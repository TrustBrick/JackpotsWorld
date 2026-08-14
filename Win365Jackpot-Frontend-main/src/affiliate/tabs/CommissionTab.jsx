import React, { useCallback, useEffect, useState } from "react";
import { HandCoins, TrendingUp, Clock, Banknote, XCircle, CheckCircle2, Search, X, Info } from "lucide-react";
import { API, affiliateFetch, fmt, fmtD } from "../helpers";
import { C, Card, Table, Tr, Td, Pagination, Select, Pill } from "../components/SharedUI";
import CountryCasinoBreakdown from "../components/CountryCasinoBreakdown";

const TYPE_LABEL = { deposit: "Deposit Commission", losing: "Losing Commission", rolling: "Rolling Commission" };
const PAGE_SIZE = 20;

function StatusPill({ status }) {
  const color = {
    Payable: "#A78BFA", Paid: C.green, Pending: C.textSecondary,
    "Not Qualified": C.orange, Rejected: C.red,
  }[status] || C.textSecondary;
  return <Pill color={color}>{status || "—"}</Pill>;
}

function eligibleAmount(row) {
  if (row.commission_type === "deposit") return row.deposit_total;
  if (row.commission_type === "losing") return row.player_loss;
  return row.rolling_amount;
}

// ─── Calculation breakdown modal — every figure here comes straight off the
// row the list already fetched (backend-calculated), never recomputed. ───
function BreakdownModal({ row, onClose }) {
  const eligible = eligibleAmount(row);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480 }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{row.player_name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{TYPE_LABEL[row.commission_type]}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}><X size={18} /></button>
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <StatusPill status={row.commission_status} />
              {row.qualification_status !== "qualified" && row.not_qualified_reason && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{row.not_qualified_reason}</span>
              )}
            </div>

            {(row.commission_type === "deposit" || row.commission_type === "losing") && (
              <>
                <Row label="Deposit Total" value={fmt(row.deposit_total)} />
                <Row label="Required Wagering" value={fmt(row.required_wagering)} />
                <Row label="Completed Wagering" value={fmt(row.completed_wagering)} />
                <Row label="Remaining Wagering" value={fmt(row.remaining_wagering)} />
              </>
            )}
            {row.commission_type === "losing" && <Row label="Player Loss (cumulative)" value={fmt(row.player_loss)} />}
            {row.commission_type === "rolling" && <Row label="Rolling Amount Wagered" value={fmt(row.rolling_amount)} />}

            <div style={{ height: 1, background: C.border, margin: "12px 0" }} />

            <Row label="Eligible Amount" value={fmt(eligible)} />
            <Row label="Rate Applied" value={row.rate_applied != null ? `${row.rate_applied}%` : "—"} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, padding: "10px 12px", borderRadius: 10, background: `${C.gold}10`, border: `1px solid ${C.gold}30` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "white" }}>Commission Amount</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: C.gold, fontFamily: "monospace" }}>{fmt(row.commission_amount)}</span>
            </div>
            {row.commission_type === "deposit" ? (
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", marginTop: 10 }}>
                {fmt(eligible)} &times; {row.rate_applied != null ? `${row.rate_applied}%` : "rate"} = {fmt(row.commission_amount)}
              </div>
            ) : (
              // Rolling/losing commission can accrue across multiple events at
              // different historical rates (e.g. an admin changes the plan's
              // rate mid-cycle) — Rate Applied only ever shows the most
              // recent one, so "Eligible Amount × Rate Applied" would not
              // reliably equal Commission Amount here. Deposit is exempt: it's
              // always exactly one event at one rate, so the formula never lies.
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", marginTop: 10 }}>
                Accrued across {row.commission_type === "rolling" ? "every wagered bet slip" : "this player's qualifying losses"},
                each priced at the rate in effect at the time.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5 }}>
      <span style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
      <span style={{ color: "white", fontFamily: "monospace", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ─── Legacy flat-rate view (no Commission Engine assignment) ───
function LegacyView() {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page });
    if (statusFilter) params.set("status", statusFilter);
    const res = await affiliateFetch(`${API}/api/affiliate/commissions/?${params}`);
    if (res?.ok) {
      const j = await res.json();
      setRows(j.results || []);
      setCount(j.count || 0);
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}25` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Info size={14} style={{ color: C.gold }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>You're on the standard commission</div>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
          You earn a flat commission on every verified bet placed by a player you referred. Contact your account manager if you'd like to move to a Deposit, Losing, or Rolling commission plan instead.
        </div>
      </Card>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Commission History</div>
          <Select
            value={statusFilter}
            onChange={v => { setStatusFilter(v); setPage(1); }}
            minWidth={150}
            options={[{ value: "", label: "All Statuses" }, { value: "pending", label: "Pending" }, { value: "paid", label: "Paid" }]}
          />
        </div>
        <Table
          headers={["Player", "Deposit / Bet Amount", "Rate", "Commission", "Status", "Date"]}
          loading={loading}
          isEmpty={!loading && rows.length === 0}
          emptyText="No commissions recorded yet."
          footer={<Pagination page={page} totalPages={totalPages} count={count} onChange={setPage} />}
        >
          {rows.map((r, i) => (
            <Tr key={r.id} index={i}>
              <Td style={{ fontWeight: 700, color: "white" }}>{r.referred_user_name || r.referred_user_email}</Td>
              <Td muted mono>{fmt(r.deposit_amount)}</Td>
              <Td muted mono>{r.commission_rate}%</Td>
              <Td gold mono>{fmt(r.amount)}</Td>
              <Td><Pill color={r.status === "paid" ? C.green : C.textSecondary}>{r.status === "paid" ? "Paid" : "Pending"}</Pill></Td>
              <Td muted style={{ whiteSpace: "nowrap" }}>{fmtD(r.created_at)}</Td>
            </Tr>
          ))}
        </Table>
      </div>
    </div>
  );
}

// ─── Commission Engine view (Deposit / Losing / Rolling) ───
function EngineView({ summary, onAgreed }) {
  const plan = summary.current_plan;
  const [agreeing, setAgreeing] = useState(false);

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [breakdownRow, setBreakdownRow] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page });
    if (typeFilter) params.set("type", typeFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (dateRange) params.set("date_range", dateRange);
    if (q) params.set("q", q);
    const res = await affiliateFetch(`${API}/api/affiliate/commission-slip/?${params}`);
    if (res?.ok) {
      const j = await res.json();
      setRows(j.results || []);
      setCount(j.count || 0);
    }
    setLoading(false);
  }, [page, typeFilter, statusFilter, dateRange, q]);

  useEffect(() => { load(); }, [load]);

  const agree = async () => {
    setAgreeing(true);
    const res = await affiliateFetch(`${API}/api/affiliate/commission-plan/agree/`, { method: "POST" });
    setAgreeing(false);
    if (res?.ok) onAgreed();
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const showDeposit = plan?.commission_type === "deposit" || plan?.commission_type === "losing";
  const showLoss = plan?.commission_type === "losing";
  const showRolling = plan?.commission_type === "rolling";

  const CARDS = [
    { label: "Total Earned", value: fmt(summary.total_earned), icon: TrendingUp, color: C.gold },
    { label: "Pending", value: fmt(summary.total_pending), icon: Clock, color: "#A78BFA" },
    { label: "Paid", value: fmt(summary.total_paid), icon: Banknote, color: C.green },
    { label: "Rejected", value: fmt(summary.total_rejected), icon: XCircle, color: C.red },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        {CARDS.map(s => (
          <Card key={s.label}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <s.icon size={14} style={{ color: s.color }} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "white", fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Country + Casino rule-engine earnings. Self-hiding — renders
          nothing for an affiliate with no rule-based commissions, so the
          tab is unchanged for anyone still on a plan or the flat rate. */}
      <CountryCasinoBreakdown />

      {/* Plan explainer */}
      {plan && (
        <Card style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}25` }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <HandCoins size={14} style={{ color: C.gold }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{plan.name}</div>
                <span style={{ fontSize: 16, fontWeight: 900, color: C.gold, fontFamily: "monospace" }}>{plan.rate}%</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8, maxWidth: 560 }}>{plan.description}</div>
            </div>
            {summary.agreed_at ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.green, whiteSpace: "nowrap" }}>
                <CheckCircle2 size={14} /> Agreed on {fmtD(summary.agreed_at)}
              </div>
            ) : (
              <button onClick={agree} disabled={agreeing}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F", border: "none", fontSize: 12, fontWeight: 800, cursor: agreeing ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                <CheckCircle2 size={13} /> {agreeing ? "Confirming…" : "I Agree to These Terms"}
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Commission Slip */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 4 }}>Commission Slip</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>Player-by-player breakdown, calculated by the server — click a row for the full calculation.</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
            <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Search player name, email, UID…"
              style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, background: "#0D0D0D", border: `1px solid ${C.tableBorder}`, color: "white", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <Select value={typeFilter} onChange={v => { setTypeFilter(v); setPage(1); }} minWidth={150}
            options={[{ value: "", label: "All Types" }, { value: "deposit", label: "Deposit" }, { value: "losing", label: "Losing" }, { value: "rolling", label: "Rolling" }]} />
          <Select value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} minWidth={150}
            options={[
              { value: "", label: "All Statuses" }, { value: "pending", label: "Pending" }, { value: "not_qualified", label: "Not Qualified" },
              { value: "payable", label: "Payable" }, { value: "paid", label: "Paid" }, { value: "rejected", label: "Rejected" },
            ]} />
          <Select value={dateRange} onChange={v => { setDateRange(v); setPage(1); }} minWidth={140}
            options={[{ value: "", label: "All Time" }, { value: "today", label: "Today" }, { value: "week", label: "This Week" }, { value: "month", label: "This Month" }]} />
        </div>

        <Table
          headers={[
            "Player", ...(showDeposit ? ["Deposit", "Wagering (Done / Req)"] : []),
            ...(showLoss ? ["Player Loss"] : []), ...(showRolling ? ["Rolling Amount"] : []),
            "Rate", "Eligible Amount", "Commission", "Qualification", "Status", "Date",
          ]}
          loading={loading}
          isEmpty={!loading && rows.length === 0}
          emptyText="No commission records match this filter."
          minWidth={900}
          footer={<Pagination page={page} totalPages={totalPages} count={count} onChange={setPage} />}
        >
          {rows.map((r, i) => (
            <Tr key={r.id} index={i} onClick={() => setBreakdownRow(r)}>
              <Td style={{ fontWeight: 700, color: "white" }}>{r.player_name}</Td>
              {showDeposit && <Td muted mono>{fmt(r.deposit_total)}</Td>}
              {showDeposit && <Td muted mono style={{ whiteSpace: "nowrap" }}>{fmt(r.completed_wagering)} / {fmt(r.required_wagering)}</Td>}
              {showLoss && <Td muted mono>{fmt(r.player_loss)}</Td>}
              {showRolling && <Td muted mono>{fmt(r.rolling_amount)}</Td>}
              <Td muted mono>{r.rate_applied != null ? `${r.rate_applied}%` : "—"}</Td>
              <Td muted mono>{fmt(eligibleAmount(r))}</Td>
              <Td gold mono>{fmt(r.commission_amount)}</Td>
              <Td muted>{r.qualification_status === "qualified" ? "Qualified" : r.qualification_status === "pending" ? "Pending" : "Not Qualified"}</Td>
              <Td><StatusPill status={r.commission_status} /></Td>
              <Td muted style={{ whiteSpace: "nowrap" }}>{fmtD(r.last_evaluated_at)}</Td>
            </Tr>
          ))}
        </Table>
      </div>

      {breakdownRow && <BreakdownModal row={breakdownRow} onClose={() => setBreakdownRow(null)} />}
    </div>
  );
}

export default function CommissionTab() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await affiliateFetch(`${API}/api/affiliate/commission-summary/`);
    if (res?.ok) setSummary(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !summary) {
    return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Loading…</div>;
  }

  return summary.on_legacy_flow
    ? <LegacyView />
    : <EngineView summary={summary} onAgreed={load} />;
}
