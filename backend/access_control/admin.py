from django.contrib import admin

from .models import (
    Laboratory,
    BiometricProfile,
    AccessPermission,
    AuthenticationEvent,
    SecurityEvent,
)


admin.site.register(Laboratory)
admin.site.register(BiometricProfile)
admin.site.register(AccessPermission)
admin.site.register(AuthenticationEvent)
admin.site.register(SecurityEvent)