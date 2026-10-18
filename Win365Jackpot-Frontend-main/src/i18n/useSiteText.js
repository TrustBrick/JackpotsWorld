import { useTranslation } from "react-i18next";
// Imported for its side effect as much as its value: any module that uses T()
// - including copy defined at module level - is guaranteed i18next is already
// initialised (synchronously, see initAsync in ./index.js) before it runs.
import i18n from "./index";

/**
 * Text-as-key translation for the public site's copy.
 *
 *   <h2>{T("Why Choose JackpotsWorld?")}</h2>
 *   <p>{T("Travel to {{destination}} and enjoy your stay.", { destination })}</p>
 *
 * The English sentence IS the key, in the "site" namespace
 * (locales/<lang>/site.json). A sentence with no translation yet simply
 * renders in English, so wrapping copy can never blank a page.
 * scripts/sync-site-translations.mjs collects every T("…") / ts("…") literal
 * under src/ and reports or merges the translations each language is missing.
 *
 * Keep the argument a plain string literal so the script can find it; put
 * variable parts in {{placeholders}} and pass them as the second argument.
 *
 * T() can be called anywhere, including in data defined at module level:
 * choosing a language in the header reloads the page, so text is always
 * resolved in the visitor's language.
 */
const OPTS = { ns: "site", keySeparator: false, nsSeparator: false };

export function T(text, vars) {
  if (typeof text !== "string" || !text) return text;
  return i18n.t(text, { ...OPTS, defaultValue: text, ...vars });
}

/** Hook form: same as T(), and re-renders the component on language change. */
export function useSiteText() {
  useTranslation("site");
  return T;
}
