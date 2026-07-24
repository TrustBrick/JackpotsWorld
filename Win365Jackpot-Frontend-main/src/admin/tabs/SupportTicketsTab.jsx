// MULTILINGUAL-CHAT: new file — local preview feature, safe to delete entirely.
//
// Back Office support ticket list. Didn't exist before this feature (the
// backend endpoints were already there — GET/PATCH /api/admin-panel/support/
// tickets/ — but nothing in the admin frontend called them yet). Works
// identically whether the multilingual flag is on or off: Language/
// Original/English columns just show "—" / the raw English message when
// there's nothing translated to show.
import React, { useState, useCallback, useEffect } from "react";
import { LifeBuoy, Send, RefreshCw } from "lucide-react";
import { API, adminFetch, fmtDT } from "../helpers";
import { Card, Btn, Table, StatusBadge, Spinner } from "../components/SharedUI";
import { useAdminTheme } from "../context/AdminThemeContext";

const LANGUAGE_NAMES = {
  en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada",
  ml: "Malayalam", mr: "Marathi", bn: "Bengali", gu: "Gujarati", pa: "Punjabi",
  si: "Sinhala", vi: "Vietnamese", "zh-CN": "Chinese", ms: "Malay",
  th: "Thai", fil: "Filipino",
};

function ReplyRow({ ticket, C, onReplied, onToast }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(ticket.admin_reply || "");
  const [saving, setSaving] = useState(false);
  const lang = ticket.preferred_language || "en";

  const submit = async () => {
    if (!reply.trim()) return;
    setSaving(true);
    const r = await adminFetch(`${API}/api/admin-panel/support/tickets/${ticket.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ admin_reply: reply, status: "resolved" }),
    });
    if (r?.ok) { onToast?.("Reply sent", true); setOpen(false); onReplied(); }
    else onToast?.("Failed to send reply", false);
    setSaving(false);
  };

  return (
    <>
      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
        <td style={{ padding: "12px 14px", fontSize: 12.5, color: C.text }}>{ticket.email}</td>
        <td style={{ padding: "12px 14px", fontSize: 12.5, color: C.text, fontWeight: 600 }}>{ticket.subject}</td>
        <td style={{ padding: "12px 14px", fontSize: 12, color: C.muted }}>{LANGUAGE_NAMES[lang] || lang}</td>
        <td style={{ padding: "12px 14px", fontSize: 12, color: C.muted, maxWidth: 220 }}>{ticket.message}</td>
        <td style={{ padding: "12px 14px", fontSize: 12.5, color: C.text, maxWidth: 220 }}>
          {ticket.message_translated || (lang === "en" ? ticket.message : <span style={{ color: C.dim }}>— not translated (feature off) —</span>)}
        </td>
        <td style={{ padding: "12px 14px" }}><StatusBadge status={ticket.status === "resolved" || ticket.status === "closed" ? "completed" : "pending"} /></td>
        <td style={{ padding: "12px 14px" }}>
          <Btn small outline onClick={() => setOpen(o => !o)}>{open ? "Close" : ticket.admin_reply ? "Edit reply" : "Reply"}</Btn>
        </td>
      </tr>
      {open && (
        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
          <td colSpan={7} style={{ padding: "0 14px 14px", background: C.hoverBg }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "10px 0 6px" }}>
              Reply in English — automatically translated to {LANGUAGE_NAMES[lang] || lang} for the customer
            </div>
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
            />
            {ticket.admin_reply_translated && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                Last translated reply ({LANGUAGE_NAMES[lang] || lang}): {ticket.admin_reply_translated}
              </div>
            )}
            <Btn onClick={submit} disabled={saving || !reply.trim()} style={{ marginTop: 8 }}>
              {saving ? "Sending…" : <><Send size={12} /> Send reply</>}
            </Btn>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SupportTicketsTab({ onToast }) {
  const { C } = useAdminTheme();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/support/tickets/`);
      const j = await r?.json();
      setTickets(Array.isArray(j) ? j : j?.results || []);
    } catch { onToast?.("Failed to load tickets", false); }
    setLoading(false);
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LifeBuoy size={15} style={{ color: C.gold }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Support Tickets — Back Office</div>
        </div>
        <Btn outline small onClick={load}><RefreshCw size={12} /> Refresh</Btn>
      </div>

      <Table headers={["Customer", "Subject", "Language", "Original", "English", "Status", ""]} loading={loading} colSpan={7} emptyText="No support tickets yet">
        {tickets.map(tk => (
          <ReplyRow key={tk.id} ticket={tk} C={C} onReplied={load} onToast={onToast} />
        ))}
      </Table>
    </div>
  );
}
