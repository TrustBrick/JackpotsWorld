import React, { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, HelpCircle } from "lucide-react";
import ManageContentTab from "./ManageContentTab";
import { Btn } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";
import { invalidateLandingCache } from "../../../services/landingService";

/**
 * FaqManageTab — Back Office CRUD for the landing and Affiliates page FAQs.
 *
 * Create/edit/delete/enable/disable are the shared ManageContentTab, exactly
 * like every other content tab. Reordering is the one thing added on top,
 * because "display order" as a number field works but is miserable: inserting
 * a question between two others means retyping every number after it.
 *
 * The reorder control posts the whole ordered id list to
 * /api/admin-panel/faqs/reorder/, which applies it in one transaction — so a
 * half-applied reorder can never leave two questions claiming the same slot.
 *
 * ── A note on the landing category ────────────────────────────────────────
 * The four landing questions are the compliance statement of what this
 * business is NOT ("Is JackpotsWorld an online casino? No."). They are seeded
 * by migration 0086 and the public page keeps them as an offline fallback, so
 * an API failure can never blank that section. Editing or disabling them here
 * is a deliberate business decision with an audit trail (updated_by /
 * updated_at) — which is exactly why the warning below is on this screen.
 */

const CATEGORY_OPTIONS = [
  { value: "landing", label: "Landing Page" },
  { value: "affiliate", label: "Affiliates Page" },
  { value: "andhar_bahar", label: "Andhar Bahar" },
];

const FIELDS = [
  { name: "question", label: "Question", wide: true, placeholder: "Is JackpotsWorld an online casino?" },
  { name: "answer", label: "Answer", type: "textarea", wide: true },
  {
    name: "category", label: "Where it appears", type: "select",
    default: "landing", options: CATEGORY_OPTIONS,
  },
  { name: "order", label: "Display Order", type: "number", placeholder: "0" },
  { name: "is_featured", label: "Featured", type: "boolean", checkboxLabel: "Highlight this question" },
  { name: "is_active", label: "Active", type: "boolean", default: true },
];

const COLUMNS = [
  { key: "question", label: "Question" },
  { key: "category", label: "Page" },
  { key: "order", label: "Order" },
];

function ReorderPanel({ category, onToast, refreshKey }) {
  const { C } = useAdminTheme();
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    adminFetch(`${API}/api/admin-panel/faqs/?category=${encodeURIComponent(category)}`)
      .then(r => r?.json())
      .then(j => {
        const list = Array.isArray(j) ? j : (j?.results || []);
        setRows(list);
        setDirty(false);
      })
      .catch(() => {});
  }, [category]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch(`${API}/api/admin-panel/faqs/reorder/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: rows.map(r => r.id) }),
      });
      if (res?.ok) {
        setDirty(false);
        invalidateLandingCache();
        onToast?.("FAQ order saved", true);
        load();
      } else {
        onToast?.("Could not save the new order", false);
      }
    } catch {
      onToast?.("Could not save the new order", false);
    }
    setSaving(false);
  };

  if (!rows.length) return null;

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 12, padding: 14,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>
          Display order — {CATEGORY_OPTIONS.find(c => c.value === category)?.label}
        </span>
        <span style={{ fontSize: 11, color: C.muted }}>
          This is the order visitors see them in.
        </span>
      </div>

      {rows.map((row, i) => (
        <div
          key={row.id}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: row.is_active ? "transparent" : `${C.muted}12`,
            opacity: row.is_active ? 1 : 0.6,
          }}
        >
          <span style={{ fontSize: 11, color: C.muted, minWidth: 20 }}>{i + 1}</span>
          <span style={{
            flex: 1, fontSize: 12.5, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {row.question}
            {!row.is_active && (
              <span style={{ marginLeft: 8, fontSize: 10.5, color: C.muted }}>(hidden)</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => move(i, -1)}
            disabled={i === 0}
            aria-label={`Move "${row.question}" up`}
            style={{
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.muted, cursor: i === 0 ? "not-allowed" : "pointer",
              opacity: i === 0 ? 0.35 : 1, padding: "4px 6px", display: "flex",
            }}
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            onClick={() => move(i, 1)}
            disabled={i === rows.length - 1}
            aria-label={`Move "${row.question}" down`}
            style={{
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.muted, cursor: i === rows.length - 1 ? "not-allowed" : "pointer",
              opacity: i === rows.length - 1 ? 0.35 : 1, padding: "4px 6px", display: "flex",
            }}
          >
            <ArrowDown size={13} />
          </button>
        </div>
      ))}

      {dirty && (
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save order"}
          </Btn>
          <Btn variant="ghost" onClick={load} disabled={saving}>Discard</Btn>
        </div>
      )}
    </div>
  );
}

export default function FaqManageTab({ onToast }) {
  const { C } = useAdminTheme();
  const [category, setCategory] = useState("landing");
  // Bumped after any save so the reorder list picks up a new or deleted
  // question without the admin reloading the panel.
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <HelpCircle size={17} style={{ color: C.gold }} />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>FAQs</h2>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {CATEGORY_OPTIONS.map(c => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
              border: category === c.value ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
              background: category === c.value ? `${C.gold}15` : "transparent",
              color: category === c.value ? C.gold : C.muted,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {category === "landing" && (
        <div style={{
          padding: "10px 12px", borderRadius: 9, fontSize: 11.5, lineHeight: 1.55,
          background: `${C.gold}10`, border: `1px solid ${C.gold}33`, color: C.text,
        }}>
          These four questions are the plain statement that JackpotsWorld is not an online
          casino, does not take bets and does not hold gaming funds. Edit the wording if you
          need to, but keep the meaning — the public page falls back to the original text if
          this list is ever empty.
        </div>
      )}

      <ReorderPanel category={category} onToast={onToast} refreshKey={refreshKey} />

      <ManageContentTab
        // Remounted per category so the create form defaults to the category
        // being viewed, and the list is not briefly showing the previous one.
        key={category}
        resourceLabel="FAQ"
        apiPath="/api/admin-panel/faqs/"
        listParams={{ category }}
        fields={FIELDS.map(f => (
          f.name === "category" ? { ...f, default: category } : f
        ))}
        columns={COLUMNS}
        onToast={onToast}
        onSaved={() => {
          invalidateLandingCache();
          setRefreshKey(k => k + 1);
        }}
      />
    </div>
  );
}
