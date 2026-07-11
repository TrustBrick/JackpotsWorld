import React, { useState, useEffect, useCallback } from "react";
import { Image as ImageIcon, Copy, Check, Megaphone } from "lucide-react";
import { API, affiliateFetch } from "../helpers";

const C = {
  bg: "#06080E", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)",
  gold: "#D4AF37", green: "#34D399", red: "#F87171", blue: "#60A5FA",
};

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

// Reuses existing shipped casino imagery as placeholder creatives — no new
// asset pipeline needed for this pass. Swap for real per-campaign banners
// once a marketing-asset backend exists.
const BANNERS = [
  { label: "Square Banner", src: "/images/deltinroyal-india.jpg" },
  { label: "Wide Banner", src: "/images/wynn-macau.jpg" },
  { label: "Story Banner", src: "/images/cod-macau.jpg" },
];

export default function CampaignsTab() {
  const [referralCode, setReferralCode] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await affiliateFetch(`${API}/api/affiliate/dashboard/`);
    if (res?.ok) {
      const j = await res.json();
      setReferralCode(j.referral_code);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
    </div>
  );
}
