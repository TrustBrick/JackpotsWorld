import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ShieldAlert, Ban, AlertTriangle, HeartPulse, SlidersHorizontal, LifeBuoy, ExternalLink, Info } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import PageHeader from '../components/shared/PageHeader'
import PageScrollButtons from '../components/PageScrollButtons'
import { useTheme } from '../context/ThemeContext'

/**
 * /online-gambling — an information and player-safety page, not a product
 * page. It states plainly that JackpotsWorld is not an online gambling site
 * and does not encourage gambling, explains the risks, the warning signs of
 * addiction and how to stay in control, and points to free support services.
 *
 * Copy lives in the i18n bundle (onlineGambling.*) so the site language
 * switch covers it.
 */

// Independent, free support services. Names and addresses are not translated.
const HELP_LINKS = [
  { name: 'Gamblers Anonymous', url: 'https://www.gamblersanonymous.org/', note: 'Worldwide self-help fellowship' },
  { name: 'Gambling Therapy', url: 'https://www.gamblingtherapy.org/', note: 'Free online support in many languages' },
  { name: 'GamCare', url: 'https://www.gamcare.org.uk/', note: 'Advice, chat and counselling' },
  { name: 'BeGambleAware', url: 'https://www.begambleaware.org/', note: 'Information and self-assessment' },
]

function Section({ icon: Icon, title, children, accent = '#D4AF37' }) {
  return (
    <section className="casino-card p-6 md:p-8">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="inline-flex items-center justify-center rounded-full shrink-0"
          style={{ width: 38, height: 38, background: `${accent}1f`, border: `1px solid ${accent}55` }}
        >
          <Icon size={17} style={{ color: accent }} />
        </span>
        <h2 className="font-display text-xl md:text-2xl" style={{ color: 'var(--w365-text)' }}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Bullets({ items }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {(Array.isArray(items) ? items : []).map(item => (
        <li key={item} className="flex gap-2.5 font-body text-sm leading-relaxed" style={{ color: 'var(--w365-text-muted)' }}>
          <span aria-hidden="true" style={{ color: '#D4AF37', marginTop: 1 }}>•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

const bodyStyle = { color: 'var(--w365-text-muted)' }

export default function OnlineGambling() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const list = key => t(key, { returnObjects: true })

  return (
    <div key={theme} className="min-h-screen" style={{ background: 'var(--w365-bg)' }}>
      <Navbar />
      <main>
        <PageHeader
          eyebrow={t('onlineGambling.eyebrow')}
          title={t('onlineGambling.title')}
          subtitle={t('onlineGambling.subtitle')}
        />

        <div className="w365-page pb-20 max-w-4xl mx-auto flex flex-col gap-6">
          <div
            role="note"
            className="rounded-2xl p-6 md:p-7 flex gap-4"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)' }}
          >
            <Ban size={26} className="shrink-0" style={{ color: '#f87171', marginTop: 2 }} />
            <div>
              <h2 className="font-display text-xl mb-2" style={{ color: 'var(--w365-text)' }}>{t('onlineGambling.noticeTitle')}</h2>
              <p className="font-body text-sm md:text-base leading-relaxed" style={bodyStyle}>{t('onlineGambling.noticeBody')}</p>
            </div>
          </div>

          <Section icon={ShieldAlert} title={t('onlineGambling.positionTitle')}>
            <Bullets items={list('onlineGambling.positionPoints')} />
          </Section>

          <Section icon={Info} title={t('onlineGambling.whatTitle')}>
            <p className="font-body text-sm leading-relaxed" style={bodyStyle}>{t('onlineGambling.whatBody')}</p>
          </Section>

          <Section icon={AlertTriangle} title={t('onlineGambling.risksTitle')} accent="#fb923c">
            <Bullets items={list('onlineGambling.risks')} />
          </Section>

          <Section icon={HeartPulse} title={t('onlineGambling.signsTitle')} accent="#f87171">
            <Bullets items={list('onlineGambling.signs')} />
            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--w365-border, rgba(255,255,255,0.08))' }}>
              <h3 className="font-display text-lg mb-2" style={{ color: 'var(--w365-text)' }}>{t('onlineGambling.addictionTitle')}</h3>
              <p className="font-body text-sm leading-relaxed" style={bodyStyle}>{t('onlineGambling.addictionBody')}</p>
            </div>
          </Section>

          <Section icon={SlidersHorizontal} title={t('onlineGambling.controlTitle')} accent="#34d399">
            <Bullets items={list('onlineGambling.controlTips')} />
            <div className="mt-5 pt-5 flex flex-col md:flex-row md:items-center gap-3 justify-between" style={{ borderTop: '1px solid var(--w365-border, rgba(255,255,255,0.08))' }}>
              <div>
                <h3 className="font-display text-lg mb-1" style={{ color: 'var(--w365-text)' }}>{t('onlineGambling.toolsTitle')}</h3>
                <p className="font-body text-sm leading-relaxed" style={bodyStyle}>{t('onlineGambling.toolsBody')}</p>
              </div>
              <Link
                to="/dashboard?tab=responsible_gambling"
                className="btn-outline-gold shrink-0 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase"
              >
                {t('onlineGambling.toolsCta')}
              </Link>
            </div>
          </Section>

          <Section icon={LifeBuoy} title={t('onlineGambling.helpTitle')} accent="#60a5fa">
            <p className="font-body text-sm leading-relaxed mb-4" style={bodyStyle}>{t('onlineGambling.helpBody')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {HELP_LINKS.map(h => (
                <a
                  key={h.url}
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl p-4 flex items-start justify-between gap-3 transition-colors"
                  style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.25)', textDecoration: 'none' }}
                >
                  <span>
                    <span className="block font-body text-sm font-bold" style={{ color: 'var(--w365-text)' }}>{h.name}</span>
                    <span className="block font-body text-xs mt-0.5" style={bodyStyle}>{h.note}</span>
                  </span>
                  <ExternalLink size={14} className="shrink-0" style={{ color: '#60a5fa', marginTop: 3 }} />
                </a>
              ))}
            </div>
          </Section>

          <p className="font-body text-xs text-center leading-relaxed" style={bodyStyle}>{t('onlineGambling.ageNote')}</p>
        </div>
      </main>
      <Footer />
      <PageScrollButtons />
    </div>
  )
}
