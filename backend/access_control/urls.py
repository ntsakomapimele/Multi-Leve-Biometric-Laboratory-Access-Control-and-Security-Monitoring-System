from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    LaboratoryViewSet,
    BiometricProfileViewSet,
    AccessPermissionViewSet,
    AuthenticationEventViewSet,
    SecurityEventViewSet,
    UserViewSet,
    AuthenticateView,
    FingerprintScanView,
    ReaderTestView,
    FaceEnrollmentView,
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

router.register(
    r"users",
    UserViewSet,
)
urlpatterns = [
    path("authenticate/", AuthenticateView.as_view()),
    path("fingerprint-scan/", FingerprintScanView.as_view()),
    path("reader-test/", ReaderTestView.as_view()),
    path("face-enroll/", FaceEnrollmentView.as_view()),
]
urlpatterns += router.urls