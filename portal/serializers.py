from rest_framework import serializers
from .models import SavedListing, ViewingRequest, BuyerOffer, AgentKPI, DiscountApproval


class SavedListingSerializer(serializers.ModelSerializer):
    listing_summary = serializers.SerializerMethodField()

    class Meta:
        model = SavedListing
        fields = '__all__'
        read_only_fields = ['buyer', 'saved_at']

    def get_listing_summary(self, obj):
        l = obj.listing
        return {
            'id': l.pk,
            'property_name': l.property.name if l.property else '',
            'asking_price': float(l.asking_price),
            'status': l.status,
            'listing_date': str(l.listing_date),
        }


class ViewingRequestSerializer(serializers.ModelSerializer):
    buyer_name = serializers.SerializerMethodField()
    agent_name = serializers.SerializerMethodField()
    listing_summary = serializers.SerializerMethodField()

    class Meta:
        model = ViewingRequest
        fields = '__all__'
        read_only_fields = ['buyer', 'created_at', 'updated_at']

    def get_buyer_name(self, obj):
        return obj.buyer.get_full_name() or obj.buyer.username

    def get_agent_name(self, obj):
        return obj.agent.get_full_name() if obj.agent else ''

    def get_listing_summary(self, obj):
        l = obj.listing
        return {
            'id': l.pk,
            'property_name': l.property.name if l.property else '',
            'asking_price': float(l.asking_price),
        }


class BuyerOfferSerializer(serializers.ModelSerializer):
    buyer_name = serializers.SerializerMethodField()
    listing_summary = serializers.SerializerMethodField()

    class Meta:
        model = BuyerOffer
        fields = '__all__'
        read_only_fields = ['buyer', 'created_at', 'updated_at']

    def get_buyer_name(self, obj):
        return obj.buyer.get_full_name() or obj.buyer.username

    def get_listing_summary(self, obj):
        l = obj.listing
        return {
            'id': l.pk,
            'property_name': l.property.name if l.property else '',
            'asking_price': float(l.asking_price),
            'city': l.property.city if l.property else '',
        }


class AgentKPISerializer(serializers.ModelSerializer):
    agent_name = serializers.SerializerMethodField()

    class Meta:
        model = AgentKPI
        fields = '__all__'
        read_only_fields = ['recorded_by', 'created_at']

    def get_agent_name(self, obj):
        return obj.agent.get_full_name() or obj.agent.username


class DiscountApprovalSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    listing_name = serializers.SerializerMethodField()

    class Meta:
        model = DiscountApproval
        fields = '__all__'
        read_only_fields = ['requested_by', 'created_at']

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username

    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else ''

    def get_listing_name(self, obj):
        return obj.listing.property.name if obj.listing and obj.listing.property else ''
