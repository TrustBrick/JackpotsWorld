import os

from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.http import JsonResponse, FileResponse, Http404
from django.views.static import serve as serve_static
from authapp.url_patterns.gift_level_urls import admin_urlpatterns, user_urlpatterns


def healthz(request):
    return JsonResponse({
        "status": "ok",
        "message": "Win365Jackpot Backend Running 🚀"
    })


def spa_index(request, *args, **kwargs):
    """
    Catch-all for the React SPA. Whitenoise (via WHITENOISE_ROOT, see
    settings.py) already serves every real file in the frontend build —
    assets/*.js, favicon.ico, etc. — before Django's URL resolver even runs.
    Anything that reaches this view is a client-side route (e.g. /dashboard,
    /login) that only exists in the React Router config, so every one of
    them gets the same index.html and the SPA's own router takes it from
    there.
    """
    frontend_root = getattr(settings, 'WHITENOISE_ROOT', None)
    index_path = os.path.join(frontend_root, 'index.html') if frontend_root else None
    if not index_path or not os.path.isfile(index_path):
        raise Http404(
            "Frontend build not found. Set FRONTEND_DIST_DIR to the built "
            "React app's dist/ folder and restart Passenger — see DEPLOYMENT.md."
        )
    response = FileResponse(open(index_path, 'rb'), content_type='text/html')
    # Always revalidate index.html so a new deploy's hashed asset filenames
    # are picked up immediately instead of being served from a cached shell.
    response['Cache-Control'] = 'no-cache'
    return response


urlpatterns = [
    path('admin/', admin.site.urls),

    # Moved off '/' — the SPA owns the domain root now (see spa_index below).
    path('healthz/', healthz),

    # Main app APIs (auth, users, wallet, rewards, etc.)
    path('api/', include('authapp.urls')),

    # Admin panel APIs from gift_level_urls
    path('admin-panel/', include((admin_urlpatterns, 'admin_gifts'))),

    # User gift/level APIs
    path('api/', include((user_urlpatterns, 'user_gifts'))),

] + [
    # Serves user-uploaded media (avatars, KYC docs, promo/event images, ...)
    # from MEDIA_ROOT. Django's django.conf.urls.static.static() helper only
    # registers this route when settings.DEBUG is True — in production
    # (DEBUG=False, as it should be) it silently returns an empty pattern
    # list, so every /media/... request 404s. There's no separate Nginx/
    # Apache vhost or CDN serving this app (Whitenoise only covers
    # STATIC_ROOT and the frontend dist/, see settings.py), so this route
    # must be registered unconditionally, not gated on DEBUG.
    re_path(
        r'^%s(?P<path>.*)$' % settings.MEDIA_URL.lstrip('/'),
        serve_static,
        {'document_root': settings.MEDIA_ROOT},
    ),
] + [
    # React SPA catch-all — must stay last. The negative lookahead is
    # required, not cosmetic: when a path under a reserved prefix doesn't
    # match anything inside that include()'s urlconf (e.g. a typo'd or
    # retired /api/ endpoint), Django's resolver falls through to the next
    # top-level pattern rather than raising immediately — without this
    # exclusion a bad /api/... request would silently return the SPA's
    # index.html with a 200 instead of a real 404.
    re_path(r'^(?!api/|admin/|admin-panel/|static/|media/|healthz/).*$', spa_index),
]
