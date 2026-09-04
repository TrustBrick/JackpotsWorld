import React from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal, X } from 'lucide-react'

/**
 * PokerFilters — the Part 12 filter bar. Options come from
 * GET /api/poker/filters/, which only returns values that have published
 * events, so the bar never offers a choice that returns nothing.
 *
 * Controlled: owns no state, renders `value`, calls `onChange` with the next
 * filter object. Same shape and styling language as TeenPattiFilters.
 */

const selectStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(212,175,55,0.22)',
  color: 'rgba(255,255,255,0.85)',
  borderRadius: 10,
  padding: '9px 12px',
  fontSize: 12.5,
  outline: 'none',
  width: '100%',
  colorScheme: 'dark',
}

const STATUS_TABS = [
  { id: '', labelKey: 'filters.all' },
  { id: 'live', labelKey: 'filters.live' },
  { id: 'upcoming', labelKey: 'filters.upcoming' },
  { id: 'completed', labelKey: 'filters.completed' },
]

export default function PokerFilters({ options, value, onChange, resultCount }) {
  const { t } = useTranslation()
  const set = (patch) => onChange({ ...value, ...patch })
  const hasActiveFilter = Object.entries(value).some(([k, v]) => k !== 'status' && v)

  return (
    <div className="casino-card px-4 py-4 md:px-5 md:py-5 mb-8">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STATUS_TABS.map(tab => {
          const active = (value.status || '') === tab.id
          return (
            <button
              key={tab.id || 'all'}
              onClick={() => set({ status: tab.id })}
              className="px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase transition-all"
              style={{
                border: active ? '1px solid rgba(212,175,55,0.55)' : '1px solid rgba(255,255,255,0.10)',
                background: active ? 'rgba(212,175,55,0.14)' : 'transparent',
                color: active ? '#D4AF37' : 'rgba(255,255,255,0.5)',
              }}
            >
              {t(tab.labelKey)}
            </button>
          )
        })}

        <div className="ml-auto flex items-center gap-3">
          {resultCount != null && (
            <span className="text-[11px] font-body text-white/60">
              {t('filters.tournamentCount', { count: resultCount })}
            </span>
          )}
          {hasActiveFilter && (
            <button
              onClick={() => onChange({ status: value.status || '' })}
              className="flex items-center gap-1 text-[11px] font-bold tracking-wider uppercase text-white/64 hover:text-gold transition-colors"
            >
              <X size={12} /> {t('filters.clear')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-white/55 font-body mb-1.5">{t('filters.country')}</label>
          <select style={selectStyle} value={value.country || ''} onChange={e => set({ country: e.target.value, city: '' })}>
            <option value="">{t('filters.allCountries')}</option>
            {(options.countries || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-white/55 font-body mb-1.5">{t('filters.city')}</label>
          <select style={selectStyle} value={value.city || ''} onChange={e => set({ city: e.target.value })}>
            <option value="">{t('filters.allCities')}</option>
            {(options.cities || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-white/55 font-body mb-1.5">{t('filters.series')}</label>
          <select style={selectStyle} value={value.series || ''} onChange={e => set({ series: e.target.value })}>
            <option value="">{t('filters.allSeries')}</option>
            {(options.series || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-white/55 font-body mb-1.5">{t('filters.gameType')}</label>
          <select style={selectStyle} value={value.game_type || ''} onChange={e => set({ game_type: e.target.value })}>
            <option value="">{t('filters.allGames')}</option>
            {(options.game_types || []).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-white/55 font-body mb-1.5">{t('filters.fromDate')}</label>
          <input
            type="date"
            style={selectStyle}
            value={value.date_from || ''}
            onChange={e => set({ date_from: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-white/55 font-body mb-1.5">{t('filters.maxBuyIn')}</label>
          <input
            type="number"
            min="0"
            placeholder={t('filters.any')}
            style={selectStyle}
            value={value.max_buy_in || ''}
            onChange={e => set({ max_buy_in: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 text-[10px] font-body text-white/40">
        <SlidersHorizontal size={11} /> {t('filters.applyInstantly')}
      </div>
    </div>
  )
}
