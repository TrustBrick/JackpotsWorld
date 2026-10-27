// Country-wise site locations for the header picker ("Australia English",
// "India English"…). A location is a country plus the site language it uses.
// Each country appears ONCE, with its main national language: regional
// languages (Telugu, Tamil, Bengali…) and second languages are deliberately
// not listed. A country whose own language we don't ship lists the closest
// one we do. Every bundled language still works for visitors whose browser
// asks for it or who pick it from the dashboard; it just has no picker row.

const FLAG_URLS = import.meta.glob(
  '../../node_modules/flag-icons/flags/4x3/{am,at,au,be,ca,de,dk,es,ge,gb,gr,ie,in,is,it,kz,lk,mo,mx,my,nl,no,nz,pe,ph,ro,se,sg,us,vn}.svg',
  { eager: true, import: 'default' },
)

export const flagUrl = country =>
  country ? FLAG_URLS[`../../node_modules/flag-icons/flags/4x3/${country}.svg`] : undefined

export const LANGUAGE_NAMES = {
  en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', kn: 'Kannada', ml: 'Malayalam',
  bn: 'Bengali', mr: 'Marathi', gu: 'Gujarati', pa: 'Punjabi', si: 'Sinhala', vi: 'Vietnamese',
  'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)', ja: 'Japanese', ko: 'Korean',
  th: 'Thai', fil: 'Filipino', ar: 'Arabic', fr: 'French', de: 'German', es: 'Spanish',
  pt: 'Portuguese', ru: 'Russian', nl: 'Dutch', da: 'Danish', el: 'Greek', is: 'Icelandic',
  it: 'Italian', nb: 'Norwegian', ro: 'Romanian', sv: 'Swedish',
}

// Each language in its own script, so the search box finds "हिन्दी" too.
export const NATIVE_NAMES = {
  en: 'English', hi: 'हिन्दी', te: 'తెలుగు', ta: 'தமிழ்', kn: 'ಕನ್ನಡ', ml: 'മലയാളം',
  bn: 'বাংলা', mr: 'मराठी', gu: 'ગુજરાતી', pa: 'ਪੰਜਾਬੀ', si: 'සිංහල', vi: 'Tiếng Việt',
  'zh-CN': '简体中文', 'zh-TW': '繁體中文', ja: '日本語', ko: '한국어', th: 'ไทย',
  fil: 'Filipino', ar: 'العربية', fr: 'Français', de: 'Deutsch', es: 'Español',
  pt: 'Português', ru: 'Русский', nl: 'Nederlands', da: 'Dansk', el: 'Ελληνικά',
  is: 'Íslenska', it: 'Italiano', nb: 'Norsk', ro: 'Română', sv: 'Svenska',
}

const L = (country, name, lang) => ({ id: `${country}-${lang}`, country, name, lang })

// The countries the business asked for, plus every country the site has a
// destination in (Vietnam, Macau, India, Sri Lanka, Philippines, US, Malaysia,
// Singapore, Armenia, Georgia, Kazakhstan). Global first, then alphabetical.
export const LOCATIONS = [
  { id: 'global-en', country: null, name: 'Global', lang: 'en' },
  L('am', 'Armenia', 'en'),
  L('au', 'Australia', 'en'),
  L('at', 'Austria', 'de'),
  L('be', 'Belgium', 'nl'),
  L('ca', 'Canada', 'en'),
  L('dk', 'Denmark', 'da'),
  L('ge', 'Georgia', 'en'),
  L('de', 'Germany', 'de'),
  L('gr', 'Greece', 'el'),
  L('is', 'Iceland', 'is'),
  L('in', 'India', 'en'),
  L('ie', 'Ireland', 'en'),
  L('it', 'Italy', 'it'),
  L('kz', 'Kazakhstan', 'ru'),
  L('mo', 'Macau', 'zh-TW'),
  L('my', 'Malaysia', 'en'),
  L('mx', 'Mexico', 'es'),
  L('nl', 'Netherlands', 'nl'),
  L('nz', 'New Zealand', 'en'),
  L('no', 'Norway', 'nb'),
  L('pe', 'Peru', 'es'),
  L('ph', 'Philippines', 'fil'),
  L('ro', 'Romania', 'ro'),
  L('sg', 'Singapore', 'en'),
  L('es', 'Spain', 'es'),
  L('lk', 'Sri Lanka', 'si'),
  L('se', 'Sweden', 'sv'),
  L('gb', 'United Kingdom', 'en'),
  L('us', 'United States', 'en'),
  L('vn', 'Vietnam', 'vi'),
]

const STORAGE_KEY = 'siteLocation'

export function loadLocationId() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

export function saveLocationId(id) {
  try { localStorage.setItem(STORAGE_KEY, id) } catch { /* private mode: language alone still sticks */ }
}

// The saved location, as long as it still matches the active language (the
// language can change elsewhere, e.g. the dashboard's own selector). Otherwise
// the first location for that language, then Global.
export function resolveLocation(lang) {
  const saved = LOCATIONS.find(l => l.id === loadLocationId())
  if (saved && saved.lang === lang) return saved
  return LOCATIONS.find(l => l.lang === lang)
    || LOCATIONS.find(l => lang?.startsWith(l.lang))
    // A language with no country here (e.g. Japanese, still selectable from
    // the dashboard's own language menu) shows as Global so the button never
    // claims English while the site is in another language.
    || (LANGUAGE_NAMES[lang] ? { id: `global-${lang}`, country: null, name: 'Global', lang } : LOCATIONS[0])
}
