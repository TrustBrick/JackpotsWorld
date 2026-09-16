import React, { useCallback, useEffect, useState } from "react";
import { Layers, Save, RefreshCw } from "lucide-react";
import ManageContentTab from "./ManageContentTab";
import AndharBaharRegistrationsTable from "./AndharBaharRegistrationsTable";
import { Card, Btn, Spinner } from "../../components/SharedUI";
import { adminFetch, API } from "../../helpers";
import { useAdminTheme } from "../../context/AdminThemeContext";
import { invalidateAndharBaharCache } from "../../../services/andharBaharService";

/**
 * AndharBaharManageTab — the Back Office home for Andhar Bahar.
 *
 * Same shape as TeenPattiManageTab: a view toggle across the parts of one
 * section, with each CRUD list driven by the shared ManageContentTab rather
 * than a bespoke table. Nothing here reimplements list/create/edit/delete,
 * file upload, pagination or the active toggle — that is all the generic tab.
 *
 * The one bespoke piece is the Page Content view, because AndharBaharContent
 * is a SINGLETON (a settings row, not a list) and ManageContentTab is a list
 * editor. It is the same read/patch form LandingSiteSettingsTab uses for
 * LandingSettings.
 *
 * EVERY string the public page renders is editable from here — hero, intro,
 * how-to-play, benefit cards, events, CTA labels AND their targets, visibility
 * switches, SEO. See pages/AndharBahar.jsx: the only literals in that file are
 * structural labels and an offline fallback.
 */

const CASINO_CATALOG_URL = "/api/admin-panel/casino-catalog/";
const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const VIDEO_ACCEPT = ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime";

// Kept in step with the ICON_MAP in pages/AndharBahar.jsx — a name not in that
// map falls back to a default icon rather than breaking the page, but offering
// only names it knows is what stops an admin picking one that silently does
// nothing.
const ICON_OPTIONS = [
  "Zap", "Sparkles", "Flame", "Crown", "Layers", "MapPin",
  "ShieldCheck", "Gift", "Globe", "Star", "BadgeCheck", "Users", "Clock",
].map(v => ({ value: v, label: v }));

const HIGHLIGHT_FIELDS = [
  { name: "title", label: "Title", placeholder: "Fast-Paced Gameplay" },
  { name: "icon_name", label: "Icon", type: "select", options: ICON_OPTIONS, default: "Zap" },
  { name: "color", label: "Accent Colour (hex)", placeholder: "#D4AF37", default: "#D4AF37" },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
  { name: "is_active", label: "Active", type: "boolean", default: true },
];

const HIGHLIGHT_COLUMNS = [
  { key: "title", label: "Title" },
  { key: "icon_name", label: "Icon" },
  { key: "order", label: "Order" },
];

const STEP_FIELDS = [
  { name: "title", label: "Step Title", placeholder: "The joker is drawn" },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
  { name: "is_active", label: "Active", type: "boolean", default: true },
];

const STEP_COLUMNS = [
  { key: "title", label: "Step" },
  { key: "order", label: "Order" },
];

// Country and casino both come from the single casino-catalog response, so the
// two dropdowns can never disagree about which venues exist — the same wiring
// the Teen Patti event form uses, for the same reason.
const EVENT_FIELDS = [
  { name: "name", label: "Event Name", placeholder: "Andhar Bahar Night" },
  { name: "event_type", label: "Event Type", placeholder: "Table Event" },
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
  { name: "city", label: "City", placeholder: "Goa" },
  { name: "venue", label: "Venue (if not a listed casino)", placeholder: "Grand Ballroom" },
  { name: "start_date", label: "Start Date", type: "date" },
  { name: "end_date", label: "End Date", type: "date" },
  { name: "start_time", label: "Start Time", type: "time" },
  { name: "end_time", label: "End Time", type: "time" },
  {
    name: "min_buy_in", label: "Indicative Table Minimum (blank = not published)",
    type: "number", placeholder: "500", clearable: true,
  },
  { name: "currency", label: "Currency", default: "USD", placeholder: "USD" },
  {
    name: "status", label: "Status", type: "select", default: "draft", options: [
      { value: "draft", label: "Draft — not visible to visitors" },
      { value: "published", label: "Published" },
      { value: "upcoming", label: "Upcoming" },
      { value: "live", label: "Live" },
      { value: "completed", label: "Completed" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  { name: "is_featured", label: "Featured", type: "boolean", checkboxLabel: "Show as featured" },
  { name: "is_active", label: "Active", type: "boolean", default: true },
  { name: "order", label: "Sort Order", type: "number", placeholder: "0" },
  { name: "short_description", label: "Short Description", type: "textarea", wide: true },
  { name: "description", label: "Full Description", type: "textarea", wide: true },
  { name: "image", label: "Event Image", type: "file", accept: IMAGE_ACCEPT, wide: true },
];

const EVENT_COLUMNS = [
  { key: "name", label: "Event" },
  { key: "country", label: "Country" },
  { key: "casino_name", label: "Casino" },
  { key: "start_date", label: "Start Date" },
  { key: "status", label: "Status" },
];

const MEDIA_SLOT_OPTIONS = [
  { value: "background", label: "Background Watermark — plays dimmed behind the hero text" },
  { value: "hero_card", label: "Hero Media Card — the framed video under the heading" },
];

const MEDIA_FIELDS = [
  { name: "slot", label: "Slot", type: "select", default: "hero_card", options: MEDIA_SLOT_OPTIONS },
  { name: "label", label: "Badge Label (optional)", placeholder: "ANDHAR BAHAR" },
  {
    name: "video", label: "Video (MP4, WEBM, MOV — max 50MB). Takes priority over the poster image.",
    type: "file", accept: VIDEO_ACCEPT, wide: true,
  },
  {
    name: "poster_image", label: "Poster / Fallback Image (JPG, PNG, WEBP — max 5MB)",
    type: "file", accept: IMAGE_ACCEPT, wide: true,
  },
  { name: "is_active", label: "Active", type: "boolean", default: true },
];

const MEDIA_COLUMNS = [
  { key: "slot", label: "Slot" },
  { key: "label", label: "Badge" },
  { key: "media_type", label: "Media" },
];

// The singleton form, laid out in the order the page renders. `type` here is
// this component's own small vocabulary, not ManageContentTab's — the two
// forms are separate because a settings row and a list are different shapes.
const CONTENT_SECTIONS = [
  {
    title: "Hero",
    fields: [
      { name: "hero_eyebrow", label: "Eyebrow" },
      { name: "hero_title", label: "Title" },
      { name: "hero_subtitle", label: "Subtitle" },
      { name: "hero_description", label: "Description", type: "textarea" },
      { name: "hero_cta_primary_label", label: "Primary CTA — Label" },
      {
        name: "hero_cta_primary_link", label: "Primary CTA — Link",
        hint: "An in-page anchor (#andhar-bahar-events), a site route (/poker), or a full URL.",
      },
      { name: "hero_cta_secondary_label", label: "Secondary CTA — Label" },
      {
        name: "hero_cta_secondary_link", label: "Secondary CTA — Link",
        hint: "#vip-host opens the live-support concierge without leaving the page. An anchor, route or full URL also works, same as the primary CTA.",
      },
      { name: "hero_trust_text", label: "Trust Line" },
    ],
  },
  {
    title: "Game Introduction",
    fields: [
      { name: "intro_title", label: "Intro Heading" },
      { name: "intro_body", label: "Intro Body", type: "textarea" },
      { name: "how_to_play_title", label: "How-To-Play Heading" },
      { name: "how_to_play_note", label: "How-To-Play Note", type: "textarea" },
    ],
  },
  {
    title: "Section Headings",
    fields: [
      { name: "highlights_title", label: "Highlights Heading" },
      { name: "events_title", label: "Events Heading" },
      { name: "events_subtitle", label: "Events Subtitle", type: "textarea" },
    ],
  },
  {
    title: "Visibility",
    fields: [
      {
        name: "is_published", label: "Page published", type: "boolean",
        hint: "Off hides the nav entry and shows an explanation on the route instead of a 404.",
      },
      { name: "show_how_to_play_section", label: "Show How-To-Play section", type: "boolean" },
      { name: "show_highlights_section", label: "Show Highlights section", type: "boolean" },
      { name: "show_events_section", label: "Show Events section", type: "boolean" },
    ],
  },
  {
    title: "SEO",
    fields: [
      { name: "seo_title", label: "SEO Title" },
      { name: "seo_description", label: "SEO Description", type: "textarea" },
    ],
  },
];

const VIEWS = [
  { id: "content", label: "Page Content" },
  { id: "steps", label: "How To Play" },
  { id: "highlights", label: "Highlights" },
  { id: "events", label: "Events" },
  { id: "registrations", label: "Registrations" },
  { id: "media", label: "Hero Media" },
];

function ContentSettingsForm({ onToast }) {
  const { C } = useAdminTheme();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: C.inputBg, border: `1px solid ${C.border}`,
    color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box",
  };

  const load = useCallback(() => {
    setLoading(true);
    adminFetch(`${API}/api/admin-panel/andhar-bahar/content/`)
      .then(r => r?.json())
      .then(j => { if (j) setForm(j); })
      .catch(() => onToast?.("Could not load Andhar Bahar content", false))
      .finally(() => setLoading(false));
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    // Only the editable fields — id/updated_at are read-only and PATCHing
    // them back would be noise the serializer has to reject.
    const body = {};
    CONTENT_SECTIONS.forEach(section => {
      section.fields.forEach(f => { body[f.name] = form[f.name]; });
    });
    try {
      const res = await adminFetch(`${API}/api/admin-panel/andhar-bahar/content/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res?.ok) {
        setForm(await res.json());
        // Drops the public page's 60s cache so an admin sees their own edit
        // immediately rather than up to a minute later.
        invalidateAndharBaharCache();
        onToast?.("Andhar Bahar content saved", true);
      } else {
        onToast?.("Could not save — check the fields and try again", false);
      }
    } catch {
      onToast?.("Could not save Andhar Bahar content", false);
    }
    setSaving(false);
  };

  if (loading && !form) return <div style={{ padding: 20 }}><Spinner /></div>;
  if (!form) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {CONTENT_SECTIONS.map(section => (
        <Card key={section.title} style={{ padding: 18 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 800, color: C.gold, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {section.title}
          </h3>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {section.fields.map(f => (
              <div key={f.name} style={{ gridColumn: f.type === "textarea" ? "1 / -1" : undefined }}>
                <label
                  htmlFor={`ab-${f.name}`}
                  style={{ display: "block", marginBottom: 5, fontSize: 11.5, color: C.muted }}
                >
                  {f.label}
                </label>
                {f.type === "boolean" ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, cursor: "pointer" }}>
                    <input
                      id={`ab-${f.name}`}
                      type="checkbox"
                      checked={!!form[f.name]}
                      onChange={e => setForm(p => ({ ...p, [f.name]: e.target.checked }))}
                    />
                    {f.label}
                  </label>
                ) : f.type === "textarea" ? (
                  <textarea
                    id={`ab-${f.name}`}
                    rows={3}
                    value={form[f.name] ?? ""}
                    onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  />
                ) : (
                  <input
                    id={`ab-${f.name}`}
                    value={form[f.name] ?? ""}
                    onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))}
                    style={inputStyle}
                  />
                )}
                {f.hint && (
                  <p style={{ margin: "5px 0 0", fontSize: 10.5, color: C.muted, lineHeight: 1.45 }}>{f.hint}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <div style={{ display: "flex", gap: 10 }}>
        <Btn onClick={save} disabled={saving}>
          <Save size={14} /> {saving ? "Saving…" : "Save Content"}
        </Btn>
        <Btn variant="ghost" onClick={load} disabled={saving}>
          <RefreshCw size={14} /> Reload
        </Btn>
      </div>
    </div>
  );
}

export default function AndharBaharManageTab({ onToast }) {
  const { C } = useAdminTheme();
  const [view, setView] = useState("content");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Layers size={17} style={{ color: C.gold }} />
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>Andhar Bahar</h2>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
              border: view === v.id ? `1px solid ${C.gold}50` : `1px solid ${C.border}`,
              background: view === v.id ? `${C.gold}15` : "transparent",
              color: view === v.id ? C.gold : C.muted,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "content" ? (
        <ContentSettingsForm onToast={onToast} />
      ) : view === "steps" ? (
        <ManageContentTab
          resourceLabel="How-To-Play Step"
          apiPath="/api/admin-panel/andhar-bahar/steps/"
          fields={STEP_FIELDS}
          columns={STEP_COLUMNS}
          onToast={onToast}
          onSaved={invalidateAndharBaharCache}
        />
      ) : view === "highlights" ? (
        <ManageContentTab
          resourceLabel="Highlight"
          apiPath="/api/admin-panel/andhar-bahar/highlights/"
          fields={HIGHLIGHT_FIELDS}
          columns={HIGHLIGHT_COLUMNS}
          onToast={onToast}
          onSaved={invalidateAndharBaharCache}
        />
      ) : view === "registrations" ? (
        <AndharBaharRegistrationsTable onToast={onToast} />
      ) : view === "events" ? (
        <ManageContentTab
          resourceLabel="Andhar Bahar Event"
          apiPath="/api/admin-panel/andhar-bahar/events/"
          fields={EVENT_FIELDS}
          columns={EVENT_COLUMNS}
          onToast={onToast}
          onSaved={invalidateAndharBaharCache}
        />
      ) : (
        <ManageContentTab
          resourceLabel="Andhar Bahar Media"
          apiPath="/api/admin-panel/andhar-bahar/media/"
          fields={MEDIA_FIELDS}
          columns={MEDIA_COLUMNS}
          onToast={onToast}
          onSaved={invalidateAndharBaharCache}
        />
      )}
    </div>
  );
}
