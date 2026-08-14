import React, { useCallback, useEffect, useState } from "react";
import {
  CalendarDays, Radio, CheckCircle2, Users, Ticket, Ban, Star, LayoutGrid, FileEdit,
} from "lucide-react";
import ManageContentTab from "./ManageContentTab";
import TeenPattiRegistrationsTable from "./TeenPattiRegistrationsTable";
import { Card, Spinner } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";

const CASINO_CATALOG_URL = "/api/admin-panel/casino-catalog/";

// Country and casino both come from the single casino-catalog response, so
// the two dropdowns never disagree about which venues exist. `dependsOn` on
// the casino field narrows it to the chosen country (Part 26), and the
// country field submits the country *name* rather than a pk because that is
// what TeenPattiEvent.country stores — hence optionValueKey: "id" over a
// catalog whose country rows are {id: "Sri Lanka", name: "Sri Lanka"}.
const FIELDS = [
  { name: "name", label: "Event Name", placeholder: "Teen Patti Royal Night" },
  { name: "event_type", label: "Event Type", placeholder: "Tournament" },
  {
    name: "country", label: "Country", type: "asyncSelect",
    optionsUrl: CASINO_CATALOG_URL, optionsKey: "countries",
    optionValueKey: "id", placeholder: "— Select country —",
  },
  {
    name: "casino", label: "Casino", type: "asyncSelect",
    optionsUrl: CASINO_CATALOG_URL, optionsKey: "results",
    dependsOn: { field: "country", optionKey: "country" },
    placeholder: "— Select casino —",
  },
  { name: "city", label: "City", placeholder: "Colombo" },
  { name: "venue", label: "Venue (if not a listed casino)", placeholder: "Grand Ballroom" },
  { name: "start_date", label: "Start Date", type: "date" },
  { name: "end_date", label: "End Date", type: "date" },
  { name: "start_time", label: "Start Time", type: "time" },
  { name: "end_time", label: "End Time", type: "time" },
  { name: "entry_fee", label: "Entry Fee", type: "number", placeholder: "100" },
  { name: "currency", label: "Currency", default: "USD", placeholder: "USD" },
  { name: "prize_pool", label: "Prize Pool", type: "number", placeholder: "25000" },
  { name: "max_participants", label: "Max Participants (blank = unlimited)", type: "number", placeholder: "50" },
  {
    name: "status", label: "Status", type: "select", default: "draft", options: [
      { value: "draft", label: "Draft" },
      { value: "published", label: "Published" },
      { value: "upcoming", label: "Upcoming" },
      { value: "live", label: "Live" },
      { value: "completed", label: "Completed" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  { name: "is_featured", label: "Featured", type: "boolean", checkboxLabel: "Show as featured" },
  { name: "registration_open", label: "Registration", type: "boolean", default: true, checkboxLabel: "Open for registration" },
  { name: "short_description", label: "Short Description", placeholder: "One-line summary", wide: true },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "image", label: "Event Image", type: "file", wide: true },
  { name: "banner", label: "Banner", type: "file", wide: true },
];

const COLUMNS = [
  { key: "name", label: "Event" },
  { key: "country", label: "Country" },
  { key: "casino_name", label: "Casino" },
  { key: "start_date", label: "Start Date" },
  { key: "status", label: "Status" },
  { key: "registration_count", label: "Registrations" },
];

const VIEWS = [
  { id: "events", label: "Events" },
  { id: "registrations", label: "Registrations" },
];

function StatCard({ label, value, icon: Icon, color }) {
  const { C } = useAdminTheme();
  return (
    <Card style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 36, height: 36, borderRadius: 10, display: "flex",
          alignItems: "center", justifyContent: "center",
          background: `${color}18`, border: `1px solid ${color}40`, flexShrink: 0,
        }}
      >
        <Icon size={17} style={{ color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{value ?? "—"}</div>
        <div style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </div>
      </div>
    </Card>
  );
}

function TeenPattiDashboard({ refreshKey }) {
  const { C } = useAdminTheme();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/teen-patti/stats/`)
      .then(r => r?.json())
      .then(j => { if (j) setStats(j); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading && !stats) return <div style={{ padding: 20 }}><Spinner /></div>;
  if (!stats) return null;

  return (
    <div
      style={{
        display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
      }}
    >
      <StatCard label="Total Events" value={stats.total_events} icon={LayoutGrid} color={C.blue} />
      <StatCard label="Live Now" value={stats.live_events} icon={Radio} color={C.red} />
      {/* Published + Upcoming are one bucket to an admin, exactly as they are
          to a visitor: "published" is just an event the date-driven promoter
          hasn't reached yet. Counting them separately made freshly-published
          events look like they'd vanished. */}
      <StatCard
        label="Upcoming"
        value={(stats.published_events || 0) + (stats.upcoming_events || 0)}
        icon={CalendarDays}
        color={C.gold}
      />
      <StatCard label="Drafts" value={stats.draft_events} icon={FileEdit} color={C.muted} />
      <StatCard label="Completed" value={stats.completed_events} icon={CheckCircle2} color={C.green} />
      <StatCard label="Featured" value={stats.featured_events} icon={Star} color={C.purple} />
      <StatCard label="Cancelled" value={stats.cancelled_events} icon={Ban} color={C.muted} />
      <StatCard label="Total Registrations" value={stats.total_registrations} icon={Ticket} color={C.teal} />
      <StatCard label="Upcoming Registrations" value={stats.upcoming_registrations} icon={Users} color={C.blue} />
      <StatCard label="Fully Booked" value={stats.fully_booked_events} icon={Users} color={C.orange} />
    </div>
  );
}

/**
 * TeenPattiManageTab — the Back Office home for Teen Patti (Part 22).
 * Dashboard tiles above a view toggle between event CRUD (driven by the
 * shared ManageContentTab) and the registration list.
 */
export default function TeenPattiManageTab({ onToast }) {
  const { C } = useAdminTheme();
  const [view, setView] = useState("events");
  // Bumped after any event save so the dashboard tiles reflect the change
  // without the admin having to reload the panel.
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <TeenPattiDashboard refreshKey={refreshKey} />

      <div style={{ display: "flex", gap: 8 }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s",
              border: view === v.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
              background: view === v.id ? `${C.gold}15` : "transparent",
              color: view === v.id ? C.gold : C.muted,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "events" ? (
        <ManageContentTab
          resourceLabel="Teen Patti Event"
          apiPath="/api/admin-panel/teen-patti/"
          fields={FIELDS}
          columns={COLUMNS}
          onToast={onToast}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      ) : (
        <TeenPattiRegistrationsTable onToast={onToast} />
      )}
    </div>
  );
}
