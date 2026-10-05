import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield } from 'lucide-react'

// The honest inventory. JackpotsWorld sets NO third-party advertising or
// tracking cookies — there is no Google Analytics, Bing, Mixpanel, Intercom
// (etc.) script on the site. Everything below is first-party data stored in
// your own browser (localStorage / sessionStorage), not sent to any ad network.
// "Category" drives the colour chip; see CATEGORY_COLORS.
const COOKIES_TABLE = [
  {
    name: 'access  refresh  (+ affiliate_token, admin_token)',
    category: 'Essential',
    duration: 'Until sign-out',
    desc: 'Keeps you signed in. Created only after you log in. Stored for the browsing session only, unless you tick "Remember me", in which case it persists until you sign out.',
  },
  {
    name: 'w365_cookie_consent',
    category: 'Essential',
    duration: 'Persistent',
    desc: 'Remembers your choice on this cookie banner (accept or reject) so you are not asked again on every visit. Re-asked only if this policy materially changes.',
  },
  {
    name: 'i18nextLng',
    category: 'Preference',
    duration: 'Persistent',
    desc: 'Remembers the language you selected so the site loads in it next time.',
  },
  {
    name: 'w365-theme  w365-admin-theme',
    category: 'Preference',
    duration: 'Persistent',
    desc: 'Remembers your light / dark appearance preference.',
  },
  {
    name: 'referral_code  affiliate_click_id  campaign_id',
    category: 'Attribution',
    duration: 'Session',
    desc: 'If you arrive from an affiliate or campaign link, remembers which one so a referral is credited to the right partner. First-party only.',
  },
  {
    name: 'wheel_last_shown',
    category: 'Preference',
    duration: 'Persistent',
    desc: 'Remembers when the rewards-wheel pop-up was last shown to you so it is not shown too often.',
  },
  {
    name: 'jw_scroll_target',
    category: 'Preference',
    duration: 'Session',
    desc: 'Briefly stores where to scroll to when moving between pages, so you land in the right place.',
  },
  {
    name: 'jw_wa_contact',
    category: 'Functional',
    duration: 'Persistent',
    desc: 'If you send a WhatsApp enquiry, remembers the name and number you entered so you are not asked again next time. It stays on your device; the enquiry itself is recorded on our own server.',
  },
  {
    name: 'jw_enquiry_country',
    category: 'Functional',
    duration: 'Persistent',
    desc: 'Remembers the country selected (or detected) for the enquiry form, so it does not have to be chosen every time.',
  },
  {
    name: 'jw_anon_id',
    category: 'Analytics',
    duration: 'Persistent',
    desc: 'An anonymous, randomly generated visitor id for our own first-party usage analytics. Contains no name, email, IP address or other personal data. Created ONLY after you accept analytics.',
  },
  {
    name: 'jw_session_id',
    category: 'Analytics',
    duration: 'Session',
    desc: 'Groups the page views in one browsing session for our first-party analytics. Created ONLY after you accept analytics.',
  },
  {
    name: 'jw_utm_first_touch',
    category: 'Analytics',
    duration: 'Session',
    desc: 'Remembers the campaign parameters (utm_*) you first arrived with, for our first-party analytics. Created ONLY after you accept analytics.',
  },
]

const SECTIONS = [
  {
    number: '1',
    title: 'Your Consent and How Analytics Works',
    content: `Analytics on this site is opt-in. When you first visit, a banner asks you to accept or reject analytics cookies, and nothing in the "Analytics" category above is created until you choose "Accept all". Essential and preference items (keeping you signed in, your language, your light/dark choice) are needed for the site to work and are always active.\n\nIf you choose "Reject non-essential", no analytics identifiers are created and no usage data is collected — the choice genuinely turns the tracking off, it is not cosmetic. If you accept and later change your mind, you can clear your choice (and any analytics identifiers) by clearing this site's stored data in your browser, after which the consent banner will appear again.\n\nOur analytics are first-party only. We do not use Google Analytics, advertising pixels, or any third-party tracking cookies, and we do not sell or share this data with ad networks.`,
  },
  {
    number: '2',
    title: 'Third-Party Services',
    content: `This site relies on two external services. Neither is used for advertising or for tracking you across other websites:\n\nCloudflare Turnstile — a privacy-focused "are you human?" check shown on the sign-in and registration forms to block bots and fraud. It is a strictly necessary security feature. Cloudflare may set its own cookie in your browser to perform this check; it is not used to profile you or to serve advertising.\n\nGoogle Fonts — the site's typefaces are loaded from Google's font service. This does not set a cookie, but your IP address is sent to Google as a normal part of requesting the font files.`,
  },
  {
    number: '3',
    title: 'Managing and Disabling Cookies',
    content: `You can accept or reject optional analytics at any time using the consent banner shown on your first visit. To change a choice you have already made, clear this site's stored data for jackpotsworld.vip in your browser and the banner will appear again.\n\nYou can also restrict or clear cookies and site data directly in your browser settings. Guidance for the most common browsers:\n\nGoogle Chrome: https://support.google.com/chrome/answer/95647\n\nMozilla Firefox: https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox\n\nApple Safari: https://support.apple.com/en-us/guide/safari/sfri11471/mac\n\nMicrosoft Edge: https://support.microsoft.com/en-us/microsoft-edge/view-and-delete-browser-history-in-microsoft-edge`,
  },
  {
    number: '4',
    title: 'Contact and Communication',
    content: `When you contact us — through the support chat, a WhatsApp enquiry, or a form on this site — you provide the details requested at your own discretion. We use that information only to respond to you and to provide the products, services or information you asked about. Your personal information is kept private and stored securely for as long as it is needed for that purpose.\n\nWe do not sell your personal information. We share it only where necessary to provide a service you have requested, or to comply with a legal or regulatory obligation.`,
  },
  {
    number: '5',
    title: 'External Links and Social Media',
    content: `This site links out to our own profiles on external platforms (for example Facebook, Instagram, Telegram and YouTube) and may link to other third-party websites. Those external sites are governed by their own terms and privacy policies, not this one.\n\nThese are ordinary outbound links — this site does not embed third-party social "share" or "like" widgets that would report your visit back to those platforms. Even so, please use good judgement before clicking any external link, as we cannot control or verify the content of sites we do not operate.`,
  },
]

const CATEGORY_COLORS = {
  Essential:   { bg: 'rgba(212,175,55,0.12)', color: '#E5C76B' },
  Preference:  { bg: 'rgba(66,133,244,0.1)',  color: '#93C5FD' },
  Functional:  { bg: 'rgba(129,140,248,0.12)', color: '#A5B4FC' },
  Attribution: { bg: 'rgba(52,211,153,0.1)',  color: '#6EE7B7' },
  Analytics:   { bg: 'rgba(244,114,182,0.1)', color: '#F9A8D4' },
}

export default function CookiesPolicy() {
  const navigate = useNavigate()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0005',
      color: 'white',
      fontFamily: "'Manrope', 'Segoe UI', sans-serif",
    }}>

      {/* ── Top bar ── */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'sticky',
        top: 0,
        background: 'rgba(10,0,5,0.95)',
        backdropFilter: 'blur(8px)',
        zIndex: 10,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.3)', cursor: 'pointer',
            color: '#D4AF37', fontSize: 13, fontWeight: 700,
            padding: '6px 10px', borderRadius: 8,
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.16)'; e.currentTarget.style.borderColor = 'rgba(212,175,55,0.5)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.08)'; e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)' }}
        >
          <ArrowLeft size={15}/> Back
        </button>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }}/>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
          Jackpotsworld · Cookies Policy
        </span>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '56px 24px 96px' }}>

        {/* ── Hero ── */}
        <div style={{ marginBottom: 52 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            border: '1px solid rgba(212,175,55,0.2)',
            borderRadius: 99, padding: '5px 14px', marginBottom: 20,
          }}>
            <Shield size={12} style={{ color: '#D4AF37' }}/>
            <span style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(212,175,55,0.7)' }}>
              Legal
            </span>
          </div>

          {/* White kept inline: this page paints its own fixed dark
              background, so the theme text colour would be wrong here. */}
          <h1 className="section-heading" style={{
            fontSize: 'clamp(28px, 5vw, 42px)',
            color: 'white',
            marginBottom: 16,
            lineHeight: 1.2,
          }}>
            Cookies <span className="gold-text">Policy</span>
          </h1>

          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.75, maxWidth: 580 }}>
            This website stores a small number of first-party items in your browser to keep you signed in, remember your preferences, and — only with your consent — understand how the site is used. On your first visit a banner lets you accept or reject the optional analytics items, in line with requirements for explicit user consent. We do not use third-party advertising or tracking cookies.
          </p>

          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.75, maxWidth: 580, marginTop: 16 }}>
            A technical note on terminology: the items listed below are stored
            using your browser's <strong style={{ color: 'rgba(255,255,255,0.55)' }}>localStorage</strong> and{' '}
            <strong style={{ color: 'rgba(255,255,255,0.55)' }}>sessionStorage</strong>, not traditional HTTP cookies.
            They stay on your device and are read only by this site. Our own
            code sets no HTTP cookies. The only cookies that may be set in your
            browser come from Cloudflare's security check on our sign-in and
            registration forms (see Third-Party Services below).
          </p>
        </div>

        {/* ── Cookies Table ── */}
        <div style={{ marginBottom: 56 }}>
          <p style={{
            fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)', marginBottom: 16,
          }}>
            What this site stores in your browser
          </p>

          <div style={{
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 90px 80px 3fr',
              gap: 0,
              background: 'rgba(255,255,255,0.04)',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              padding: '10px 20px',
            }}>
              {['Name', 'Category', 'Duration', 'Purpose'].map(h => (
                <span key={h} style={{
                  fontSize: 11, fontWeight: 600,
                  color: 'rgba(255,255,255,0.35)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Table rows */}
            {COOKIES_TABLE.map((row, i) => {
              const ownerStyle = CATEGORY_COLORS[row.category] || { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }
              return (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 90px 80px 3fr',
                    gap: 0,
                    padding: '14px 20px',
                    borderBottom: i < COOKIES_TABLE.length - 1
                      ? '1px solid rgba(255,255,255,0.05)'
                      : 'none',
                    alignItems: 'start',
                  }}
                >
                  <span style={{
                    fontSize: 12, fontFamily: 'monospace',
                    color: 'rgba(212,175,55,0.7)',
                    lineHeight: 1.6, paddingRight: 12,
                    wordBreak: 'break-all',
                  }}>
                    {row.name}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 500,
                    background: ownerStyle.bg,
                    color: ownerStyle.color,
                    padding: '3px 8px', borderRadius: 6,
                    display: 'inline-block', width: 'fit-content',
                  }}>
                    {row.category}
                  </span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                    {row.duration}
                  </span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65 }}>
                    {row.desc}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Sections ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {SECTIONS.map((s, i) => (
            <div
              key={s.number}
              style={{
                paddingTop: 36,
                paddingBottom: 36,
                borderBottom: i < SECTIONS.length - 1
                  ? '1px solid rgba(255,255,255,0.06)'
                  : 'none',
              }}
            >
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div style={{
                  flexShrink: 0,
                  width: 32, height: 32,
                  border: '1px solid rgba(212,175,55,0.2)',
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600,
                  color: 'rgba(212,175,55,0.6)',
                  fontFamily: 'monospace',
                  marginTop: 2,
                }}>
                  {s.number}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{
                    fontSize: 16, fontWeight: 600,
                    color: 'white', marginBottom: 14, lineHeight: 1.3,
                  }}>
                    {s.title}
                  </h2>
                  {s.content.split('\n\n').map((para, pi) => (
                    <p key={pi} style={{
                      fontSize: 14,
                      color: 'rgba(255,255,255,0.45)',
                      lineHeight: 1.75,
                      marginBottom: pi < s.content.split('\n\n').length - 1 ? 14 : 0,
                    }}>
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer note ── */}
        <div style={{
          marginTop: 56,
          padding: '20px 24px',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          <Shield size={16} style={{ color: 'rgba(212,175,55,0.5)', flexShrink: 0, marginTop: 1 }}/>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65 }}>
            For any questions about how we use cookies or to request changes to your cookie preferences, please contact us at{' '}
            <span style={{ color: 'rgba(212,175,55,0.7)' }}>support@jackpotsworld.vip</span>
            {' '}or through the customer support chat on our website.
          </p>
        </div>

      </div>
    </div>
  )
}