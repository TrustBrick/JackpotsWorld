import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, X, AlertTriangle, Info } from "lucide-react";
import { Btn, Card, Table, Pagination, Spinner, rowHover } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

/**
 * Email Logs — every message JackpotsWorld has attempted to send.
 *
 * NOT WIRED UP. This component is deliberately unreferenced: the Back
 * Office page was removed because the log is wanted as a record in
 * authapp_emaillog, not as a screen. Nothing else about the feature was
 * touched — LoggingEmailBackend still logs every outgoing email, and the
 * /api/admin-panel/email-logs/ endpoints still serve it to an admin.
 *
 * To bring the page back: re-add the {id:"email-logs"} entry to the System
 * group in admin/constants.js and its case in admin/AdminPanel.jsx. Kept
 * rather than deleted so that is a two-line change instead of a rewrite.
 *
 * A read-only operations view, deliberately NOT the shared ManageContentTab:
 * that component offers Create, Edit and Delete and none of them belong to a
 * log. The only action here is Retry, and the API refuses most of those on
 * purpose (see the retry endpoint's docstring).
 *
 * THE ONE THING THIS PAGE MUST NOT DO is imply delivery it cannot prove. The
 * current provider is plain SMTP, which reports only that it accepted a
 * message — so the success state is labelled "Sent / SMTP Accepted", and the
 * banner below says what that does and does not mean. `delivery_tracking`
 * comes from the stats endpoint rather than being hardcoded here, so the day
 * a provider with real delivery events is configured, this page stops
 * disclaiming on its own.
 */

const STATUS_COLOURS = {
  pending: "#9CA3AF",
  sent: "#3B82F6",
  delivered: "#22C55E",
  failed: "#EF4444",
  bounced: "#F59E0B",
};

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed" },
  { value: "bounced", label: "Bounced" },
];

const COLUMNS = [
  "Status", "Recipient", "Subject", "Type", "Provider",
  "Created", "Sent", "Delivered", "Failed", "Error",
];

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function StatusPill({ status, label }) {
  const colour = STATUS_COLOURS[status] || "#9CA3AF";
  return (
    <span style={{
      display: "inline-block", whiteSpace: "nowrap",
      fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em",
      padding: "3px 9px", borderRadius: 20,
      background: `${colour}1F`, border: `1px solid ${colour}66`, color: colour,
    }}>
      {label}
    </span>
  );
}

function StatCard({ label, value, colour, C }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: colour || C.text, lineHeight: 1.2 }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
    </Card>
  );
}

function DetailRow({ label, value, C, mono = false, emphasis = false }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ flex: "0 0 150px", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{
        flex: 1, fontSize: 12.5, color: emphasis ? C.text : C.sub, wordBreak: "break-word",
        fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit",
        whiteSpace: mono ? "pre-wrap" : "normal",
        fontWeight: emphasis ? 700 : 400,
      }}>
        {value || "—"}
      </div>
    </div>
  );
}

function DetailModal({ id, onClose, onToast }) {
  const { C } = useAdminTheme();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/email-logs/${id}/`)
      .then(r => r?.json())
      .then(j => { if (live && j) setItem(j); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  const retry = async () => {
    setRetrying(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/email-logs/${id}/retry/`, { method: "POST" });
      const j = await r?.json().catch(() => null);
      // The API refuses most retries deliberately and explains why; surface
      // that reason rather than a generic failure.
      onToast?.(j?.detail || (r?.ok ? "Retry queued" : "Retry refused"), !!r?.ok);
    } finally {
      setRetrying(false);
    }
  };

  const failed = item?.status === "failed" || item?.status === "bounced";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)", maxHeight: "86vh", overflowY: "auto",
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Email Details</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}>
            <X size={18} />
          </button>
        </div>

        {loading && <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div>}

        {!loading && item && (
          <>
            {/* The failure reason is the whole point of opening a failed row,
                so it leads rather than sitting at the bottom of a field list. */}
            {failed && (
              <div style={{
                marginBottom: 14, padding: "12px 14px", borderRadius: 10,
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.35)",
              }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <AlertTriangle size={14} style={{ color: "#EF4444" }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#EF4444" }}>
                    {item.status_display}
                  </span>
                </div>
                {item.smtp_response && (
                  <div style={{
                    fontSize: 12, color: C.text, whiteSpace: "pre-wrap",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginBottom: 6,
                  }}>
                    {item.smtp_response}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: C.sub }}>{item.error_message}</div>
              </div>
            )}

            <div style={{
              marginBottom: 14, padding: "10px 12px", borderRadius: 10,
              background: C.inputBg, border: `1px solid ${C.border}`,
              display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <Info size={13} style={{ color: C.muted, flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.6 }}>
                {item.status_explanation}
              </span>
            </div>

            <DetailRow C={C} label="Status" emphasis
              value={<StatusPill status={item.status} label={item.status_display} />} />
            <DetailRow C={C} label="Recipient" value={item.recipient_email} emphasis />
            {/* Only when there is more than one, so the ordinary single-address
                case is not padded with a row that repeats the line above it.
                The column above stores the first/primary address because that
                is what the index and the search are built on; this is the rest
                of them, which would otherwise be invisible in the Back Office
                even though the backend records every one. */}
            {Array.isArray(item.all_recipients) && item.all_recipients.length > 1 && (
              <DetailRow C={C} label="All Recipients" value={item.all_recipients.join(", ")} />
            )}
            <DetailRow C={C} label="Subject" value={item.subject} />
            <DetailRow C={C} label="Email Type" value={item.email_type_display} />
            <DetailRow C={C} label="Provider" value={item.provider} />
            <DetailRow C={C} label="Provider Msg ID"
              value={item.provider_message_id || "Not supplied by this provider"} mono />
            <DetailRow C={C} label="Message-ID" value={item.message_id} mono />
            <DetailRow C={C} label="From" value={item.from_email} />
            <DetailRow C={C} label="Created At" value={fmt(item.created_at)} />
            <DetailRow C={C} label="Sent At" value={fmt(item.sent_at)} />
            <DetailRow C={C} label="Delivered At" value={fmt(item.delivered_at)} />
            <DetailRow C={C} label="Failed At" value={fmt(item.failed_at)} />
            <DetailRow C={C} label="Retry Count" value={String(item.retry_count ?? 0)} />
            <DetailRow C={C} label="User" value={item.user_email || "No account"} />
            <DetailRow C={C} label="Triggered By" value={item.triggered_by} mono />

            {failed && (
              <div style={{ marginTop: 16 }}>
                <Btn onClick={retry} disabled={retrying || !item.is_retryable} small>
                  {retrying ? "Retrying…" : "Retry"}
                </Btn>
                {!item.is_retryable && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                    Retry is disabled: this is a permanent failure, so re-sending would
                    fail the same way.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function EmailLogsTab({ onToast }) {
  const { C } = useAdminTheme();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [options, setOptions] = useState({ email_types: [], providers: [] });
  const [openId, setOpenId] = useState(null);

  const [status, setStatus] = useState("");
  const [emailType, setEmailType] = useState("");
  const [provider, setProvider] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");

  const selectStyle = {
    padding: "6px 9px", borderRadius: 7, fontSize: 12, fontWeight: 600,
    background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: "none",
  };

  // Every filter is sent to the server. A month of email is far too many rows
  // to ship to the browser and hide with CSS.
  const params = useCallback(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (emailType) p.set("email_type", emailType);
    if (provider) p.set("provider", provider);
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    if (query.trim()) p.set("search", query.trim());
    return p;
  }, [status, emailType, provider, dateFrom, dateTo, query]);

  const load = useCallback(() => {
    setLoading(true);
    const p = params();
    if (page > 1) p.set("page", page);
    adminFetch(`${API}/api/admin-panel/email-logs/?${p}`)
      .then(r => r?.json())
      .then(j => {
        if (!j) return;
        setItems(j.results || []);
        setTotal(j.count ?? 0);
      })
      .finally(() => setLoading(false));

    // The statistics carry the SAME filters as the list, so the numbers at the
    // top always describe the rows underneath rather than the whole table.
    adminFetch(`${API}/api/admin-panel/email-logs/stats/?${params()}`)
      .then(r => r?.json())
      .then(j => { if (j) setStats(j); });
  }, [params, page]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounced so typing isn't a request per keystroke
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => { setPage(1); }, [status, emailType, provider, dateFrom, dateTo, query]);

  useEffect(() => {
    adminFetch(`${API}/api/admin-panel/email-logs/filters/`)
      .then(r => r?.json())
      .then(j => { if (j) setOptions(j); });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Statistics ── */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <StatCard C={C} label="Total" value={stats?.total} />
        <StatCard C={C} label="Sent / SMTP Accepted" value={stats?.sent} colour={STATUS_COLOURS.sent} />
        <StatCard C={C} label="Delivered" value={stats?.delivered} colour={STATUS_COLOURS.delivered} />
        <StatCard C={C} label="Failed" value={stats?.failed} colour={STATUS_COLOURS.failed} />
        <StatCard C={C} label="Bounced" value={stats?.bounced} colour={STATUS_COLOURS.bounced} />
        <StatCard C={C} label="Pending" value={stats?.pending} colour={STATUS_COLOURS.pending} />
      </div>

      {/* Shown only while the provider genuinely cannot confirm delivery. The
          flag is server-side, so configuring a provider with event
          destinations removes this banner without a frontend change. */}
      {stats && stats.delivery_tracking_available === false && (
        <div style={{
          display: "flex", gap: 9, alignItems: "flex-start",
          padding: "11px 13px", borderRadius: 10,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.32)",
        }}>
          <Info size={14} style={{ color: "#F59E0B", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.65 }}>
            {stats.delivery_tracking_note}
          </span>
        </div>
      )}

      {/* ── Filters ── */}
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search recipient, subject or message ID…"
              style={{ ...selectStyle, width: "100%", paddingLeft: 28, fontWeight: 500 }}
            />
          </div>

          <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
            {STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <select value={emailType} onChange={e => setEmailType(e.target.value)} style={selectStyle}>
            <option value="">All types</option>
            {(options.email_types || []).map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select value={provider} onChange={e => setProvider(e.target.value)} style={selectStyle}>
            <option value="">All providers</option>
            {(options.providers || []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={selectStyle} title="From" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={selectStyle} title="To" />

          <Btn small outline onClick={load}><RefreshCw size={12} /> Refresh</Btn>
        </div>
      </Card>

      {/* ── Table ── */}
      <Table headers={COLUMNS} loading={loading} colSpan={COLUMNS.length} emptyText="No emails logged yet">
        {items.map(item => (
          <tr
            key={item.id}
            onClick={() => setOpenId(item.id)}
            style={{ cursor: "pointer", ...rowHover(C) }}
          >
            <td style={{ padding: "11px 14px" }}>
              <StatusPill status={item.status} label={item.status_display} />
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12.5 }}>{item.recipient_email}</td>
            <td style={{ padding: "11px 14px", fontSize: 12.5, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.subject || "—"}
            </td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.email_type_display}</td>
            <td style={{ padding: "11px 14px", fontSize: 12 }}>{item.provider || "—"}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap", color: C.sub }}>{fmt(item.created_at)}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap", color: C.sub }}>{fmt(item.sent_at)}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap", color: C.sub }}>{fmt(item.delivered_at)}</td>
            <td style={{ padding: "11px 14px", fontSize: 12, whiteSpace: "nowrap", color: C.sub }}>{fmt(item.failed_at)}</td>
            <td style={{ padding: "11px 14px", fontSize: 11.5, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: item.error_message ? "#EF4444" : C.muted }}>
              {item.error_message || "—"}
            </td>
          </tr>
        ))}
      </Table>

      <Pagination page={page} total={total} perPage={25} onChange={setPage} />

      {openId != null && (
        <DetailModal id={openId} onClose={() => setOpenId(null)} onToast={onToast} />
      )}
    </div>
  );
}
