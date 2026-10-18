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
import nl from "./locales/nl/common.json";
import da from "./locales/da/common.json";
import el from "./locales/el/common.json";
import is_ from "./locales/is/common.json";
import it from "./locales/it/common.json";
import nb from "./locales/nb/common.json";
import ro from "./locales/ro/common.json";
import sv from "./locales/sv/common.json";

// Public-site copy, keyed by its English text (see ./useSiteText.js).
import enSite from "./locales/en/site.json";
import hiSite from "./locales/hi/site.json";
import teSite from "./locales/te/site.json";
import taSite from "./locales/ta/site.json";
import knSite from "./locales/kn/site.json";
import mlSite from "./locales/ml/site.json";
import bnSite from "./locales/bn/site.json";
import mrSite from "./locales/mr/site.json";
import guSite from "./locales/gu/site.json";
import paSite from "./locales/pa/site.json";
import siSite from "./locales/si/site.json";
import viSite from "./locales/vi/site.json";
import zhCNSite from "./locales/zh-CN/site.json";
import zhTWSite from "./locales/zh-TW/site.json";
import jaSite from "./locales/ja/site.json";
import koSite from "./locales/ko/site.json";
import thSite from "./locales/th/site.json";
import filSite from "./locales/fil/site.json";
import arSite from "./locales/ar/site.json";
import frSite from "./locales/fr/site.json";
import deSite from "./locales/de/site.json";
import esSite from "./locales/es/site.json";
import ptSite from "./locales/pt/site.json";
import ruSite from "./locales/ru/site.json";
import nlSite from "./locales/nl/site.json";
import daSite from "./locales/da/site.json";
import elSite from "./locales/el/site.json";
import is_Site from "./locales/is/site.json";
import itSite from "./locales/it/site.json";
import nbSite from "./locales/nb/site.json";
import roSite from "./locales/ro/site.json";
import svSite from "./locales/sv/site.json";

// Bundled statically (not lazy-fetched) — 24 small JSON files add negligible
// weight, and this avoids a network round-trip / flash-of-English on switch.
const resources = {
  en:    { common: en, site: enSite },
  hi:    { common: hi, site: hiSite },
  te:    { common: te, site: teSite },
  ta:    { common: ta, site: taSite },
  kn:    { common: kn, site: knSite },
  ml:    { common: ml, site: mlSite },
  bn:    { common: bn, site: bnSite },
  mr:    { common: mr, site: mrSite },
  gu:    { common: gu, site: guSite },
  pa:    { common: pa, site: paSite },
  si:    { common: si, site: siSite },
  vi:    { common: vi, site: viSite },
  "zh-CN": { common: zhCN, site: zhCNSite },
  "zh-TW": { common: zhTW, site: zhTWSite },
  ja:    { common: ja, site: jaSite },
  ko:    { common: ko, site: koSite },
  th:    { common: th, site: thSite },
  fil:   { common: fil, site: filSite },
  ar:    { common: ar, site: arSite },
  fr:    { common: fr, site: frSite },
  de:    { common: de, site: deSite },
  es:    { common: es, site: esSite },
  pt:    { common: pt, site: ptSite },
  ru:    { common: ru, site: ruSite },
  nl:    { common: nl, site: nlSite },
  da:    { common: da, site: daSite },
  el:    { common: el, site: elSite },
  is:    { common: is_, site: is_Site },
  it:    { common: it, site: itSite },
  nb:    { common: nb, site: nbSite },
  ro:    { common: ro, site: roSite },
  sv:    { common: sv, site: svSite },
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
    // Resources are bundled, so initialise synchronously: copy defined at
    // module level (see ./useSiteText.js) must see the chosen language.
    initAsync: false,
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common", "site"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "i18nextLng",
      caches: ["localStorage"],
    },
  });

// Keep <html lang> in step with the chosen language, for screen readers,
// browser translation prompts and search engines.
const syncHtmlLang = (lng) => {
  if (typeof document !== "undefined" && lng) document.documentElement.lang = lng;
};
syncHtmlLang(i18n.language);
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
