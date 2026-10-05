// src/components/CookieConsent.jsx
//
// COOKIE-CONSENT: the bottom-of-screen banner that asks the visitor to accept
// or reject non-essential (analytics) cookies. The choice is persisted by
// services/consent.js, and services/analytics.js reads it before sending any
// event — so "Reject" genuinely stops first-party tracking, it isn't cosmetic.
//
// Mounted once from App.jsx, outside <Routes>, so it can appear on any public
// page. It hides itself on the back-office routes (admin / super-admin /
// affiliate panels), which mirrors AnalyticsTracker's UNTRACKED_CLICK_PREFIXES
// — those surfaces aren't visitor-facing and don't need a consent prompt.
//
// Styling uses the public site's --w365-* theme tokens directly, so the banner
// tracks light/dark automatically without reading ThemeContext.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getConsent, setConsent } from '../services/consent';

// Back-office areas — no consent banner here (matches AnalyticsTracker).
const HIDE_PREFIXES = ['/admin-panel', '/super-admin', '/affiliate-panel', '/affiliate-login'];

function isHiddenArea(pathname) {
  return HIDE_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

export default function CookieConsent() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Only decide visibility after mount so first paint matches the stored
  // choice (no flash of the banner for visitors who already chose).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsent() === null);
  }, []);

  const choose = (status) => {
    setConsent(status);
    setVisible(false);
  };

  if (isHiddenArea(pathname)) return null;

  const banner = (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-label={t('cookieConsent.title', 'Cookie notice')}
          aria-live="polite"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            left: 'max(12px, env(safe-area-inset-left))',
            right: 'max(12px, env(safe-area-inset-right))',
            bottom: 'max(12px, env(safe-area-inset-bottom))',
            zIndex: 2147483000, // above app chrome, below nothing it needs to beat
            margin: '0 auto',
            maxWidth: 680,
            background: 'var(--w365-card, #1A0015)',
            color: 'var(--w365-text, #f5f0e8)',
            border: '1px solid var(--w365-border, rgba(212,175,55,0.3))',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            padding: '18px 20px',
            fontFamily: 'Manrope, system-ui, sans-serif',
          }}
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div
              aria-hidden="true"
              style={{
                flex: '0 0 auto',
                width: 38, height: 38, borderRadius: 10,
                display: 'grid', placeItems: 'center',
                background: 'rgba(212,175,55,0.14)',
                border: '1px solid var(--w365-border, rgba(212,175,55,0.3))',
              }}
            >
              <Cookie size={20} color="#D4AF37" />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                {t('cookieConsent.title', 'We value your privacy')}
              </div>
              <p style={{
                margin: 0,
                fontSize: 13.5,
                lineHeight: 1.5,
                color: 'var(--w365-text-muted, rgba(245,240,232,0.78))',
              }}>
                {t(
                  'cookieConsent.message',
                  'We use essential cookies to run this site and optional analytics cookies to understand how it is used. You can accept or reject the optional ones.'
                )}{' '}
                <Link
                  to="/cookies-policy"
                  onClick={() => setVisible(false)}
                  style={{ color: '#D4AF37', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                >
                  {t('cookieConsent.learnMore', 'Cookies Policy')}
                </Link>
              </p>
            </div>
          </div>

          <div style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            marginTop: 16,
            flexWrap: 'wrap',
          }}>
            <button
              type="button"
              onClick={() => choose('rejected')}
              data-analytics-id="cookie-consent-reject"
              style={{
                cursor: 'pointer',
                padding: '9px 18px',
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--w365-text, #f5f0e8)',
                border: '1px solid var(--w365-border, rgba(212,175,55,0.3))',
              }}
            >
              {t('cookieConsent.reject', 'Reject non-essential')}
            </button>
            <button
              type="button"
              onClick={() => choose('accepted')}
              data-analytics-id="cookie-consent-accept"
              style={{
                cursor: 'pointer',
                padding: '9px 20px',
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 700,
                background: '#D4AF37',
                color: '#07080F',
                border: '1px solid #D4AF37',
              }}
            >
              {t('cookieConsent.accept', 'Accept all')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Portal to <body> so the fixed banner is never clipped by a transformed or
  // overflow-hidden ancestor in the route tree.
  if (typeof document === 'undefined') return null;
  return createPortal(banner, document.body);
}
