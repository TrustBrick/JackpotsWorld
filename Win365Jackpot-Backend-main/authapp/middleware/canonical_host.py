from django.http import HttpResponsePermanentRedirect


class WWWRedirectMiddleware:
    """
    301-redirects any www.<host> request to the bare apex domain, preserving
    the full path and query string (www.jackpotsworld.vip/x?y=1 ->
    jackpotsworld.vip/x?y=1). Placed first in MIDDLEWARE so a www. request
    never pays for CORS/CSRF/session/URL-resolver work it's about to be
    redirected away from anyway.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = request.get_host().split(":")[0]
        if host.startswith("www."):
            apex = host[len("www."):]
            scheme = "https" if request.is_secure() else "http"
            return HttpResponsePermanentRedirect(
                f"{scheme}://{apex}{request.get_full_path()}"
            )
        return self.get_response(request)
