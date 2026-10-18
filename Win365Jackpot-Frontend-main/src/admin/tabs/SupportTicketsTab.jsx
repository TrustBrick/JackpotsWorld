// Back Office "Service Requests" list (formerly Support Tickets).
//
// Each row shows who raised the request (name + email) and its state. The
// request itself is read in the View panel, which is also where an agent
// moves it through its three states: Pending -> Processing -> Completed.
// Conversation with the customer happens in Live Support, not here.
import React, { useState, useCallback, useEffect } from "react";
import { LifeBuoy, RefreshCw, Eye, X, Paperclip } from "lucide-react";
import { API, adminFetch, fmtDT } from "../helpers";
import { Card, Btn, Table } from "../components/SharedUI";
import { useAdminTheme } from "../context/AdminThemeContext";

// Backend status -> the three states the Back Office works with.
const STATUSES = [
  { value: "open",        label: "Pending" },
  { value: "in_progress", label: "Processing" },
  { value: "resolved",    label: "Completed" },
];
const toUiStatus = (s) => (s === "closed" ? "resolved" : s);

function ServiceStatusPill({ status, C }) {
  const s = toUiStatus(status);
  const cfg = {
    open:        { color: C.orange, label: "Pending" },
    in_progress: { color: C.blue,   label: "Processing" },
    resolved:    { color: C.green,  label: "Completed" },
  }[s] || { color: C.muted, label: status || "—" };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: `${cfg.color}18`, color: cfg.color, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

function Field({ C, label, value, full }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

function ViewModal({ ticket, C, onClose, onChanged, onToast }) {
  const [busy, setBusy] = useState("");
  const current = toUiStatus(ticket.status);

  const setStatus = async (status) => {
    if (status === current) return;
    setBusy(status);
    const r = await adminFetch(`${API}/api/admin-panel/support/tickets/${ticket.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setBusy("");
    if (r?.ok) {
      onToast?.(`Request marked ${STATUSES.find(s => s.value === status).label}`, true);
      onChanged();
    } else onToast?.("Failed to update status", false);
  };

  const original = ticket.message;
  const translated = ticket.message_translated;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <Card solid style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Service Request #{ticket.id}</div>
            <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{ticket.subject}</div>
              <ServiceStatusPill status={ticket.status} C={C} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field C={C} label="Name" value={ticket.name} />
              <Field C={C} label="Email" value={ticket.email} />
              <Field C={C} label="Phone" value={ticket.phone} />
              <Field C={C} label="User ID" value={ticket.user_uid} />
              <Field C={C} label="Country" value={ticket.country} />
              <Field C={C} label="Raised as" value={ticket.is_affiliate ? "Affiliate" : "Player"} />
              <Field C={C} label="Created" value={fmtDT(ticket.created_at)} />
              <Field C={C} label="Last updated" value={fmtDT(ticket.updated_at)} />
              <Field C={C} label="Message" value={original} full />
              {translated && translated !== original && (
                <Field C={C} label="Message (English)" value={translated} full />
              )}
              {ticket.admin_reply && <Field C={C} label="Earlier reply" value={ticket.admin_reply} full />}
              {ticket.attachment && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <a href={ticket.attachment} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.gold }}>
                    <Paperclip size={13} /> View attachment
                  </a>
                </div>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Status</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {STATUSES.map(s => {
                  const active = s.value === current;
                  return (
                    <Btn
                      key={s.value}
                      small
                      outline={!active}
                      disabled={!!busy || active}
                      onClick={() => setStatus(s.value)}
                    >
                      {busy === s.value ? "Saving…" : s.label}
                    </Btn>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function SupportTicketsTab({ onToast }) {
  const { C } = useAdminTheme();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [viewId, setViewId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/support/tickets/`);
      const j = await r?.json();
      setTickets(Array.isArray(j) ? j : j?.results || []);
    } catch { onToast?.("Failed to load service requests", false); }
    setLoading(false);
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const shown = filter ? tickets.filter(t => toUiStatus(t.status) === filter) : tickets;
  const viewing = tickets.find(t => t.id === viewId);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LifeBuoy size={15} style={{ color: C.gold }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Service Requests</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[{ value: "", label: "All" }, ...STATUSES].map(s => (
            <button
              key={s.value || "all"}
              onClick={() => setFilter(s.value)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: filter === s.value ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
                background: filter === s.value ? `${C.gold}15` : "transparent",
                color: filter === s.value ? C.gold : C.muted,
              }}
            >
              {s.label}
            </button>
          ))}
          <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </div>

      <Table headers={["Customer", "Subject", "Message", "Status", "Created", ""]} loading={loading} colSpan={6} emptyText="No service requests yet">
        {shown.map(tk => (
          <tr key={tk.id} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ padding: "12px 14px", fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: C.text }}>{tk.name || "—"}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{tk.email}</div>
            </td>
            <td style={{ padding: "12px 14px", fontSize: 12.5, color: C.text, fontWeight: 600 }}>{tk.subject}</td>
            <td style={{ padding: "12px 14px", fontSize: 12, color: C.muted, maxWidth: 260 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {tk.message_translated || tk.message}
              </div>
            </td>
            <td style={{ padding: "12px 14px" }}><ServiceStatusPill status={tk.status} C={C} /></td>
            <td style={{ padding: "12px 14px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{fmtDT(tk.created_at)}</td>
            <td style={{ padding: "12px 14px" }}>
              <Btn small outline onClick={() => setViewId(tk.id)}><Eye size={12} /> View</Btn>
            </td>
          </tr>
        ))}
      </Table>

      {viewing && (
        <ViewModal
          ticket={viewing}
          C={C}
          onClose={() => setViewId(null)}
          onChanged={load}
          onToast={onToast}
        />
      )}
    </div>
  );
}
