# authapp/models/kyc_model.py

from django.db import models
from django.conf import settings


class KYCSubmission(models.Model):

    STATUS_CHOICES = [
        ("pending",  "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    KYC_TYPE_CHOICES = [
        ("player",    "Player"),
        ("affiliate", "Affiliate"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="kyc",
    )
    kyc_type = models.CharField(max_length=10, choices=KYC_TYPE_CHOICES, default="player", db_index=True)
    full_name        = models.CharField(max_length=150, blank=True)
    date_of_birth    = models.DateField(null=True, blank=True)
    document_type    = models.CharField(max_length=50, blank=True)
    document_number  = models.CharField(max_length=100, blank=True)
    doc_front        = models.ImageField(upload_to="kyc/docs/",    null=True, blank=True)
    doc_back         = models.ImageField(upload_to="kyc/docs/",    null=True, blank=True)
    selfie           = models.ImageField(upload_to="kyc/selfies/", null=True, blank=True)

    ID_PROOF_CHOICES = [
        ("address_proof", "Address Proof"),
        ("income_proof",  "Income Proof"),
    ]
    id_proof_type = models.CharField(max_length=30, blank=True, choices=ID_PROOF_CHOICES)
    id_proof_file = models.FileField(upload_to="kyc/id_proof/", null=True, blank=True)

    # Meta captured at submission time
    submitted_at = models.DateTimeField(auto_now_add=True)
    ip_address   = models.GenericIPAddressField(null=True, blank=True)
    user_agent   = models.TextField(blank=True)
    geo_country  = models.CharField(max_length=100, blank=True)
    geo_city     = models.CharField(max_length=100, blank=True)
    geo_region   = models.CharField(max_length=100, blank=True)
    geo_isp      = models.CharField(max_length=200, blank=True)
    geo_lat      = models.FloatField(null=True, blank=True)
    geo_lon      = models.FloatField(null=True, blank=True)

    # Review
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    reviewed_at   = models.DateTimeField(null=True, blank=True)
    reviewed_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="kyc_reviews",
    )
    reject_reason = models.TextField(blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "submitted_at"])]

    def __str__(self):
        return f"{self.user.email} | KYC {self.status}"