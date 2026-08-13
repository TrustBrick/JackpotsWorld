"""
authapp/utils/email_utils.py
─────────────────────────────────────────────────────────────────────────────
General transactional-email helpers (non-OTP). Reuses the same Django email
backend/settings as authapp/otp/otp_utils.py.
"""

import html
import logging
import os
from email.mime.image import MIMEImage

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

AFFILIATE_PORTAL_URL = "https://jackpotsworld.vip/affiliates"
SUPPORT_EMAIL = "support@jackpotsworld.vip"
# ?tab=affiliates is read by AdminPanel.jsx on mount (see src/admin/AdminPanel.jsx)
# to land directly on the Affiliates tab instead of the default Overview.
ADMIN_PORTAL_AFFILIATES_URL = "https://jackpotsworld.vip/admin-panel?tab=affiliates"

# Illustration assets for the affiliate approval email, embedded as inline
# CID attachments (see _attach_inline_images) rather than remote-hosted
# <img src="https://..."> URLs, since this app has no public asset CDN and
# CID embedding is the standard, Gmail/Outlook-safe way to ship images with
# a transactional email.
#   logo.png          — the app's real logo (public/images/jackpotsworld_watermark.png),
#                        cut to a soft circle with transparent corners
#   swoosh.png         — generated curved gold divider with sparkle accents
#   illustration.png   — user-supplied premium hero artwork (globe/network,
#                         handshake, growth arrow, bar chart, coin stacks).
#                         Kept as a static PNG rather than converted to GIF —
#                         GIF's 256-color palette would visibly band/degrade
#                         a photographic image like this, so full color depth
#                         wins out over animation for this specific asset.
#   social_*.png       — real brand marks (Facebook "f", Telegram paper
#                         plane, WhatsApp glyph, envelope) rendered from the
#                         same Font Awesome path data already used in
#                         CampaignsTab.jsx's share buttons, on solid brand-
#                         colored circles.
_EMAIL_ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "emails", "affiliate_approval")
_INLINE_IMAGES = [
    ("logo", "png"), ("swoosh", "png"), ("illustration", "png"),
    ("social_facebook", "png"), ("social_telegram", "png"), ("social_whatsapp", "png"), ("social_email", "png"),
]

# Gold/black HTML template for the affiliate onboarding email, laid out to
# match the approved reference design: real app logo header, curved gold
# swoosh divider, two-column body (copy left, illustration right — stacks on
# mobile), bordered Affiliate ID/Portal box, solid-gold CTA button (bulletproof
# bgcolor fallback for Outlook, gradient as a progressive enhancement), and a
# social-icon footer row. Table-based + inline styles throughout so it
# renders consistently in Outlook/Gmail/Apple Mail.
_APPROVAL_EMAIL_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Affiliate Onboarding Completed Successfully</title>
<style>
  body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  @media (max-width: 620px) {
    .w365-container { width: 100% !important; }
    .w365-px { padding-left: 22px !important; padding-right: 22px !important; }
    .w365-col-text, .w365-col-img { display: block !important; width: 100% !important; }
    .w365-col-img { padding: 14px 0 0 !important; text-align: center !important; }
    .w365-heading { font-size: 22px !important; }
  }
  @keyframes w365Glow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(212,175,55,0.35); }
    50% { box-shadow: 0 0 0 9px rgba(212,175,55,0); }
  }
  .w365-cta { animation: w365Glow 2.4s ease-in-out infinite; }
</style>
</head>
<body style="margin:0;padding:0;background:#050505;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505;">
    <tr><td align="center" style="padding:36px 14px;">
      <table role="presentation" width="600" class="w365-container" cellpadding="0" cellspacing="0"
        style="width:600px;max-width:100%;background:#0B0B0B;border:1px solid rgba(212,175,55,0.28);border-radius:18px;overflow:hidden;">

        <tr><td style="height:3px;line-height:3px;font-size:0;background:linear-gradient(90deg,transparent,#D4AF37,#F4E5A1,#D4AF37,transparent);">&nbsp;</td></tr>

        <!-- logo -->
        <tr><td align="center" style="padding:30px 40px 0;">
          <img src="cid:logo" width="118" height="118" alt="JackpotsWorld" style="display:block;border:0;margin:0 auto;">
        </td></tr>

        <!-- curved gold divider -->
        <tr><td style="padding:16px 0 4px;"><img src="cid:swoosh" width="600" alt="" style="display:block;width:100%;height:auto;border:0;"></td></tr>

        <!-- body: copy (left) + illustration (right) -->
        <tr><td class="w365-px" style="padding:14px 40px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>

            <td class="w365-col-text" valign="top" width="60%" style="width:60%;word-wrap:break-word;overflow-wrap:break-word;">
              <div class="w365-heading" style="font-size:25px;line-height:1.28;font-weight:800;color:#D4AF37;margin-bottom:16px;">Affiliate Onboarding Completed Successfully!</div>

              <div style="font-size:14px;font-weight:700;color:#D4AF37;margin-bottom:10px;">Dear __NAME__,</div>
              <p style="margin:0 0 12px;font-size:13.5px;line-height:1.7;color:rgba(255,255,255,0.82);">Congratulations! Your affiliate account has been successfully onboarded and is now active.</p>
              <p style="margin:0 0 18px;font-size:13.5px;line-height:1.7;color:rgba(255,255,255,0.82);">You can log in to the affiliate portal using your registered credentials and start using our services.</p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid rgba(212,175,55,0.4);border-radius:10px;max-width:100%;">
                <tr><td style="padding:14px 18px;word-wrap:break-word;overflow-wrap:break-word;">
                  <div style="font-size:13px;line-height:1.8;color:rgba(255,255,255,0.85);">Affiliate ID: <span style="color:#D4AF37;font-weight:800;font-family:'Courier New',monospace;">__UID__</span></div>
                  <div style="font-size:13px;line-height:1.8;color:rgba(255,255,255,0.85);">Portal: <a href="__PORTAL_URL__" style="color:#D4AF37;text-decoration:underline;word-break:break-all;">__PORTAL_URL__</a></div>
                </td></tr>
              </table>

              <p style="margin:0 0 3px;font-size:13px;line-height:1.7;color:rgba(255,255,255,0.6);">If you need any assistance, please reach out to us at</p>
              <p style="margin:0 0 16px;font-size:13px;line-height:1.7;"><a href="mailto:__SUPPORT_EMAIL__" style="color:#D4AF37;text-decoration:none;font-weight:700;">__SUPPORT_EMAIL__</a></p>

              <p style="margin:0 0 14px;font-size:13px;line-height:1.7;color:rgba(255,255,255,0.6);">Thank you for partnering with JackpotsWorld.</p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#D4AF37;">Best regards,<br><strong>JackpotsWorld Affiliate Team</strong></p>
            </td>

            <td class="w365-col-img" valign="top" align="center" width="40%" style="width:40%;padding-left:4px;">
              <img src="cid:illustration" width="235" alt="" style="display:block;width:100%;max-width:235px;height:auto;border:0;margin:2px auto 0;">
            </td>

          </tr></table>
        </td></tr>

        <!-- CTA -->
        <tr><td align="center" style="padding:28px 40px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td class="w365-cta" bgcolor="#D4AF37" style="border-radius:10px;background-color:#D4AF37;background-image:linear-gradient(135deg,#D4AF37,#B8860B);">
              <a href="__PORTAL_URL__" target="_blank" style="display:inline-block;padding:14px 38px;font-size:14px;font-weight:800;color:#08080A;text-decoration:none;letter-spacing:0.4px;">Login to Affiliate Portal</a>
            </td>
          </tr></table>
        </td></tr>

        <!-- footer divider -->
        <tr><td class="w365-px" style="padding:30px 40px 0;">
          <div style="height:1px;line-height:1px;font-size:0;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.45),transparent);">&nbsp;</div>
        </td></tr>

        <!-- social icons -->
        <tr><td align="center" style="padding:22px 40px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding:0 7px;"><img src="cid:social_facebook" width="38" height="38" alt="Facebook" style="display:block;border:0;border-radius:50%;"></td>
            <td style="padding:0 7px;"><img src="cid:social_telegram" width="38" height="38" alt="Telegram" style="display:block;border:0;border-radius:50%;"></td>
            <td style="padding:0 7px;"><img src="cid:social_whatsapp" width="38" height="38" alt="WhatsApp" style="display:block;border:0;border-radius:50%;"></td>
            <td style="padding:0 7px;"><img src="cid:social_email" width="38" height="38" alt="Email" style="display:block;border:0;border-radius:50%;"></td>
          </tr></table>
        </td></tr>

        <tr><td class="w365-px" style="padding:16px 40px 30px;">
          <div style="font-size:10.5px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;">This is an automated message from JackpotsWorld. If you weren't expecting this email, please contact support.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _attach_inline_images(msg: EmailMultiAlternatives) -> None:
    """Best-effort — a missing/unreadable asset just means that one image
    won't render (broken-image icon), never a reason to fail the whole send."""
    for name, ext in _INLINE_IMAGES:
        filename = f"{name}.{ext}"
        path = os.path.join(_EMAIL_ASSETS_DIR, filename)
        try:
            with open(path, "rb") as f:
                img = MIMEImage(f.read(), _subtype=ext)
        except OSError:
            logger.warning(f"Affiliate approval email: inline image '{filename}' not found at {path}")
            continue
        img.add_header("Content-ID", f"<{name}>")
        img.add_header("Content-Disposition", "inline", filename=filename)
        msg.attach(img)


def send_affiliate_approval_email(user) -> None:
    """
    Notify an affiliate that their account has been approved and is now
    active. Best-effort: failures are logged, not raised, so an SMTP hiccup
    never blocks the admin approval action itself.
    """
    subject = "Affiliate Onboarding Completed Successfully"
    display_name = user.name or user.email
    message = (
        f"Dear {display_name},\n\n"
        f"Congratulations! Your affiliate account has been successfully onboarded and is now active.\n\n"
        f"You can log in to the affiliate portal using your registered credentials and start using our services.\n\n"
        f"Affiliate ID: {user.user_uid}\n"
        f"Portal: {AFFILIATE_PORTAL_URL}\n\n"
        f"If you need any assistance, please reach out to us at {SUPPORT_EMAIL}\n\n"
        f"Thank you for partnering with JackpotsWorld.\n\n"
        f"Best regards,\n"
        f"JackpotsWorld Affiliate Team"
    )
    html_message = (
        _APPROVAL_EMAIL_HTML
        .replace("__NAME__", html.escape(display_name))
        .replace("__UID__", html.escape(user.user_uid))
        .replace("__PORTAL_URL__", AFFILIATE_PORTAL_URL)
        .replace("__SUPPORT_EMAIL__", SUPPORT_EMAIL)
    )
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@jackpotsworld.vip")
    try:
        msg = EmailMultiAlternatives(subject, message, from_email, [user.email])
        msg.attach_alternative(html_message, "text/html")
        msg.mixed_subtype = "related"  # required so inline cid: images stay attached to the html part, not split off as separate attachments
        _attach_inline_images(msg)
        msg.send(fail_silently=False)
        logger.info(f"Affiliate onboarding email sent to {user.email}")
    except Exception as exc:
        logger.error(f"Affiliate onboarding email to {user.email} failed: {exc}")


# Internal ops alert — same card/gold-CTA layout language as
# _APPROVAL_EMAIL_HTML above (kept as its own standalone document rather than
# a shared base template, matching how otp_verification_gold.html and
# _APPROVAL_EMAIL_HTML each already do), but simpler: single-column, no
# illustration/social-icon row, since those are affiliate-facing brand touches
# that don't apply to an internal support-inbox alert. Reuses the same
# cid:logo asset via _attach_inline_images for brand consistency.
_ADMIN_ALERT_EMAIL_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>New Affiliate Registration — Approval Required | JackpotsWorld</title>
<style>
  body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  @media (max-width: 620px) {
    .w365-container { width: 100% !important; }
    .w365-px { padding-left: 22px !important; padding-right: 22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#050505;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505;">
    <tr><td align="center" style="padding:36px 14px;">
      <table role="presentation" width="600" class="w365-container" cellpadding="0" cellspacing="0"
        style="width:600px;max-width:100%;background:#0B0B0B;border:1px solid rgba(212,175,55,0.28);border-radius:18px;overflow:hidden;">

        <tr><td style="height:3px;line-height:3px;font-size:0;background:linear-gradient(90deg,transparent,#D4AF37,#F4E5A1,#D4AF37,transparent);">&nbsp;</td></tr>

        <tr><td align="center" style="padding:30px 40px 0;">
          <img src="cid:logo" width="88" height="88" alt="JackpotsWorld" style="display:block;border:0;margin:0 auto;">
        </td></tr>

        <tr><td class="w365-px" style="padding:22px 40px 0;">
          <div style="font-size:21px;line-height:1.3;font-weight:800;color:#D4AF37;margin-bottom:14px;text-align:center;">New Affiliate Registration &ndash; Approval Required</div>
          <p style="margin:0 0 16px;font-size:13.5px;line-height:1.7;color:rgba(255,255,255,0.82);text-align:center;">A new affiliate has registered and requires approval.</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid rgba(212,175,55,0.4);border-radius:10px;">
            <tr><td style="padding:16px 18px;">
              <div style="font-size:13px;line-height:1.95;color:rgba(255,255,255,0.85);">Name: <span style="color:#FFFFFF;font-weight:700;">__NAME__</span></div>
              <div style="font-size:13px;line-height:1.95;color:rgba(255,255,255,0.85);">Email: <span style="color:#FFFFFF;font-weight:700;">__EMAIL__</span></div>
              <div style="font-size:13px;line-height:1.95;color:rgba(255,255,255,0.85);">Affiliate ID: <span style="color:#D4AF37;font-weight:800;font-family:'Courier New',monospace;">__UID__</span></div>
              <div style="font-size:13px;line-height:1.95;color:rgba(255,255,255,0.85);">Country: <span style="color:#FFFFFF;font-weight:700;">__COUNTRY__</span></div>
              <div style="font-size:13px;line-height:1.95;color:rgba(255,255,255,0.85);">Registered: <span style="color:#FFFFFF;font-weight:700;">__REGISTERED_AT__</span></div>
              <div style="font-size:13px;line-height:1.95;color:rgba(255,255,255,0.85);">Status: <span style="color:#F4C430;font-weight:800;">Pending Approval</span></div>
            </td></tr>
          </table>

          <p style="margin:0 0 4px;font-size:13px;line-height:1.7;color:rgba(255,255,255,0.6);text-align:center;">Kindly review and approve the affiliate from the admin panel.</p>
        </td></tr>

        <tr><td align="center" style="padding:22px 40px 34px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td bgcolor="#D4AF37" style="border-radius:10px;background-color:#D4AF37;background-image:linear-gradient(135deg,#D4AF37,#B8860B);">
              <a href="__ADMIN_URL__" target="_blank" style="display:inline-block;padding:14px 38px;font-size:14px;font-weight:800;color:#08080A;text-decoration:none;letter-spacing:0.4px;">Review &amp; Approve Affiliate</a>
            </td>
          </tr></table>
        </td></tr>

        <tr><td class="w365-px" style="padding:0 40px 30px;">
          <div style="font-size:10.5px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;">This is an automated message from JackpotsWorld.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_affiliate_registration_alert(user, profile) -> None:
    """
    Alert the support inbox that a new affiliate has registered and is
    awaiting approval. Best-effort: failures are logged, not raised, so an
    SMTP hiccup never blocks the applicant's own registration response (same
    convention as send_affiliate_approval_email above).
    """
    subject = "New Affiliate Registration — Approval Required | JackpotsWorld"
    display_name = user.name or user.email
    country = user.country or "—"
    registered_at = profile.created_at.strftime("%b %d, %Y %I:%M %p")
    message = (
        f"A new affiliate has registered and requires approval.\n\n"
        f"Name: {display_name}\n"
        f"Email: {user.email}\n"
        f"Affiliate ID: {user.user_uid}\n"
        f"Country: {country}\n"
        f"Registered: {registered_at}\n"
        f"Status: Pending Approval\n\n"
        f"Kindly review and approve the affiliate from the admin panel.\n"
        f"{ADMIN_PORTAL_AFFILIATES_URL}"
    )
    html_message = (
        _ADMIN_ALERT_EMAIL_HTML
        .replace("__NAME__", html.escape(display_name))
        .replace("__EMAIL__", html.escape(user.email))
        .replace("__UID__", html.escape(user.user_uid))
        .replace("__COUNTRY__", html.escape(country))
        .replace("__REGISTERED_AT__", html.escape(registered_at))
        .replace("__ADMIN_URL__", ADMIN_PORTAL_AFFILIATES_URL)
    )
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@jackpotsworld.vip")
    try:
        msg = EmailMultiAlternatives(subject, message, from_email, [SUPPORT_EMAIL])
        msg.attach_alternative(html_message, "text/html")
        msg.mixed_subtype = "related"
        _attach_inline_images(msg)
        msg.send(fail_silently=False)
        logger.info(f"Affiliate registration alert sent to {SUPPORT_EMAIL} for {user.email}")
    except Exception as exc:
        logger.error(f"Affiliate registration alert for {user.email} failed: {exc}")
