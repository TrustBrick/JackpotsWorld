from django.contrib import admin
from django.urls import path, include
from django.conf.urls.static import static
from django.conf import settings
from authapp.url_patterns.gift_level_urls import admin_urlpatterns, user_urlpatterns
from django.http import JsonResponse

def home(request):
    return JsonResponse({
        "status": "ok",
        "message": "Win365Jackpot Backend Running 🚀"
    })

urlpatterns = [
    path('', home),
    path('admin/', admin.site.urls),

    # Main app APIs (auth, users, wallet, rewards, etc.)
    path('api/', include('authapp.urls')),

    # Admin panel APIs from gift_level_urls
    path('admin-panel/', include((admin_urlpatterns, 'admin_gifts'))),

    # User gift/level APIs
    path('api/', include((user_urlpatterns, 'user_gifts'))),

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)