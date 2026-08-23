from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    LaboratoryViewSet,
    BiometricProfileViewSet,
    AccessPermissionViewSet,
    AuthenticationEventViewSet,
    SecurityEventViewSet,
     AuthenticateView,
)


router = DefaultRouter()

router.register(
    r"laboratories",
    LaboratoryViewSet,
)

router.register(
    r"biometric-profiles",
    BiometricProfileViewSet,
)

router.register(
    r"access-permissions",
    AccessPermissionViewSet,
)

router.register(
    r"authentication-events",
    AuthenticationEventViewSet,
)

router.register(
    r"security-events",
    SecurityEventViewSet,
)
urlpatterns = [
    path("authenticate/", AuthenticateView.as_view()),
]
urlpatterns += router.urls