"""VOICE-CALL: print the ICE configuration this deployment actually serves.

A call that rings, connects and then carries silence is almost always a missing
or misconfigured relay, and the quickest way to tell is to look at what the
browser is being handed rather than to guess. This prints exactly that, and
mints a live TURN credential you can paste straight into a Trickle ICE tester
to prove the relay end to end.

The shared secret itself is never printed — only a derived credential that
stops working after WEBRTC_TURN_CREDENTIAL_TTL seconds.

    python manage.py check_turn
    python manage.py check_turn --json
"""
import json

from django.conf import settings
from django.core.management.base import BaseCommand

from authapp.services import voice_call_service


class Command(BaseCommand):
    help = "Show the STUN/TURN configuration served to browsers, and diagnose gaps."

    def add_arguments(self, parser):
        parser.add_argument(
            "--json", action="store_true", dest="as_json",
            help="Emit machine-readable output instead of the report.",
        )

    def handle(self, *args, **options):
        servers = voice_call_service.ice_servers()

        def urls_of(prefix):
            out = []
            for server in servers:
                for url in server.get("urls", []):
                    if str(url).lower().startswith(prefix):
                        out.append(url)
            return out

        stun = urls_of("stun")
        turn = urls_of("turn")
        turn_entry = next(
            (s for s in servers
             if any(str(u).lower().startswith("turn") for u in s.get("urls", []))),
            None,
        )
        configured_turn = list(getattr(settings, "WEBRTC_TURN_URLS", []) or [])

        if not configured_turn:
            verdict = "NO_TURN"
        elif not turn_entry:
            verdict = "TURN_MISCONFIGURED"
        else:
            verdict = "OK"

        if options["as_json"]:
            self.stdout.write(json.dumps({
                "calling_available": voice_call_service.calling_available(),
                "stun": stun,
                "turn": turn,
                "turn_username": (turn_entry or {}).get("username", ""),
                "verdict": verdict,
            }, indent=2))
            return

        self.stdout.write(self.style.MIGRATE_HEADING("Voice call ICE configuration"))
        self.stdout.write(
            f"  calling available : {voice_call_service.calling_available()}"
        )
        self.stdout.write(f"  STUN servers      : {len(stun)}")
        for url in stun:
            self.stdout.write(f"      {url}")
        self.stdout.write(f"  TURN servers      : {len(turn)}")
        for url in turn:
            self.stdout.write(f"      {url}")

        if verdict == "OK":
            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("  A relay is configured."))
            self.stdout.write("  Test credential (expires - safe to paste into a tester):")
            self.stdout.write(f"      username : {turn_entry.get('username')}")
            self.stdout.write(f"      password : {turn_entry.get('credential')}")
            self.stdout.write("")
            self.stdout.write("  Verify at https://webrtc.github.io/samples/src/content/"
                              "peerconnection/trickle-ice/ - enter the turn: URL with the")
            self.stdout.write("  pair above and press Gather candidates. You must see a")
            self.stdout.write("  component of type 'relay'. If you only see 'srflx', the")
            self.stdout.write("  relay is not reachable and calls will still fail between")
            self.stdout.write("  networks with no direct path.")
            return

        self.stdout.write("")
        if verdict == "NO_TURN":
            self.stdout.write(self.style.ERROR(
                "  No TURN relay is configured (WEBRTC_TURN_URLS is empty)."
            ))
            self.stdout.write(
                "  STUN alone connects two peers only when at least one side's NAT\n"
                "  allows a direct path. Symmetric NAT and carrier-grade NAT - which\n"
                "  is normal on mobile data - have no such path, so those calls will\n"
                "  ring, connect and carry silence. See deploy/turn/README.md."
            )
        else:
            self.stdout.write(self.style.ERROR(
                "  WEBRTC_TURN_URLS is set but no usable credentials were produced."
            ))
            self.stdout.write(
                "  Set WEBRTC_TURN_STATIC_AUTH_SECRET (preferred - short-lived\n"
                "  credentials), or both WEBRTC_TURN_USERNAME and\n"
                "  WEBRTC_TURN_CREDENTIAL. Until then only STUN is served."
            )
