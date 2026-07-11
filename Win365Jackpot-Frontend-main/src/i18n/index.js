import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en/common.json";
import hi from "./locales/hi/common.json";
import te from "./locales/te/common.json";
import ta from "./locales/ta/common.json";
import kn from "./locales/kn/common.json";
import ml from "./locales/ml/common.json";
import bn from "./locales/bn/common.json";
import mr from "./locales/mr/common.json";
import gu from "./locales/gu/common.json";
import pa from "./locales/pa/common.json";
import si from "./locales/si/common.json";
import vi from "./locales/vi/common.json";
import zhCN from "./locales/zh-CN/common.json";
import zhTW from "./locales/zh-TW/common.json";
import ja from "./locales/ja/common.json";
import ko from "./locales/ko/common.json";
import th from "./locales/th/common.json";
import fil from "./locales/fil/common.json";
import ar from "./locales/ar/common.json";
import fr from "./locales/fr/common.json";
import de from "./locales/de/common.json";
import es from "./locales/es/common.json";
import pt from "./locales/pt/common.json";
import ru from "./locales/ru/common.json";

// Bundled statically (not lazy-fetched) — 24 small JSON files add negligible
// weight, and this avoids a network round-trip / flash-of-English on switch.
const resources = {
  en:    { common: en },
  hi:    { common: hi },
  te:    { common: te },
  ta:    { common: ta },
  kn:    { common: kn },
  ml:    { common: ml },
  bn:    { common: bn },
  mr:    { common: mr },
  gu:    { common: gu },
  pa:    { common: pa },
  si:    { common: si },
  vi:    { common: vi },
  "zh-CN": { common: zhCN },
  "zh-TW": { common: zhTW },
  ja:    { common: ja },
  ko:    { common: ko },
  th:    { common: th },
  fil:   { common: fil },
  ar:    { common: ar },
  fr:    { common: fr },
  de:    { common: de },
  es:    { common: es },
  pt:    { common: pt },
  ru:    { common: ru },
};

// NOTE: this covers Phase A's highest-visibility surface only (sidebar,
// navbar, VIP tier names, common buttons, auth page) — most of the app's
// text is still English-only pending a wider retrofit. Every non-English
// string here is machine-translated as a starting point and should get a
// professional review pass before this is relied on for compliance-sensitive
// copy (e.g. Responsible Gambling content, once that's translated too).
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "i18nextLng",
      caches: ["localStorage"],
    },
  });

export default i18n;
