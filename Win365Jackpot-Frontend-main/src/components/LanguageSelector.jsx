import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Check, X } from "lucide-react";

// Shared with src/i18n/index.js — one source of truth for the 24 supported
// languages so the selector UI and the i18next resource bundles never drift.
export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "te", name: "Telugu" },
  { code: "ta", name: "Tamil" },
  { code: "kn", name: "Kannada" },
  { code: "ml", name: "Malayalam" },
  { code: "bn", name: "Bengali" },
  { code: "mr", name: "Marathi" },
  { code: "gu", name: "Gujarati" },
  { code: "pa", name: "Punjabi" },
  { code: "si", name: "Sinhala" },
  { code: "vi", name: "Vietnamese" },
  { code: "zh-CN", name: "Chinese (Simplified)" },
  { code: "zh-TW", name: "Chinese (Traditional)" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "th", name: "Thai" },
  { code: "fil", name: "Filipino" },
  { code: "ar", name: "Arabic" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
];

/**
 * Sidebar footer language control. Renders a "Language: English"-style
 * button that opens a searchable list of the 24 supported languages.
 * Switches the whole app instantly via i18next; `onChange` is an optional
 * hook for callers that also want to persist the choice server-side
 * (see Sidebar.jsx, which PATCHes /api/user/profile/).
 */
export default function LanguageSelector({ C, onChange }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const current = i18n.language;
  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === current)
    || SUPPORTED_LANGUAGES.find(l => current?.startsWith(l.code))
    || SUPPORTED_LANGUAGES[0];
  const filtered = SUPPORTED_LANGUAGES.filter(l => l.name.toLowerCase().includes(q.toLowerCase()));

  const select = (code) => {
    i18n.changeLanguage(code);
    onChange?.(code);
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderRadius: 9, fontSize: 11, fontWeight: 600,
          background: "transparent", border: `1px solid ${C.border}`,
          color: "rgba(255,255,255,0.5)", cursor: "pointer",
        }}
      >
        <Globe size={13} style={{ flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t("sidebar.language")}: {currentLang.name}
        </span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 380, maxHeight: "70vh",
              background: "#0f1117", border: `1px solid ${C.border}`, borderRadius: 16,
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>Select Language</div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "10px 16px" }}>
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search languages…"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 8,
                  background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
                  color: "white", fontSize: 13, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ overflowY: "auto", padding: "4px 8px 12px" }}>
              {filtered.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => select(lang.code)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", borderRadius: 8, fontSize: 13, textAlign: "left",
                    background: lang.code === current ? `${C.gold}15` : "transparent",
                    border: "none", color: lang.code === current ? C.gold : "rgba(255,255,255,0.7)",
                    cursor: "pointer",
                  }}
                >
                  {lang.name}
                  {lang.code === current && <Check size={14} />}
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                  No languages match "{q}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
