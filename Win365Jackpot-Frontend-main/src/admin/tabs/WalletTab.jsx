import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Check, X, Filter, RefreshCw, Info, Shield,
  ArrowDownLeft, ArrowUpRight, Plus, AlertCircle, CheckCircle,
} from "lucide-react";
import { C, WALLET_CFG, SCENARIO_META, VALIDATABLE } from "../constants";
import { adminFetch, API, fmt, fmtN, fmtDT, fmtD } from "../helpers";
import {
  Card, Btn, Input, Select, Textarea, Spinner, UidBadge, UtrBadge,
  StatusBadge, Pagination, Table, rowHover, SectionTitle,
} from "../components/SharedUI";

// ═════════════════════════════════════════════════════════════════════════════
// WALLET MANAGER TAB  (root)
// ═════════════════════════════════════════════════════════════════════════════

export default function WalletTab({ onToast }) {
  const [sub, setSub] = useState("balances");

  const SUB_TABS = [
    ["balances",    "💳 Account Balances"],
    ["entry",       "➕ New Transaction"],
    ["verify",      "✅ Pending Verification"],
    ["history",     "📋 Transaction History"],
  ];

  return (
    <div>
      {/* Sub-tab switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        {SUB_TABS.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} style={{
            padding: "9px 16px", borderRadius: "10px 10px 0 0",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${sub === id ? C.border : "transparent"}`,
            borderBottom: "none",
            background: sub === id ? C.surface2 : "transparent",
            color: sub === id ? "white" : "rgba(255,255,255,0.4)",
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {sub === "balances"   && <BalancesPane   onToast={onToast} />}
      {sub === "entry"      && <EntryPane       onToast={onToast} onDone={() => setSub("verify")} />}
      {sub === "verify"     && <VerifyPane      onToast={onToast} />}
      {sub === "history"    && <HistoryPane     onToast={onToast} />}
      {sub === "validation" && <ValidationPane  onToast={onToast} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. ACCOUNT BALANCES PANE
// ═════════════════════════════════════════════════════════════════════════════

function BalancesPane({ onToast }) {
  const [q, setQ]               = useState("");
  const [userId, setUserId]     = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading]   = useState(false);

  const search = async () => {
    if (!q) return;
    setLoading(true);
    const r = await adminFetch(`${API}/api/admin-panel/users/?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    if (j.results?.length) {
      const u = j.results[0];
      setUserId(u.id);
      setUserInfo(u);
      const ar = await adminFetch(`${API}/api/admin-panel/wallet/accounts/user/${u.id}/`);
      const aj = await ar.json();
      setAccounts(aj.accounts || []);
    } else {
      onToast("User not found", false);
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: `${C.blue}08`, border: `1px solid ${C.blue}20`, fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 18, lineHeight: 1.7 }}>
        <Info size={12} style={{ display: "inline", marginRight: 6, color: C.blue }} />
        Each user has exactly <b style={{ color: "white" }}>4 wallet accounts</b> (Cash, Non-Cash, OTP, Rolling Points). Account numbers are unique per customer UID.
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by email / UID / name…"
            onKeyDown={e => e.key === "Enter" && search()}
            style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <Btn onClick={search} outline><Search size={13} /> Search</Btn>
      </div>

      {loading && <Spinner />}

      {userInfo && !loading && (
        <>
          {/* User info bar */}
          <div style={{ padding: "12px 16px", borderRadius: 12, background: `${C.green}08`, border: `1px solid ${C.green}25`, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <div style={{ fontWeight: 700, color: "white", fontSize: 13 }}>{userInfo.name || userInfo.email}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{userInfo.email}</div>
            </div>
            <UidBadge uid={userInfo.user_uid} />
            <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 11 }}>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>VIP <b style={{ color: "#D4AF37" }}>{userInfo.vip_level}</b></span>
            </div>
          </div>

          {/* 4 wallet cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {accounts.map(acct => {
              const cfg = WALLET_CFG[acct.wallet_type] || {};
              return (
                <Card key={acct.id} style={{ background: `${cfg.color}07`, border: `1px solid ${cfg.color}22`, position: "relative" }}>
                  <div style={{ position: "absolute", top: 12, right: 14, fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: `${cfg.color}20`, color: cfg.color }}>{cfg.abbr}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: cfg.color, marginBottom: 4 }}>{cfg.label}</div>

                  {/* Account number */}
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 700, marginBottom: 12, padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}` }}>
                    {acct.account_number}
                  </div>

                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>Available Balance</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "white", fontFamily: "monospace", marginBottom: 14 }}>{fmt(acct.balance)}</div>

                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 10 }}>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>Last Updated</div>
                      <div style={{ color: "rgba(255,255,255,0.6)" }}>{fmtDT(acct.last_updated)}</div>
                    </div>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>Updated By</div>
                      <div style={{ color: cfg.color, fontWeight: 700, fontFamily: "monospace" }}>{acct.updated_by_uid || "—"}</div>
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>Last Reason</div>
                      <div style={{ color: "rgba(255,255,255,0.5)" }}>{acct.last_reason || "—"}</div>
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>Last Scenario Code</div>
                      <div style={{ fontFamily: "monospace", fontWeight: 700, color: cfg.color }}>{acct.last_scenario || "—"}</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {!userInfo && !loading && (
        <div style={{ textAlign: "center", padding: 56, color: "rgba(255,255,255,0.2)" }}>
          Search for a user to view their wallet accounts
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. NEW TRANSACTION ENTRY PANE  (manual back-office form)
// ═════════════════════════════════════════════════════════════════════════════

// Scenarios grouped by wallet
const SCENARIO_GROUPS = {
  cash:           Object.entries(SCENARIO_META).filter(([, v]) => v.wallet === "cash"),
  non_cash:       Object.entries(SCENARIO_META).filter(([, v]) => v.wallet === "non_cash"),
  otp:            Object.entries(SCENARIO_META).filter(([, v]) => v.wallet === "otp"),
  rolling_points: Object.entries(SCENARIO_META).filter(([, v]) => v.wallet === "rolling_points"),
};

function EntryPane({ onToast, onDone }) {
  const [q, setQ]               = useState("");
  const [userId, setUserId]     = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [scenario, setScenario] = useState("");
  const [amount, setAmount]     = useState("");
  const [note, setNote]         = useState("");
  const [submitting, setSubmit] = useState(false);
  const [result, setResult]     = useState(null);  // last submission result

  const meta       = SCENARIO_META[scenario] || null;
  const walletType = meta?.wallet || null;
  const direction  = meta?.dir    || "credit";
  const isValidatable = VALIDATABLE.includes(scenario);

  // Expected bonus for validatable scenarios (mirrors backend rule)
  const vipLevel   = userInfo?.vip_level || 1;
  const MULTIPLIER = { LUB: 100, LUBNC: 100, LUBOT: 100, WBA: 50, MBA: 200 };
  const expected   = isValidatable ? vipLevel * (MULTIPLIER[scenario] || 0) : null;

  const search = async () => {
    if (!q) return;
    const r = await adminFetch(`${API}/api/admin-panel/users/?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    if (j.results?.length) { setUserId(j.results[0].id); setUserInfo(j.results[0]); }
    else onToast("User not found", false);
  };

  const submit = async () => {
    if (!userId || !scenario || !amount) { onToast("Fill all required fields", false); return; }
    setSubmit(true);
    const r = await adminFetch(`${API}/api/admin-panel/wallet/transactions/`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, scenario_code: scenario, direction, amount: parseFloat(amount), note }),
    });
    const j = await r.json();
    if (r.ok) {
      setResult({ ok: true, ...j });
      onToast("Transaction created – awaiting verification", true);
      setAmount(""); setNote(""); setScenario("");
      onDone();
    } else {
      setResult({ ok: false, ...j });
      onToast(j.error || "Submission failed", false);
    }
    setSubmit(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "480px 1fr", gap: 20 }}>
      {/* Form */}
      <Card>
        <SectionTitle sub="All transactions require admin verification before funds are applied.">
          Manual Wallet Entry
        </SectionTitle>

        {/* User search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search user by email / UID…"
              onKeyDown={e => e.key === "Enter" && search()}
              style={{ width: "100%", padding: "10px 14px 10px 34px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <Btn outline onClick={search}><Search size={13} /></Btn>
        </div>

        {userInfo && (
          <div style={{ padding: "10px 12px", borderRadius: 10, background: `${C.green}08`, border: `1px solid ${C.green}25`, marginBottom: 14, fontSize: 12 }}>
            <div style={{ color: C.green, fontWeight: 700 }}>✅ {userInfo.user_uid} · {userInfo.name || userInfo.email}</div>
            <div style={{ color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
              VIP {userInfo.vip_level} &nbsp;|&nbsp; Cash: {fmt(userInfo.wallet_balance)} &nbsp;|&nbsp; NC: {fmt(userInfo.bonus_balance)}
            </div>
          </div>
        )}

        {/* Scenario selector */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Transaction Scenario *
          </label>
          <select value={scenario} onChange={e => setScenario(e.target.value)}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "#0d0d1a", border: `1px solid ${scenario ? C.gold + "50" : C.border}`, color: "white", fontSize: 13, outline: "none" }}>
            <option value="">— Select scenario —</option>
            {Object.entries(SCENARIO_GROUPS).map(([wtype, pairs]) => (
              <optgroup key={wtype} label={`── ${WALLET_CFG[wtype]?.label || wtype} Wallet ──`}>
                {pairs.map(([code, meta]) => (
                  <option key={code} value={code}>{code} — {meta.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Scenario info card */}
        {meta && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: `${WALLET_CFG[walletType]?.color}10`, border: `1px solid ${WALLET_CFG[walletType]?.color}30`, fontSize: 12 }}>
            <div style={{ display: "flex", gap: 16 }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Wallet</div>
                <div style={{ fontWeight: 700, color: WALLET_CFG[walletType]?.color }}>{WALLET_CFG[walletType]?.label}</div>
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Direction</div>
                <div style={{ fontWeight: 700, color: direction === "credit" ? C.green : C.red }}>
                  {direction === "credit" ? "↑ Credit" : "↓ Debit"}
                </div>
              </div>
              {isValidatable && expected !== null && (
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Expected Amount</div>
                  <div style={{ fontWeight: 700, color: C.gold }}>{fmt(expected)}</div>
                </div>
              )}
            </div>
            {isValidatable && (
              <div style={{ marginTop: 8, fontSize: 11, color: C.orange }}>
                ⚠️ System validation: must match ${expected}. Mismatch → auto-rejected.
              </div>
            )}
            {scenario === "ROP" && (
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                ℹ️ Rolling Points are non-redeemable and non-transferrable.
              </div>
            )}
          </motion.div>
        )}

        <Input label="Amount ($) *" value={amount} onChange={setAmount} type="number" placeholder="Enter amount" />

        {/* Quick amount chips */}
        {scenario && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, marginTop: -6 }}>
            {[500, 1000, 2500, 5000, 10000, 25000, 50000].map(a => (
              <button key={a} onClick={() => setAmount(String(a))} style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", background: amount === String(a) ? `${C.gold}20` : C.surface, border: `1px solid ${amount === String(a) ? `${C.gold}50` : C.border}`, color: amount === String(a) ? C.gold : "rgba(255,255,255,0.4)" }}>
                ${a >= 1000 ? (a / 1000) + "k" : a}
              </button>
            ))}
          </div>
        )}

        <Textarea label="Note / Reference" value={note} onChange={setNote} placeholder="e.g. Casino visit 06-Apr-2026, Cash deposit by player" />

        <Btn onClick={submit} disabled={!userId || !scenario || !amount || submitting} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
          <Plus size={14} /> {submitting ? "Submitting…" : "Submit for Verification"}
        </Btn>
      </Card>

      {/* Right: scenario reference */}
      <div>
        <SectionTitle sub="All manual entries go to verification before being applied.">Scenario Reference</SectionTitle>
        {Object.entries(SCENARIO_GROUPS).map(([wtype, pairs]) => {
          const cfg = WALLET_CFG[wtype];
          return (
            <Card key={wtype} style={{ marginBottom: 14, background: `${cfg.color}06`, border: `1px solid ${cfg.color}18` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: cfg.color, marginBottom: 10 }}>
                {cfg.label} Wallet ({cfg.abbr})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pairs.map(([code, meta]) => (
                  <div key={code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.025)" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: cfg.color, minWidth: 54 }}>{code}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{meta.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: meta.dir === "credit" ? C.green : C.red }}>{meta.dir === "credit" ? "↑ Cr" : "↓ Dr"}</span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}

        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: "14px 16px", borderRadius: 12, background: result.ok ? `${C.green}10` : `${C.red}10`, border: `1px solid ${result.ok ? C.green : C.red}30`, marginTop: 4 }}>
            <div style={{ fontWeight: 700, color: result.ok ? C.green : C.red, marginBottom: 6 }}>
              {result.ok ? "✅ Submitted Successfully" : "❌ Submission Failed"}
            </div>
            {result.utr_reference && <div style={{ fontFamily: "monospace", fontSize: 12, color: C.blue }}>UTR: {result.utr_reference}</div>}
            {result.detail && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>{result.detail}</div>}
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. PENDING VERIFICATION PANE
// ═════════════════════════════════════════════════════════════════════════════

function VerifyPane({ onToast }) {
  const [txns, setTxns]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRR]   = useState("");
  const [acting, setActing]     = useState(null);
  const PER = 20;

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    const r = await adminFetch(`${API}/api/admin-panel/wallet/transactions/?status=pending&page=${pg}&page_size=${PER}`);
    const j = await r.json();
    setTxns(j.results || []);
    setTotal(j.count || 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    setActing(id);
    const r = await adminFetch(`${API}/api/admin-panel/wallet/transactions/${id}/approve/`, { method: "POST" });
    const j = await r.json();
    onToast(j.message || j.error, r.ok);
    if (r.ok) load(page);
    setActing(null);
  };

  const reject = async () => {
    if (!rejectReason.trim()) { onToast("Enter a rejection reason", false); return; }
    setActing(rejectId);
    const r = await adminFetch(`${API}/api/admin-panel/wallet/transactions/${rejectId}/reject/`, {
      method: "POST", body: JSON.stringify({ reason: rejectReason }),
    });
    const j = await r.json();
    onToast(j.message || j.error, r.ok);
    if (r.ok) { setRejectId(null); setRR(""); load(page); }
    setActing(null);
  };

  const HEADERS = ["UTR Reference", "User", "Scenario", "Wallet", "Direction", "Amount", "Note", "Created By", "Date", "Actions"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <SectionTitle sub="Transactions submitted by back-office, awaiting approval.">Pending Verification</SectionTitle>
        <Btn small outline onClick={() => load(page)}><RefreshCw size={12} /></Btn>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
              {HEADERS.map(h => <th key={h} style={{ padding: "12px 13px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={10} style={{ padding: 40, textAlign: "center" }}><Spinner /></td></tr>
              : txns.length === 0
                ? <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>No pending transactions</td></tr>
                : txns.map(tx => {
                  const wCfg = WALLET_CFG[tx.wallet_type] || {};
                  const isCr = tx.direction === "credit";
                  return (
                    <tr key={tx.id} style={{ borderBottom: `1px solid ${C.border}` }} {...rowHover}>
                      <td style={{ padding: "11px 13px" }}><UtrBadge utr={tx.utr_reference} /></td>
                      <td style={{ padding: "11px 13px" }}>
                        <div style={{ fontWeight: 600, color: "white", fontSize: 11 }}>{tx.user_name || "—"}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{tx.user_uid}</div>
                      </td>
                      <td style={{ padding: "11px 13px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 800, color: wCfg.color, background: `${wCfg.color}15`, padding: "2px 7px", borderRadius: 6 }}>{tx.scenario_code}</span>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{tx.scenario_label}</div>
                      </td>
                      <td style={{ padding: "11px 13px" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: wCfg.color, padding: "2px 7px", borderRadius: 6, background: `${wCfg.color}15` }}>{wCfg.abbr}</span>
                      </td>
                      <td style={{ padding: "11px 13px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isCr ? C.green : C.red }}>{isCr ? "↑ Credit" : "↓ Debit"}</span>
                      </td>
                      <td style={{ padding: "11px 13px", fontFamily: "monospace", fontWeight: 900, color: isCr ? C.green : C.red, whiteSpace: "nowrap" }}>
                        {isCr ? "+" : "-"}{fmt(tx.amount)}
                      </td>
                      <td style={{ padding: "11px 13px", fontSize: 10, color: "rgba(255,255,255,0.4)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tx.note || "—"}
                      </td>
                      <td style={{ padding: "11px 13px", fontFamily: "monospace", fontSize: 10, color: C.gold }}>{tx.created_by_uid || "—"}</td>
                      <td style={{ padding: "11px 13px", fontSize: 10, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>{fmtDT(tx.created_at)}</td>
                      <td style={{ padding: "11px 13px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Btn small color={C.green} disabled={acting === tx.id} onClick={() => approve(tx.id)}>
                            <Check size={11} /> {acting === tx.id ? "…" : "Approve"}
                          </Btn>
                          <Btn small outline color={C.red} onClick={() => setRejectId(tx.id)}>
                            <X size={11} />
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        <Pagination page={page} total={total} perPage={PER} onChange={pg => { setPage(pg); load(pg); }} />
      </Card>

      {/* Reject modal */}
      <AnimatePresence>
        {rejectId && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRejectId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000 }} />
            <motion.div initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: "100%", maxWidth: 420, padding: "0 20px" }}>
              <Card style={{ padding: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 16 }}>❌ Reject Transaction</div>
                <Textarea label="Rejection Reason *" value={rejectReason} onChange={setRR} placeholder="e.g. Amount does not match casino record" />
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn color={C.red} disabled={acting === rejectId} onClick={reject} style={{ flex: 1, justifyContent: "center" }}>
                    {acting === rejectId ? "Rejecting…" : "Confirm Reject"}
                  </Btn>
                  <Btn outline onClick={() => { setRejectId(null); setRR(""); }}>Cancel</Btn>
                </div>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. TRANSACTION HISTORY PANE
// ═════════════════════════════════════════════════════════════════════════════

function HistoryPane({ onToast }) {
  const [txns, setTxns]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [statusF, setStatusF]   = useState("");
  const [walletF, setWalletF]   = useState("");
  const [scenarioF, setScenF]   = useState("");
  const [q, setQ]               = useState("");
  const PER = 20;

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    const p = new URLSearchParams();
    if (statusF)   p.set("status",      statusF);
    if (walletF)   p.set("wallet_type", walletF);
    if (scenarioF) p.set("scenario",    scenarioF);
    if (q)         p.set("q",           q);
    p.set("page", pg); p.set("page_size", PER);
    const r = await adminFetch(`${API}/api/admin-panel/wallet/transactions/?${p}`);
    const j = await r.json();
    setTxns(j.results || []);
    setTotal(j.count || 0);
    setPage(pg);
    setLoading(false);
  }, [statusF, walletF, scenarioF, q]);

  useEffect(() => { load(); }, [load]);

  const HEADERS = ["UTR Reference", "User", "Scenario", "Wallet", "Direction", "Amount", "Balance Before", "Balance After", "Status", "Date"];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search UTR / user UID / email…"
            style={{ width: "100%", padding: "9px 14px 9px 34px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, color: "white", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
        </div>
        {[
          { val: statusF,   set: setStatusF,  opts: [["", "All Status"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]] },
          { val: walletF,   set: setWalletF,  opts: [["", "All Wallets"], ...Object.entries(WALLET_CFG).map(([k, v]) => [k, v.label])] },
          { val: scenarioF, set: setScenF,    opts: [["", "All Scenarios"], ...Object.keys(SCENARIO_META).map(c => [c, c])] },
        ].map((f, i) => (
          <select key={i} value={f.val} onChange={e => { f.set(e.target.value); setPage(1); }}
            style={{ padding: "9px 12px", borderRadius: 10, background: "#111", border: `1px solid ${C.border}`, color: "white", fontSize: 12 }}>
            {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        <Btn small outline onClick={() => load(1)}><RefreshCw size={12} /></Btn>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
              {HEADERS.map(h => <th key={h} style={{ padding: "12px 13px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={10} style={{ padding: 40, textAlign: "center" }}><Spinner /></td></tr>
              : txns.length === 0
                ? <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>No transactions found</td></tr>
                : txns.map(tx => {
                  const wCfg = WALLET_CFG[tx.wallet_type] || {};
                  const isCr = tx.direction === "credit";
                  return (
                    <tr key={tx.id} style={{ borderBottom: `1px solid ${C.border}` }} {...rowHover}>
                      <td style={{ padding: "11px 13px" }}><UtrBadge utr={tx.utr_reference} /></td>
                      <td style={{ padding: "11px 13px" }}>
                        <div style={{ fontWeight: 600, color: "white", fontSize: 11 }}>{tx.user_name || "—"}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{tx.user_uid}</div>
                      </td>
                      <td style={{ padding: "11px 13px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 800, color: wCfg.color || C.gold, background: `${wCfg.color || C.gold}15`, padding: "2px 7px", borderRadius: 6 }}>{tx.scenario_code}</span>
                      </td>
                      <td style={{ padding: "11px 13px" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: wCfg.color, padding: "2px 7px", borderRadius: 6, background: `${wCfg.color}15` }}>{wCfg.abbr}</span>
                      </td>
                      <td style={{ padding: "11px 13px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isCr ? C.green : C.red }}>{isCr ? "↑ Cr" : "↓ Dr"}</span>
                      </td>
                      <td style={{ padding: "11px 13px", fontFamily: "monospace", fontWeight: 700, color: isCr ? C.green : C.red, whiteSpace: "nowrap" }}>
                        {isCr ? "+" : "-"}{fmt(tx.amount)}
                      </td>
                      <td style={{ padding: "11px 13px", fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                        {tx.balance_before != null ? fmt(tx.balance_before) : "—"}
                      </td>
                      <td style={{ padding: "11px 13px", fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
                        {tx.balance_after != null ? fmt(tx.balance_after) : "—"}
                      </td>
                      <td style={{ padding: "11px 13px" }}><StatusBadge status={tx.status} /></td>
                      <td style={{ padding: "11px 13px", fontSize: 10, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>{fmtDT(tx.created_at)}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        <Pagination page={page} total={total} perPage={PER} onChange={pg => load(pg)} />
      </Card>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. SYSTEM VALIDATION LOG PANE
// ═════════════════════════════════════════════════════════════════════════════

function ValidationPane({ onToast }) {
  const [vals, setVals]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [resultF, setResultF] = useState("");
  const PER = 20;

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    const p = new URLSearchParams();
    if (resultF) p.set("result", resultF);
    p.set("page", pg); p.set("page_size", PER);
    const r = await adminFetch(`${API}/api/admin-panel/wallet/validations/?${p}`);
    const j = await r.json();
    setVals(j.results || []);
    setTotal(j.count || 0);
    setPage(pg);
    setLoading(false);
  }, [resultF]);

  useEffect(() => { load(); }, [load]);

  const HEADERS = ["Validation UTR", "User UID", "Bonus Type", "Expected", "Submitted", "Back Office ID", "Result", "Reason", "Date"];

  return (
    <div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: `${C.blue}08`, border: `1px solid ${C.blue}20`, fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 1.7 }}>
        <Shield size={12} style={{ display: "inline", marginRight: 6, color: C.blue }} />
        System validates LUB / WBA / MBA entries against configured rules (VIP Level × multiplier). Mismatches are auto-rejected and logged here.
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {[["", "All"], ["approved", "Approved"], ["rejected", "Rejected"], ["pending", "Pending"]].map(([v, l]) => (
          <button key={v} onClick={() => { setResultF(v); setPage(1); }} style={{ padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${resultF === v ? `${C.gold}40` : C.border}`, background: resultF === v ? `${C.gold}12` : "transparent", color: resultF === v ? C.gold : "rgba(255,255,255,0.4)" }}>{l}</button>
        ))}
        <Btn small outline onClick={() => load(page)}><RefreshCw size={12} /></Btn>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
              {HEADERS.map(h => <th key={h} style={{ padding: "12px 13px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={9} style={{ padding: 40, textAlign: "center" }}><Spinner /></td></tr>
              : vals.length === 0
                ? <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.2)" }}>No validation records</td></tr>
                : vals.map(v => (
                  <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}` }} {...rowHover}>
                    <td style={{ padding: "11px 13px" }}><UtrBadge utr={v.utr_reference} /></td>
                    <td style={{ padding: "11px 13px" }}><UidBadge uid={v.user_uid} /></td>
                    <td style={{ padding: "11px 13px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: C.orange, background: `${C.orange}12`, padding: "2px 8px", borderRadius: 6 }}>{v.bonus_type}</span>
                    </td>
                    <td style={{ padding: "11px 13px", fontFamily: "monospace", fontWeight: 700, color: C.green }}>{fmt(v.expected_amount)}</td>
                    <td style={{ padding: "11px 13px", fontFamily: "monospace", fontWeight: 700, color: v.result === "approved" ? C.green : C.red }}>{fmt(v.submitted_amount)}</td>
                    <td style={{ padding: "11px 13px", fontFamily: "monospace", fontSize: 10, color: C.blue, fontWeight: 700 }}>{v.back_office_uid || "—"}</td>
                    <td style={{ padding: "11px 13px" }}><StatusBadge status={v.result} /></td>
                    <td style={{ padding: "11px 13px", fontSize: 10, color: v.result === "approved" ? "rgba(255,255,255,0.35)" : C.red, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.rejection_reason || (v.result === "approved" ? "Values match" : "—")}
                    </td>
                    <td style={{ padding: "11px 13px", fontSize: 10, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>{fmtDT(v.created_at)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
        <Pagination page={page} total={total} perPage={PER} onChange={pg => load(pg)} />
      </Card>
    </div>
  );
}