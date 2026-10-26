from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdministrator(BasePermission):
    message = "Administrator access required."

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.groups.filter(
                name="Administrator"
            ).exists()
        )


class IsSecurityOfficer(BasePermission):
    message = "Security Officer access required."

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.groups.filter(
                name__in=[
                    "Administrator",
                    "Security Officer",
                ]
            ).exists()
        )


class IsLaboratoryUser(BasePermission):
    message = "Laboratory User access required."

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.groups.filter(
                name__in=[
                    "Administrator",
                    "Security Officer",
                    "Laboratory User",
                ]
            ).exists()
        )


class CanManageLaboratories(BasePermission):
    message = "Administrator access required to modify laboratories."

    def has_permission(self, request, view):
        read_only = request.method in ["GET", "HEAD", "OPTIONS"]
        if not request.user.is_authenticated:
            return read_only
        if read_only:
            return request.user.groups.filter(
                name__in=[
                    "Administrator",
                    "Security Officer",
                ]
            ).exists()

        return request.user.groups.filter(
            name="Administrator"
        ).exists()


class CanManageBiometricProfiles(BasePermission):
    message = "Administrator access is required to modify biometric profiles."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False

        if request.user.groups.filter(name="Administrator").exists():
            return True

        return (
            request.method in SAFE_METHODS
            and request.user.groups.filter(name="Security Officer").exists()
        )


class CanViewSecurityEvents(BasePermission):
    message = "Security Officer or Administrator access required."

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.groups.filter(
                name__in=[
                    "Administrator",
                    "Security Officer",
                ]
            ).exists()
        )