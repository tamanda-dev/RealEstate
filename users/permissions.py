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


class ReadOnlyForLandlordTenant(BasePermission):
    """Landlords and tenants get read-only access everywhere; they must never
    be able to create/update/delete records via the API, only view their own
    (queryset-scoped) data."""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role not in ('landlord', 'owner', 'tenant')


class IsInternalStaff(BasePermission):
    """Restricts a view to internal staff (admin/manager/agent/accountant/etc.),
    excluding external parties like landlords, tenants and buyers."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_internal_staff


class TenantCanCreateOwnMaintenanceRequest(BasePermission):
    """Landlords stay fully read-only everywhere. Tenants stay read-only except
    for submitting new maintenance requests (WorkOrder create) — they still can't
    edit/delete/dispatch/complete a work order, only file one against a property
    they're scoped to via get_queryset."""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.user.role in ('landlord', 'owner'):
            return False
        if request.user.role == 'tenant':
            return view.action == 'create'
        return True

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return request.user.role not in ('landlord', 'owner', 'tenant')


class AuthRateThrottle(object):
    """Marker class for auth endpoint throttling — applied via DRF throttle_classes."""
    scope = 'auth'
