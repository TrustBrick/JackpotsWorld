Promotions voice-over
=====================

The Promotions page voice-over is ADMIN-MANAGED. Upload the clip from the
Admin Panel → "Manage Promotions" tab → "Promotions Voice-Over" card. That
clip is stored on S3 (under the public promotions/ prefix) and served to
visitors via the GET /api/promotions/ payload.

This file is only a FALLBACK
----------------------------
    promotions-voiceover.mp3

The bundled clip at this path is played only when NO clip has been uploaded
in the admin panel yet. Once an admin uploads one, the uploaded clip takes
precedence and this file is ignored. You can leave this file absent if you
always manage the voice-over from the admin.

Consumed by src/components/promotions/PromotionsVoiceOver.jsx
(STATIC_FALLBACK_SRC). Change that constant if you rename this file.

Notes
-----
- mp3 is the safest format for broad browser support. ~128 kbps mono is
  plenty for speech and keeps the file small.
- Browsers block sound-on autoplay until the visitor interacts with the
  page, so on a first visit the clip starts on their first tap/click/keypress
  instead of the instant the page loads. The floating speaker button
  (bottom-left) always lets them mute/unmute or replay it.
- An admin can also disable the voice-over entirely from that same card
  (the "Enabled" toggle), which hides the control and plays nothing.
