from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdminOrManager(BasePermission):
    """Only admins and property managers can write; all authenticated users can read."""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in ('admin', 'manager')


class IsAdminOnly(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class IsOwnerOrAdminOrManager(BasePermission):
    """Object-level: owner, admin, or manager can access."""
    def has_object_permission(self, request, view, obj):
        if request.user.role in ('admin', 'manager'):
            return True
        owner = getattr(obj, 'owner', None)
        return owner == request.user


class IsTenantSelf(BasePermission):
    """Tenants can only access their own records."""
    def has_object_permission(self, request, view, obj):
        if request.user.role in ('admin', 'manager', 'agent'):
            return True
        tenant = getattr(obj, 'tenant', None)
        return tenant == request.user


class IsManagerOrAgentOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in ('admin', 'manager', 'agent')
        )


class AuthRateThrottle(object):
    """Marker class for auth endpoint throttling — applied via DRF throttle_classes."""
    scope = 'auth'
