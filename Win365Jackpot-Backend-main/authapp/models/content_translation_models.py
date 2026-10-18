from django.db import models


class ContentTranslation(models.Model):
    """One machine translation of one piece of Back Office text.

    The public site's content APIs are translated on the way out when a
    visitor has picked a language (see services/content_translation_service
    and middleware/content_translation.py). Each distinct English string is
    translated once per language and kept here, keyed by a hash of the exact
    source text — so an admin editing a title simply produces a new row the
    next time it is shown, and nothing ever has to be invalidated by hand.
    """

    lang = models.CharField(max_length=8)
    source_hash = models.CharField(max_length=64)
    source_text = models.TextField()
    translated_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["lang", "source_hash"], name="uniq_content_translation_lang_hash"),
        ]

    def __str__(self):
        return f"[{self.lang}] {self.source_text[:40]}"
