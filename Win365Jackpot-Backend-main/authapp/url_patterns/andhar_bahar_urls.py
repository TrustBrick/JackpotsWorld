# authapp/url_patterns/andhar_bahar_urls.py
#
# ANDHAR-BAHAR: public page content + events, and the Back Office CRUD behind
# them. Mounted from authapp/urls.py (public at api/, admin at
# api/admin-panel/). Safe to delete this file + its import/include block in
# urls.py to remove the feature's routes.
from django.urls import path

from authapp.views.andhar_bahar_views import (
    AdminAndharBaharContentView,
    AdminAndharBaharRegistrationDetailView,
    AdminAndharBaharRegistrationListView,
    AdminAndharBaharEventDetailView,
    AdminAndharBaharEventListCreateView,
    AdminAndharBaharHighlightDetailView,
    AdminAndharBaharHighlightListCreateView,
    AdminAndharBaharStepDetailView,
    AdminAndharBaharStepListCreateView,
    AndharBaharEventDetailView,
    AndharBaharEventListView,
    AndharBaharFilterOptionsView,
    AndharBaharMediaDetailView,
    AndharBaharMediaListCreateView,
    AndharBaharMyRegistrationsView,
    AndharBaharPageView,
    AndharBaharRegisterView,
)

# Public — mounted at api/andhar-bahar/
public_urlpatterns = [
    path("andhar-bahar/content/", AndharBaharPageView.as_view()),
    # "filters" is declared before the <int:pk> detail route for the same
    # reason the Teen Patti urls do it: a literal segment would otherwise be
    # captured by the detail pattern and always 404.
    path("andhar-bahar/events/filters/", AndharBaharFilterOptionsView.as_view()),
    # Literal, so it is never captured by the <int:pk> detail route below.
    path("andhar-bahar/my-registrations/", AndharBaharMyRegistrationsView.as_view()),
    path("andhar-bahar/events/", AndharBaharEventListView.as_view()),
    path("andhar-bahar/events/<int:pk>/", AndharBaharEventDetailView.as_view()),
    path("andhar-bahar/events/<int:pk>/register/", AndharBaharRegisterView.as_view()),
]

# Admin-managed — mounted at api/admin-panel/andhar-bahar/ (IsAdminOrSuperAdmin)
admin_urlpatterns = [
    path("andhar-bahar/content/", AdminAndharBaharContentView.as_view()),
    path("andhar-bahar/highlights/", AdminAndharBaharHighlightListCreateView.as_view()),
    path("andhar-bahar/highlights/<int:pk>/", AdminAndharBaharHighlightDetailView.as_view()),
    path("andhar-bahar/steps/", AdminAndharBaharStepListCreateView.as_view()),
    path("andhar-bahar/steps/<int:pk>/", AdminAndharBaharStepDetailView.as_view()),
    path("andhar-bahar/events/", AdminAndharBaharEventListCreateView.as_view()),
    path("andhar-bahar/events/<int:pk>/", AdminAndharBaharEventDetailView.as_view()),
    path("andhar-bahar/media/", AndharBaharMediaListCreateView.as_view()),
    path("andhar-bahar/media/<int:pk>/", AndharBaharMediaDetailView.as_view()),
    # Registrations. "registrations" is a literal ahead of no int route here,
    # but kept adjacent to its detail route so the pair reads together.
    path("andhar-bahar/registrations/", AdminAndharBaharRegistrationListView.as_view()),
    path("andhar-bahar/registrations/<int:pk>/", AdminAndharBaharRegistrationDetailView.as_view()),
]
