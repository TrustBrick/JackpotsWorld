// src/admin/tabs/analytics/VisitorAnalyticsTab.jsx
//
// VISITOR-ANALYTICS: who visited, from where, and what they did.
//
// Three views behind one tab:
//   list      — paginated Recent Visitors, filterable by country/city/device
//   detail    — one visitor: approximate location, device, sources, and a
//               chronological timeline of everything they did
//   locations — Visitors by Country -> Region -> City
//
// Two presentation rules this file exists to honour, both of which the
// previous dashboard got wrong:
//
//  1. LOCATION IS LABELLED APPROXIMATE, ALWAYS. It is derived from an IP
//     address, which locates a network, not a person — so the detail view
//     says "Approximate Location" and never renders the coordinates as a
//     position. See authapp/utils/geolocation.py.
//  2. "UNKNOWN" MEANS UNKNOWN. A blank country/city is shown as Unknown or as
//     "Local / Private Network", never back-filled with a plausible-looking
//     value. Where the server tells us WHY it is blank (geo_status), that
//     reason is shown, because "the lookup failed" and "this visitor is on
//     the office LAN" are different problems.
import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Search, RefreshCw } from "lucide-react";
import { adminFetch, API, fmtN } from "../../helpers";
import { Table, Spinner, Pagination } from "../../components/SharedUI";
import { C } from "../../constants";
import {
  DateRangeSelector, StatCard, StatGrid, Panel, EmptyState,
} from "./AnalyticsShared";

const td = { padding: "9px 10px", fontSize: 12, color: "rgba(255,255,255,0.82)", whiteSpace: "nowrap" };
const inputStyle = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
  borderRadius: 7, color: "white", fontSize: 12, padding: "6px 9px", minWidth: 120,
};

function rangeQuery(range) {
  const params = new URLSearchParams({ range: range.id });
  if (range.id === "custom" && range.start && range.end) {
    params.set("start", range.start);
    params.set("end", range.end);
  }
  return params;
}

// Blank never becomes a guess — see rule 2 in the file header.
function locationText(row) {
  if (row.geo_status === "private_ip") return "Local / Private Network";
  return row.location || "Unknown";
}

// A short, readable explanation of why a location is missing. Only shown when
// it IS missing, so a normal row isn't cluttered with diagnostics.
const GEO_STATUS_NOTE = {
  private_ip: "Private / local network address — no public location exists",
  failed: "Lookup ran but the provider could not place this address",
  unavailable: "No lookup was made (no address, lookups disabled, or provider rate-limited)",
};

function timeText(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function clockText(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

// ── Visitor detail + timeline ────────────────────────────────────────────────
function Field({ label, value, note }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "white", marginTop: 3, wordBreak: "break-word" }}>
        {value == null || value === "" ? "—" : value}
      </div>
      {note && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{note}</div>}
    </div>
  );
}

const TIMELINE_COLOR = {
  page_view: C.blue,
  click: C.purple,
  url_click: C.purple,
  video_click: C.purple,
  video_cta_click: C.purple,
  video_impression: C.teal,
  video_start: C.orange,
  video_progress: C.orange,
  video_complete: C.pink,
  video_pause: C.gold,
  video_exit: C.gold,
  signup: C.teal,
  login: C.teal,
};

function TimelineEntry({ entry }) {
  const color = TIMELINE_COLOR[entry.event_type] || C.gold;

  // What to show beside the event name, chosen per event kind so the line
  // reads as a sentence rather than a field dump.
  let detail = entry.url || "";
  if (entry.element_label || entry.element_id) {
    detail = `"${entry.element_label || entry.element_id}"`;
    if (entry.destination_url) detail += ` → ${entry.destination_url}`;
  } else if (entry.video_title || entry.video_id) {
    detail = entry.video_title || entry.video_id;
    if (entry.percent != null) detail += ` · ${entry.percent}%`;
    if (entry.watch_position != null) detail += ` · at ${entry.watch_position}s`;
  }

  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 74, flexShrink: 0, fontSize: 11.5, color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums" }}>
        {clockText(entry.at)}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color, letterSpacing: "0.03em" }}>{entry.label}</div>
        {detail && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2, wordBreak: "break-all" }}>{detail}</div>
        )}
        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{entry.location}</div>
      </div>
    </div>
  );
}

function VisitorDetail({ visitorId, onBack, onToast }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // No range parameter on purpose: opening a visitor should show their
        // whole history, not just the slice that happened to be in view.
        const r = await adminFetch(`${API}/api/admin-panel/analytics/visitors/${encodeURIComponent(visitorId)}/`);
        if (alive) setDetail(r?.ok ? await r.json() : null);
      } catch { onToast?.("Failed to load visitor", false); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [visitorId, onToast]);

  if (loading) return <Spinner />;
  if (!detail) return <EmptyState text="Visitor not found" />;

  const geoNote = detail.geo_status !== "success" ? GEO_STATUS_NOTE[detail.geo_status] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={onBack} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "rgba(255,255,255,0.8)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
        <ArrowLeft size={14} /> Back to visitors
      </button>

      <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>
        Visitor #{detail.short_id}
      </div>

      <StatGrid>
        <StatCard label="Page Views" value={fmtN(detail.page_views)} color={C.blue} />
        <StatCard label="Clicks" value={fmtN(detail.clicks)} color={C.purple} />
        <StatCard label="Videos Viewed" value={fmtN(detail.videos_viewed)} color={C.orange} />
        <StatCard label="Video Completions" value={fmtN(detail.video_completions)} color={C.pink} />
        <StatCard label="Sessions" value={fmtN(detail.session_count)} color={C.teal} />
      </StatGrid>

      <Panel title="Visitor">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16 }}>
          {/* Labelled "Approximate" deliberately — this is an IP-derived
              city, not a device position. */}
          <Field label="Approximate Location" value={locationText(detail)} note={geoNote} />
          <Field label="IP Address" value={detail.ip_address} />
          <Field label="Timezone" value={detail.timezone} />
          <Field label="Network / ISP" value={detail.isp} />
          <Field label="First Seen" value={timeText(detail.first_seen)} />
          <Field label="Last Seen" value={timeText(detail.last_seen)} />
          <Field label="Device" value={detail.device_type} />
          <Field label="Browser" value={detail.browser} />
          <Field label="Operating System" value={detail.operating_system} />
          <Field label="Traffic Source" value={detail.traffic_source} />
          <Field label="Referrer" value={detail.referrer} />
          <Field label="Landing Page" value={detail.landing_page} />
          {detail.utm_campaign && <Field label="UTM Campaign" value={detail.utm_campaign} />}
          {detail.utm_source && <Field label="UTM Source" value={detail.utm_source} />}
          {detail.utm_medium && <Field label="UTM Medium" value={detail.utm_medium} />}
        </div>
      </Panel>

      <Panel title="Pages viewed">
        {!detail.pages_viewed?.length ? <EmptyState text="No page views recorded" /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {detail.pages_viewed.map(p => (
              <div key={p.url} style={{ display: "flex", gap: 10, fontSize: 12 }}>
                <span style={{ flex: 1, color: "rgba(255,255,255,0.78)", wordBreak: "break-all" }}>{p.url || "/"}</span>
                <span style={{ color: C.gold, fontWeight: 700 }}>{fmtN(p.views)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Timeline"
        right={detail.timeline_truncated
          ? <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>most recent 500 events</span>
          : null}
      >
        {!detail.timeline?.length ? <EmptyState text="No activity recorded" /> : (
          <div>
            {detail.timeline.map((e, i) => <TimelineEntry key={`${e.at}-${i}`} entry={e} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Visitors by location ─────────────────────────────────────────────────────
// Its own tree rather than the shared LocationTree: that one is keyed on video
// VIEWERS and labels its columns accordingly, and reusing it here would mean
// showing visitor counts under headings that say "viewers".
function VisitorLocationTree({ countries, onPickCity }) {
  const [openCountry, setOpenCountry] = useState(null);
  const [openRegion, setOpenRegion] = useState(null);

  if (!countries?.length) return <EmptyState text="No location data for this window" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {countries.map(c => {
        const isOpen = openCountry === c.country_code;
        return (
          <div key={c.country_code}>
            <div
              onClick={() => { setOpenCountry(isOpen ? null : c.country_code); setOpenRegion(null); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 8, cursor: "pointer", background: isOpen ? "rgba(255,255,255,0.05)" : "transparent" }}
            >
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: "white", flex: 1 }}>{c.country}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.gold }}>{fmtN(c.visitors)}</span>
            </div>
            {isOpen && (
              <div style={{ paddingLeft: 20 }}>
                {c.regions.map(r => {
                  const regionKey = `${c.country_code}:${r.region}`;
                  const rOpen = openRegion === regionKey;
                  return (
                    <div key={r.region}>
                      <div
                        onClick={() => setOpenRegion(rOpen ? null : regionKey)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 7, cursor: "pointer" }}
                      >
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>{rOpen ? "▾" : "▸"}</span>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", flex: 1 }}>{r.region}</span>
                        <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)" }}>{fmtN(r.visitors)}</span>
                      </div>
                      {rOpen && (
                        <div style={{ paddingLeft: 20 }}>
                          {r.cities.map(city => (
                            <div
                              key={city.city}
                              onClick={() => onPickCity?.(city.city)}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 9px", fontSize: 11.5, cursor: onPickCity ? "pointer" : "default" }}
                            >
                              <span style={{ color: "rgba(255,255,255,0.6)", flex: 1 }}>{city.city}</span>
                              <span style={{ color: C.orange }}>{fmtN(city.visitors)} visitors</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────
export default function VisitorAnalyticsTab({ onToast }) {
  const [range, setRange] = useState({ id: "30d" });
  const [overview, setOverview] = useState(null);
  const [visitors, setVisitors] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  // Filters. `search` is held separately from `applied` so typing doesn't fire
  // a request per keystroke — it is applied on Enter or on the button.
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [device, setDevice] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = rangeQuery(range);
    if (country) params.set("country", country);
    if (city) params.set("city", city);
    if (device) params.set("device", device);
    if (search) params.set("search", search);

    const listParams = new URLSearchParams(params);
    listParams.set("page", String(page));

    try {
      const [o, v, loc] = await Promise.all([
        adminFetch(`${API}/api/admin-panel/analytics/visitors/overview/?${params}`),
        adminFetch(`${API}/api/admin-panel/analytics/visitors/?${listParams}`),
        adminFetch(`${API}/api/admin-panel/analytics/visitor-locations/?${params}`),
      ]);
      setOverview(o?.ok ? await o.json() : null);
      setVisitors(v?.ok ? await v.json() : null);
      setLocations(loc?.ok ? await loc.json() : []);
    } catch { onToast?.("Failed to load visitor analytics", false); }
    setLoading(false);
  }, [range, page, country, city, device, search, onToast]);

  useEffect(() => { load(); }, [load]);

  // Any filter change invalidates the current page number — page 4 of the
  // unfiltered list is meaningless once a country filter is applied.
  const setFilter = (setter) => (value) => { setter(value); setPage(1); };

  const applySearch = () => { setSearch(searchDraft.trim()); setPage(1); };

  if (selected) {
    return <VisitorDetail visitorId={selected} onBack={() => setSelected(null)} onToast={onToast} />;
  }

  const rows = visitors?.results || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "white" }}>Visitor Analytics</div>
        <DateRangeSelector value={range} onChange={r => { setRange(r); setPage(1); }} />
      </div>

      {loading && !overview ? <Spinner /> : (
        <>
          {overview && (
            <StatGrid>
              <StatCard label="Visitors" value={fmtN(overview.visitors)} color={C.gold} />
              <StatCard label="New Visitors" value={fmtN(overview.new_visitors)} color={C.teal} />
              <StatCard label="Returning" value={fmtN(overview.returning_visitors)} color={C.blue} />
              <StatCard label="Sessions" value={fmtN(overview.sessions)} color={C.purple} />
              <StatCard label="Page Views" value={fmtN(overview.page_views)} color={C.blue} />
              <StatCard label="Clicks" value={fmtN(overview.clicks)} sub={`${fmtN(overview.unique_clickers)} unique`} color={C.purple} />
              <StatCard label="Video Viewers" value={fmtN(overview.video_viewers)} sub={`${fmtN(overview.video_views)} views`} color={C.orange} />
              {/* Operational, not vanity: if this is high, the location
                  column is empty for a reason worth investigating. */}
              <StatCard
                label="Location Resolved"
                value={fmtN(overview.geo_resolved)}
                sub={`${fmtN(overview.geo_unresolved)} unresolved`}
                color={C.pink}
              />
            </StatGrid>
          )}

          <Panel
            title="Visitors by location"
            right={<span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>approximate, from IP</span>}
          >
            <VisitorLocationTree countries={locations} onPickCity={setFilter(setCity)} />
          </Panel>

          <Panel
            title="Recent visitors"
            right={
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  placeholder="Country code"
                  value={country}
                  onChange={e => setFilter(setCountry)(e.target.value)}
                  style={{ ...inputStyle, minWidth: 100 }}
                />
                <input
                  placeholder="City"
                  value={city}
                  onChange={e => setFilter(setCity)(e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Device"
                  value={device}
                  onChange={e => setFilter(setDevice)(e.target.value)}
                  style={{ ...inputStyle, minWidth: 100 }}
                />
                <input
                  placeholder="Visitor / IP"
                  value={searchDraft}
                  onChange={e => setSearchDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") applySearch(); }}
                  style={inputStyle}
                />
                <button
                  onClick={applySearch}
                  title="Search"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 7, color: "rgba(255,255,255,0.8)", padding: "6px 9px", cursor: "pointer" }}
                >
                  <Search size={13} />
                </button>
                <button
                  onClick={load}
                  title="Refresh"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 7, color: "rgba(255,255,255,0.8)", padding: "6px 9px", cursor: "pointer" }}
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            }
          >
            <Table
              headers={["Visitor", "IP", "Approx. Location", "Device", "Browser", "Source", "Views", "Clicks", "Videos", "Last Seen"]}
              loading={loading}
              colSpan={10}
              emptyText="No visitors in this window"
            >
              {rows.map(v => (
                <tr
                  key={v.visitor_id}
                  onClick={() => setSelected(v.visitor_id)}
                  style={{ cursor: "pointer", borderTop: `1px solid ${C.border}` }}
                >
                  <td style={{ ...td, fontWeight: 700, color: C.gold }}>#{v.short_id}</td>
                  <td style={td}>{v.ip_address || "—"}</td>
                  <td style={{ ...td, whiteSpace: "normal" }}>{locationText(v)}</td>
                  <td style={td}>{v.device_type || "—"}</td>
                  <td style={td}>{v.browser || "—"}</td>
                  <td style={td}>{v.traffic_source || "—"}</td>
                  <td style={td}>{fmtN(v.page_views)}</td>
                  <td style={td}>{fmtN(v.clicks)}</td>
                  <td style={td}>{fmtN(v.video_views)}</td>
                  <td style={td}>{timeText(v.last_seen)}</td>
                </tr>
              ))}
            </Table>

            {visitors && visitors.total > visitors.page_size && (
              <div style={{ marginTop: 12 }}>
                <Pagination
                  page={visitors.page}
                  total={visitors.total}
                  perPage={visitors.page_size}
                  onChange={setPage}
                />
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
