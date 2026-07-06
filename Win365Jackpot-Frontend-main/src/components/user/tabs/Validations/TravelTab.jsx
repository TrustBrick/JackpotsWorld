import React, { useState, useEffect, useMemo } from "react";
import { Plane, Globe, Hash, Calendar, ChevronDown } from "lucide-react";
import { C } from "../../constants";
import { authFetch, API, fmtD } from "../../helpers";
import { Card, Spinner } from "../../components/SharedUI";

const VIP_NAMES = [
  "VIP", "VIP Bronze", "Silver", "Gold",
  "Jackpot I", "Jackpot II", "Jackpot III", "Jackpot Platinum", "Jackpot Diamond"
];
const VIP_COLORS = [
  "#9CA3AF", "#34D399", "#60A5FA", "#A78BFA",
  "#D4AF37", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6",
];

const PAGE_SIZE = 10;

function CasinoDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = value === "all" ? "All Casinos" : value;
  const isFiltered = value !== "all";

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0, minWidth: 180 }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          padding: "8px 12px", borderRadius: 8,
          background: "rgba(15,17,23,0.95)",
          border: `1px solid ${isFiltered ? C.gold + "80" : "rgba(255,255,255,0.1)"}`,
          color: isFiltered ? C.gold : "rgba(255,255,255,0.55)",
          cursor: "pointer", outline: "none",
          fontSize: 12, fontWeight: 600,
          transition: "border-color 0.15s",
          boxShadow: isFiltered ? `0 0 0 1px ${C.gold}20` : "none",
        }}
      >
        <span>{selected}</span>
        <ChevronDown
          size={12}
          style={{
            flexShrink: 0,
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "none",
            color: isFiltered ? C.gold : "rgba(255,255,255,0.3)",
          }}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "#0f1117",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, overflow: "hidden",
          zIndex: 100,
          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        }}>
          {["all", ...options].map(opt => {
            const label    = opt === "all" ? "All Casinos" : opt;
            const isActive = value === opt;
            return (
              <div
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  padding: "9px 12px",
                  fontSize: 12, fontWeight: isActive ? 700 : 400,
                  color: isActive ? C.gold : "rgba(255,255,255,0.6)",
                  background: isActive ? `${C.gold}12` : "transparent",
                  cursor: "pointer",
                  borderLeft: isActive ? `2px solid ${C.gold}` : "2px solid transparent",
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                  }
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TravelTab({ profile }) {
  const [travels,    setTravels]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [casino,     setCasino]     = useState("all");
  const [page,       setPage]       = useState(1);

  useEffect(() => {
    authFetch(`${API}/api/user/travel-history/`)
      .then(r => r.json())
      .then(d => { setTravels(d.results || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Unique casino names for dropdown
  const casinoOptions = useMemo(() => {
    const names = [...new Set(travels.map(t => t.casino_name).filter(Boolean))].sort();
    return names;
  }, [travels]);

  // Filtered list
  const filtered = useMemo(() => {
    if (casino === "all") return travels;
    return travels.filter(t => t.casino_name === casino);
  }, [travels, casino]);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [casino]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Summary (on filtered)
  const totalRP     = filtered.reduce((s, t) => s + (t.rolling_points_added || 0), 0);
  const totalBetAmt = filtered.reduce((s, t) => s + (t.total_bet_amount     || 0), 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <Plane size={16} style={{ color: C.blue }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Casino Travel History</div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          {filtered.length} visit{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Filter + Summary row */}
      {travels.length > 0 && (
  <div style={{ display: "flex", alignItems: "stretch", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>

    {/* Custom Casino Dropdown */}
    <CasinoDropdown
      value={casino}
      onChange={setCasino}
      options={casinoOptions}
    />

    {/* Summary pills */}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
      {[
        { label: "Visits",     value: filtered.length,                          color: C.blue   },
        { label: "Bet Amount", value: `$${totalBetAmt.toLocaleString("en-IN")}`, color: C.gold   },
        { label: "RP Earned",  value: `${totalRP.toLocaleString("en-IN")} RP`,  color: C.purple },
      ].map(({ label, value, color }) => (
        <div key={label} style={{
          padding: "8px 14px", borderRadius: 8,
          background: `${color}08`, border: `1px solid ${color}20`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</span>
        </div>
      ))}
    </div>
  </div>
)}

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 56 }}>
          <Plane size={40} style={{ color: "rgba(255,255,255,0.08)", margin: "0 auto 12px", display: "block" }} />
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
            {casino !== "all" ? `No visits recorded for ${casino}` : "No casino visits recorded yet"}
          </div>
          <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 11, marginTop: 6 }}>
            Your visits will appear here after your first session entry
          </div>
        </Card>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {paginated.map(t => {
              const vipIdx   = (t.vip_level_at_time || 1) - 1;
              const vipColor = VIP_COLORS[vipIdx] || VIP_COLORS[0];
              const vipName  = VIP_NAMES[vipIdx]  || "VIP";

              return (
                <Card key={t.id} style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ height: 2, background: `linear-gradient(90deg, ${vipColor}, transparent)` }} />

                  <div style={{ padding: "14px 16px" }}>
                    {/* Row 1 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8,
                          background: `${C.blue}15`, border: `1px solid ${C.blue}30`,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <Globe size={15} style={{ color: C.blue }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{t.casino_name || "—"}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                              background: `${vipColor}18`, color: vipColor, border: `1px solid ${vipColor}30`,
                            }}>
                              {vipName}
                            </span>
                            {t.level_up_triggered && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                                background: "rgba(52,211,153,0.12)", color: C.green,
                                border: "1px solid rgba(52,211,153,0.3)",
                              }}>
                                ⬆ Leveled Up
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                          <Calendar size={10} />
                          {t.betting_date
                            ? new Date(t.betting_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                            : fmtD(t.created_at)}
                        </div>
                        {t.slip_number && (
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 2, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                            <Hash size={9} /> {t.slip_number}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Stats */}
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
                      paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      {[
                        { label: "Total Bets",  value: (t.total_bets || 0).toLocaleString("en-IN"),                          color: "rgba(255,255,255,0.55)" },
                        { label: "Bet Amount",  value: `$${Number(t.total_bet_amount     || 0).toLocaleString("en-IN")}`,     color: C.gold   },
                        { label: "RP Earned",   value: `+${Number(t.rolling_points_added || 0).toLocaleString("en-IN")} RP`, color: C.purple },
                        { label: "Total RP",    value: `${Number(t.rolling_points_total  || 0).toLocaleString("en-IN")} RP`,  color: "rgba(255,255,255,0.55)" },
                      ].map(({ label, value, color }) => (
                        <div key={label}>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                            {label}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {t.note && (
                      <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                        {t.note}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginTop: 16, padding: "10px 14px", borderRadius: 8,
              border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.01)",
              fontSize: 12, color: "rgba(255,255,255,0.35)",
            }}>
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: "4px 11px", borderRadius: 6, fontSize: 12,
                    border: `1px solid ${C.border}`, background: "transparent",
                    color: page === 1 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.55)",
                    cursor: page === 1 ? "not-allowed" : "pointer",
                  }}
                >← Prev</button>
                <span style={{ padding: "0 6px" }}>{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{
                    padding: "4px 11px", borderRadius: 6, fontSize: 12,
                    border: `1px solid ${C.border}`, background: "transparent",
                    color: page >= totalPages ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.55)",
                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                  }}
                >Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}