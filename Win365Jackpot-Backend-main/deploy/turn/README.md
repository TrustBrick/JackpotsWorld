# TURN relay for in-app voice calls

## Why this exists

Support calls are peer-to-peer. When both people are on the same network the
two browsers talk directly and everything works — which is exactly why calls
succeed when the agent and the player are in the same place and fail when they
are not.

Across networks, WebRTC has to punch a path through both sides' NAT. STUN
(already configured, no server needed) is enough **only when at least one side's
NAT allows a direct path**. It does not exist when either side is behind:

- **carrier-grade NAT** — standard on mobile data, so a player calling from
  their phone is the common case, not an edge case;
- **symmetric NAT** — common on corporate and hotel networks;
- **firewalls that block UDP outright**.

For those, a relay is not an optimisation. It is the only route the audio can
take. Without one the call rings, connects, shows a timer, and carries silence.

This directory sets up **coturn**, self-hosted, so that relayed audio stays
inside your own infrastructure — which matters here because those calls are
being recorded.

## What you end up with

A small EC2 instance with a fixed public address running coturn, and two
environment variables on the Elastic Beanstalk app. No application code
changes: `authapp/services/voice_call_service.ice_servers()` already speaks
coturn's time-limited credential scheme.

---

## 1. Launch the instance

A dedicated box, **not** the Elastic Beanstalk instance — EB instances get
replaced (which is how the media on this environment was lost once already), a
relay needs a stable address, and it needs a wide UDP range open that has no
business being open on the app server.

- **AMI**: Ubuntu Server 24.04 LTS
- **Type**: `t4g.small` (ARM, cheapest that comfortably handles concurrent
  relays). `t4g.micro` is fine for a handful of simultaneous calls.
- **Elastic IP**: allocate one and associate it. This is required — a relay
  whose address changes on reboot breaks every call after the reboot.
- Same region as the app (`ap-south-1`) to keep latency down.

## 2. Security group

Create a new group, e.g. `jackpotsworld-turn`. Inbound:

| Type       | Protocol | Port range    | Source          | Why |
|------------|----------|---------------|-----------------|-----|
| Custom     | UDP      | 3478          | `0.0.0.0/0`     | STUN/TURN — the main path |
| Custom     | TCP      | 3478          | `0.0.0.0/0`     | TURN where UDP is blocked |
| Custom     | TCP      | 443           | `0.0.0.0/0`     | TURNS over TLS — the fallback that gets through the strictest networks |
| Custom     | UDP      | 49152–49500   | `0.0.0.0/0`     | the relay allocations themselves |
| SSH        | TCP      | 22            | **your IP only**| administration |
| HTTP       | TCP      | 80            | `0.0.0.0/0`     | certbot only; may be removed after issuance if you renew via DNS |

The wide sources are correct and unavoidable: players call from arbitrary
networks, so the relay has to be reachable from anywhere. What stops it being
abused is the authentication and the peer denials in `turnserver.conf`, not the
security group.

## 3. DNS

Add an `A` record pointing at the Elastic IP:

    turn.jackpotsworld.vip.  A  <elastic-ip>

Needed before step 4, because certbot validates over HTTP against that name.

## 4. Install

Copy this directory to the instance and run:

```bash
sudo ./install-coturn.sh turn.jackpotsworld.vip jackpotsworld.vip
```

It installs coturn, reads the instance's own addresses from IMDS, generates a
shared secret, obtains a TLS certificate, writes `/etc/turnserver.conf`, and
starts the service. It is safe to re-run; the secret is only generated once and
kept at `/etc/coturn-secret`.

It prints the two environment variables to set. **The secret is shown once** —
it is also readable later at `/etc/coturn-secret` on the instance.

## 5. Point the app at it

Set on the Elastic Beanstalk environment (values come from the installer's
output):

    WEBRTC_TURN_URLS=turn:turn.jackpotsworld.vip:3478?transport=udp,turn:turn.jackpotsworld.vip:3478?transport=tcp,turns:turn.jackpotsworld.vip:443?transport=tcp
    WEBRTC_TURN_STATIC_AUTH_SECRET=<the secret the installer printed>

The secret must match the instance's exactly — the backend derives every
client credential from it, so a mismatch means every relayed call fails
authentication while STUN-only calls keep working, which looks like an
intermittent fault rather than a config error.

Listing all three URLs is deliberate: ICE tries them in parallel and uses
whichever answers first, so a network that blocks UDP still gets TCP, and one
that blocks everything but 443 still gets TLS.

## 6. Verify

**On the app instance**, confirm what the browser is actually being served:

```bash
python manage.py check_turn
```

It prints the STUN/TURN list and mints a short-lived credential. Paste the
`turn:` URL and that credential into the
[Trickle ICE tester](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
and press *Gather candidates*.

- A row of type **`relay`** — the relay works. This is the proof.
- Only `host` and `srflx` — the relay is not reachable or the credential is
  rejected. Check the security group and that the secret matches.

Then the real test: **player on mobile data, agent on office wifi**, call and
talk both ways.

## Cost

A `t4g.small` is roughly $12/month. Relayed audio is Opus at about 40 kbps per
direction, and only calls that *need* the relay use it — AWS egress at
$0.09/GB works out to well under a dollar a month at support-desk volumes. The
instance, not the bandwidth, is the cost.

## Troubleshooting

**coturn will not start.** `journalctl -u coturn -n 50`. The usual cause is TLS
paths pointing at a certificate that was never issued; the installer comments
those lines out when certbot fails, so re-run it after fixing DNS.

**Calls still fail from mobile.** Confirm `check_turn` reports a relay, then
check `sudo tcpdump -ni any port 3478` on the instance while placing a call — no
packets means the security group or DNS, packets but no allocation means
authentication (secret mismatch).

**How to tell whether a specific failed call was a relay problem.** Failed
calls record what each side gathered, on the call's audit row:

```sql
SELECT c.id, c.end_reason, e.detail, c.created_at
FROM authapp_callevent e
JOIN authapp_callsession c ON c.id = e.call_id
WHERE e.event = 'failed'
ORDER BY e.id DESC LIMIT 20;
```

`detail` reads like `ringing->failed:connection_failed ice:l=host+srflx,r=host,turn=0`:

- `turn=0` — no relay was offered to that browser at all.
- `l=host` only — that side never learned its public address; STUN was
  unreachable from its network.
- `l=...+relay` present and still failed — the relay was offered but could not
  be used; check the instance.

**Certificate renewal.** The installer adds a deploy hook that re-applies file
permissions and restarts coturn, because a renewal otherwise leaves coturn
holding the old certificate and reading files it no longer has access to.
