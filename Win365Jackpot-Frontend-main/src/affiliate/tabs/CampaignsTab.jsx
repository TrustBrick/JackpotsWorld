import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Image as ImageIcon, Copy, Check, Megaphone, Plus, X, Search,
  BarChart3, QrCode, Pause, Play, Ban,
} from "lucide-react";
import { FaWhatsapp, FaTelegram, FaFacebook, FaEnvelope } from "react-icons/fa";
import { API, affiliateFetch, fmt, fmtD } from "../helpers";
import { C, Card, Table, Tr, Td, Pagination, Select, Pill } from "../components/SharedUI";

const VISITORS_PAGE_SIZE = 20;

// Reuses existing shipped casino imagery as placeholder creatives — no new
// asset pipeline needed for this pass. Swap for real per-campaign banners
// once a marketing-asset backend exists.
const BANNERS = [
  { label: "Square Banner", src: "/assets/images/deltinroyal-india.jpg" },
  { label: "Wide Banner", src: "/assets/images/wynn-macau.jpg" },
  { label: "Story Banner", src: "/assets/images/cod-macau.jpg" },
];

const STATUS_META = {
  active: { label: "Active", color: C.green },
  paused: { label: "Paused", color: C.orange },
  expired: { label: "Expired", color: C.red },
};

function StatusPill({ status }) {
  const meta = STATUS_META[status] || { label: status || "—", color: "rgba(255,255,255,0.4)" };
  return <Pill color={meta.color}>{meta.label}</Pill>;
}

function buildLink(referralCode, campaignId) {
  return `${window.location.origin}?ref=${referralCode}&campaign=${campaignId}`;
}

function CopyButton({ text, size = "small" }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const small = size === "small";
  return (
    <button
      onClick={copy}
      title="Copy referral link"
      style={{
        display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
        padding: small ? "5px 9px" : "11px 18px", borderRadius: small ? 6 : 10,
        background: copied ? `${C.green}18` : `${C.gold}18`,
        border: `1px solid ${copied ? C.green : C.gold}40`,
        color: copied ? C.green : C.gold, fontSize: small ? 10.5 : 12, fontWeight: 700,
        cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {copied ? <Check size={small ? 11 : 13} /> : <Copy size={small ? 11 : 13} />} {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ─── Create Campaign modal ──────────────────────────────────────────────────

function CreateCampaignModal({ referralCode, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const preview = campaignId ? buildLink(referralCode, campaignId) : "";

  const submit = async () => {
    if (!name.trim()) { setError("Campaign name is required"); return; }
    if (!campaignId.trim()) { setError("Campaign ID is required"); return; }
    setError(""); setLoading(true);
    const res = await affiliateFetch(`${API}/api/affiliate/campaigns/`, {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), campaign_id: campaignId.trim() }),
    });
    const json = await res?.json().catch(() => ({}));
    setLoading(false);
    if (res?.ok) onCreated(json);
    else setError(json?.error || "Failed to create campaign");
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>Create Campaign</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}><X size={18} /></button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Campaign Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer Promo 2026"
              style={{ width: "100%", padding: "10px 13px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Campaign ID</label>
            <input
              value={campaignId}
              onChange={e => setCampaignId(e.target.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60))}
              placeholder="e.g. Summer2026"
              style={{ width: "100%", padding: "10px 13px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "monospace" }}
            />
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 5 }}>Letters, numbers, hyphens and underscores only.</div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Referral Link (auto-generated)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, padding: "10px 13px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, fontFamily: "monospace", fontSize: 11.5, color: preview ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {preview || "Enter a Campaign ID to preview…"}
              </div>
              <CopyButton text={preview} />
            </div>
          </div>

          {error && (
            <div style={{ padding: "9px 12px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginBottom: 14 }}>{error}</div>
          )}

          <button onClick={submit} disabled={loading || !name.trim() || !campaignId.trim()}
            style={{ width: "100%", padding: "11px 0", borderRadius: 10, fontSize: 13, fontWeight: 800, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: (!name.trim() || !campaignId.trim()) ? 0.5 : 1 }}>
            {loading ? "Creating…" : "Create Campaign"}
          </button>
        </Card>
      </div>
    </div>
  );
}

// ─── Campaign Analytics modal ───────────────────────────────────────────────

function AnalyticsTile({ label, value }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: "#141414", border: `1px solid ${C.tableBorder}` }}>
      <div style={{ fontSize: 16, fontWeight: 900, color: "white", fontFamily: "monospace" }}>{value}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function CampaignAnalyticsModal({ campaign, referralCode, onClose, onChanged }) {
  const [detail, setDetail] = useState(campaign);
  const [visitors, setVisitors] = useState([]);
  const [visitorCount, setVisitorCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingVisitors, setLoadingVisitors] = useState(true);
  const [notes, setNotes] = useState(campaign.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const notesTimer = useRef(null);

  const link = buildLink(referralCode, campaign.campaign_id);

  const loadDetail = useCallback(async () => {
    const res = await affiliateFetch(`${API}/api/affiliate/campaigns/${campaign.id}/`);
    if (res?.ok) setDetail(await res.json());
  }, [campaign.id]);

  const loadVisitors = useCallback(async () => {
    setLoadingVisitors(true);
    const res = await affiliateFetch(`${API}/api/affiliate/campaigns/${campaign.id}/visitors/?page=${page}`);
    if (res?.ok) {
      const json = await res.json();
      setVisitors(json.results || []);
      setVisitorCount(json.count || 0);
    }
    setLoadingVisitors(false);
  }, [campaign.id, page]);

  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { loadVisitors(); }, [loadVisitors]);
  useEffect(() => () => clearTimeout(notesTimer.current), []);

  const changeStatus = async (newStatus) => {
    const res = await affiliateFetch(`${API}/api/affiliate/campaigns/${campaign.id}/`, {
      method: "PATCH", body: JSON.stringify({ status: newStatus }),
    });
    if (res?.ok) {
      const json = await res.json();
      setDetail(json);
      onChanged?.();
    }
  };

  const onNotesChange = (v) => {
    setNotes(v);
    setSavingNotes(true);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      await affiliateFetch(`${API}/api/affiliate/campaigns/${campaign.id}/`, {
        method: "PATCH", body: JSON.stringify({ notes: v }),
      });
      setSavingNotes(false);
    }, 700);
  };

  const downloadQR = async () => {
    const origin = window.location.origin;
    const res = await affiliateFetch(`${API}/api/affiliate/campaigns/${campaign.id}/qr/?origin=${encodeURIComponent(origin)}`);
    if (!res?.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `campaign-${campaign.campaign_id}-qr.png`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const shareMsg = encodeURIComponent(`Join JackpotsWorld: ${link}`);
  const shareLinks = {
    whatsapp: `https://wa.me/?text=${shareMsg}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join JackpotsWorld")}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
    email: `mailto:?subject=${encodeURIComponent("Join me on JackpotsWorld")}&body=${shareMsg}`,
  };

  const totalPages = Math.max(1, Math.ceil(visitorCount / VISITORS_PAGE_SIZE));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 940, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{detail.name}</div>
                <StatusPill status={detail.status} />
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", marginTop: 3 }}>{detail.campaign_id} · created {fmtD(detail.created_at)}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}><X size={18} /></button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Link + status + QR + share */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 220, padding: "10px 13px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link}</div>
              <CopyButton text={link} size="regular" />
              <button onClick={downloadQR} title="Download QR code" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                <QrCode size={13} /> QR Code
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
              {/* Status changer */}
              <div style={{ display: "flex", gap: 6 }}>
                {Object.entries(STATUS_META).map(([key, meta]) => (
                  <button key={key} onClick={() => changeStatus(key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      border: detail.status === key ? `1px solid ${meta.color}50` : `1px solid ${C.border}`,
                      background: detail.status === key ? `${meta.color}18` : "transparent",
                      color: detail.status === key ? meta.color : "rgba(255,255,255,0.4)",
                    }}>
                    {key === "active" ? <Play size={10} /> : key === "paused" ? <Pause size={10} /> : <Ban size={10} />}
                    {meta.label}
                  </button>
                ))}
              </div>

              {/* Share buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { Icon: FaWhatsapp, href: shareLinks.whatsapp, color: "#25D366", title: "Share on WhatsApp" },
                  { Icon: FaTelegram, href: shareLinks.telegram, color: "#229ED9", title: "Share on Telegram" },
                  { Icon: FaFacebook, href: shareLinks.facebook, color: "#1877F2", title: "Share on Facebook" },
                  { Icon: FaEnvelope, href: shareLinks.email, color: "rgba(255,255,255,0.6)", title: "Share via Email" },
                ].map(s => (
                  <a key={s.title} href={s.href} target="_blank" rel="noopener noreferrer" title={s.title}
                    style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, textDecoration: "none" }}>
                    <s.Icon size={13} />
                  </a>
                ))}
              </div>
            </div>

            {/* Analytics tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              <AnalyticsTile label="Total Clicks" value={detail.total_clicks ?? 0} />
              <AnalyticsTile label="Unique Visitors" value={detail.total_visitors ?? 0} />
              <AnalyticsTile label="Registered Users" value={detail.registered_players ?? 0} />
              <AnalyticsTile label="Deposit Players" value={detail.deposit_players ?? 0} />
              <AnalyticsTile label="Qualified Players" value={detail.qualified_players ?? 0} />
              <AnalyticsTile label="Deposits Generated" value={fmt(detail.deposits_generated ?? 0)} />
              <AnalyticsTile label="Conversion Rate" value={`${detail.conversion_rate ?? 0}%`} />
            </div>

            {/* Notes */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Private Notes</label>
                {savingNotes && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Saving…</span>}
              </div>
              <textarea value={notes} onChange={e => onNotesChange(e.target.value)} rows={2} placeholder="Notes only you can see…"
                style={{ width: "100%", padding: "10px 13px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, color: "white", fontSize: 12.5, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            {/* Visitors table */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 8 }}>Visitors</div>
              <Table
                headers={["Visitor", "Country", "City", "Device", "Browser", "Click Date", "Registration", "Deposit", "Bet"]}
                loading={loadingVisitors}
                isEmpty={!loadingVisitors && visitors.length === 0}
                emptyText="No visitors recorded yet."
                minWidth={760}
                footer={<Pagination page={page} totalPages={totalPages} count={visitorCount} onChange={setPage} />}
              >
                {visitors.map((v, i) => (
                  <Tr key={v.id} index={i}>
                    <Td gold={v.registration_status === "Registered"}>{v.visitor}</Td>
                    <Td muted>{v.country || "—"}</Td>
                    <Td muted>{v.city || "—"}</Td>
                    <Td muted>{v.device || "—"}</Td>
                    <Td muted>{v.browser || "—"}</Td>
                    <Td muted style={{ whiteSpace: "nowrap" }}>{new Date(v.click_date).toLocaleString("en-IN")}</Td>
                    <Td>{v.registration_status}</Td>
                    <Td>{v.deposit_status}</Td>
                    <Td>{v.bet_status}</Td>
                  </Tr>
                ))}
              </Table>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Main tab ────────────────────────────────────────────────────────────────

export default function CampaignsTab() {
  const [referralCode, setReferralCode] = useState(null);
  const [copied, setCopied] = useState(false);

  const [campaigns, setCampaigns] = useState([]);
  const [campaignCount, setCampaignCount] = useState(0);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("new");
  const [showCreate, setShowCreate] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState(null);

  const load = useCallback(async () => {
    const res = await affiliateFetch(`${API}/api/affiliate/dashboard/`);
    if (res?.ok) {
      const j = await res.json();
      setReferralCode(j.referral_code);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Light debounce on the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    const params = new URLSearchParams({ sort });
    if (q) params.set("q", q);
    if (statusFilter) params.set("status", statusFilter);
    const res = await affiliateFetch(`${API}/api/affiliate/campaigns/?${params}`);
    if (res?.ok) {
      const json = await res.json();
      setCampaigns(json.results || []);
      setCampaignCount(json.count || 0);
    }
    setLoadingCampaigns(false);
  }, [q, statusFilter, sort]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const referralLink = referralCode ? `${window.location.origin}?ref=${referralCode}` : "";

  const copy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}25` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Megaphone size={14} style={{ color: C.gold }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Share your link</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{
            flex: 1, minWidth: 240, padding: "11px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
            fontFamily: "monospace", fontSize: 13, color: "rgba(255,255,255,0.8)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {referralLink || "Loading…"}
          </div>
          <button
            onClick={copy}
            disabled={!referralLink}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "11px 18px", borderRadius: 10,
              background: copied ? `${C.green}18` : `${C.gold}18`,
              border: `1px solid ${copied ? C.green : C.gold}40`,
              color: copied ? C.green : C.gold, fontSize: 12, fontWeight: 700,
              cursor: referralLink ? "pointer" : "not-allowed",
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </Card>

      {/* Campaigns */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Campaigns</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Track clicks, visitors and conversions per channel or promo.</div>
          </div>
          <button onClick={() => setShowCreate(true)} disabled={!referralCode}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F", border: "none", fontSize: 12, fontWeight: 800, cursor: referralCode ? "pointer" : "not-allowed", opacity: referralCode ? 1 : 0.6 }}>
            <Plus size={13} /> Create Campaign
          </button>
        </div>

        {/* Search + filter + sort */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
            <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Search by name or Campaign ID…"
              style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, background: "#0D0D0D", border: `1px solid ${C.tableBorder}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            minWidth={150}
            options={[
              { value: "", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "expired", label: "Expired" },
            ]}
          />
          <Select
            value={sort}
            onChange={setSort}
            minWidth={140}
            options={[
              { value: "new", label: "New to Old" },
              { value: "old", label: "Old to New" },
            ]}
          />
        </div>

        {/* Campaign table */}
        <Table
          headers={["Name", "Campaign ID", "Referral Link", "Created", "Clicks", "Visitors", "Registered", "Deposit Players", "Qualified", "Status", ""]}
          loading={loadingCampaigns}
          isEmpty={!loadingCampaigns && campaigns.length === 0}
          emptyText={campaignCount === 0 && !q && !statusFilter ? "No campaigns yet — create your first one to start tracking a channel or promo." : "No campaigns match your search/filter."}
          emptyIcon={Megaphone}
          minWidth={1080}
        >
          {campaigns.map((c, i) => {
            const link = buildLink(referralCode, c.campaign_id);
            return (
              <Tr key={c.id} index={i} onClick={() => setActiveCampaign(c)}>
                <Td style={{ fontWeight: 700, color: "white" }}>{c.name}</Td>
                <Td mono muted>{c.campaign_id}</Td>
                <Td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{link}</span>
                    <CopyButton text={link} />
                  </div>
                </Td>
                <Td muted style={{ whiteSpace: "nowrap" }}>{fmtD(c.created_at)}</Td>
                <Td mono>{c.total_clicks}</Td>
                <Td mono>{c.total_visitors}</Td>
                <Td mono>{c.registered_players}</Td>
                <Td mono>{c.deposit_players}</Td>
                <Td mono gold>{c.qualified_players}</Td>
                <Td><StatusPill status={c.status} /></Td>
                <Td>
                  <button onClick={e => { e.stopPropagation(); setActiveCampaign(c); }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.tableBorder}`, background: "rgba(212,175,55,0.06)", color: C.gold, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    <BarChart3 size={12} /> Analytics
                  </button>
                </Td>
              </Tr>
            );
          })}
        </Table>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 4 }}>Creative Templates</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>
          Ready-to-post banners for your channels. More formats and a custom-creative request flow are coming soon.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {BANNERS.map(b => (
            <Card key={b.label} style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ height: 120, background: `url(${b.src}) center/cover` }} />
              <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center", gap: 6 }}>
                  <ImageIcon size={12} /> {b.label}
                </span>
                <a
                  href={b.src} download
                  style={{ fontSize: 11, fontWeight: 700, color: C.gold, textDecoration: "none" }}
                >
                  Download
                </a>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {showCreate && (
        <CreateCampaignModal
          referralCode={referralCode}
          onClose={() => setShowCreate(false)}
          onCreated={(created) => { setShowCreate(false); loadCampaigns(); setActiveCampaign(created); }}
        />
      )}

      {activeCampaign && (
        <CampaignAnalyticsModal
          campaign={activeCampaign}
          referralCode={referralCode}
          onClose={() => { setActiveCampaign(null); loadCampaigns(); }}
          onChanged={loadCampaigns}
        />
      )}
    </div>
  );
}
