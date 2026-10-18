// "Start a conversation" for Live Support: the agent finds a player or an
// affiliate and texts or calls them, instead of only ever answering chats the
// customer started.
//
// Each result carries a green dot when that person is on the site right now
// (backed by the site's presence heartbeat), so the agent can see who is
// reachable before reaching out. With an empty search box the list shows who
// is online at the moment.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, MessageSquare, PhoneOutgoing, UserPlus } from "lucide-react";
import { API, adminFetch } from "../helpers";
import { Btn } from "./SharedUI";

const KINDS = [
  { key: "player",    label: "Player" },
  { key: "affiliate", label: "Affiliate" },
];
const REFRESH_MS = 20000;

function lastSeenText(iso) {
  if (!iso) return "Never seen";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Seen just now";
  if (mins < 60) return `Seen ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Seen ${hrs} h ago`;
  return `Seen ${Math.round(hrs / 24)} d ago`;
}

export default function LiveChatContactPicker({ C, onStart, canCall }) {
  const [kind, setKind] = useState("player");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [agentCanCall, setAgentCanCall] = useState(true);
  const reqRef = useRef(0);

  const load = useCallback(async (query, k) => {
    const id = ++reqRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, type: k });
      const r = await adminFetch(`${API}/api/admin-panel/live-chat/contacts/?${params}`);
      const j = await r?.json();
      if (id === reqRef.current) {
        setResults(j?.results || []);
        if (typeof j?.agent_can_call === "boolean") setAgentCanCall(j.agent_can_call);
      }
    } catch {
      if (id === reqRef.current) setResults([]);
    }
    if (id === reqRef.current) setLoading(false);
  }, []);

  // Debounced search; also refreshes on a timer so a dot turns green or grey
  // while the agent is looking at the list.
  useEffect(() => {
    const t = setTimeout(() => load(q.trim(), kind), 250);
    const iv = setInterval(() => load(q.trim(), kind), REFRESH_MS);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [q, kind, load]);

  const start = async (contact, action) => {
    setBusy(`${contact.id}:${action}`);
    try {
      await onStart(contact, kind, action);
    } finally {
      setBusy("");
    }
  };

  const shown = kind === "affiliate" ? results.filter(r => r.is_affiliate) : results;

  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: C.gold, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <UserPlus size={12} /> Start a conversation
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {KINDS.map(k => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            style={{
              flex: 1, padding: "5px 4px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
              border: `1px solid ${kind === k.key ? `${C.gold}60` : C.border}`,
              background: kind === k.key ? `${C.gold}14` : "transparent",
              color: kind === k.key ? C.gold : C.muted,
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={`Search ${kind === "affiliate" ? "affiliates" : "players"} by name, email, ID…`}
          aria-label="Search players or affiliates"
          style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 27px", borderRadius: 7, background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: "none" }}
        />
      </div>
      {!q.trim() && (
        <div style={{ fontSize: 10.5, color: C.muted }}>Online now{loading ? "…" : ` (${shown.length})`}</div>
      )}
      <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {!loading && shown.length === 0 && (
          <div style={{ fontSize: 11.5, color: C.dim, padding: "6px 2px" }}>
            {q.trim() ? "No matches" : `No ${kind === "affiliate" ? "affiliates" : "players"} online right now`}
          </div>
        )}
        {shown.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, background: C.hoverBg, border: `1px solid ${C.border}` }}>
            <span
              title={c.is_online ? "Online now" : lastSeenText(c.last_seen_at)}
              aria-label={c.is_online ? "Online" : "Offline"}
              style={{
                width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                background: c.is_online ? "#22c55e" : C.dim,
                boxShadow: c.is_online ? "0 0 0 3px rgba(34,197,94,0.22)" : "none",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name || c.email}
              </div>
              <div style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(kind === "affiliate" ? c.affiliate_id : c.user_uid)} · {c.is_online ? "Online" : lastSeenText(c.last_seen_at)}
              </div>
            </div>
            <Btn small outline disabled={!!busy} onClick={() => start(c, "chat")} style={{ padding: "4px 8px" }}>
              <MessageSquare size={11} /> {busy === `${c.id}:chat` ? "…" : "Text"}
            </Btn>
            <span
              title={
                !agentCanCall ? "Only Customer Support staff can place calls"
                  : !canCall ? "Voice calling is not available right now"
                    : c.is_online ? "" : "Offline — they will not hear the call"
              }
              style={{ display: "inline-flex" }}
            >
              <Btn small disabled={!!busy || !agentCanCall || !canCall || !c.is_online} onClick={() => start(c, "call")} style={{ padding: "4px 8px" }}>
                <PhoneOutgoing size={11} /> {busy === `${c.id}:call` ? "…" : "Call"}
              </Btn>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
