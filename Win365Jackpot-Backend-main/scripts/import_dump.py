"""
scripts/import_dump.py
─────────────────────────────────────────────────────────────────────────────
One-time import of the GoDaddy MySQL dump's DATA into the AWS RDS database.

Runs after ensure_database.py / migrate in .ebextensions/01_django.config.
Idempotent: skips entirely once `_data_import_marker` has a row, which is
only ever written as the very last step, after every REPLACE INTO has
already succeeded and committed. A row count on any real data table (e.g.
authapp_activitylog) is NOT a safe completion signal here — MySQL's
CREATE/DROP/ALTER TABLE statements each trigger an implicit commit of
whatever came before them in the same connection, so a script that dies
partway through (as an earlier version of this script did, on a table
whose CREATE TABLE syntax MySQL rejected) can still leave earlier tables'
data committed even though the run as a whole never finished — a bare
row-count check would then wrongly treat that partial state as "already
imported" forever after. The dedicated marker table sidesteps that: it's
unrelated to any real table, so nothing but this script's own successful
completion ever touches it.

Only the dump's INSERT statements for authapp_* tables are executed — its
own DROP/CREATE TABLE statements are skipped entirely, and non-authapp
tables (auth_permission, django_content_type, django_migrations,
django_session, django_cache, token_blacklist_*) are skipped too. The
dump was captured from MariaDB, which supports a native `uuid` column
type; migrate already built the correct, MySQL-compatible schema for
these same models (Django's UUIDField maps to char(32) on MySQL, storing
dashless hex), so re-running the dump's own CREATE TABLE statements would
both fail (real MySQL doesn't have a `uuid` type) and fight the schema
Django itself just built. The non-authapp tables are excluded because
Django's post_migrate signal auto-populates auth_permission /
django_content_type from the current codebase with IDs assigned by
insertion order — not guaranteed to match the old dump's IDs — so
overwriting them from the dump risks corrupting permission-to-model
mappings. None of that is real user data anyway; it's framework
bookkeeping Django already manages correctly on its own.

INSERT INTO is rewritten to REPLACE INTO so rows Django's own seed data
migrations already created (e.g. authapp_promotion) get overwritten with
the real data instead of erroring on duplicate primary keys. UUID
literals in the dump (dash-formatted, MariaDB's native display form) are
converted to Django's dashless-hex form before insert to match what
UUIDField expects to read back.

Deliberately standalone (no Django import), matching ensure_database.py's
reasoning: it needs to run before/independently of Django's own DB-touching
startup code.
"""
import os
import re
import pymysql

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_db_ssl_ca = os.environ.get('DB_SSL_CA', '')
if _db_ssl_ca and not os.path.isabs(_db_ssl_ca):
    _db_ssl_ca = os.path.join(BASE_DIR, _db_ssl_ca)

DUMP_PATH = os.path.join(BASE_DIR, 'scripts', 'data', 'jackpotdb_dump.sql')

_UUID_RE = re.compile(
    r"'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'"
)
_INSERT_TABLE_RE = re.compile(r"^INSERT\s+INTO\s+`([^`]+)`", re.IGNORECASE)


def _dashless_uuid(match):
    return "'" + match.group(1).replace('-', '') + "'"


def split_statements(sql_text):
    # mysqldump always puts its own comments on their own line starting with
    # "--", so stripping those first keeps the later split(";") from ever
    # seeing a bare "--" line as a fake statement.
    lines = [ln for ln in sql_text.splitlines() if not ln.strip().startswith('--')]
    cleaned = '\n'.join(lines)
    return [s.strip() for s in cleaned.split(';') if s.strip()]


_SKIP_PREFIXES = (
    'DROP TABLE', 'CREATE TABLE', 'ALTER TABLE', 'LOCK TABLES', 'UNLOCK TABLES',
)


def prepare_statements(statements):
    prepared = []
    for stmt in statements:
        head = stmt.lstrip().upper()
        # mysqldump wraps its DISABLE/ENABLE KEYS calls as
        # "/*!40000 ALTER TABLE `x` DISABLE KEYS */", not a bare "ALTER
        # TABLE" prefix, so a substring check catches those too.
        if head.startswith(_SKIP_PREFIXES) or 'ALTER TABLE' in head:
            continue
        if head.startswith('INSERT INTO'):
            m = _INSERT_TABLE_RE.match(stmt.lstrip())
            if not m or not m.group(1).startswith('authapp_'):
                continue
            stmt = 'REPLACE INTO' + stmt[len('INSERT INTO'):]
            stmt = _UUID_RE.sub(_dashless_uuid, stmt)
        prepared.append(stmt)
    return prepared


conn = pymysql.connect(
    host=os.environ['DB_HOST'],
    port=int(os.environ.get('DB_PORT', '3306')),
    user=os.environ['DB_USER'],
    password=os.environ['DB_PASSWORD'],
    database=os.environ['DB_NAME'],
    ssl_ca=_db_ssl_ca or None,
    charset='utf8mb4',
)
try:
    with conn.cursor() as cur:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS _data_import_marker "
            "(id INT PRIMARY KEY, imported_at DATETIME)"
        )
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM _data_import_marker")
        already_imported = cur.fetchone()[0] > 0

    if already_imported:
        print("_data_import_marker already set — skipping data import.")
    elif not os.path.isfile(DUMP_PATH):
        print("No dump file bundled at %s — skipping data import." % DUMP_PATH)
    else:
        with open(DUMP_PATH, 'r', encoding='utf-8') as f:
            sql_text = f.read()
        statements = prepare_statements(split_statements(sql_text))
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
            cur.execute(
                "INSERT INTO _data_import_marker (id, imported_at) VALUES (1, NOW())"
            )
        conn.commit()
        print("Imported %d statements from %s." % (len(statements), DUMP_PATH))
finally:
    conn.close()
