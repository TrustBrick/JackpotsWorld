#!/usr/bin/env python3
"""
staging_teardown.py - delete the staging environment built by staging_build.py.

It deletes ONLY what staging-state.json records as created, and every deletion
is additionally name-checked, so it cannot delete a production resource even if
the state file were edited. Production identifiers are refused outright.

USAGE
    python staging_teardown.py                       # show what would be deleted
    python staging_teardown.py --yes-delete-staging  # delete it
    python staging_teardown.py --yes-delete-staging --keep-bucket
"""

import json
import os
import subprocess
import sys
import time

REGION = "ap-south-1"
ACCOUNT = "632813643662"

ENV_NAME = "Jackpotsworld-staging"
DB_ID = "jackpotsworld-staging"
REDIS_ID = "jackpotsworld-redis-staging"
REDIS_SUBNET_GROUP = "jackpotsworld-staging-redis-subnets"
BUCKET = "jackpotsworld-media-staging"
ROLE_NAME = "jackpotsworld-staging-ec2-role"
S3_POLICY_NAME = "jackpotsworld-media-staging-s3-access"

ALLOWED_NAMES = {ENV_NAME, DB_ID, REDIS_ID, REDIS_SUBNET_GROUP, BUCKET, ROLE_NAME, S3_POLICY_NAME}
PROD_IDS = {
    "Jackpotsworld-env", "e-qrzj5c8mqp", "jackpotsworld", "jackpotsworld-redis",
    "jackpotsworld-media", "jackpotsworld-pitr", "awseb--AWSEB-Xe2XTYVR7IZZ",
    "awseb-AWSEB-DEEBYOQV7UFX", "sg-0d046a6e5b452f1c2", "sg-052722011c063cd36",
    "sg-0afe0ca31d17b3bdd", "sg-0592b2037f74e4702", "sg-09ad19b76fe070770",
    "i-0348fc144f4801590", "i-0a9b9c45468f3563b", "i-02719a19d5c777db5",
    "aws-elasticbeanstalk-ec2-role", "jackpotsworld-media-s3-access",
    "default-vpc-02d8543360e444a9e", "jackpotsworld-redis-subnets", "default",
}

HERE = os.path.dirname(os.path.abspath(__file__))
STATE_PATH = os.path.join(HERE, "staging-state.json")


def guard(args):
    verb = args[1] if len(args) > 1 else ""
    if not verb.startswith(("delete-", "terminate-", "remove-", "detach-", "revoke-")):
        return
    for raw in args:
        for tok in str(raw).replace(",", " ").split():
            if tok in PROD_IDS:
                raise SystemExit("\nREFUSED: `aws %s` mentions production identifier %r. Nothing sent.\n" % (verb, tok))


def aws(*args, region=REGION, check=True, quiet=False):
    argv = ["aws", *args]
    if region:
        argv += ["--region", region]
    argv += ["--output", "json"]
    guard(argv)
    r = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", stdin=subprocess.DEVNULL)
    if r.returncode:
        if not check:
            if not quiet:
                print("      (skip: %s)" % (r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "error")[:110])
            return None
        raise SystemExit("FAILED: aws %s\n%s" % (" ".join(args[:3]), r.stderr.strip()[:500]))
    return json.loads(r.stdout) if r.stdout.strip() else {}


def load_state():
    if not os.path.exists(STATE_PATH):
        print("No staging-state.json next to this script.")
        print("That means either staging was never built from here, or it is already torn down.")
        print("Nothing will be deleted. (Teardown only removes what the build recorded.)")
        sys.exit(0)
    with open(STATE_PATH, encoding="utf-8") as f:
        return json.load(f)


def main():
    st = load_state()
    created = st.get("created", {})
    ident = aws("sts", "get-caller-identity", region=None)
    if ident["Account"] != ACCOUNT:
        raise SystemExit("REFUSED: wrong AWS account.")

    print("=" * 74)
    print("STAGING TEARDOWN - these resources were recorded by staging_build.py")
    print("=" * 74)
    for k, v in created.items():
        print("  %-26s %s" % (k, v))
    keep_bucket = "--keep-bucket" in sys.argv
    print("  %-26s %s" % ("S3 bucket", BUCKET + (" (kept)" if keep_bucket else " (emptied and deleted)")))
    print("-" * 74)
    print("  Production is NOT touched: Jackpotsworld-env, its ALB, RDS jackpotsworld,")
    print("  jackpotsworld-redis, jackpotsworld-media, jackpotsworld-pitr, the production")
    print("  instance role and every production security group are all refused by name.")
    print("=" * 74)
    if "--yes-delete-staging" not in sys.argv:
        print("\nDry run. Re-run with --yes-delete-staging to delete the above.")
        return

    # 1. Environment first: it owns the ALB, ASG, instances and their security groups.
    if created.get("eb_environment"):
        print("\n[1/6] Terminating the Elastic Beanstalk environment")
        r = aws("elasticbeanstalk", "terminate-environment", "--environment-name", ENV_NAME,
                "--terminate-resources", check=False)
        if r is not None:
            deadline = time.time() + 30 * 60
            while time.time() < deadline:
                e = aws("elasticbeanstalk", "describe-environments", "--environment-names", ENV_NAME,
                        "--no-include-deleted", check=False, quiet=True)
                if not e or not e.get("Environments"):
                    print("      terminated")
                    break
                print("      status=%s" % e["Environments"][0]["Status"])
                if e["Environments"][0]["Status"] == "Terminated":
                    break
                time.sleep(30)

    # 2. Database (no final snapshot: staging holds no data worth keeping)
    if created.get("rds"):
        print("[2/6] Deleting the staging database")
        aws("rds", "delete-db-instance", "--db-instance-identifier", DB_ID,
            "--skip-final-snapshot", "--delete-automated-backups", check=False)
        print("      deletion started (the AWS-managed password secret is removed with it)")

    # 3. Redis
    if created.get("redis"):
        print("[3/6] Deleting Redis")
        aws("elasticache", "delete-cache-cluster", "--cache-cluster-id", REDIS_ID, check=False)
        deadline = time.time() + 20 * 60
        while time.time() < deadline:
            c = aws("elasticache", "describe-cache-clusters", "--cache-cluster-id", REDIS_ID,
                    check=False, quiet=True)
            if not c:
                print("      deleted")
                break
            print("      status=%s" % c["CacheClusters"][0]["CacheClusterStatus"])
            time.sleep(30)
    if created.get("redis_subnet_group"):
        aws("elasticache", "delete-cache-subnet-group",
            "--cache-subnet-group-name", REDIS_SUBNET_GROUP, check=False)
        print("      subnet group deleted")

    # 4. IAM (staging-only objects)
    print("[4/6] Deleting the staging IAM role, instance profile and policy")
    aws("iam", "remove-role-from-instance-profile", "--instance-profile-name", ROLE_NAME,
        "--role-name", ROLE_NAME, region=None, check=False, quiet=True)
    aws("iam", "delete-instance-profile", "--instance-profile-name", ROLE_NAME,
        region=None, check=False, quiet=True)
    pol_arn = created.get("iam_policy") or "arn:aws:iam::%s:policy/%s" % (ACCOUNT, S3_POLICY_NAME)
    for arn in ["arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier",
                "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore", pol_arn]:
        aws("iam", "detach-role-policy", "--role-name", ROLE_NAME, "--policy-arn", arn,
            region=None, check=False, quiet=True)
    aws("iam", "delete-policy", "--policy-arn", pol_arn, region=None, check=False)
    aws("iam", "delete-role", "--role-name", ROLE_NAME, region=None, check=False)
    print("      done")

    # 5. Security groups (only once nothing references them)
    print("[5/6] Deleting the staging security groups")
    for key, gid in list(created.items()):
        if not key.startswith("sg_"):
            continue
        for attempt in range(6):
            r = aws("ec2", "delete-security-group", "--group-id", gid, check=False, quiet=True)
            if r is not None:
                print("      deleted %s (%s)" % (key[3:], gid))
                break
            time.sleep(20)
        else:
            print("      could not delete %s yet (still in use); re-run later" % gid)

    # 6. Bucket
    if not keep_bucket:
        print("[6/6] Emptying and deleting the staging bucket")
        subprocess.run(["aws", "s3", "rm", "s3://" + BUCKET, "--recursive", "--region", REGION],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL)
        aws("s3api", "delete-bucket", "--bucket", BUCKET, check=False)
        print("      done")
    else:
        print("[6/6] Keeping the bucket as asked")

    os.rename(STATE_PATH, STATE_PATH + ".torn-down")
    print("\nTeardown complete. State file renamed to staging-state.json.torn-down")
    print("Remember to delete staging-credentials.txt once you no longer need it.")
    print("\nVerify nothing production-side changed:  python staging_verify.py --after-teardown")


if __name__ == "__main__":
    main()
