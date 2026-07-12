import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield } from 'lucide-react'

const COOKIES_TABLE = [
  {
    name: 'SAPISID APISID SSID HSID SID',
    owner: 'Google',
    duration: '2 years',
    desc: 'Stores the preferences and other information of the user, including preferred language, number of search results to be displayed, and the decision whether or not to activate Google SafeSearch filter.',
  },
  {
    name: 'SIDCC',
    owner: 'Google',
    duration: '1 day',
    desc: 'Security cookie that protects user data from unauthorized access.',
  },
  {
    name: '__Secure-3PSID __Secure-3PAPISID __Secure-1PAPISID __Secure-1PSID',
    owner: 'Google',
    duration: '2 years',
    desc: 'Builds a profile of website visitor interests to show relevant and personalized ads through retargeting.',
  },
  {
    name: '__Secure-3PSIDCC __Secure-1PSIDCC',
    owner: 'Google',
    duration: '1 year',
    desc: 'Builds a profile of website visitor interests to show relevant and personalized ads through retargeting.',
  },
  {
    name: 'NID',
    owner: 'Google',
    duration: '6 months',
    desc: 'Stores visitors\' preferences and personalizes ads on Google websites based on recent searches and interactions.',
  },
  {
    name: '_ga',
    owner: 'Google',
    duration: 'Persistent',
    desc: 'A Google Analytics persistent cookie used to distinguish unique users.',
  },
  {
    name: '1P_JAR',
    owner: 'Google',
    duration: '1 week',
    desc: 'Based on recent searches and previous interactions, custom ads are shown on Google sites.',
  },
  {
    name: 'MUID',
    owner: 'Bing',
    duration: '1 month',
    desc: 'Microsoft User Identifier tracking cookie used by Bing Ads.',
  },
  {
    name: '_EDGE_S',
    owner: 'Bing',
    duration: 'Session',
    desc: 'Used to retarget website visitors via Bing.',
  },
  {
    name: 'OTZ',
    owner: 'Google',
    duration: '1 month',
    desc: 'Links activities of website visitors to other devices previously logged in via a Google account, allowing advertisements to be tailored to different devices.',
  },
  {
    name: '_gid',
    owner: 'Google',
    duration: '1 day',
    desc: 'Installed by Google Analytics. Stores information on how visitors use the website and helps create an analytics report. Collects number of visitors, source, and pages visited in anonymous form.',
  },
  {
    name: '_uetvid',
    owner: 'Bing',
    duration: '1 year',
    desc: 'Used to track visitors on multiple websites in order to present relevant advertisements based on visitor preferences.',
  },
  {
    name: '_uetsid',
    owner: 'Bing',
    duration: '1 day',
    desc: 'Collects data on visitor behaviour from multiple websites in order to present more relevant advertisements and limit the number of times the same advertisement is shown.',
  },
  {
    name: 'fp_token_* io_token_*',
    owner: 'Iovation',
    duration: 'Session',
    desc: 'Used for analytics and customer support purposes.',
  },
  {
    name: 'incap_ses_* visid_incap_*',
    owner: 'Optimove',
    duration: 'Session',
    desc: 'Used for marketing purposes.',
  },
  {
    name: 'intercom-id-* intercom-session-*',
    owner: 'Intercom',
    duration: 'Session',
    desc: 'Used for customer support purposes.',
  },
  {
    name: 'mp_*_mixpanel',
    owner: 'Mixpanel',
    duration: 'Session',
    desc: 'Used for marketing purposes.',
  },
]

const SECTIONS = [
  {
    number: '1',
    title: 'Opt-out',
    content: `In order to provide website visitors with more choice on how data is collected by Google Analytics, Google has developed the Google Analytics Opt-out Browser Add-on. The add-on communicates with the Google Analytics JavaScript (ga.js) to stop data being sent to Google Analytics. The Google Analytics Opt-out Browser Add-on does not affect usage of the website in any other way.\n\nFor more information on the usage of cookies by Google Analytics please see the Google website. You can also visit http://tools.google.com/dlpage/gaoptout to install the opt-out add-on.`,
  },
  {
    number: '2',
    title: 'Disabling Cookies',
    content: `If you would like to restrict the use of cookies you can control this in your Internet browser. Advice on how to do this for the most popular browsers is available below:\n\nInternet Explorer: http://windows.microsoft.com/en-GB/windows7/Block-enable-or-allow-cookies\n\nGoogle Chrome: https://support.google.com/chrome/bin/answer.py?hl=en-GB&answer=95647\n\nMozilla Firefox: http://support.mozilla.org/en-US/kb/Blocking%20cookies\n\nApple Safari: http://docs.info.apple.com/article.html?artnum=32467`,
  },
  {
    number: '3',
    title: 'Contact and Communication',
    content: `Users contacting this website and/or its owners do so at their own discretion and provide any such personal details requested at their own risk. Your personal information is kept private and stored securely until a time it is no longer required or has no use, as detailed in the Data Protection Regulation.\n\nThis website and its owners use any information submitted to provide you with further information about the products or services they offer or to assist you in answering any questions or queries you may have submitted. This includes using your details to subscribe you to any email newsletter program the website operates, but only if this was made clear to you and your express permission was granted when submitting any form.\n\nWe will only transfer your personal data where it is necessary for us to set up or fulfil a contract you have entered into with us, to comply with a legal or regulatory obligation, or where the recipient is bound by standard contractual clauses or binding corporate rules that ensure the protection of your personal information.`,
  },
  {
    number: '4',
    title: 'External Links',
    content: `Although this website only looks to include quality, safe and relevant external links, users are advised to adopt a policy of caution before clicking any external web links mentioned throughout this website. The owners of this website cannot guarantee or verify the contents of any externally linked website despite their best efforts. Users should therefore note that they click on external links at their own risk and this website and its owners cannot be held liable for any damages or implications caused by visiting any external links mentioned.`,
  },
  {
    number: '5',
    title: 'Social Media Platforms',
    content: `Communication, engagement and actions taken through external social media platforms that this website and its owners participate on are subject to the terms and conditions as well as the privacy policies held with each social media platform respectively.\n\nUsers are advised to use social media platforms wisely and communicate and engage upon them with due care and caution in regard to their own privacy and personal details. This website and its owners will never ask for personal or sensitive information through social media platforms and encourage users wishing to discuss sensitive details to contact them through primary communication channels such as by telephone or email.\n\nThis website may use social sharing buttons which help share web content directly from web pages to the social media platform in question. Users are advised before using such social sharing buttons that they do so at their own discretion and note that the social media platform may track and save your request to share a web page through your social media platform account.`,
  },
  {
    number: '6',
    title: 'Shortened Links in Social Media',
    content: `This website and its owners through their social media platform accounts may share web links to relevant web pages. Users are advised to take caution and good judgement before clicking any shortened URLs published on social media platforms by this website and its owners. Despite the best efforts to ensure only genuine URLs are published, many social media platforms are prone to spam and hacking and therefore this website and its owners cannot be held liable for any damages or implications caused by visiting any shortened links.`,
  },
]

const OWNER_COLORS = {
  Google: { bg: 'rgba(66,133,244,0.1)', color: '#93C5FD' },
  Bing:   { bg: 'rgba(0,120,212,0.1)',  color: '#7DD3FC' },
  Iovation: { bg: 'rgba(167,139,250,0.1)', color: '#C4B5FD' },
  Optimove: { bg: 'rgba(52,211,153,0.1)', color: '#6EE7B7' },
  Intercom: { bg: 'rgba(251,146,60,0.1)', color: '#FCA572' },
  Mixpanel: { bg: 'rgba(244,114,182,0.1)', color: '#F9A8D4' },
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
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.45)', fontSize: 13,
            padding: '6px 10px', borderRadius: 8,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
        >
          <ArrowLeft size={15}/> Back
        </button>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }}/>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
          WIN365 · Cookies Policy
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

          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 42px)',
            fontWeight: 700,
            color: 'white',
            marginBottom: 16,
            lineHeight: 1.2,
          }}>
            Cookies Policy
          </h1>

          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.75, maxWidth: 580 }}>
            This website uses cookies to improve your experience while visiting. Where applicable, we use a cookie control system allowing you on your first visit to allow or disallow the use of cookies on your device, in compliance with legislation requirements for explicit user consent.
          </p>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            marginTop: 20, padding: '7px 14px',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399' }}/>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
              Last updated: April 2026
            </span>
          </div>
        </div>

        {/* ── Cookies Table ── */}
        <div style={{ marginBottom: 56 }}>
          <p style={{
            fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)', marginBottom: 16,
          }}>
            Cookies in use
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
              {['Cookie Name', 'Owner', 'Duration', 'Description'].map(h => (
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
              const ownerStyle = OWNER_COLORS[row.owner] || { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }
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
                    {row.owner}
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
            <span style={{ color: 'rgba(212,175,55,0.7)' }}>support@win365.com</span>
            {' '}or through the customer support chat on our website.
          </p>
        </div>

      </div>
    </div>
  )
}