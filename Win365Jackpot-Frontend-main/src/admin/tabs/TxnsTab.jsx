import React, { useState, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, ChevronDown, ChevronUp,
  ArrowDownLeft, ArrowUpRight, Hash, Clock,
  FileText, User, CreditCard
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { C, WALLET_CFG } from "../constants";
import { adminFetch, API, fmt, fmtDT } from "../helpers";
import { Card, Spinner, Pagination } from "../components/SharedUI";

// ─── TX type config ───────────────────────────────────────────────────────────
const TX_TYPES = {
  "DAC":   { label: "Deposit",        color: "#34d399", icon: ArrowDownLeft  },
  "WAC":   { label: "Withdrawal",     color: "#f87171", icon: ArrowUpRight   },
  "TAC":   { label: "Transfer",       color: "#a78bfa", icon: ArrowUpRight   },
  "LAC":  { label: "Lost at Casino", color: "#fb923c", icon: ArrowUpRight   },
  "WIN":   { label: "Winnings",       color: "#34d399", icon: ArrowDownLeft  },
  "LUB":   { label: "Level Bonus",    color: "#f59e0b", icon: ArrowDownLeft  },
  "WBA":   { label: "Weekly Bonus",   color: "#a78bfa", icon: ArrowDownLeft  },
  "MBA":   { label: "Monthly Bonus",  color: "#a78bfa", icon: ArrowDownLeft  },
  "RMB":   { label: "Refund",         color: "#2dd4bf", icon: ArrowDownLeft  },
  "GBE":   { label: "Encashment",     color: "#fb923c", icon: ArrowDownLeft  },
  "CBG":   { label: "Cashback",       color: "#fb923c", icon: ArrowDownLeft  },
  "CBGNC": { label: "NC Cashback",    color: "#60a5fa", icon: ArrowDownLeft  },
  "LUBNC": { label: "NC Bonus",       color: "#60a5fa", icon: ArrowDownLeft  },
  "CBGOT": { label: "OTP Cashback",   color: "#e879f9", icon: ArrowDownLeft  },
  "LUBOT": { label: "OTP Bonus",      color: "#e879f9", icon: ArrowDownLeft  },
  "ROP":   { label: "Rolling Pts",    color: "#a78bfa", icon: ArrowDownLeft  },
  "MAN":   { label: "Manual Override",color: "#60a5fa", icon: ArrowDownLeft  },
};

// FIX 1: DEBIT_TYPES must be a Set of uppercase strings only — and must NOT
// reference `tx` at module scope (that caused "tx is not defined").
const DEBIT_TYPES = new Set(["WAC", "TAC", "LAC"]);

// ─── Normalize reference string ───────────────────────────────────────────────
function normalizeRef(ref, txType) {
  if (!ref) return "—";
  if (/^[A-Z]+-\d+$/.test(ref)) return ref;

  const parts    = ref.split("-");
  const lastPart = parts[parts.length - 1];

  const TYPE_MAP = {
    "OTP_ADD":   "OTP",
    "ROP_ADD":   "ROP",
    "CASH_DEP":  "DAC",
    "CASH_WIN":  "WIN",
    "CASH_WD":   "WAC",
    "CASH_LOSS": "LOSS",
    "CASH_TAC":  "TAC",
    "NC_BONUS":  "LUBNC",
    "NC_CBK":    "CBGNC",
    "LVL_BONUS": "LUB",
    "WK_BONUS":  "WBA",
    "MN_BONUS":  "MBA",
    "REFUND":    "RMB",
    "ENCASH":    "GBE",
    "CASHBACK":  "CBG",
  };

  for (const [key, short] of Object.entries(TYPE_MAP)) {
    if (ref.includes(key)) return `${short}-${lastPart}`;
  }

  if (txType && lastPart && /^\d+$/.test(lastPart)) {
    return `${txType}-${lastPart}`;
  }

  return ref;
}

// ─── Wallet fallback ──────────────────────────────────────────────────────────
const WALLET_FALLBACK = {
  "cash":     { label: "Cash",         abbr: "CASH", color: "#34d399" },
  "C":        { label: "Cash",         abbr: "CASH", color: "#34d399" },
  "non_cash": { label: "Non-Cash",     abbr: "NC",   color: "#60a5fa" },
  "NC":       { label: "Non-Cash",     abbr: "NC",   color: "#60a5fa" },
  "otp":      { label: "OTP",          abbr: "OTP",  color: "#a78bfa" },
  "O":        { label: "OTP",          abbr: "OTP",  color: "#a78bfa" },
  "rp":       { label: "Rolling Pts",  abbr: "RP",   color: "#f59e0b" },
  "RP":       { label: "Rolling Pts",  abbr: "RP",   color: "#f59e0b" },
};

// Add this lookup at the top of TxnsTab, next to WALLET_FALLBACK
const WALLET_KEY_MAP = {
  cash:           "C",
  non_cash:       "NC",
  otp:            "O",
  rolling_points: "RP",
};

const WALLET_CFG_BY_RAW = {
  C:  WALLET_CFG.cash,
  NC: WALLET_CFG.non_cash,
  O:  WALLET_CFG.otp,
  RP: WALLET_CFG.rolling_points,
};

const PER_PAGE = 20;

export default function TxnsTab({ onToast }) {
  const [txns,     setTxns]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [q,        setQ]        = useState("");
  const [typeF,    setTypeF]    = useState("");
  const [walletF,  setWalletF]  = useState("");


   const load = async (pg = 1) => {
    console.log("Filters →", { q, typeF, walletF });
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q)       p.set("q", q);
      if (typeF)   p.set("transaction_type", typeF);
      if (walletF) p.set("wallet_type", WALLET_KEY_MAP[walletF] || walletF);
      p.set("page", pg);
      p.set("page_size", PER_PAGE);

      const r = await adminFetch(`${API}/api/admin-panel/wallet/transactions/?${p}`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      setTxns(j.results || []);
      setTotal(j.count  || 0);
      setPage(pg);
    } catch {
      onToast?.("Failed to load transactions", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); }, [typeF, walletF]);
  useEffect(() => { load(1); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 250 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: 11, color: "rgba(255,255,255,0.3)" }} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(1)}
            placeholder="Search reference / user UID / email…"
            style={sInput}
          />
        </div>
        <select value={typeF} onChange={e => setTypeF(e.target.value)} style={sSelect}>
          <option value="">All Types</option>
          {Object.entries(TX_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.label} ({k})</option>
          ))}
        </select>
        <select value={walletF} onChange={e => setWalletF(e.target.value)} style={sSelect}>
  <option value="">All Wallets</option>
  {Object.entries(WALLET_CFG).map(([k, v]) => (
    <option key={k} value={k}>{v.label}</option>
  ))}
</select>
        <button onClick={() => load(1)} style={sRefresh}><RefreshCw size={14} /></button>
      </div>

      {/* ── Table ── */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center" }}><Spinner /></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${C.border}` }}>
                  <th style={thStyle}>Reference / Date</th>
                  <th style={thStyle}>User</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Wallet</th>
                  <th style={{ ...thStyle, textAlign: "right", color: "#f87171" }}>Debit (−)</th>
                  <th style={{ ...thStyle, textAlign: "right", color: "#34d399" }}>Credit (+)</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {txns.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
                      No transactions found
                    </td>
                  </tr>
                ) : txns.map(tx => {
                  // FIX 1: ALL per-row variables declared INSIDE map — never at module scope.
                  const txType = (tx.transaction_type || "").toUpperCase();
                  const cfg    = TX_TYPES[txType] || { label: tx.transaction_type, color: "#888", icon: Hash };
                  const wCfg = WALLET_CFG_BY_RAW[tx.wallet_type]
                      || WALLET_CFG[tx.wallet_type]
                      || WALLET_FALLBACK[tx.wallet_type]
                      || { label: tx.wallet_type, color: "#888", abbr: tx.wallet_type || "?" };
                  const isExp  = expanded === tx.id;
                  const isDr   = DEBIT_TYPES.has(txType);   // WAC / TAC / LOSS are debits

                  return (
                    <React.Fragment key={tx.id}>
                      <tr
                        onClick={() => setExpanded(isExp ? null : tx.id)}
                        style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                        className="tx-row"
                      >
                        {/* Reference + Date */}
                        <td style={tdStyle}>
                          <div style={{ fontFamily: "monospace", fontWeight: 700, color: "white", fontSize: 12 }}>
                            {normalizeRef(tx.transaction_reference, txType)}
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
                            {fmtDT(tx.created_at)}
                          </div>
                        </td>

                        {/* User */}
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: "white", fontSize: 12 }}>{tx.user_name || "—"}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{tx.user_uid}</div>
                        </td>

                        {/* Type */}
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                              width: 7, height: 7, borderRadius: "50%",
                              background: cfg.color, display: "inline-block", flexShrink: 0,
                            }} />
                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{cfg.label}</span>
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: cfg.color,
                              background: `${cfg.color}20`, padding: "1px 5px", borderRadius: 3,
                            }}>
                              {txType}
                            </span>
                          </div>
                        </td>

                        {/* Wallet */}
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: wCfg.color, background: `${wCfg.color}18`,
                            padding: "2px 8px", borderRadius: 4,
                          }}>
                            {wCfg.abbr}
                          </span>
                        </td>

                        {/* Debit column — WAC, TAC, LOSS show as debit */}
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                          {isDr
                            ? <span style={{ color: "#f87171", fontWeight: 700 }}>−{fmt(tx.amount)}</span>
                            : <span style={{ color: "rgba(255,255,255,0.15)" }}>—</span>
                          }
                        </td>

                        {/* Credit column */}
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                          {!isDr
                            ? <span style={{ color: "#34d399", fontWeight: 700 }}>+{fmt(tx.amount)}</span>
                            : <span style={{ color: "rgba(255,255,255,0.15)" }}>—</span>
                          }
                        </td>

                        {/* Running balance */}
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "rgba(255,255,255,0.55)" }}>
                          {fmt(tx.balance_after)}
                        </td>

                        <td style={{ ...tdStyle, color: "rgba(255,255,255,0.3)" }}>
                          {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      <AnimatePresence>
                        {isExp && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0 }}>
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                style={{
                                  background: "rgba(255,255,255,0.01)",
                                  overflow: "hidden",
                                  borderBottom: `1px solid ${C.border}`,
                                }}
                              >
                                <div style={{
  padding: "16px 20px",
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 16,
}}>
  <DetailItem icon={<Clock size={11}/>}     label="Status"         value="SUCCESS" color="#34d399" />
  <DetailItem icon={<Hash size={11}/>}       label="Transaction ID" value={tx.id} />
  <DetailItem icon={<CreditCard size={11}/>} label="Main Bal Before" value={fmt(tx.balance_before)} />
  <DetailItem icon={<CreditCard size={11}/>} label="Main Bal After"  value={fmt(tx.balance_after)} />
  <DetailItem icon={<User size={11}/>}       label="Performed by"   value={tx.performed_by_name || "System"} />

  {/* ── Casino wallet section — only for casino transactions ── */}
  {tx.casino_name && (
    <>
      {/* Divider row */}
      <div style={{
        gridColumn: "span 5",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        paddingTop: 12,
        marginTop: 4,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 800, textTransform: "uppercase",
          letterSpacing: "0.1em", color: "#a78bfa",
          background: "rgba(167,139,250,0.1)",
          padding: "2px 8px", borderRadius: 4,
          border: "1px solid rgba(167,139,250,0.2)",
        }}>
          Casino Wallet
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>
          {tx.casino_name}
        </span>
        <span style={{
          fontSize: 9, color: "rgba(255,255,255,0.3)",
          background: "rgba(255,255,255,0.05)",
          padding: "2px 6px", borderRadius: 3,
        }}>
          {tx.wallet_type}
        </span>
      </div>

      <DetailItem
        icon={<CreditCard size={11}/>}
        label="Casino Bal Before"
        value={fmt(tx.casino_balance_before)}
        color="#a78bfa"
      />
      <DetailItem
        icon={<CreditCard size={11}/>}
        label="Casino Bal After"
        value={fmt(tx.casino_balance_after)}
        color="#a78bfa"
      />
    </>
  )}

  {/* Note — always last, full width */}
  <div style={{ gridColumn: "span 5" }}>
    <div style={{
      fontSize: 10, color: "rgba(255,255,255,0.3)",
      textTransform: "uppercase", marginBottom: 6,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <FileText size={10} /> Note
    </div>
    <div style={{
      fontSize: 12, color: "rgba(255,255,255,0.6)",
      background: "rgba(255,255,255,0.02)",
      padding: "8px 12px", borderRadius: 8,
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {tx.note || "No note attached."}
    </div>
  </div>
</div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination total={total} page={page} pageSize={PER_PAGE} onChange={p => { setPage(p); load(p); }} />

      <style>{`.tx-row:hover { background: rgba(255,255,255,0.025); }`}</style>
    </div>
  );
}

function DetailItem({ label, value, color, icon }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: "rgba(255,255,255,0.3)",
        textTransform: "uppercase", marginBottom: 5,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        {icon} {label}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 700,
        color: color || "rgba(255,255,255,0.75)",
        fontFamily: "monospace",
        wordBreak: "break-all",
      }}>
        {value}
      </div>
    </div>
  );
}

const sInput   = { width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none" };
const sSelect  = { padding: "9px 12px", borderRadius: 10, background: "#111", border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none", cursor: "pointer" };
const sRefresh = { padding: "10px", borderRadius: 10, background: "transparent", border: `1px solid ${C.border}`, color: "rgba(255,255,255,0.5)", cursor: "pointer" };
const thStyle  = { padding: "11px 15px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 800, textTransform: "uppercase", whiteSpace: "nowrap" };
const tdStyle  = { padding: "13px 15px", whiteSpace: "nowrap" };