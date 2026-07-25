// GIFTS-REWARDS: new admin tab — safe to delete this file (and its entry
// in constants.js's ADMIN_TABS + the case in AdminPanel.jsx) to remove the
// feature. Manages UserGift rows independently from the Affiliate module —
// no affiliate data is fetched or displayed here.
import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, Plus, X, Clock, CheckCircle2, Ban, RotateCcw, AlertCircle } from "lucide-react";
import { Card, Btn, Table, Pagination, Input, Select, Textarea, rowHover } from "../components/SharedUI";
import { adminFetch, API, fmt, fmtD } from "../helpers";
import { useAdminTheme } from "../context/AdminThemeContext";

// Mirrors UserGift.GIFT_TYPE_CHOICES (authapp/models/gift_level_models.py) —
// purely user promotional rewards, no affiliate-related entries.
const GIFT_TYPE_OPTIONS = [
  { value: "welcome", label: "Welcome Bonus" },
  { value: "registration", label: "Registration Reward" },
  { value: "birthday", label: "Birthday Gift" },
  { value: "festival", label: "Festival Gift" },
  { value: "vip_upgrade", label: "VIP Gift" },
  { value: "bonus", label: "Promotional Bonus" },
  { value: "cashback", label: "Cashback Reward" },
  { value: "event", label: "Event Reward" },
  { value: "lucky_draw", label: "Lucky Draw Reward" },
  { value: "referral", label: "User Referral Bonus" },
  { value: "spin_reward", label: "Free Spins" },
  { value: "coupon", label: "Coupon Reward" },
  { value: "loyalty", label: "Loyalty Reward" },
  { value: "achievement", label: "Achievement Reward" },
  { value: "manual", label: "Admin-issued Gift" },
  { value: "seasonal", label: "Seasonal Reward" },
  { value: "tournament", label: "Tournament Prize" },
  { value: "merchandise", label: "Merchandise" },
  { value: "gift_voucher", label: "Gift Voucher" },
  { value: "discount_voucher", label: "Discount Voucher" },
];
const GIFT_TYPE_LABEL = Object.fromEntries(GIFT_TYPE_OPTIONS.map(o => [o.value, o.label]));

const STATUS_TABS = [
  { id: "", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "claimed", label: "Claimed" },
  { id: "expired", label: "Expired" },
  { id: "revoked", label: "Cancelled" },
];

function StatusPill({ status, C }) {
  const cfg = {
    pending: { color: C.orange, label: "Available" },
    claimed: { color: C.green, label: "Claimed" },
    expired: { color: C.red, label: "Expired" },
    revoked: { color: C.muted, label: "Cancelled" },
  }[status] || { color: C.muted, label: status || "—" };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: `${cfg.color}18`, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

const PAGE_SIZE = 20;

export default function GiftsRewardsTab({ onToast }) {
  const { C } = useAdminTheme();
  const [tab, setTab] = useState("");
  const [giftType, setGiftType] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadList = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, status: tab, gift_type: giftType, q });
    adminFetch(`${API}/api/admin-panel/gifts-rewards/?${params}`)
      .then(r => r?.json())
      .then(j => { if (j) { setItems(j.results || []); setCount(j.count || 0); setSummary(j.summary || null); } })
      .finally(() => setLoading(false));
  }, [page, tab, giftType, q]);

  useEffect(() => { loadList(); }, [loadList]);

  const act = async (giftId, action, body = {}) => {
    const r = await adminFetch(`${API}/api/admin-panel/gifts-rewards/${giftId}/${action}/`, {
      method: "POST", body: JSON.stringify(body),
    });
    const j = await r?.json().catch(() => ({}));
    if (r?.ok) { onToast?.(j.message || "Done.", true); loadList(); }
    else onToast?.(j?.error || "Action failed.", false);
  };

  const SUMMARY_CARDS = [
    { key: "pending", label: "Available", icon: Clock, color: C.orange },
    { key: "claimed", label: "Claimed", icon: CheckCircle2, color: C.green },
    { key: "expired", label: "Expired", icon: X, color: C.red },
    { key: "revoked", label: "Cancelled", icon: Ban, color: C.muted },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {SUMMARY_CARDS.map(s => (
          <Card key={s.key} style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <s.icon size={13} style={{ color: s.color }} />
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>{summary ? summary[s.key] ?? 0 : "—"}</div>
          </Card>
        ))}
        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Total Value (this view)</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.gold, fontFamily: "monospace" }}>{summary ? fmt(summary.total_amount) : "—"}</div>
        </Card>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setPage(1); }}
              style={{
                padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                cursor: "pointer", transition: "all 0.15s",
                border: tab === t.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
                background: tab === t.id ? `${C.gold}15` : "transparent",
                color: tab === t.id ? C.gold : C.muted,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
              placeholder="Search user, description…"
              style={{ padding: "8px 12px 8px 32px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none", width: 220 }}
            />
          </div>
          <Btn small onClick={() => setShowCreate(true)}><Plus size={12} /> Create Gift</Btn>
          <Btn outline small onClick={loadList}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      <Table
        headers={["User", "Gift Type", "Amount", "Description", "Status", "Expires", "Created", ""]}
        loading={loading}
        colSpan={8}
        emptyText="No gifts in this view"
      >
        {items.map(row => (
          <tr key={row.id} {...rowHover(C)} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>
              <div style={{ fontWeight: 700 }}>{row.user_name || row.user_email}</div>
              <div style={{ fontSize: 10.5, color: C.muted }}>{row.user_uid}</div>
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{GIFT_TYPE_LABEL[row.gift_type] || row.gift_type}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, fontFamily: "monospace", fontWeight: 700, color: C.gold }}>{fmt(row.amount)}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, color: C.muted, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.description || "—"}</td>
            <td style={{ padding: "11px 14px" }}><StatusPill status={row.status} C={C} /></td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap" }}>{row.expires_at ? fmtD(row.expires_at) : "No expiry"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap" }}>{fmtD(row.created_at)}</td>
            <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
              {row.status === "pending" && (
                <>
                  <Btn small outline color={C.orange} onClick={() => act(row.id, "expire")} style={{ marginRight: 6 }}>Expire</Btn>
                  <Btn small outline color={C.red} onClick={() => act(row.id, "cancel")}>Cancel</Btn>
                </>
              )}
              {(row.status === "expired" || row.status === "revoked") && (
                <Btn small color={C.green} onClick={() => act(row.id, "reissue")}><RotateCcw size={12} /> Reissue</Btn>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} total={count} perPage={PAGE_SIZE} onChange={setPage} />

      {showCreate && (
        <CreateGiftModal
          C={C}
          onClose={() => setShowCreate(false)}
          onDone={(msg, ok) => { onToast?.(msg, ok); if (ok) { setShowCreate(false); loadList(); } }}
        />
      )}
    </div>
  );
}

function CreateGiftModal({ C, onClose, onDone }) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [amount, setAmount] = useState("");
  const [giftType, setGiftType] = useState("manual");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const r = await adminFetch(`${API}/api/admin-panel/users/?q=${encodeURIComponent(query.trim())}`);
    const j = await r?.json().catch(() => ({}));
    setSearchResults(j?.results || []);
    setSearching(false);
  };

  const submit = async () => {
    if (!selectedUser || !amount) return;
    setSubmitting(true);
    setError("");
    const r = await adminFetch(`${API}/api/admin-panel/wallet/bonus/`, {
      method: "POST",
      body: JSON.stringify({
        user_id: selectedUser.id, amount, gift_type: giftType,
        description, note, expires_at: expiresAt || null,
      }),
    });
    const j = await r?.json().catch(() => ({}));
    setSubmitting(false);
    if (r?.ok) onDone(j.message || "Gift created.", true);
    else setError(typeof j?.error === "string" ? j.error : "Failed to create gift.");
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Create Gift</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: 18 }}>
            {!selectedUser ? (
              <div>
                <label style={{ display: "block", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Find User</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input
                    value={query} onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && search()}
                    placeholder="Name, email or UID…"
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none" }}
                  />
                  <Btn small onClick={search} disabled={searching}>{searching ? "…" : <Search size={13} />}</Btn>
                </div>
                {searchResults.map(u => (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 6, cursor: "pointer", background: C.hoverBg }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{u.name || u.email}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{u.email} · {u.user_uid}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: C.hoverBg, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{selectedUser.name || selectedUser.email}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{selectedUser.email} · {selectedUser.user_uid}</div>
                  </div>
                  <Btn small outline onClick={() => setSelectedUser(null)}>Change</Btn>
                </div>

                <Input label="Amount" type="number" value={amount} onChange={setAmount} placeholder="0.00" />
                <Select
                  label="Gift Type" value={giftType} onChange={setGiftType}
                  options={GIFT_TYPE_OPTIONS}
                />
                <Input label="Description" value={description} onChange={setDescription} placeholder="e.g. Welcome Bonus for new signup" />
                <Textarea label="Internal Note (optional)" value={note} onChange={setNote} placeholder="Not shown to the user…" />
                <Input label="Expires At (optional)" type="datetime-local" value={expiresAt} onChange={setExpiresAt} />

                {error && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginBottom: 12 }}>
                    <AlertCircle size={13} /> {error}
                  </div>
                )}

                <Btn onClick={submit} disabled={!amount || submitting} style={{ width: "100%", justifyContent: "center" }}>
                  {submitting ? "Creating…" : "Create Gift"}
                </Btn>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 8, textAlign: "center" }}>
                  The gift is immediately available for the user to claim into their Non-Cash Wallet.
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
