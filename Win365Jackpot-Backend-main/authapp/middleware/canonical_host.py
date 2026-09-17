import logging

from django.core.exceptions import DisallowedHost
from django.http import HttpResponseBadRequest, HttpResponsePermanentRedirect

logger = logging.getLogger(__name__)

# Enough of the header to identify what sent it, without letting a caller
# write an unbounded string into the log by way of a giant Host.
_MAX_LOGGED_HOST = 120


class WWWRedirectMiddleware:
    """
    301-redirects any www.<host> request to the bare apex domain, preserving
    the full path and query string (www.jackpotsworld.vip/x?y=1 ->
    jackpotsworld.vip/x?y=1). Placed first in MIDDLEWARE so a www. request
    never pays for CORS/CSRF/session/URL-resolver work it's about to be
    redirected away from anyway.

    Being first also makes this the first thing to call get_host(), and
    therefore the first thing to hit ALLOWED_HOSTS — which is why the rejection
    of an unknown Host is handled here rather than being left to raise.

    WHY THAT MATTERS
    ────────────────
    Both of this environment's load-balancer addresses are public IPs, and the
    internet scans public IPs continuously. Each of those scans arrives with
    `Host: <lb-ip>`, which is not in ALLOWED_HOSTS, so DisallowedHost was being
    raised and logged by Django at ERROR *with a full traceback* several times
    an hour, forever. Nothing was broken — a request for a host we do not serve
    is correctly refused — but the traceback said "error" about routine
    background noise, which is how a log stops being worth reading.

    So the refusal is now explicit: the same 400 Django would have produced,
    without the exception, and one WARNING line instead of a stack trace.

    WHAT IS DELIBERATELY NOT DONE
    ─────────────────────────────
    The load balancer's IPs are NOT added to ALLOWED_HOSTS. They are assigned
    by AWS and change, so the list would silently rot; and allowing them would
    mean actually serving the site on a bare IP, which invites a non-canonical
    copy of the whole site to be crawled and indexed. Refusing is the correct
    behaviour — only the noise needed fixing.

    The ALB's own health check is unaffected: it uses the instance's PRIVATE
    IP, which backend/settings.py appends to ALLOWED_HOSTS from the EC2
    metadata service at startup.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            host = request.get_host().split(":")[0]
        except DisallowedHost:
            # The user agent is logged because it is what distinguishes noise
            # from a real fault. A scanner is nothing to act on; an
            # "ELB-HealthChecker" here would mean the instance's own private IP
            # never made it into ALLOWED_HOSTS (the metadata lookup in settings
            # failed), which takes the whole environment unhealthy and is
            # urgent. Both used to look like the same traceback.
            logger.warning(
                "Refused a request whose Host is not in ALLOWED_HOSTS: %r "
                "(path=%s, agent=%r). Routine for internet scans of the load "
                "balancer's public IPs; investigate only if the agent is a "
                "health checker or a domain we actually serve.",
                (request.META.get("HTTP_HOST") or "")[:_MAX_LOGGED_HOST],
                request.path,
                (request.META.get("HTTP_USER_AGENT") or "")[:_MAX_LOGGED_HOST],
            )
            # The same status Django's own handler returns for this, so nothing
            # downstream of the app sees a behaviour change.
            return HttpResponseBadRequest("Invalid Host header.")

        if host.startswith("www."):
            apex = host[len("www."):]
            scheme = "https" if request.is_secure() else "http"
            return HttpResponsePermanentRedirect(
                f"{scheme}://{apex}{request.get_full_path()}"
            )
        return self.get_response(request)
