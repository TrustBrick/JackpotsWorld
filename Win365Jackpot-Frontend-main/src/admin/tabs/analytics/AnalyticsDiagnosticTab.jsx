// src/admin/tabs/analytics/AnalyticsDiagnosticTab.jsx
//
// ANALYTICS DIAGNOSTIC (§28) — a wiring test for the tracking pipeline.
//
// It reports what the backend sees for THIS request: which header the client
// IP came from, whether Cloudflare is sending its country header, which
// geolocation provider is configured and whether it answered. It resolves
// nothing into the database and records no event.
//
// It exists because the bug this feature was built to fix was invisible from
// the outside. Location was blank site-wide, and there was no way to tell
// whether that was a missing Cloudflare header, a proxy misconfiguration
// making every visitor look like the load balancer, a rate-limited provider,
// or simply no traffic. Each of those needs a different fix, and this page
// distinguishes them in one look.
//
// Because it reports on the caller's own request, an admin opening it sees
// their OWN address and location. That is the intended behaviour — it is a
// test of the plumbing, not a lookup tool for other visitors.
import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { adminFetch, API } from "../../helpers";
import { Spinner } from "../../components/SharedUI";
import { C } from "../../constants";
import { Panel, EmptyState } from "./AnalyticsShared";

function Row({ label, value, tone }) {
  const color = tone === "good" ? C.teal : tone === "warn" ? C.orange : tone === "bad" ? C.pink : "white";
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}`, alignItems: "flex-start" }}>
      <div style={{ width: 190, flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
        {label}
      </div>
      <div style={{ flex: 1, fontSize: 12.5, color, wordBreak: "break-all", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        {value == null || value === "" ? "—" : String(value)}
      </div>
    </div>
  );
}

function Verdict({ tone, children }) {
  const Icon = tone === "good" ? CheckCircle2 : tone === "warn" ? AlertTriangle : XCircle;
  const color = tone === "good" ? C.teal : tone === "warn" ? C.orange : C.pink;
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 12px", borderRadius: 9, background: `${color}12`, border: `1px solid ${color}40` }}>
      <Icon size={15} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export default function AnalyticsDiagnosticTab({ onToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch(`${API}/api/admin-panel/analytics/diagnostic/`);
      setData(r?.ok ? await r.json() : null);
    } catch { onToast?.("Failed to load diagnostic", false); }
    setLoading(false);
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spinner />;
  if (!data) return <EmptyState text="Diagnostic unavailable" />;

  // Each verdict maps one observable fact to the action it implies. Written
  // as advice rather than raw status because the whole point is that the raw
  // status alone did not tell anyone what to do about it.
  const verdicts = [];

  if (data.ip_source === "REMOTE_ADDR" && !data.ip_is_private) {
    verdicts.push({ tone: "bad", text: "The client IP is coming from REMOTE_ADDR, not a proxy header. Behind Cloudflare/the load balancer this means every visitor is being recorded as the proxy itself — check that the origin is actually receiving forwarded headers." });
  } else if (data.ip_source === "unavailable") {
    verdicts.push({ tone: "bad", text: "The client IP could not be established — the forwarding chain is malformed. Location will be blank for every visitor until this is fixed." });
  } else if (data.ip_is_private) {
    verdicts.push({ tone: "warn", text: "This request came from a private/local address, so there is no public location to resolve. Expected in local development; unexpected in production." });
  } else {
    verdicts.push({ tone: "good", text: `Client IP resolved via ${data.ip_source}.` });
  }

  if (!data.cf_ipcountry_present) {
    verdicts.push({ tone: "warn", text: "Cloudflare is not sending CF-IPCountry. Enable the \"Add visitor location headers\" Managed Transform on the zone for a free, instant country on every request. Country still resolves via the geolocation provider without it — this is an optimisation, no longer a dependency." });
  } else {
    verdicts.push({ tone: "good", text: `Cloudflare is sending CF-IPCountry (${data.cf_ipcountry_header}).` });
  }

  if (!data.geo_lookup_enabled) {
    verdicts.push({ tone: "warn", text: "Geolocation lookups are disabled (ANALYTICS_RESOLVE_LOCATION=False). Region and city will stay blank until this is turned back on." });
  } else if (data.geo_status === "success") {
    verdicts.push({ tone: "good", text: `${data.geo_provider} resolved this address.` });
  } else if (data.geo_status === "failed") {
    verdicts.push({ tone: "warn", text: `${data.geo_provider} was asked but could not place this address.` });
  } else if (data.geo_status === "unavailable" && !data.ip_is_private) {
    verdicts.push({ tone: "warn", text: `No lookup was made — ${data.geo_provider} may be rate-limiting (its free tier is counted per originating server IP, so the whole site shares one budget).` });
  }

  if (data.detected_as_bot) {
    verdicts.push({ tone: "warn", text: "This request's User-Agent is classified as a bot, so an equivalent visitor request would be excluded from analytics." });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "white" }}>Analytics Diagnostic</div>
        <button
          onClick={load}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, color: "rgba(255,255,255,0.8)", padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
        >
          <RefreshCw size={13} /> Re-run
        </button>
      </div>

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
        Reports what the tracking pipeline sees for <strong>your own</strong> request to this page.
        Nothing is recorded and no visitor is created by loading it.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {verdicts.map((v, i) => <Verdict key={i} tone={v.tone}>{v.text}</Verdict>)}
      </div>

      <Panel title="IP">
        <Row label="IP address" value={data.ip} />
        <Row
          label="IP source"
          value={data.ip_source}
          tone={data.ip_source === "CF-Connecting-IP" ? "good" : data.ip_source === "unavailable" ? "bad" : "warn"}
        />
        <Row label="Private / local" value={data.ip_is_private ? "yes" : "no"} />
      </Panel>

      <Panel title="Geolocation">
        <Row label="Provider" value={data.geo_provider} />
        <Row label="Lookups enabled" value={data.geo_lookup_enabled ? "yes" : "no"} tone={data.geo_lookup_enabled ? "good" : "warn"} />
        <Row label="Status" value={data.geo_status} tone={data.geo_status === "success" ? "good" : "warn"} />
        <Row label="CF-IPCountry header" value={data.cf_ipcountry_header} tone={data.cf_ipcountry_present ? "good" : "warn"} />
        <Row label="Country" value={data.country_name ? `${data.country_name} (${data.country_code})` : data.country_code} />
        <Row label="Region" value={data.region_code ? `${data.region} (${data.region_code})` : data.region} />
        <Row label="City" value={data.city} />
        <Row label="Timezone" value={data.timezone} />
        <Row
          label="Approx. coordinates"
          value={data.latitude != null && data.longitude != null ? `${data.latitude}, ${data.longitude}` : null}
        />
        <Row label="Network / ISP" value={data.isp} />
      </Panel>

      <Panel title="Client">
        <Row label="Visitor ID" value={data.visitor_id} />
        <Row label="Session ID" value={data.session_id} />
        <Row label="Device" value={data.device_type} />
        <Row label="Browser" value={data.browser} />
        <Row label="Operating system" value={data.operating_system} />
        <Row label="Detected as bot" value={data.detected_as_bot ? "yes" : "no"} tone={data.detected_as_bot ? "warn" : "good"} />
        <Row label="User-Agent" value={data.user_agent} />
      </Panel>

      <Panel title="Configuration">
        <Row label="Store visitor IPs" value={data.store_ip_enabled ? "yes" : "no"} />
        <Row label="IP retention (days)" value={data.ip_retention_days} />
        <Row label="Session idle timeout (min)" value={data.session_idle_minutes} />
      </Panel>
    </div>
  );
}
