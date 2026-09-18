#!/usr/bin/env python3
"""
staging_verify.py - prove two things: production is untouched, and staging is isolated.

Read-only. It never modifies anything.

USAGE
    python staging_verify.py --baseline        # BEFORE building: fingerprint production
    python staging_verify.py                   # AFTER building: compare + isolation checks
    python staging_verify.py --after-teardown  # AFTER teardown: production still intact, staging gone
"""

import hashlib
import json
import os
import subprocess
import sys

REGION = "ap-south-1"
HERE = os.path.dirname(os.path.abspath(__file__))
BASELINE = os.path.join(HERE, "production-baseline.json")

PROD_ENV = "Jackpotsworld-env"
PROD_DB = "jackpotsworld"
PROD_REDIS_HOST = "jackpotsworld-redis.vean75.0001.aps1.cache.amazonaws.com"
PROD_BUCKET = "jackpotsworld-media"
PROD_SGS = ["sg-0d046a6e5b452f1c2", "sg-052722011c063cd36", "sg-0afe0ca31d17b3bdd", "sg-0592b2037f74e4702"]

STG_ENV = "Jackpotsworld-staging"
STG_DB = "jackpotsworld-staging"
STG_REDIS = "jackpotsworld-redis-staging"
STG_BUCKET = "jackpotsworld-media-staging"
STG_ROLE = "jackpotsworld-staging-ec2-role"

PASS, FAIL, INFO = [], [], []


def aws(*args, region=REGION, check=False):
    argv = ["aws", *args]
    if region:
        argv += ["--region", region]
    argv += ["--output", "json"]
    r = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", stdin=subprocess.DEVNULL)
    if r.returncode:
        if check:
            raise SystemExit("FAILED: aws %s\n%s" % (" ".join(args[:3]), r.stderr.strip()[:400]))
        return None
    return json.loads(r.stdout) if r.stdout.strip() else {}


def ok(msg):
    PASS.append(msg)


def bad(msg):
    FAIL.append(msg)


def fingerprint_production():
    fp = {}
    e = aws("elasticbeanstalk", "describe-environments", "--environment-names", PROD_ENV, check=True)["Environments"][0]
    fp["env"] = {k: e.get(k) for k in ("EnvironmentId", "VersionLabel", "Status", "Health", "DateUpdated", "CNAME", "EndpointURL")}
    res = aws("elasticbeanstalk", "describe-environment-resources", "--environment-name", PROD_ENV, check=True)["EnvironmentResources"]
    fp["instances"] = sorted(i["Id"] for i in res["Instances"])
    fp["load_balancers"] = sorted(l["Name"] for l in res["LoadBalancers"])
    lb = aws("elbv2", "describe-load-balancers", "--names", "awseb--AWSEB-Xe2XTYVR7IZZ", check=True)["LoadBalancers"][0]
    fp["alb"] = {"arn": lb["LoadBalancerArn"], "sgs": sorted(lb["SecurityGroups"]), "scheme": lb["Scheme"]}
    tg = aws("elbv2", "describe-target-groups", "--load-balancer-arn", lb["LoadBalancerArn"], check=True)["TargetGroups"][0]
    fp["target_group"] = {"name": tg["TargetGroupName"], "health_path": tg["HealthCheckPath"],
                          "interval": tg["HealthCheckIntervalSeconds"], "unhealthy": tg["UnhealthyThresholdCount"]}
    db = aws("rds", "describe-db-instances", "--db-instance-identifier", PROD_DB, check=True)["DBInstances"][0]
    fp["rds"] = {"class": db["DBInstanceClass"], "status": db["DBInstanceStatus"], "multi_az": db["MultiAZ"],
                 "public": db["PubliclyAccessible"], "endpoint": db["Endpoint"]["Address"],
                 "sgs": sorted(s["VpcSecurityGroupId"] for s in db["VpcSecurityGroups"])}
    rd = aws("elasticache", "describe-cache-clusters", "--cache-cluster-id", "jackpotsworld-redis",
             "--show-cache-node-info", check=True)["CacheClusters"][0]
    fp["redis"] = {"status": rd["CacheClusterStatus"], "node_type": rd["CacheNodeType"],
                   "endpoint": rd["CacheNodes"][0]["Endpoint"]["Address"]}
    sgs = {}
    for gid in PROD_SGS:
        g = aws("ec2", "describe-security-groups", "--group-ids", gid, check=True)["SecurityGroups"][0]
        sgs[gid] = hashlib.sha256(json.dumps([g["IpPermissions"], g["IpPermissionsEgress"]], sort_keys=True).encode()).hexdigest()[:16]
    fp["prod_sg_rule_hashes"] = sgs
    pol = aws("s3api", "get-bucket-policy", "--bucket", PROD_BUCKET)
    fp["prod_bucket_policy_sha"] = hashlib.sha256((pol or {}).get("Policy", "").encode()).hexdigest()[:16]
    fp["prod_bucket_pab"] = aws("s3api", "get-public-access-block", "--bucket", PROD_BUCKET)
    pitr = aws("rds", "describe-db-instances", "--db-instance-identifier", "jackpotsworld-pitr")
    fp["pitr_status"] = pitr["DBInstances"][0]["DBInstanceStatus"] if pitr else "absent"
    return fp


def compare_production():
    print("\nA. PRODUCTION UNTOUCHED")
    if not os.path.exists(BASELINE):
        print("   No baseline file. Run `python staging_verify.py --baseline` before building next time.")
        INFO.append("no production baseline captured")
        return
    old = json.load(open(BASELINE, encoding="utf-8"))
    new = fingerprint_production()
    checks = [
        ("environment version + id", old["env"]["VersionLabel"] == new["env"]["VersionLabel"] and old["env"]["EnvironmentId"] == new["env"]["EnvironmentId"]),
        ("environment last-updated timestamp", old["env"]["DateUpdated"] == new["env"]["DateUpdated"]),
        ("production instances", old["instances"] == new["instances"]),
        ("production load balancer + its security groups", old["alb"] == new["alb"]),
        ("target group health check", old["target_group"] == new["target_group"]),
        ("production RDS (class, AZ, access, endpoint)", old["rds"] == new["rds"]),
        ("production Redis", old["redis"] == new["redis"]),
        ("production security group rules", old["prod_sg_rule_hashes"] == new["prod_sg_rule_hashes"]),
        ("production bucket policy", old["prod_bucket_policy_sha"] == new["prod_bucket_policy_sha"]),
        ("production bucket public-access block", old["prod_bucket_pab"] == new["prod_bucket_pab"]),
        ("jackpotsworld-pitr untouched", old["pitr_status"] == new["pitr_status"]),
    ]
    for label, good in checks:
        (ok if good else bad)("%s %s" % ("unchanged:" if good else "CHANGED:", label))
        print("   %s %s" % ("PASS" if good else "FAIL", label))


def check_staging(expect_present=True):
    print("\nB. STAGING ISOLATION")
    env = aws("elasticbeanstalk", "describe-environments", "--environment-names", STG_ENV, "--no-include-deleted")
    present = bool(env and env.get("Environments"))
    if not expect_present:
        (ok if not present else bad)("staging environment gone" if not present else "staging environment still exists")
        print("   %s staging environment removed" % ("PASS" if not present else "FAIL"))
        for name, res in [("database", aws("rds", "describe-db-instances", "--db-instance-identifier", STG_DB)),
                          ("redis", aws("elasticache", "describe-cache-clusters", "--cache-cluster-id", STG_REDIS)),
                          ("bucket", aws("s3api", "head-bucket", "--bucket", STG_BUCKET))]:
            gone = res is None
            (ok if gone else bad)("staging %s %s" % (name, "removed" if gone else "STILL PRESENT"))
            print("   %s staging %s removed" % ("PASS" if gone else "FAIL", name))
        return
    if not present:
        bad("staging environment not found")
        print("   FAIL staging environment not found")
        return
    e = env["Environments"][0]
    print("   INFO staging status=%s health=%s url=%s" % (e["Status"], e.get("Health"), e.get("CNAME")))

    cfg = aws("elasticbeanstalk", "describe-configuration-settings",
              "--application-name", "jackpotsworld", "--environment-name", STG_ENV)
    opts = {o["OptionName"]: o.get("Value") for o in cfg["ConfigurationSettings"][0]["OptionSettings"]
            if o["Namespace"] == "aws:elasticbeanstalk:application:environment"}
    infra = {(o["Namespace"], o["OptionName"]): o.get("Value") for o in cfg["ConfigurationSettings"][0]["OptionSettings"]}

    db = aws("rds", "describe-db-instances", "--db-instance-identifier", STG_DB)
    db_ep = db["DBInstances"][0]["Endpoint"]["Address"] if db else ""
    rd = aws("elasticache", "describe-cache-clusters", "--cache-cluster-id", STG_REDIS, "--show-cache-node-info")
    rd_ep = rd["CacheClusters"][0]["CacheNodes"][0]["Endpoint"]["Address"] if rd else ""

    tests = [
        ("staging points at the staging database", opts.get("DB_HOST") == db_ep and db_ep != ""),
        ("staging does NOT point at the production database", PROD_DB + "." not in (opts.get("DB_HOST") or "x")),
        ("staging points at the staging Redis", rd_ep and rd_ep in (opts.get("REDIS_URL") or "")),
        ("staging does NOT point at production Redis", PROD_REDIS_HOST not in (opts.get("REDIS_URL") or "")),
        ("staging uses the staging bucket", opts.get("AWS_STORAGE_BUCKET_NAME") == STG_BUCKET),
        ("staging sends no real email", "console" in (opts.get("EMAIL_BACKEND") or "")),
        ("staging uses the Turnstile test secret", (opts.get("TURNSTILE_SECRET_KEY") or "").startswith("1x0000")),
        ("staging admin emails are staging-only", "staging-" in (opts.get("ADMIN_EMAIL") or "")),
        ("staging uses its own instance role", infra.get(("aws:autoscaling:launchconfiguration", "IamInstanceProfile")) == STG_ROLE),
        ("staging database is not publicly accessible", bool(db) and db["DBInstances"][0]["PubliclyAccessible"] is False),
        ("staging database is encrypted", bool(db) and db["DBInstances"][0].get("StorageEncrypted") is True),
        ("staging has its own load balancer", (e.get("EndpointURL") or "") != "" and "Xe2XTYVR7IZZ" not in (e.get("EndpointURL") or "")),
        ("staging never self-updates mid-test", infra.get(("aws:elasticbeanstalk:managedactions", "ManagedActionsEnabled")) in ("false", None)),
    ]
    for label, good in tests:
        (ok if good else bad)(("isolated: " if good else "NOT ISOLATED: ") + label)
        print("   %s %s" % ("PASS" if good else "FAIL", label))

    pab = aws("s3api", "get-public-access-block", "--bucket", STG_BUCKET)
    good = bool(pab) and all(pab["PublicAccessBlockConfiguration"].values())
    (ok if good else bad)("staging bucket blocks all public access")
    print("   %s staging bucket blocks all public access" % ("PASS" if good else "FAIL"))

    for gid_name in ("jackpotsworld-staging-db-sg", "jackpotsworld-staging-redis-sg"):
        g = aws("ec2", "describe-security-groups", "--filters", "Name=group-name,Values=" + gid_name)
        if not g or not g["SecurityGroups"]:
            continue
        cidrs = [r["CidrIp"] for p in g["SecurityGroups"][0]["IpPermissions"] for r in p.get("IpRanges", [])]
        good = cidrs and all(c == "172.31.0.0/16" for c in cidrs)
        (ok if good else bad)("%s allows only the VPC" % gid_name)
        print("   %s %s allows only the VPC (%s)" % ("PASS" if good else "FAIL", gid_name, ",".join(cidrs) or "none"))


def main():
    if "--baseline" in sys.argv:
        fp = fingerprint_production()
        with open(BASELINE, "w", encoding="utf-8") as f:
            json.dump(fp, f, indent=2)
        print("Production fingerprint written to %s" % BASELINE)
        print("  environment %s, version %s, instances %s" % (fp["env"]["EnvironmentId"], fp["env"]["VersionLabel"], ", ".join(fp["instances"])))
        print("  Run this script again after building staging to prove nothing here moved.")
        return
    compare_production()
    check_staging(expect_present="--after-teardown" not in sys.argv)
    print("\n" + "=" * 68)
    print("RESULT: %d passed, %d failed" % (len(PASS), len(FAIL)))
    for f in FAIL:
        print("  FAIL  %s" % f)
    print("=" * 68)
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
