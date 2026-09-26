class ApiNoIndexMiddleware:
    """
    Adds `X-Robots-Tag: noindex` to every /api/ response.

    WHY THIS EXISTS
    ───────────────
    robots.txt used to `Disallow: /api/`. Googlebot's renderer honours
    robots.txt for the fetch() calls a page makes while rendering, so every
    public page (/, /events, /promotions, …) rendered its "Couldn't load …"
    error state for Google, and Search Console flagged /promotions as a
    Soft 404. The Disallow is gone so the renderer can load the data; this
    header is what now keeps the raw JSON out of search results.

    The two are not interchangeable: a Disallow stops the fetch (breaking the
    render), while noindex lets the fetch happen but forbids listing the URL.
    Private endpoints need no special casing — they already refuse a caller
    with no session.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            response["X-Robots-Tag"] = "noindex"
        return response
