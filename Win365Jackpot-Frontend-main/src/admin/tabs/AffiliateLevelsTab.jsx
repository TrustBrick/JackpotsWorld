// AFFILIATE-LEVELS: where admins set what an affiliate must reach for each
// level. Backend: AdminAffiliateLevelConditionsView and
// services/affiliate_level_service.py.
//
// Rules shown on the page as well, because they decide what the numbers do:
// every filled-in minimum must be met, blanks are ignored, a level with no
// minimums is never awarded automatically, totals are lifetime, and levels
// only ever go up on their own.
import React, { useEffect, useState } from "react";
import { Save, Info } from "lucide-react";
import { Card, Btn, Spinner } from "../components/SharedUI";
import { API, adminFetch } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";
import { affiliateLevel } from "../../config/affiliateLevels";

const COLUMNS = [
  { key: "min_referred_players",  label: "Referred players",  hint: "Sign-ups through their link", money: false },
  { key: "min_qualified_players", label: "Qualified players", hint: "Referred players who placed a bet", money: false },
  { key: "min_deposit_volume",    label: "Deposit volume",    hint: "Total deposits by referred players", money: true },
  { key: "min_commission_earned", label: "Commission earned", hint: "Pending + paid commission", money: true },
];

const toForm = rows => rows.map(r => ({
  ...r,
  ...Object.fromEntries(COLUMNS.map(c => [c.key, r[c.key] === null || r[c.key] === undefined ? "" : String(Number(r[c.key]))])),
}));

export default function AffiliateLevelsTab({ onToast }) {
  const { C } = useAdminTheme();
  const [rows, setRows] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch(`${API}/api/admin-panel/affiliate-level-conditions/`)
      .then(r => (r?.ok ? r.json() : Promise.reject()))
      .then(j => setRows(toForm(j.conditions)))
      .catch(() => setError("Could not load the level conditions."));
  }, []);

  const setCell = (level, key, value) => {
    // Whole numbers for player counts, up to 2 decimals for money.
    const money = COLUMNS.find(c => c.key === key).money;
    const clean = money ? value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1") : value.replace(/\D/g, "");
    setRows(prev => prev.map(r => (r.level === level ? { ...r, [key]: clean } : r)));
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const r = await adminFetch(`${API}/api/admin-panel/affiliate-level-conditions/`, {
        method: "PUT",
        body: JSON.stringify({
          conditions: rows.map(row => ({
            level: row.level,
            ...Object.fromEntries(COLUMNS.map(c => [c.key, row[c.key] === "" ? null : row[c.key]])),
          })),
        }),
      });
      if (!r) return;
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setRows(toForm(j.conditions));
        const n = j.affiliates_moved_up || 0;
        onToast?.(n ? `Saved. ${n} affiliate${n === 1 ? "" : "s"} moved up.` : "Saved. No affiliate qualifies for a higher level yet.", true);
      } else {
        setError(j.error || "Could not save the conditions.");
      }
    } catch { setError("Network error. Please try again."); }
    finally { setSaving(false); }
  };

  if (error && !rows) return <Card><div style={{ color: C.red, fontSize: 13 }}>{error}</div></Card>;
  if (!rows) return <Spinner />;

  const cell = { padding: "10px 12px", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" };
  const input = {
    width: "100%", minWidth: 110, padding: "8px 10px", borderRadius: 8, fontSize: 13,
    background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Info size={16} style={{ color: C.gold, flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.65 }}>
            Every affiliate joins at <b style={{ color: C.text }}>VIP</b>. They move up automatically as soon as they reach
            <b style={{ color: C.text }}> every</b> minimum you fill in for a level. Leave a box empty to ignore that measure;
            a level with all boxes empty is never given out automatically. Totals are lifetime, and levels never go down
            on their own. Affiliates whose level you set by hand in the Affiliates tab are left alone until you set them back
            to <b style={{ color: C.text }}>Automatic</b>. Saving re-checks every affiliate straight away.
          </div>
        </div>
      </Card>

      <Card solid style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.hoverBg }}>
                <th style={{ ...cell, textAlign: "left", fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: "0.08em" }}>Level</th>
                {COLUMNS.map(c => (
                  <th key={c.key} style={{ ...cell, textAlign: "left" }}>
                    <div style={{ fontSize: 10, color: C.sub, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                      Min. {c.label}{c.money ? " ($)" : ""}
                    </div>
                    <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 500, marginTop: 3 }}>{c.hint}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cell}><LevelName id="vip" /></td>
                <td colSpan={COLUMNS.length} style={{ ...cell, fontSize: 12, color: C.muted }}>Starting level — every affiliate joins here.</td>
              </tr>
              {rows.map(r => (
                <tr key={r.level}>
                  <td style={cell}><LevelName id={r.level} /></td>
                  {COLUMNS.map(c => (
                    <td key={c.key} style={cell}>
                      <input
                        value={r[c.key]} inputMode={c.money ? "decimal" : "numeric"} placeholder="—"
                        aria-label={`${r.level_label}: minimum ${c.label.toLowerCase()}`}
                        onChange={e => setCell(r.level, c.key, e.target.value)}
                        style={input}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Btn onClick={save} disabled={saving}><Save size={14} /> {saving ? "Saving…" : "Save conditions"}</Btn>
        {error && <span style={{ fontSize: 12, color: C.red }}>{error}</span>}
      </div>
    </div>
  );
}

function LevelName({ id }) {
  const l = affiliateLevel(id);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: l.color, whiteSpace: "nowrap" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: l.color }} />
      {l.label}
    </span>
  );
}
