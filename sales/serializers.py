from rest_framework import serializers
from .models import Listing, Contact, Offer, CommissionStructure, Transaction


class ListingSerializer(serializers.ModelSerializer):
    property_name = serializers.SerializerMethodField()
    agent_name = serializers.SerializerMethodField()
    offer_count = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = '__all__'

    def get_property_name(self, obj):
        return obj.property.name if obj.property else ''

    def get_agent_name(self, obj):
        return obj.listing_agent.get_full_name() if obj.listing_agent else ''

    def get_offer_count(self, obj):
        return obj.offers.count()


class ContactSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = Contact
        fields = '__all__'


class OfferSerializer(serializers.ModelSerializer):
    buyer_name = serializers.SerializerMethodField()
    listing_address = serializers.SerializerMethodField()

    class Meta:
        model = Offer
        fields = '__all__'

    def get_buyer_name(self, obj):
        return obj.buyer.full_name if obj.buyer else ''

    def get_listing_address(self, obj):
        return obj.listing.property.address if obj.listing and obj.listing.property else ''


class CommissionStructureSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommissionStructure
        fields = '__all__'


class CommissionCalculationSerializer(serializers.Serializer):
    sale_price = serializers.DecimalField(max_digits=14, decimal_places=2)
    commission_structure_id = serializers.IntegerField()


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'
