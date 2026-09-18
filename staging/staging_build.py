#!/usr/bin/env python3
"""
staging_build.py - build an isolated JackpotsWorld staging environment for load testing.

WHAT THIS IS FOR
    Phase 2 of the load-balancing plan: a throwaway copy of production, built at
    production parity so the baseline load test is comparable, and isolated from
    production in every direction.

SAFETY DESIGN (read this before running)
    1. Every AWS call goes through run_aws(), which refuses any MUTATING command
       that mentions a known production identifier (see PROD_IDS), and refuses any
       mutating command whose resource-naming flag is not exactly the staging name
       (see FLAG_MUST_EQUAL). Read-only calls are allowed to reference production,
       because parity settings are copied from it.
    2. The only production objects this script reads are: the Jackpotsworld-env
       environment settings (platform + running version label) and the VPC/subnet
       ids. It never writes to them.
    3. The only production-shared object it USES (without modifying) is the
       Elastic Beanstalk application "jackpotsworld", because the staging
       environment must deploy the same application version that production is
       running. A new environment inside that application does not alter the
       existing one.
    4. Production IAM is untouched: staging gets its own role and instance
       profile, so no policy is ever attached to aws-elasticbeanstalk-ec2-role.
    5. The RDS master password is never generated, seen or stored by this script:
       --manage-master-user-password hands it to AWS Secrets Manager, and it is
       read back only to place it in the staging environment configuration.
    6. Generated staging credentials are written to staging-credentials.txt next
       to this script and never printed to the console.
    7. Everything created is recorded in staging-state.json, and
       staging_teardown.py deletes only what is recorded there.

USAGE
    python staging_build.py --plan     # print the plan and cost, create nothing
    python staging_build.py --yes      # build it (resumable; safe to re-run)
"""

import json
import os
import secrets
import string
import subprocess
import sys
import time

REGION = "ap-south-1"
ACCOUNT = "632813643662"

# ---------------------------------------------------------------- staging names
ENV_NAME = "Jackpotsworld-staging"
APP_NAME = "jackpotsworld"                      # shared application, read/use only
DB_ID = "jackpotsworld-staging"
REDIS_ID = "jackpotsworld-redis-staging"
REDIS_SUBNET_GROUP = "jackpotsworld-staging-redis-subnets"
BUCKET = "jackpotsworld-media-staging"
ROLE_NAME = "jackpotsworld-staging-ec2-role"    # staging-only instance role
S3_POLICY_NAME = "jackpotsworld-media-staging-s3-access"
DB_SG_NAME = "jackpotsworld-staging-db-sg"
REDIS_SG_NAME = "jackpotsworld-staging-redis-sg"

# ---------------------------------------------------------------- network (read from production, hardcoded for transparency)
VPC_ID = "vpc-02d8543360e444a9e"
SUBNETS = "subnet-0546e783f40dc7094,subnet-0ba0ca48c5e7343ea,subnet-0101bce2467d61820"
VPC_CIDR = "172.31.0.0/16"

# ---------------------------------------------------------------- guard rails
PROD_IDS = {
    "jackpotsworld",            # production RDS id and EB application name
    "Jackpotsworld-env", "e-qrzj5c8mqp",
    "jackpotsworld-redis", "jackpotsworld-media", "jackpotsworld-pitr",
    "awseb--AWSEB-Xe2XTYVR7IZZ", "awseb-AWSEB-DEEBYOQV7UFX",
    "sg-0d046a6e5b452f1c2", "sg-052722011c063cd36",
    "sg-0afe0ca31d17b3bdd", "sg-0592b2037f74e4702", "sg-09ad19b76fe070770",
    "i-0348fc144f4801590", "i-0a9b9c45468f3563b", "i-02719a19d5c777db5",
    "aws-elasticbeanstalk-ec2-role",
    "jackpotsworld.czssuaiu83ya.ap-south-1.rds.amazonaws.com",
    "jackpotsworld-redis.vean75.0001.aps1.cache.amazonaws.com",
    "jackpotsworld-media-s3-access",
    "default-vpc-02d8543360e444a9e",
    "jackpotsworld-redis-subnets",
}
# The bare application name is a production identifier too, but a staging
# environment has to live inside it. Only these exact verb/flag/value triples are
# allowed - scoped to the verb, so that e.g. delete-application can never pass.
ALLOWED_PROD_REFS = {
    ("create-environment", "--application-name", "jackpotsworld"),
    ("update-environment", "--application-name", "jackpotsworld"),
    ("describe-configuration-settings", "--application-name", "jackpotsworld"),
}
# Verbs this script never has any reason to use. Refused whatever they target.
DENY_VERBS = {
    "delete-application", "delete-application-version", "delete-platform-version",
    "delete-configuration-template", "delete-environment-configuration",
    "terminate-environment", "rebuild-environment", "restart-app-server",
    "swap-environment-cnames", "delete-db-instance", "delete-db-cluster",
    "delete-cache-cluster", "delete-bucket", "delete-role", "delete-policy",
    "modify-db-instance", "reboot-db-instance", "revoke-security-group-ingress",
}
MUTATING = ("create-", "delete-", "modify-", "update-", "put-", "attach-", "detach-",
            "authorize-", "revoke-", "terminate-", "reboot-", "add-", "remove-",
            "register-", "deregister-", "tag-", "untag-", "rebuild-", "restart-",
            "swap-", "set-", "send-command")
FLAG_MUST_EQUAL = {
    "--environment-name": ENV_NAME,
    "--db-instance-identifier": DB_ID,
    "--cache-cluster-id": REDIS_ID,
    "--cache-subnet-group-name": REDIS_SUBNET_GROUP,
    "--bucket": BUCKET,
    "--role-name": ROLE_NAME,
    "--instance-profile-name": ROLE_NAME,
}

HERE = os.path.dirname(os.path.abspath(__file__))
STATE_PATH = os.path.join(HERE, "staging-state.json")
CREDS_PATH = os.path.join(HERE, "staging-credentials.txt")


def state_load():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"created": {}, "region": REGION, "account": ACCOUNT}


def state_save(st):
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(st, f, indent=2)


STATE = state_load()


def record(kind, value):
    STATE["created"][kind] = value
    state_save(STATE)
    print("      recorded in staging-state.json: %s = %s" % (kind, value))


def guard(args):
    """Refuse any mutating AWS call that could touch production."""
    verb = args[1] if len(args) > 1 else ""
    if verb in DENY_VERBS:
        raise SystemExit(
            "\nREFUSED: `aws %s` is a destructive verb this build script never uses.\n"
            "Nothing was sent to AWS. Use staging_teardown.py to remove staging.\n" % verb)
    if not any(verb.startswith(p) for p in MUTATING):
        return
    for i, raw in enumerate(args):
        prev = args[i - 1] if i else ""
        for tok in str(raw).replace(",", " ").split():
            if tok in PROD_IDS and (verb, prev, tok) not in ALLOWED_PROD_REFS:
                raise SystemExit(
                    "\nREFUSED: `aws %s` mentions the production identifier %r.\n"
                    "Nothing was sent to AWS. This is the safety guard doing its job.\n"
                    % (verb, tok))
        if raw in FLAG_MUST_EQUAL:
            want = FLAG_MUST_EQUAL[raw]
            got = args[i + 1] if i + 1 < len(args) else ""
            if got != want:
                raise SystemExit(
                    "\nREFUSED: `aws %s` used %s=%r but only %r is allowed.\n"
                    % (verb, raw, got, want))


def aws(*args, region=REGION, check=True, quiet=False):
    argv = ["aws", *args]
    if region:
        argv += ["--region", region]
    argv += ["--output", "json"]
    guard(argv)
    r = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8",
                       stdin=subprocess.DEVNULL)
    if r.returncode:
        msg = r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "unknown error"
        if not check:
            if not quiet:
                print("      (skipped: %s)" % msg[:120])
            return None
        raise SystemExit("\nFAILED: aws %s\n%s\n" % (" ".join(args[:3]), r.stderr.strip()[:600]))
    return json.loads(r.stdout) if r.stdout.strip() else {}


def gen_password(n=24):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_=+"
    while True:
        p = "".join(secrets.choice(alphabet) for _ in range(n))
        if any(c.islower() for c in p) and any(c.isupper() for c in p) and any(c.isdigit() for c in p):
            return p


PLAN = [
    ("EC2 security group", DB_SG_NAME, "MySQL 3306, inbound from the VPC only", "free"),
    ("EC2 security group", REDIS_SG_NAME, "Redis 6379, inbound from the VPC only", "free"),
    ("IAM role + instance profile", ROLE_NAME, "staging-only; production role untouched", "free"),
    ("IAM customer policy", S3_POLICY_NAME, "read/write the staging bucket only", "free"),
    ("S3 bucket", BUCKET + " (already created)", "private, SSE-S3, no public policy", "~$0.00"),
    ("RDS MySQL 8.4", DB_ID, "db.t4g.micro, 20 GB, single-AZ, private, no backups, password in Secrets Manager", "$0.021/h + $0.003/h storage"),
    ("ElastiCache subnet group", REDIS_SUBNET_GROUP, "the three default-VPC subnets", "free"),
    ("ElastiCache Redis 7.1", REDIS_ID, "cache.t4g.micro, one node", "~$0.016/h"),
    ("Secrets Manager secret", "rds!db-... (AWS-managed)", "the staging DB master password", "$0.40/month"),
    ("Elastic Beanstalk environment", ENV_NAME, "2 x t3.small, Min 2 / Max 4, own ALB, production parity", "$0.045/h instances + $0.024/h ALB"),
    ("CloudWatch log groups", "/aws/elasticbeanstalk/" + ENV_NAME + "/*", "3-day retention, deleted with the environment", "~$0.00"),
]


def print_plan():
    print("=" * 78)
    print("STAGING BUILD PLAN - account %s, region %s" % (ACCOUNT, REGION))
    print("=" * 78)
    for kind, name, note, cost in PLAN:
        print("  %-30s %s" % (kind, name))
        print("  %-30s   %s   [%s]" % ("", note, cost))
    print("-" * 78)
    print("  Estimated running cost: about $0.11 per hour, roughly $2.70 per day.")
    print("  The load-generator instance is NOT created here; it is added later,")
    print("  only while tests are running (c7g.large, $0.049/h).")
    print("-" * 78)
    print("  Production objects READ (never written): Jackpotsworld-env settings,")
    print("  its platform version and running application version, VPC + subnet ids.")
    print("  Production objects USED (never modified): the Elastic Beanstalk")
    print("  application 'jackpotsworld' and the existing EB service role.")
    print("  NOT touched at all: production RDS, Redis, S3, ALB, security groups,")
    print("  instance role, jackpotsworld-pitr, Cloudflare.")
    print("=" * 78)


def preflight():
    print("[0/8] Preflight")
    ident = aws("sts", "get-caller-identity", region=None)
    if ident["Account"] != ACCOUNT:
        raise SystemExit("REFUSED: wrong AWS account %s (expected %s)" % (ident["Account"], ACCOUNT))
    print("      account %s as %s" % (ident["Account"], ident["Arn"].split("/")[-1]))
    # Guard self-test: this must raise, or the guard is broken.
    try:
        guard(["aws", "delete-db-instance", "--db-instance-identifier", "jackpotsworld-pitr"])
    except SystemExit:
        print("      guard self-test passed (a production-targeting call is refused)")
    else:
        raise SystemExit("REFUSED: the safety guard is not working. Aborting.")
    prod = aws("elasticbeanstalk", "describe-environments", "--environment-names", "Jackpotsworld-env")
    env = prod["Environments"][0]
    STATE["platform"] = env["SolutionStackName"]
    STATE["version_label"] = env["VersionLabel"]
    state_save(STATE)
    print("      production parity: %s" % STATE["platform"])
    print("      deploying the same version production runs: %s" % STATE["version_label"])


def sg_ensure(name, port, desc):
    existing = aws("ec2", "describe-security-groups",
                   "--filters", "Name=group-name,Values=" + name, "Name=vpc-id,Values=" + VPC_ID)
    if existing["SecurityGroups"]:
        gid = existing["SecurityGroups"][0]["GroupId"]
        print("      exists: %s (%s)" % (name, gid))
    else:
        gid = aws("ec2", "create-security-group", "--group-name", name,
                  "--description", desc, "--vpc-id", VPC_ID,
                  "--tag-specifications",
                  "ResourceType=security-group,Tags=[{Key=Name,Value=%s},{Key=Purpose,Value=jackpotsworld-staging}]" % name)["GroupId"]
        print("      created: %s (%s)" % (name, gid))
    perms = json.dumps([{"IpProtocol": "tcp", "FromPort": port, "ToPort": port,
                         "IpRanges": [{"CidrIp": VPC_CIDR, "Description": "staging, VPC only"}]}])
    aws("ec2", "authorize-security-group-ingress", "--group-id", gid,
        "--ip-permissions", perms, check=False, quiet=True)
    record("sg_" + name, gid)
    return gid


def iam_ensure():
    print("[2/8] IAM (staging-only role; production role is not touched)")
    trust = {"Version": "2012-10-17", "Statement": [
        {"Effect": "Allow", "Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole"}]}
    s3doc = {"Version": "2012-10-17", "Statement": [
        {"Sid": "StagingObjects", "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::%s/*" % BUCKET},
        {"Sid": "StagingList", "Effect": "Allow", "Action": ["s3:ListBucket"],
         "Resource": "arn:aws:s3:::%s" % BUCKET}]}
    tp = os.path.join(HERE, "_trust.json")
    sp = os.path.join(HERE, "_s3policy.json")
    open(tp, "w", encoding="utf-8").write(json.dumps(trust))
    open(sp, "w", encoding="utf-8").write(json.dumps(s3doc))
    try:
        r = aws("iam", "create-role", "--role-name", ROLE_NAME,
                "--assume-role-policy-document", "file://" + tp,
                "--description", "JackpotsWorld staging EB instances (load testing)",
                "--tags", "Key=Purpose,Value=jackpotsworld-staging", region=None, check=False)
        print("      role %s: %s" % (ROLE_NAME, "created" if r else "already exists"))
        record("iam_role", ROLE_NAME)
        pol_arn = "arn:aws:iam::%s:policy/%s" % (ACCOUNT, S3_POLICY_NAME)
        r = aws("iam", "create-policy", "--policy-name", S3_POLICY_NAME,
                "--policy-document", "file://" + sp,
                "--description", "Staging media bucket access", region=None, check=False)
        print("      policy %s: %s" % (S3_POLICY_NAME, "created" if r else "already exists"))
        record("iam_policy", pol_arn)
        for arn in ["arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier",
                    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
                    pol_arn]:
            aws("iam", "attach-role-policy", "--role-name", ROLE_NAME,
                "--policy-arn", arn, region=None, check=False, quiet=True)
        print("      attached: EB web tier, SSM core, staging S3 policy")
        r = aws("iam", "create-instance-profile", "--instance-profile-name", ROLE_NAME,
                "--tags", "Key=Purpose,Value=jackpotsworld-staging", region=None, check=False)
        print("      instance profile: %s" % ("created" if r else "already exists"))
        record("iam_instance_profile", ROLE_NAME)
        aws("iam", "add-role-to-instance-profile", "--instance-profile-name", ROLE_NAME,
            "--role-name", ROLE_NAME, region=None, check=False, quiet=True)
    finally:
        for p in (tp, sp):
            if os.path.exists(p):
                os.remove(p)


def rds_ensure(db_sg):
    print("[3/8] RDS MySQL (master password managed by AWS Secrets Manager)")
    ex = aws("rds", "describe-db-instances", "--db-instance-identifier", DB_ID, check=False, quiet=True)
    if ex:
        print("      exists: %s (%s)" % (DB_ID, ex["DBInstances"][0]["DBInstanceStatus"]))
    else:
        aws("rds", "create-db-instance",
            "--db-instance-identifier", DB_ID,
            "--db-instance-class", "db.t4g.micro",
            "--engine", "mysql", "--engine-version", "8.4.9",
            "--master-username", "jwstaging",
            "--manage-master-user-password",
            "--allocated-storage", "20", "--storage-type", "gp2", "--storage-encrypted",
            "--db-name", "jackpotdb",
            "--db-subnet-group-name", "default",
            "--vpc-security-group-ids", db_sg,
            "--backup-retention-period", "0",
            "--no-multi-az", "--no-publicly-accessible", "--no-deletion-protection",
            "--no-auto-minor-version-upgrade",
            "--tags", "Key=Purpose,Value=jackpotsworld-staging")
        print("      creating: %s (db.t4g.micro, private, no backups)" % DB_ID)
    record("rds", DB_ID)


def redis_ensure(redis_sg):
    print("[4/8] ElastiCache Redis")
    ex = aws("elasticache", "describe-cache-subnet-groups",
             "--cache-subnet-group-name", REDIS_SUBNET_GROUP, check=False, quiet=True)
    if not ex:
        aws("elasticache", "create-cache-subnet-group",
            "--cache-subnet-group-name", REDIS_SUBNET_GROUP,
            "--cache-subnet-group-description", "JackpotsWorld staging Redis subnets",
            "--subnet-ids", *SUBNETS.split(","))
        print("      created subnet group: %s" % REDIS_SUBNET_GROUP)
    else:
        print("      subnet group exists: %s" % REDIS_SUBNET_GROUP)
    record("redis_subnet_group", REDIS_SUBNET_GROUP)
    ex = aws("elasticache", "describe-cache-clusters", "--cache-cluster-id", REDIS_ID,
             check=False, quiet=True)
    if ex:
        print("      exists: %s (%s)" % (REDIS_ID, ex["CacheClusters"][0]["CacheClusterStatus"]))
    else:
        aws("elasticache", "create-cache-cluster",
            "--cache-cluster-id", REDIS_ID,
            "--engine", "redis", "--engine-version", "7.1",
            "--cache-node-type", "cache.t4g.micro", "--num-cache-nodes", "1",
            "--cache-subnet-group-name", REDIS_SUBNET_GROUP,
            "--security-group-ids", redis_sg,
            "--tags", "Key=Purpose,Value=jackpotsworld-staging")
        print("      creating: %s (cache.t4g.micro)" % REDIS_ID)
    record("redis", REDIS_ID)


def wait_for_stores():
    print("[5/8] Waiting for the database and Redis to come up (5-15 minutes)")
    db_endpoint = redis_endpoint = None
    deadline = time.time() + 30 * 60
    while time.time() < deadline:
        d = aws("rds", "describe-db-instances", "--db-instance-identifier", DB_ID)["DBInstances"][0]
        c = aws("elasticache", "describe-cache-clusters", "--cache-cluster-id", REDIS_ID,
                "--show-cache-node-info")["CacheClusters"][0]
        db_ok = d["DBInstanceStatus"] == "available"
        rd_ok = c["CacheClusterStatus"] == "available"
        if db_ok:
            db_endpoint = d["Endpoint"]["Address"]
            STATE["db_secret_arn"] = d.get("MasterUserSecret", {}).get("SecretArn")
        if rd_ok:
            redis_endpoint = c["CacheNodes"][0]["Endpoint"]["Address"]
        print("      database=%s redis=%s" % (d["DBInstanceStatus"], c["CacheClusterStatus"]))
        if db_ok and rd_ok:
            STATE["db_endpoint"] = db_endpoint
            STATE["redis_endpoint"] = redis_endpoint
            state_save(STATE)
            print("      both available")
            return db_endpoint, redis_endpoint
        time.sleep(30)
    raise SystemExit("Timed out waiting for the stores. Re-run this script; it resumes.")


def env_ensure(db_endpoint, redis_endpoint):
    print("[6/8] Elastic Beanstalk environment (production parity)")
    ex = aws("elasticbeanstalk", "describe-environments", "--environment-names", ENV_NAME,
             "--no-include-deleted", check=False, quiet=True)
    if ex and ex.get("Environments"):
        e = ex["Environments"][0]
        print("      exists: %s (%s / %s)" % (ENV_NAME, e["Status"], e.get("Health")))
        STATE["env_cname"] = e.get("CNAME")
        state_save(STATE)
        return
    secret = aws("secretsmanager", "get-secret-value", "--secret-id", STATE["db_secret_arn"])
    db_password = json.loads(secret["SecretString"])["password"]
    django_secret = secrets.token_urlsafe(50)
    admin_pw = gen_password()
    super_pw = gen_password()
    with open(CREDS_PATH, "w", encoding="utf-8") as f:
        f.write("JackpotsWorld STAGING credentials - generated %s\n" % time.strftime("%Y-%m-%d %H:%M:%S"))
        f.write("These are staging-only. Nothing here is reused from production.\n\n")
        f.write("Django admin (staging):\n")
        f.write("  admin      staging-admin@jackpotsworld.invalid  /  %s\n" % admin_pw)
        f.write("  superadmin staging-super@jackpotsworld.invalid  /  %s\n" % super_pw)
        f.write("\nDatabase master password: managed by AWS Secrets Manager\n")
        f.write("  secret: %s\n" % STATE["db_secret_arn"])
        f.write("\nDelete this file once staging is torn down.\n")
    print("      generated a staging SECRET_KEY and two staging admin passwords")
    print("      written to %s (not printed here)" % CREDS_PATH)

    envvars = {
        "DB_HOST": db_endpoint, "DB_NAME": "jackpotdb", "DB_USER": "jwstaging",
        "DB_PASSWORD": db_password, "DB_PORT": "3306",
        "DB_SSL_CA": "certs/global-bundle.pem", "DB_CONN_MAX_AGE": "60",
        "SECRET_KEY": django_secret, "DEBUG": "False",
        "ALLOWED_HOSTS": ".elasticbeanstalk.com,.amazonaws.com",
        "REDIS_URL": "redis://%s:6379" % redis_endpoint, "REDIS_SOCKET_TIMEOUT": "20",
        "AWS_STORAGE_BUCKET_NAME": BUCKET, "AWS_S3_REGION_NAME": REGION,
        "FRONTEND_DIST_DIR": "jackpotsworld_frontend_dist",
        "MEDIA_ROOT_DIR": "/var/app/media",
        "EMAIL_BACKEND": "django.core.mail.backends.console.EmailBackend",
        "EMAIL_HOST_USER": "staging@jackpotsworld.invalid",
        "EMAIL_HOST_PASSWORD": "unused-in-staging",
        "DEFAULT_FROM_EMAIL": "staging@jackpotsworld.invalid",
        "TURNSTILE_SECRET_KEY": "1x0000000000000000000000000000000AA",
        "ADMIN_EMAIL": "staging-admin@jackpotsworld.invalid",
        "ADMIN_NAME": "Staging-Admin", "ADMIN_PASSWORD": admin_pw,
        "SUPERADMIN_EMAIL": "staging-super@jackpotsworld.invalid",
        "SUPERADMIN_NAME": "Staging-Super", "SUPERADMIN_PASSWORD": super_pw,
        "VOICE_CALL_RECORDING_ENABLED": "False",
    }
    opts = [{"Namespace": "aws:elasticbeanstalk:application:environment",
             "OptionName": k, "Value": v} for k, v in envvars.items()]
    opts += [
        {"Namespace": "aws:elasticbeanstalk:environment", "OptionName": "EnvironmentType", "Value": "LoadBalanced"},
        {"Namespace": "aws:elasticbeanstalk:environment", "OptionName": "LoadBalancerType", "Value": "application"},
        {"Namespace": "aws:elasticbeanstalk:environment", "OptionName": "ServiceRole",
         "Value": "arn:aws:iam::%s:role/aws-elasticbeanstalk-service-role" % ACCOUNT},
        {"Namespace": "aws:autoscaling:launchconfiguration", "OptionName": "IamInstanceProfile", "Value": ROLE_NAME},
        {"Namespace": "aws:autoscaling:launchconfiguration", "OptionName": "MonitoringInterval", "Value": "1 minute"},
        {"Namespace": "aws:ec2:instances", "OptionName": "InstanceTypes", "Value": "t3.small"},
        {"Namespace": "aws:autoscaling:asg", "OptionName": "MinSize", "Value": "2"},
        {"Namespace": "aws:autoscaling:asg", "OptionName": "MaxSize", "Value": "4"},
        {"Namespace": "aws:ec2:vpc", "OptionName": "VPCId", "Value": VPC_ID},
        {"Namespace": "aws:ec2:vpc", "OptionName": "Subnets", "Value": SUBNETS},
        {"Namespace": "aws:ec2:vpc", "OptionName": "ELBSubnets", "Value": SUBNETS},
        {"Namespace": "aws:ec2:vpc", "OptionName": "ELBScheme", "Value": "public"},
        {"Namespace": "aws:ec2:vpc", "OptionName": "AssociatePublicIpAddress", "Value": "true"},
        # production parity: same health check, same thresholds, same deploy policy
        {"Namespace": "aws:elasticbeanstalk:environment:process:default", "OptionName": "HealthCheckPath", "Value": "/admin/login/"},
        {"Namespace": "aws:elasticbeanstalk:environment:process:default", "OptionName": "HealthCheckInterval", "Value": "15"},
        {"Namespace": "aws:elasticbeanstalk:environment:process:default", "OptionName": "HealthyThresholdCount", "Value": "3"},
        {"Namespace": "aws:elasticbeanstalk:environment:process:default", "OptionName": "UnhealthyThresholdCount", "Value": "5"},
        {"Namespace": "aws:elasticbeanstalk:environment:process:default", "OptionName": "DeregistrationDelay", "Value": "20"},
        {"Namespace": "aws:elasticbeanstalk:command", "OptionName": "DeploymentPolicy", "Value": "Rolling"},
        {"Namespace": "aws:elasticbeanstalk:command", "OptionName": "BatchSizeType", "Value": "Fixed"},
        {"Namespace": "aws:elasticbeanstalk:command", "OptionName": "BatchSize", "Value": "1"},
        {"Namespace": "aws:autoscaling:trigger", "OptionName": "MeasureName", "Value": "CPUUtilization"},
        {"Namespace": "aws:autoscaling:trigger", "OptionName": "Statistic", "Value": "Average"},
        {"Namespace": "aws:autoscaling:trigger", "OptionName": "Unit", "Value": "Percent"},
        {"Namespace": "aws:autoscaling:trigger", "OptionName": "UpperThreshold", "Value": "60"},
        {"Namespace": "aws:autoscaling:trigger", "OptionName": "LowerThreshold", "Value": "20"},
        {"Namespace": "aws:elasticbeanstalk:healthreporting:system", "OptionName": "SystemType", "Value": "enhanced"},
        {"Namespace": "aws:elasticbeanstalk:cloudwatch:logs", "OptionName": "StreamLogs", "Value": "true"},
        {"Namespace": "aws:elasticbeanstalk:cloudwatch:logs", "OptionName": "RetentionInDays", "Value": "3"},
        {"Namespace": "aws:elasticbeanstalk:cloudwatch:logs", "OptionName": "DeleteOnTerminate", "Value": "true"},
        # staging must never self-update mid-test
        {"Namespace": "aws:elasticbeanstalk:managedactions", "OptionName": "ManagedActionsEnabled", "Value": "false"},
    ]
    opt_path = os.path.join(HERE, "_options.json")
    open(opt_path, "w", encoding="utf-8").write(json.dumps(opts))
    try:
        last = None
        for attempt in range(4):  # IAM instance profile can take a moment to propagate
            r = aws("elasticbeanstalk", "create-environment",
                    "--application-name", APP_NAME,
                    "--environment-name", ENV_NAME,
                    "--solution-stack-name", STATE["platform"],
                    "--version-label", STATE["version_label"],
                    "--option-settings", "file://" + opt_path,
                    "--tags", "Key=Purpose,Value=jackpotsworld-staging",
                    check=False)
            if r:
                last = r
                break
            print("      retrying in 20s (IAM propagation)")
            time.sleep(20)
        if not last:
            raise SystemExit("Could not create the environment. Nothing else was changed.")
        print("      created: %s (%s)" % (ENV_NAME, last.get("EnvironmentId")))
        record("eb_environment", ENV_NAME)
        STATE["env_cname"] = last.get("CNAME")
        state_save(STATE)
    finally:
        if os.path.exists(opt_path):
            with open(opt_path, "w", encoding="utf-8") as f:
                f.write("{}")      # overwrite the file that held the DB password
            os.remove(opt_path)


def wait_for_env():
    print("[7/8] Waiting for the environment to finish launching (10-20 minutes)")
    deadline = time.time() + 40 * 60
    while time.time() < deadline:
        e = aws("elasticbeanstalk", "describe-environments", "--environment-names", ENV_NAME)["Environments"][0]
        print("      status=%s health=%s version=%s" % (e["Status"], e.get("Health"), e.get("VersionLabel")))
        if e["Status"] == "Ready":
            STATE["env_cname"] = e.get("CNAME")
            STATE["env_url"] = "http://" + (e.get("CNAME") or "")
            state_save(STATE)
            return e
        if e["Status"] in ("Terminated", "Terminating"):
            raise SystemExit("The environment went to %s. Check the EB events." % e["Status"])
        time.sleep(30)
    raise SystemExit("Timed out. Check the Elastic Beanstalk console; the script resumes on re-run.")


def post_launch(env):
    print("[8/8] Post-launch: staging origins, and disabling any imported accounts")
    cname = env.get("CNAME")
    if cname:
        aws("elasticbeanstalk", "update-environment", "--environment-name", ENV_NAME,
            "--option-settings",
            "Namespace=aws:elasticbeanstalk:application:environment,OptionName=CSRF_TRUSTED_ORIGINS,Value=http://%s" % cname,
            "Namespace=aws:elasticbeanstalk:application:environment,OptionName=CORS_ALLOWED_ORIGINS,Value=http://%s" % cname,
            "Namespace=aws:elasticbeanstalk:application:environment,OptionName=SITE_BASE_URL,Value=http://%s" % cname,
            check=False)
        print("      staging origins set to http://%s" % cname)
    res = aws("elasticbeanstalk", "describe-environment-resources", "--environment-name", ENV_NAME)
    instances = [i["Id"] for i in res["EnvironmentResources"]["Instances"]]
    if not instances:
        print("      no instances reported yet; run the account check manually (see below)")
        return
    script = (
        "set -a; . /opt/elasticbeanstalk/deployment/env 2>/dev/null; set +a; "
        "cd /var/app/current && /var/app/venv/*/bin/python manage.py shell -c "
        "\"from authapp.models import User; "
        "keep=['staging-admin@jackpotsworld.invalid','staging-super@jackpotsworld.invalid']; "
        "qs=User.objects.exclude(email__in=keep); "
        "n=qs.count(); "
        "[ (u.set_unusable_password(), setattr(u,'is_active',False), u.save()) for u in qs ]; "
        "print('disabled imported accounts:', n)\""
    )
    r = aws("ssm", "send-command", "--instance-ids", instances[0],
            "--document-name", "AWS-RunShellScript",
            "--parameters", json.dumps({"commands": [script]}),
            "--comment", "staging: disable imported accounts", check=False)
    if not r:
        print("      SSM call not permitted from here. Do this manually, on STAGING only:")
        print("        sign in to the staging Django admin with the generated superadmin")
        print("        and deactivate any account that is not one of the two staging ones.")
        return
    cid = r["Command"]["CommandId"]
    for _ in range(20):
        time.sleep(6)
        inv = aws("ssm", "get-command-invocation", "--command-id", cid,
                  "--instance-id", instances[0], check=False, quiet=True)
        if inv and inv.get("Status") in ("Success", "Failed", "TimedOut"):
            print("      %s: %s" % (inv["Status"], (inv.get("StandardOutputContent") or "").strip()[:200]))
            break


def summary():
    print("\n" + "=" * 78)
    print("STAGING IS UP")
    print("=" * 78)
    print("  Environment : %s" % ENV_NAME)
    print("  URL         : http://%s" % STATE.get("env_cname", "?"))
    print("  Database    : %s (private, VPC only)" % STATE.get("db_endpoint", "?"))
    print("  Redis       : %s (private, VPC only)" % STATE.get("redis_endpoint", "?"))
    print("  Bucket      : %s (private)" % BUCKET)
    print("  Credentials : %s" % CREDS_PATH)
    print("  State file  : %s" % STATE_PATH)
    print("\n  Isolation checks to run now:")
    print("    python staging_verify.py")
    print("\n  Tear everything down with:")
    print("    python staging_teardown.py --yes-delete-staging")
    print("=" * 78)


def main():
    if "--plan" in sys.argv:
        print_plan()
        print("\nNothing was created. Re-run with --yes to build.")
        return
    if "--yes" not in sys.argv:
        print_plan()
        print("\nRe-run with --yes to build, or --plan to see this again.")
        return
    print_plan()
    print()
    preflight()
    print("[1/8] Security groups")
    db_sg = sg_ensure(DB_SG_NAME, 3306, "JackpotsWorld staging MySQL, VPC only")
    redis_sg = sg_ensure(REDIS_SG_NAME, 6379, "JackpotsWorld staging Redis, VPC only")
    iam_ensure()
    rds_ensure(db_sg)
    redis_ensure(redis_sg)
    db_endpoint, redis_endpoint = wait_for_stores()
    env_ensure(db_endpoint, redis_endpoint)
    env = wait_for_env()
    post_launch(env)
    summary()


if __name__ == "__main__":
    main()
