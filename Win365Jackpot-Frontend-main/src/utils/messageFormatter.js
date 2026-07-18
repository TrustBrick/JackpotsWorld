// MULTILINGUAL-CHAT: new file — local preview feature, safe to delete entirely.
//
// Small display helpers shared between the customer SupportTab and the
// admin SupportTicketsTab so language-name lookup isn't duplicated.
import { SUPPORTED_LANGUAGES } from "../components/LanguageSelector";

export function languageName(code) {
  if (!code) return "English";
  const found = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return found ? found.name : code;
}

// Prefer the translated text when present, otherwise fall back to the
// original — used identically by both the customer view (translated reply)
// and the back office view (English translation of the original message).
export function displayText(original, translated) {
  return translated && translated.trim() ? translated : original;
}
