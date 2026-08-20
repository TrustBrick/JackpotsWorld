import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollText } from "lucide-react";
import { API, affiliateFetch, fmt, fmtD } from "../helpers";
import { C, Card, Table, Tr, Td, Pagination, Select, Pill } from "./SharedUI";

/**
 * CommissionLedger — the affiliate's own view of the Country+Casino rule
 * engine's ledger, reading /api/affiliate/commissions/ledger/ (already scoped
 * server-side to the requesting affiliate; there is no parameter that could
 * widen it to someone else's earnings).
 *
 * This is the same underlying CommissionLedgerEntry table the Back Office
 * ledger renders — one set of records, two audiences — not a parallel copy.
 * The payload deliberately carries no rule or tier names: an affiliate sees
 * what they earned and whether they qualified, not how the rules are
 * configured (the serializer's Part 40 boundary).
 *
 * Self-hiding: an affiliate whose commissions all come from the older plan or
 * flat-rate layers has no entries here, so the section renders nothing at all
 * and their tab looks exactly as it did before.
 */

const PAGE_SIZE = 20;

const TYPE_LABEL = {
  deposit: "Deposit Commission",
  losing: "Losing Commission",
  rolling: "Rolling Commission",
};

// Mirrors LEDGER_STATUSES in commission_rule_models.py. Colours follow the
// same reading as the Commission Slip's pills: gold/green = money is coming
// or has arrived, purple = approved and waiting, muted = still in progress.
const STATUS_COLOR = {
  pending: C.textSecondary,
  qualifying: C.orange,
  qualified: C.blue,
  approved: "#A78BFA",
  payable: "#A78BFA",
  paid: C.green,
  rejected: C.red,
  cancelled: C.textSecondary,
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "qualifying", label: "Qualifying" },
  { value: "qualified", label: "Qualified" },
  { value: "approved", label: "Approved" },
  { value: "payable", label: "Payable" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
];

function titleCase(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : "—";
}

export default function CommissionLedger() {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  // Whether this affiliate has *any* rule-engine entries at all, remembered
  // from the first unfiltered load — so filtering down to an empty result
  // shows "nothing matches this filter" rather than making the whole section
  // vanish under the reader.
  const [hasEntries, setHasEntries] = useState(false);
  const settled = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    const res = await affiliateFetch(`${API}/api/affiliate/commissions/ledger/?${params}`);
    if (res?.ok) {
      const data = await res.json();
      setRows(data.results || []);
      setCount(data.count || 0);
      if (!settled.current) {
        settled.current = true;
        setHasEntries((data.count || 0) > 0);
      }
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  if (!hasEntries) return null;

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ScrollText size={14} style={{ color: C.gold }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Commission Ledger</div>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
            Every commission calculated for you under country and casino specific rates, with the status it is currently at.
          </div>
        </div>
        <Select
          value={statusFilter}
          onChange={v => { setStatusFilter(v); setPage(1); }}
          minWidth={150}
          options={STATUS_OPTIONS}
        />
      </div>

      <Table
        headers={["Date", "Source", "Player", "Country", "Casino", "Base Amount", "Rate", "Commission", "Status", "Reference"]}
        loading={loading}
        isEmpty={!loading && rows.length === 0}
        emptyText="No commission entries match this filter."
        minWidth={980}
        footer={<Pagination page={page} totalPages={totalPages} count={count} onChange={setPage} />}
      >
        {rows.map((r, i) => (
          <Tr key={r.id} index={i}>
            <Td muted style={{ whiteSpace: "nowrap" }}>{fmtD(r.created_at)}</Td>
            <Td style={{ fontWeight: 600, color: "white", whiteSpace: "nowrap" }}>
              {TYPE_LABEL[r.commission_type] || titleCase(r.commission_type)}
            </Td>
            <Td muted mono>{r.player_uid || "—"}</Td>
            <Td muted>{r.country || "—"}</Td>
            <Td muted>{r.casino_name || "—"}</Td>
            <Td muted mono>{fmt(r.base_amount)}</Td>
            <Td muted mono>{Number(r.commission_rate) > 0 ? `${r.commission_rate}%` : "—"}</Td>
            <Td gold mono>{`${r.currency || "USD"} ${Number(r.commission_amount || 0).toFixed(2)}`}</Td>
            <Td>
              <Pill color={STATUS_COLOR[r.status] || C.textSecondary}>{titleCase(r.status)}</Pill>
            </Td>
            <Td muted mono style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={r.qualification_reason || ""}>
              {r.reference_id || "—"}
            </Td>
          </Tr>
        ))}
      </Table>
    </div>
  );
}
