// src/components/support/TransferCallModal.jsx
//
// The agent's forward/escalate picker. Agent-only — it is never mounted on a
// customer surface, and the endpoints behind it are IsAdminOrSuperAdmin
// regardless, so hiding it is presentation and the gate is the server.
//
// Targets come from GET /api/admin-panel/live-chat/transfer-targets/, which
// returns only colleagues who can take the call RIGHT NOW: a call-handling
// role, the Back Office open, and not already on a call with a player. An
// agent mid-call is not in the list, because forwarding to them would ring
// nobody and leave the customer on hold until the window lapsed.
//
// The filtering is entirely server-side and this component never has to know
// the rule. It is also not the enforcement: request_transfer independently
// refuses a target who is on a call, so a stale card cannot park a customer on
// hold waiting for someone mid-conversation with somebody else.
//
// Offline is treated more softly than busy, on both sides. Presence comes from
// a WebSocket, where a dropped socket reads the same as an empty chair, so it
// hides a colleague here but does not block a deliberate forward — and with no
// presence data at all the filter stands down entirely rather than emptying
// the picker. See call_control_service for the full reasoning.
//
// The reason field is internal agent-to-agent context. It travels to whoever
// picks up and is stored on the CallTransfer row; it is never shown to the
// customer (call_control_service.call_control_payload deliberately omits it).

import React, { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { AlertCircle, Building2, Forward, Search, User, X } from "lucide-react"
import { PUBLIC_CALL_THEME } from "./callTheme"

// Everything a row DISPLAYS is searchable, and everything searchable is
// displayed. `role` is in here because a colleague with no department shows
// their role on the row, and a visible label that matches nothing is the same
// bug as an invisible field that does.
//
// Module scope rather than inside the component: it depends only on its
// argument, so rebuilding it every render would be noise in the useMemo that
// uses it.
const agentHaystack = (a) =>
  `${a.name || ""} ${a.email || ""} ${a.department || ""} ${a.role || ""}`.toLowerCase()

export default function TransferCallModal({
  open,
  onClose,
  onSubmit,
  fetchTargets,
  theme = PUBLIC_CALL_THEME,
}) {
  const [targets, setTargets] = useState({
    agents: [], departments: [], unavailable_count: 0, on_call_count: 0,
  })
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null) // {kind: 'agent'|'department', id, label}
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setLoading(true)
    setError("")
    ;(async () => {
      try {
        const data = await fetchTargets?.()
        if (!cancelled && data) setTargets(data)
      } catch {
        if (!cancelled) setError("Could not load the list of colleagues.")
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, fetchTargets])

  // Reset between openings so a cancelled transfer does not leave its target
  // and reason pre-filled the next time the agent opens this.
  useEffect(() => {
    if (open) return
    setSelected(null)
    setReason("")
    setQuery("")
    setError("")
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const agents = (targets.agents || []).filter(a => !q || agentHaystack(a).includes(q))
    const departments = (targets.departments || []).filter(d =>
      !q || `${d.name || ""} ${d.description || ""}`.toLowerCase().includes(q),
    )
    return { agents, departments }
  }, [targets, query])

  const matchCount = filtered.agents.length + filtered.departments.length

  // How many colleagues the server withheld as unable to take the call. A
  // count, never names — an agent needs to know the list is short because the
  // desk is busy rather than because something broke, and does not need a
  // roster of who is on what.
  const hiddenNote = useMemo(() => {
    const onCall = targets.on_call_count || 0
    const other = Math.max(0, (targets.unavailable_count || 0) - onCall)
    const parts = []
    if (onCall) parts.push(`${onCall} on a call`)
    if (other) parts.push(`${other} offline`)
    return parts.length ? `${parts.join(" · ")} — not shown` : ""
  }, [targets])

  if (!open) return null

  const submit = async () => {
    if (!selected || submitting) return
    setSubmitting(true)
    setError("")
    const res = await onSubmit?.({
      toAgentId: selected.kind === "agent" ? selected.id : null,
      toDepartmentId: selected.kind === "department" ? selected.id : null,
      reason: reason.trim(),
    })
    setSubmitting(false)
    if (res?.ok) onClose?.()
    else setError(res?.data?.error || "Could not forward the call.")
  }

  const rowStyle = (isSelected) => ({
    display: "flex", alignItems: "center", gap: 10, width: "100%",
    padding: "10px 12px", borderRadius: 9, cursor: "pointer", textAlign: "left",
    border: `1px solid ${isSelected ? theme.gold : theme.border}`,
    background: isSelected ? `${theme.gold}1A` : "transparent",
    color: theme.text, fontSize: 13,
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Forward call"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: theme.overlay, backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 400, maxHeight: "85vh",
          display: "flex", flexDirection: "column",
          background: theme.surface, border: `1px solid ${theme.border}`,
          borderRadius: 16, padding: 18,
          boxShadow: "0 24px 70px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Forward size={16} style={{ color: theme.gold }} />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: theme.text, flex: 1 }}>
            Forward this call
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: theme.sub, cursor: "pointer", padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: theme.muted, lineHeight: 1.5 }}>
          Only colleagues free to take a call are listed. The customer stays on the
          same call and hears hold audio while your colleague is rung; if nobody
          answers, the call comes back to you.
        </p>
        {hiddenNote && (
          <p style={{ margin: "0 0 10px", fontSize: 10.5, color: theme.muted, opacity: 0.85 }}>
            {hiddenNote}
          </p>
        )}

        <div style={{ position: "relative", marginBottom: 6 }}>
          <Search
            size={14}
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: theme.muted }}
          />
          <input
            id="jw-transfer-search"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search colleagues by name, email, department or role"
            placeholder="Search by name, email or department…"
            style={{
              width: "100%", padding: "9px 30px 9px 32px", borderRadius: 9,
              background: "transparent", border: `1px solid ${theme.border}`,
              color: theme.text, fontSize: 12.5, outline: "none", boxSizing: "border-box",
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "transparent", border: "none", color: theme.muted,
                cursor: "pointer", padding: 2, display: "flex",
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* A search that silently returns nothing is indistinguishable from one
            that broke, so say what it found either way. */}
        <p
          aria-live="polite"
          style={{
            margin: "0 0 8px", minHeight: 13, fontSize: 10.5,
            color: theme.muted, opacity: query.trim() ? 1 : 0,
          }}
        >
          {matchCount === 1 ? "1 match" : `${matchCount} matches`}
        </p>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, minHeight: 80 }}>
          {loading && (
            <p style={{ fontSize: 12, color: theme.muted, textAlign: "center", padding: 16 }}>Loading…</p>
          )}

          {!loading && filtered.departments.length > 0 && (
            <>
              <p style={{ margin: "4px 0 2px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: theme.muted }}>
                Departments
              </p>
              {filtered.departments.map(d => {
                const isSelected = selected?.kind === "department" && selected.id === d.id
                // Free headcount, not total membership: a department whose
                // whole team is mid-call cannot take this one, and offering it
                // would fail on submit. Departments stay VISIBLE though —
                // unlike an individual, an empty one is a routing gap worth
                // noticing rather than hiding.
                const free = d.available_agent_count ?? d.agent_count
                const unavailable = !free
                return (
                  <button
                    key={`dept-${d.id}`}
                    type="button"
                    disabled={unavailable}
                    onClick={() => setSelected({ kind: "department", id: d.id, label: d.name })}
                    style={{ ...rowStyle(isSelected), opacity: unavailable ? 0.45 : 1, cursor: unavailable ? "not-allowed" : "pointer" }}
                  >
                    <Building2 size={14} style={{ color: theme.gold, flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <span style={{ fontSize: 10.5, color: theme.muted }}>
                      {!d.agent_count
                        ? "no agents"
                        : unavailable
                          ? "all on calls"
                          : `${free} free`}
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {!loading && filtered.agents.length > 0 && (
            <>
              <p style={{ margin: "8px 0 2px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: theme.muted }}>
                Colleagues
              </p>
              {filtered.agents.map(a => {
                const isSelected = selected?.kind === "agent" && selected.id === a.id
                return (
                  <button
                    key={`agent-${a.id}`}
                    type="button"
                    onClick={() => setSelected({ kind: "agent", id: a.id, label: a.name })}
                    style={{ ...rowStyle(isSelected), alignItems: "flex-start" }}
                  >
                    <User size={14} style={{ color: theme.gold, flexShrink: 0, marginTop: 2 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: "block", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {a.name}
                      </span>
                      {/* The email you can search by, visible so you can confirm
                          you picked the right colleague — two people sharing a
                          first name is exactly when the search matters. Skipped
                          when the name IS the email (the server falls back to it
                          for an agent with no name set), which would just print
                          the same string twice. */}
                      {a.email && a.email !== a.name && (
                        <span style={{
                          display: "block", fontSize: 10.5, color: theme.muted,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {a.email}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 10.5, color: theme.muted, flexShrink: 0, marginTop: 2 }}>
                      {a.department || a.role}
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {!loading && !filtered.agents.length && !filtered.departments.length && (
            <p style={{ fontSize: 12, color: theme.muted, textAlign: "center", padding: 16 }}>
              {query.trim()
                ? "Nobody matches that search."
                : (targets.unavailable_count || 0) > 0
                  ? "Everyone is on a call or offline right now. Try again in a moment, or stay with the customer."
                  : "No colleagues or departments are available to take this call."}
            </p>
          )}
        </div>

        <label
          htmlFor="jw-transfer-reason"
          style={{ display: "block", margin: "12px 0 5px", fontSize: 11, color: theme.muted }}
        >
          Context for your colleague (optional, not shown to the customer)
        </label>
        <input
          id="jw-transfer-reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={255}
          placeholder="e.g. Withdrawal reversal, KYC already verified"
          style={{
            width: "100%", padding: "9px 11px", borderRadius: 9,
            background: "transparent", border: `1px solid ${theme.border}`,
            color: theme.text, fontSize: 12.5, outline: "none", boxSizing: "border-box",
          }}
        />

        {error && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12,
            padding: "9px 11px", borderRadius: 9,
            background: `${theme.red}14`, border: `1px solid ${theme.red}44`,
            color: theme.red, fontSize: 12, lineHeight: 1.45,
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: "11px", borderRadius: 11,
              border: `1px solid ${theme.border}`, background: "transparent",
              color: theme.text, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!selected || submitting}
            style={{
              flex: 1, padding: "11px", borderRadius: 11,
              border: `1px solid ${theme.gold}88`,
              background: selected ? `${theme.gold}22` : "transparent",
              color: theme.gold, fontSize: 13, fontWeight: 700,
              cursor: selected && !submitting ? "pointer" : "not-allowed",
              opacity: selected && !submitting ? 1 : 0.5,
            }}
          >
            {submitting ? "Forwarding…" : "Forward"}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
