#!/usr/bin/env bash
#
# Install and configure coturn as the TURN relay for JackpotsWorld voice calls.
# Run ON THE TURN INSTANCE (Ubuntu 22.04/24.04), as root or with sudo.
#
#   sudo ./install-coturn.sh turn.jackpotsworld.vip jackpotsworld.vip
#
# Arguments:
#   $1  TURN hostname  — the DNS A record pointing at this instance's Elastic IP
#   $2  realm          — the site's domain (cosmetic; must match nothing else)
#
# The shared secret is generated here and printed once at the end. Put it in
# the Elastic Beanstalk environment as WEBRTC_TURN_STATIC_AUTH_SECRET — the
# backend derives every client credential from it, so the two must match
# exactly or every relayed call fails authentication.
#
# Idempotent: safe to re-run to pick up a config change. Re-running generates a
# NEW secret only if one is not already stored at /etc/coturn-secret.

set -euo pipefail

TURN_HOST="${1:-}"
REALM="${2:-}"

if [[ -z "$TURN_HOST" || -z "$REALM" ]]; then
    echo "usage: $0 <turn-hostname> <realm>" >&2
    echo "example: $0 turn.jackpotsworld.vip jackpotsworld.vip" >&2
    exit 2
fi

if [[ $EUID -ne 0 ]]; then
    echo "run this with sudo" >&2
    exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Installing coturn"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq coturn certbot curl

echo "==> Discovering this instance's addresses"
# IMDSv2. A token is required on instances configured to demand it, and works
# fine on those that do not.
TOKEN="$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 300" || true)"
meta() {
    curl -sS -H "X-aws-ec2-metadata-token: ${TOKEN}" \
        "http://169.254.169.254/latest/meta-data/$1"
}
PRIVATE_IP="$(meta local-ipv4)"
PUBLIC_IP="$(meta public-ipv4)"

if [[ -z "$PRIVATE_IP" || -z "$PUBLIC_IP" ]]; then
    echo "could not read instance addresses from IMDS." >&2
    echo "This instance needs a public address (attach an Elastic IP)." >&2
    exit 1
fi
echo "    private: $PRIVATE_IP"
echo "    public : $PUBLIC_IP"

echo "==> Shared secret"
if [[ -s /etc/coturn-secret ]]; then
    SECRET="$(cat /etc/coturn-secret)"
    echo "    reusing the existing secret at /etc/coturn-secret"
else
    SECRET="$(openssl rand -hex 32)"
    printf '%s' "$SECRET" > /etc/coturn-secret
    chmod 600 /etc/coturn-secret
    echo "    generated a new secret"
fi

echo "==> TLS certificate for $TURN_HOST"
# certbot needs port 80 free and the DNS record already pointing here. Failing
# this is not fatal: plain turn: on 3478 still relays, it just loses the 443
# fallback that gets through the most restrictive networks.
TLS_OK=1
if [[ -f "/etc/letsencrypt/live/${TURN_HOST}/fullchain.pem" ]]; then
    echo "    certificate already present"
elif certbot certonly --standalone --non-interactive --agree-tos \
        --register-unsafely-without-email -d "$TURN_HOST"; then
    echo "    certificate issued"
else
    echo "    !! certbot failed - continuing WITHOUT TLS."
    echo "       Plain turn: on 3478 will still work for most networks."
    echo "       Fix DNS/port 80 and re-run this script to add TLS."
    TLS_OK=0
fi

echo "==> Writing /etc/turnserver.conf"
install -m 640 -o root -g turnserver /dev/null /etc/turnserver.conf
sed -e "s|__PUBLIC_IP__|${PUBLIC_IP}|g" \
    -e "s|__PRIVATE_IP__|${PRIVATE_IP}|g" \
    -e "s|__SECRET__|${SECRET}|g" \
    -e "s|__REALM__|${REALM}|g" \
    -e "s|__TURN_HOST__|${TURN_HOST}|g" \
    "${HERE}/turnserver.conf.template" > /etc/turnserver.conf

if [[ "$TLS_OK" -eq 0 ]]; then
    # Comment out the TLS lines rather than leaving coturn pointing at files
    # that do not exist, which stops it starting at all.
    sed -i -e 's|^cert=|#cert=|' -e 's|^pkey=|#pkey=|' \
           -e 's|^tls-listening-port=|#tls-listening-port=|' /etc/turnserver.conf
fi

# coturn reads the certificate as an unprivileged user after dropping
# privileges, so it needs traversal into letsencrypt's directories.
if [[ "$TLS_OK" -eq 1 ]]; then
    chgrp -R turnserver /etc/letsencrypt/live /etc/letsencrypt/archive || true
    chmod -R g+rX /etc/letsencrypt/live /etc/letsencrypt/archive || true
    # Renewal replaces the files and resets those permissions; re-apply and
    # restart coturn so a renewed certificate is actually picked up.
    cat > /etc/letsencrypt/renewal-hooks/deploy/coturn.sh <<'HOOK'
#!/usr/bin/env bash
set -e
chgrp -R turnserver /etc/letsencrypt/live /etc/letsencrypt/archive || true
chmod -R g+rX /etc/letsencrypt/live /etc/letsencrypt/archive || true
systemctl restart coturn
HOOK
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn.sh
fi

echo "==> Enabling the service"
# Ubuntu ships coturn disabled behind this flag.
if [[ -f /etc/default/coturn ]]; then
    sed -i 's|^#*TURNSERVER_ENABLED=.*|TURNSERVER_ENABLED=1|' /etc/default/coturn
    grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn || \
        echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
fi
systemctl enable coturn
systemctl restart coturn
sleep 2
systemctl --no-pager --lines=0 status coturn || true

echo
echo "============================================================"
echo "coturn is running on ${PUBLIC_IP} (${TURN_HOST})"
echo
echo "Set these on the Elastic Beanstalk environment:"
echo
if [[ "$TLS_OK" -eq 1 ]]; then
    echo "  WEBRTC_TURN_URLS=turn:${TURN_HOST}:3478?transport=udp,turn:${TURN_HOST}:3478?transport=tcp,turns:${TURN_HOST}:443?transport=tcp"
else
    echo "  WEBRTC_TURN_URLS=turn:${TURN_HOST}:3478?transport=udp,turn:${TURN_HOST}:3478?transport=tcp"
fi
echo "  WEBRTC_TURN_STATIC_AUTH_SECRET=${SECRET}"
echo
echo "Then verify from the app instance:  python manage.py check_turn"
echo "============================================================"
