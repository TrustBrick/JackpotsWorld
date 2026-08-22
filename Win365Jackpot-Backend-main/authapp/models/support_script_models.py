"""
authapp/models/support_script_models.py
─────────────────────────────────────────────────────────────────────────────
The standard support wording from the Call & Live Chat Script Manual, stored
where the Back Office can edit it.

WHY ONLY THE GREETING IS AUTOMATIC
──────────────────────────────────
The manual is an *agent* manual, not a bot script. Its governing rule is
"CHECK FIRST. RESPOND SECOND." -- every account-specific answer must be
verified in the Admin Portal before it is given, and the Don'ts are explicit:
do not guess, do not invent policies or timelines, do not confirm anything
without checking it first.

An automatic message cannot check anything. So exactly one entry here is ever
sent by the system: `greeting`, the manual's Section 5 / Section 35 opening
line, which promises nothing and states no fact about the customer's account.
Every other row is wording for a human agent to send deliberately, and is
stored here so it lives in one place instead of being retyped -- or worse,
hardcoded into a component -- five different ways.

`is_auto_send` is what marks the difference, rather than the key name, so
turning the automatic greeting off is a Back Office toggle and not a code
change. Nothing in the service layer sends a row that does not have it set.
"""
from django.conf import settings
from django.db import models


class SupportScript(models.Model):
    """One standard support message from the script manual."""

    key = models.SlugField(max_length=60, unique=True)
    label = models.CharField(max_length=120)
    body = models.TextField()
    # Where this wording comes from, so an admin editing it can find the
    # original: e.g. "Manual s.35 - Quick Reference Script Library".
    source_section = models.CharField(max_length=120, blank=True)

    # The one flag that decides whether the system may ever send this by
    # itself. See the module docstring for why almost nothing has it.
    is_auto_send = models.BooleanField(
        default=False,
        help_text="Send automatically when a live chat session opens. Only the greeting should have this.",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="support_scripts_updated",
    )

    class Meta:
        ordering = ["order", "key"]

    def __str__(self):
        return f"{self.label} ({self.key})"
