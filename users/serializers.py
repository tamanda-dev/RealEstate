from rest_framework import serializers
from .models import User


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    is_internal_staff = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'role_display', 'is_internal_staff', 'phone', 'avatar', 'is_active',
            'created_at', 'date_joined', 'last_login',
        ]
        read_only_fields = ['created_at', 'date_joined', 'last_login']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class UserCreateSerializer(serializers.ModelSerializer):
    """Used by admins to create new users with a specific role."""
    password = serializers.CharField(write_only=True, min_length=8,
                                     style={'input_type': 'password'})
    confirm_password = serializers.CharField(write_only=True, min_length=8,
                                              style={'input_type': 'password'})

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'phone', 'password', 'confirm_password',
        ]
        read_only_fields = ['id']

    def validate(self, data):
        if data['password'] != data.pop('confirm_password'):
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return data

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('A user with this username already exists.')
        return value

    def validate_email(self, value):
        if value and User.objects.filter(email=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Admins can update profile fields (not password — use reset_password action)."""

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'phone', 'role', 'is_active']

    def validate_role(self, value):
        valid_roles = [r[0] for r in User.ROLE_CHOICES]
        if value not in valid_roles:
            raise serializers.ValidationError(f'Invalid role. Choose from: {valid_roles}')
        return value


class SelfProfileUpdateSerializer(serializers.ModelSerializer):
    """Any authenticated user can update their own basic contact details — deliberately
    excludes role/is_active/username so this can never be used for privilege escalation."""

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'phone', 'avatar']
