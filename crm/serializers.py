from rest_framework import serializers
from .models import PipelineStage, Lead, Opportunity, Interaction, Campaign


class PipelineStageSerializer(serializers.ModelSerializer):
    opportunity_count = serializers.SerializerMethodField()

    class Meta:
        model = PipelineStage
        fields = '__all__'

    def get_opportunity_count(self, obj):
        return obj.opportunity_set.count()


class LeadSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    assigned_to_name = serializers.SerializerMethodField()
    interaction_count = serializers.SerializerMethodField()
    contact_name = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = '__all__'
        read_only_fields = ['contact']

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.get_full_name() if obj.assigned_to else ''

    def get_interaction_count(self, obj):
        return obj.interactions.count()

    def get_contact_name(self, obj):
        return obj.contact.full_name if obj.contact else ''


class OpportunitySerializer(serializers.ModelSerializer):
    lead_name = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    stage_name = serializers.SerializerMethodField()
    stage_color = serializers.SerializerMethodField()

    class Meta:
        model = Opportunity
        fields = '__all__'

    def get_lead_name(self, obj):
        return obj.lead.full_name if obj.lead else ''

    def get_property_name(self, obj):
        return obj.property.name if obj.property else ''

    def get_stage_name(self, obj):
        return obj.stage.name if obj.stage else ''

    def get_stage_color(self, obj):
        return obj.stage.color if obj.stage else '#94a3b8'


class InteractionSerializer(serializers.ModelSerializer):
    agent_name = serializers.SerializerMethodField()
    lead_name = serializers.SerializerMethodField()

    class Meta:
        model = Interaction
        fields = '__all__'

    def get_agent_name(self, obj):
        return obj.agent.get_full_name() if obj.agent else ''

    def get_lead_name(self, obj):
        return obj.lead.full_name if obj.lead else (str(obj.contact) if obj.contact else '')


class CampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campaign
        fields = '__all__'
