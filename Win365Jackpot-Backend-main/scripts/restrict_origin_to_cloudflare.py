"""
scripts/restrict_origin_to_cloudflare.py
─────────────────────────────────────────────────────────────────────────────
Locks the load balancer's security group down to Cloudflare's edge ranges, so
the origin can only be reached *through* the proxy.

Why it matters: with 0.0.0.0/0 on 80/443 anyone who learns the environment's
CNAME can talk to the origin directly and skip Cloudflare's WAF, bot rules
and DDoS protection entirely — every security control configured in the
Cloudflare dashboard becomes optional from the attacker's point of view.

Re-runnable on purpose. Elastic Beanstalk owns this security group and can
re-add 0.0.0.0/0 when the environment is rebuilt or its load balancer config
changes, so this is worth running again after any such operation.

    python scripts/restrict_origin_to_cloudflare.py            # show the plan
    python scripts/restrict_origin_to_cloudflare.py --apply    # make the change
    python scripts/restrict_origin_to_cloudflare.py --revert   # back to 0.0.0.0/0

IMPORTANT — do not apply while DNS is still propagating onto Cloudflare.
Any visitor whose resolver still holds the pre-migration A records connects
to the origin directly, and this change drops those connections. Confirm the
migration has settled first:

    nslookup -type=NS jackpotsworld.vip 8.8.8.8

Every nameserver in the answer should be *.ns.cloudflare.com, and it is worth
checking several public resolvers, not just one.
"""
import argparse
import sys

import boto3

REGION = "ap-south-1"
ENV = "Jackpotsworld-env"
PROFILE = "eb-cli"
PORTS = (80, 443)
OPEN_V4 = "0.0.0.0/0"

# https://www.cloudflare.com/ips/ — fetched 2026-08-05. Keep in step with
# authapp/utils/client_ip.py, which uses the same list to decide whether a
# request genuinely arrived via Cloudflare.
CF_V4 = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
]
CF_V6 = [
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
]


def load_balancer_security_groups(session):
    eb = session.client("elasticbeanstalk")
    elbv2 = session.client("elbv2")
    resources = eb.describe_environment_resources(EnvironmentName=ENV)
    arns = [lb["Name"] for lb in resources["EnvironmentResources"]["LoadBalancers"]]
    groups = []
    for arn in arns:
        lb = elbv2.describe_load_balancers(LoadBalancerArns=[arn])["LoadBalancers"][0]
        groups.extend(lb["SecurityGroups"])
    return groups


def current_sources(ec2, sg_id, port):
    sg = ec2.describe_security_groups(GroupIds=[sg_id])["SecurityGroups"][0]
    found = set()
    for perm in sg["IpPermissions"]:
        if perm.get("IpProtocol") != "tcp":
            continue
        if perm.get("FromPort") != port or perm.get("ToPort") != port:
            continue
        found.update(r["CidrIp"] for r in perm.get("IpRanges", []))
        found.update(r["CidrIpv6"] for r in perm.get("Ipv6Ranges", []))
    return found


def permission(port, v4=(), v6=()):
    perm = {"IpProtocol": "tcp", "FromPort": port, "ToPort": port}
    if v4:
        perm["IpRanges"] = [
            {"CidrIp": c, "Description": "Cloudflare edge"} for c in v4
        ]
    if v6:
        perm["Ipv6Ranges"] = [
            {"CidrIpv6": c, "Description": "Cloudflare edge"} for c in v6
        ]
    return perm


def apply_lockdown(ec2, sg_id, dry_run):
    for port in PORTS:
        existing = current_sources(ec2, sg_id, port)
        missing_v4 = [c for c in CF_V4 if c not in existing]
        missing_v6 = [c for c in CF_V6 if c not in existing]

        # Grant Cloudflare *before* revoking the open rule, so there is never
        # a moment where the listener accepts nothing.
        if missing_v4 or missing_v6:
            print(
                "  tcp/%d: add %d Cloudflare ranges"
                % (port, len(missing_v4) + len(missing_v6))
            )
            if not dry_run:
                ec2.authorize_security_group_ingress(
                    GroupId=sg_id,
                    IpPermissions=[permission(port, missing_v4, missing_v6)],
                )
        else:
            print("  tcp/%d: Cloudflare ranges already present" % port)

        if OPEN_V4 in existing:
            print("  tcp/%d: revoke %s" % (port, OPEN_V4))
            if not dry_run:
                ec2.revoke_security_group_ingress(
                    GroupId=sg_id,
                    IpPermissions=[permission(port, [OPEN_V4])],
                )
        else:
            print("  tcp/%d: %s not present" % (port, OPEN_V4))


def apply_revert(ec2, sg_id, dry_run):
    """Restore unrestricted access. For emergencies — if locking down turns
    out to have cut off real traffic, this puts it back immediately."""
    for port in PORTS:
        existing = current_sources(ec2, sg_id, port)
        if OPEN_V4 not in existing:
            print("  tcp/%d: restore %s" % (port, OPEN_V4))
            if not dry_run:
                ec2.authorize_security_group_ingress(
                    GroupId=sg_id, IpPermissions=[permission(port, [OPEN_V4])]
                )
        else:
            print("  tcp/%d: %s already present" % (port, OPEN_V4))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="perform the lockdown")
    group.add_argument("--revert", action="store_true", help="restore 0.0.0.0/0")
    args = parser.parse_args()

    dry_run = not (args.apply or args.revert)
    session = boto3.Session(profile_name=PROFILE, region_name=REGION)
    ec2 = session.client("ec2")

    sgs = load_balancer_security_groups(session)
    if not sgs:
        sys.exit("no load balancer security group found for %s" % ENV)

    action = "REVERT" if args.revert else "LOCKDOWN"
    print("%s%s on %s" % (action, " (dry run)" if dry_run else "", ", ".join(sgs)))
    for sg_id in sgs:
        print("\n%s:" % sg_id)
        if args.revert:
            apply_revert(ec2, sg_id, dry_run)
        else:
            apply_lockdown(ec2, sg_id, dry_run)

    if dry_run:
        print("\nNothing changed. Re-run with --apply to execute.")


if __name__ == "__main__":
    main()
