"""
scripts/ensure_database.py
─────────────────────────────────────────────────────────────────────────────
Creates the target MySQL database if it doesn't already exist yet.

Runs before `migrate` in .ebextensions/01_django.config — Django's migrate
only creates tables inside an existing database, it never creates the
database/schema itself, and a fresh RDS instance whose "Initial database
name" wasn't actually applied at creation time has no schema at all to
migrate into. Connects without selecting a database first (unlike Django's
own DATABASES config, which always tries to USE one immediately on
connect) so this works even when that database doesn't exist yet.

Deliberately standalone (no Django import) so it can run before Django's
own DB-touching startup code would otherwise fail on the same missing
database.
"""
import os
import pymysql

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_db_ssl_ca = os.environ.get('DB_SSL_CA', '')
if _db_ssl_ca and not os.path.isabs(_db_ssl_ca):
    _db_ssl_ca = os.path.join(BASE_DIR, _db_ssl_ca)

conn = pymysql.connect(
    host=os.environ['DB_HOST'],
    port=int(os.environ.get('DB_PORT', '3306')),
    user=os.environ['DB_USER'],
    password=os.environ['DB_PASSWORD'],
    ssl_ca=_db_ssl_ca or None,
)
try:
    db_name = os.environ['DB_NAME']
    with conn.cursor() as cur:
        cur.execute(
            "CREATE DATABASE IF NOT EXISTS `%s` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" % db_name
        )
    conn.commit()
    print("Database '%s' ensured." % db_name)
finally:
    conn.close()
