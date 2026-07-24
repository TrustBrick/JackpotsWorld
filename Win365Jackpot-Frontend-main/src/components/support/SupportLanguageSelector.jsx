// MULTILINGUAL-CHAT: new file — local preview feature, safe to delete entirely.
//
// Deliberately NOT the shared src/components/LanguageSelector.jsx: that one
// calls i18n.changeLanguage() on selection, which switches the whole site's
// UI language (titles, sidebar, buttons, everything). This picker only
// controls which language the support chat is translated to/from — it
// never touches i18next, so choosing a chat language has zero effect on
// the rest of the dashboard.
import React, { useState } from "react";
import { Globe, Check, X } from "lucide-react";

export default function SupportLanguageSelector({ C, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const currentLang = options.find(l => l.code === value) || options[0] || { code: "en", name: "English" };
  const filtered = options.filter(l => l.name.toLowerCase().includes(q.toLowerCase()));

  const select = (code) => {
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
          Chat language: {currentLang.name}
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
              <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>Support Chat Language</div>
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
                    background: lang.code === value ? `${C.gold}15` : "transparent",
                    border: "none", color: lang.code === value ? C.gold : "rgba(255,255,255,0.7)",
                    cursor: "pointer",
                  }}
                >
                  {lang.name}
                  {lang.code === value && <Check size={14} />}
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
