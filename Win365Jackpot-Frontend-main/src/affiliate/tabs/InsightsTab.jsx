import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, Award, BarChart3, Check, Copy, Gamepad2, Layers, Link2,
  RefreshCw, ShieldCheck, Spade, Club, TrendingUp, Users, Wallet,
} from "lucide-react";
import { API, affiliateFetch, fmt } from "../helpers";
import { C, Card, Table, Tr, Td, Pill } from "../components/SharedUI";

/**
 * InsightsTab — the affiliate metrics beyond commission.
 *
 * EVERY FIGURE ON THIS SCREEN COMES FROM A REAL ROW. There is no estimate,
 * no projection and no placeholder anywhere: the backend
 * (services/affiliate_dashboard_service.py) is explicit that where data does
 * not exist it returns null, and this component renders that as an honest
 * empty state rather than a zero or an invented number.
 *
 * The three places that matters most:
 *   • Top performing game is hidden entirely until real attributed activity
 *     exists. Commission earned before per-game attribution carries no game,
 *     and is shown under "Not attributed" rather than being credited to one.
 *   • Tier progress only appears when a TIERED commission rule actually
 *     applies to this affiliate. There is no separate affiliate-tier table in
 *     this app, and inventing a "Bronze/Silver/Gold" ladder would be a second
 *     source of truth for something the commission engine already decides.
 *   • A rate reads "As agreed" when no rule matches and the older plan or
 *     flat-rate layer would price it, rather than showing a percentage nobody
 *     configured.
 *
 * Additive: this is a NEW tab beside the existing Overview, which is
 * untouched. The two share their funnel maths server-side
 * (affiliate_stats_service), so they can never disagree about what
 * "qualified" means.
 */

const GAME_ICONS = { poker: Spade, teen_patti: Club, andhar_bahar: Layers };

const STATUS_TONE = {
  active: { color: "#34d399", label: "Active" },
  pending: { color: "#D4AF37", label: "Pending approval" },
  suspended: { color: "#f87171", label: "Suspended" },
  disabled: { color: "rgba(255,255,255,0.45)", label: "Disabled" },
};

function StatCard({ icon: Icon, label, value, sub, color = "#D4AF37" }) {
  return (
    <Card style={{ padding: "15px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${color}18`, border: `1px solid ${color}40`,
      }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "white", lineHeight: 1.15 }}>{value}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.38)", marginTop: 3 }}>{sub}</div>
        )}
      </div>
    </Card>
  );
}

function SectionTitle({ icon: Icon, children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {Icon && <Icon size={14} style={{ color: C.gold }} />}
      <span style={{ fontSize: 12.5, fontWeight: 800, color: "white", flex: 1 }}>{children}</span>
      {right}
    </div>
  );
}

/** A horizontal bar for a value against the largest in its set. */
function BarRow({ label, value, max, formatted, color = "#D4AF37" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
        <span style={{ color: "rgba(255,255,255,0.7)" }}>{label}</span>
        <span style={{ color: "white", fontWeight: 700 }}>{formatted}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

function ReferralLinkRow({ code, game, label, param }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/${param}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked in some embedded contexts. The link is on screen
      // and selectable either way, so this degrades to "copy it by hand"
      // rather than to a broken button.
    }
  };

  const Icon = GAME_ICONS[game] || Link2;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`,
    }}>
      <Icon size={14} style={{ color: C.gold, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11.5, color: "white", fontWeight: 700 }}>{label}</div>
        <div style={{
          fontSize: 10.5, color: "rgba(255,255,255,0.45)", fontFamily: "monospace",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {url}
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy the ${label} referral link`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "5px 10px", borderRadius: 7, cursor: "pointer",
          border: `1px solid ${copied ? "#34d39966" : C.border}`,
          background: copied ? "#34d39918" : "transparent",
          color: copied ? "#34d399" : "rgba(255,255,255,0.6)", fontSize: 10.5, fontWeight: 700,
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function InsightsTab({ onToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await affiliateFetch(`${API}/api/affiliate/insights/`);
      if (res?.ok) setData(await res.json());
      else onToast?.("Could not load your insights", false);
    } catch {
      onToast?.("Could not load your insights", false);
    }
    setLoading(false);
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const maxGameTotal = useMemo(() => {
    const games = data?.by_game?.games || [];
    return Math.max(0, ...games.map(g => g.total));
  }, [data]);

  const maxMonth = useMemo(() => {
    const rows = data?.performance || [];
    return Math.max(0, ...rows.map(r => r.commission));
  }, [data]);

  if (loading && !data) {
    return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Loading…</div>;
  }
  if (!data) return null;

  const { status, referrals, earnings, by_game: byGame, by_status: byStatus,
          by_type: byType, performance, activity, tier, supported_games: supportedGames,
          links, clicks } = data;

  const tone = STATUS_TONE[status.status] || STATUS_TONE.pending;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Status + refresh ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
          color: tone.color, background: `${tone.color}18`, border: `1px solid ${tone.color}44`,
        }}>
          <ShieldCheck size={12} /> {status.label}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={load}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${C.border}`, background: "transparent",
            color: "rgba(255,255,255,0.6)", fontSize: 11.5,
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ── Headline figures ── */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <StatCard
          icon={Users} label="Total referrals" value={fmt(referrals.total_referrals)}
          sub={`${fmt(referrals.active_referrals)} active in the last ${referrals.active_window_days} days`}
        />
        <StatCard
          icon={TrendingUp} label="Conversion rate" value={`${referrals.conversion_rate}%`}
          sub={`${fmt(referrals.qualified_players)} of ${fmt(referrals.total_referrals)} have placed a bet`}
          color="#34d399"
        />
        <StatCard
          icon={Wallet} label="Total earnings" value={`$${fmt(earnings.total_earnings)}`}
          sub={`${earnings.commission_count} commission entries`}
        />
        <StatCard
          icon={Activity} label="Pending" value={`$${fmt(earnings.pending_earnings)}`}
          sub="Awaiting approval or settlement" color="#fbbf24"
        />
        <StatCard
          icon={Award} label="Paid" value={`$${fmt(earnings.paid_earnings)}`}
          sub="Already settled to you" color="#34d399"
        />
        <StatCard
          icon={Link2} label="Referral clicks" value={fmt(clicks.total_clicks)}
          sub={`${clicks.click_conversion_rate}% became registrations`} color="#60A5FA"
        />
      </div>

      {/* ── Funnel ── */}
      <Card style={{ padding: 18 }}>
        <SectionTitle icon={BarChart3}>Referral funnel</SectionTitle>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {[
            { label: "Registered only", value: referrals.registered_only, hint: "No deposit or bet yet" },
            { label: "Deposit players", value: referrals.deposit_players, hint: "Deposited, not yet bet" },
            { label: "Qualified players", value: referrals.qualified_players, hint: "Placed at least one bet" },
            { label: "Total deposits", value: `$${fmt(referrals.total_deposits)}`, hint: "From every referred player" },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "white" }}>
                {typeof item.value === "number" ? fmt(item.value) : item.value}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{item.label}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{item.hint}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Per game ── */}
      <Card style={{ padding: 18 }}>
        <SectionTitle
          icon={Gamepad2}
          right={byGame.top_game ? (
            <Pill color="#D4AF37">Top: {byGame.top_game.label}</Pill>
          ) : null}
        >
          Commission by game
        </SectionTitle>

        {maxGameTotal === 0 ? (
          // Honest empty state. The games are still listed above with zeros
          // so an affiliate can see the full set they can refer for.
          <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
            No commission has been attributed to a specific game yet. Once your referred players
            have qualifying activity, it will be broken down here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 14 }}>
            {byGame.games.map(g => (
              <BarRow
                key={g.game}
                label={`${g.label}${g.entries ? ` · ${g.entries} entr${g.entries === 1 ? "y" : "ies"}` : ""}`}
                value={g.total}
                max={maxGameTotal}
                formatted={`$${fmt(g.total)}`}
              />
            ))}
          </div>
        )}

        {byGame.unattributed.total > 0 && (
          <div style={{
            padding: "9px 11px", borderRadius: 9, fontSize: 11, lineHeight: 1.55,
            background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
            color: "rgba(255,255,255,0.6)",
          }}>
            <strong style={{ color: "white" }}>
              ${fmt(byGame.unattributed.total)} not attributed
            </strong>{" "}
            — {byGame.unattributed.note}
          </div>
        )}
      </Card>

      {/* ── Supported games and their rates ── */}
      <Card style={{ padding: 18 }}>
        <SectionTitle icon={Layers}>Games you can refer for</SectionTitle>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {supportedGames.map(g => {
            const Icon = GAME_ICONS[g.game] || Layers;
            const rates = Object.entries(g.rates || {});
            return (
              <div key={g.game} style={{ padding: 12, borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <Icon size={14} style={{ color: C.gold }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "white" }}>{g.label}</span>
                </div>
                {rates.length ? rates.map(([type, r]) => (
                  <div key={type} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 3 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>{type}</span>
                    <span style={{ color: "white", fontWeight: 700 }}>
                      {r.rate_type === "fixed"
                        ? `${r.currency} ${fmt(r.fixed_amount)}`
                        : r.rate_type === "tiered" ? "Tiered" : `${r.rate}%`}
                    </span>
                  </div>
                )) : (
                  // No rule matches, so the plan or flat-rate layer decides.
                  // Saying "as agreed" is the truth; printing a percentage
                  // nobody configured would not be.
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    As agreed with your account manager
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Tier progress — only when a tiered rule genuinely applies ── */}
      {tier && (
        <Card style={{ padding: 18 }}>
          <SectionTitle icon={Award}>
            Tier progress — {tier.metric_label}
          </SectionTitle>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "white" }}>{fmt(tier.measured)}</span>
            {tier.current_tier && (
              <span style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>
                {tier.current_tier.name} · {tier.current_tier.rate}%
              </span>
            )}
          </div>
          {tier.next_tier ? (
            <>
              <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(100, tier.next_tier.progress_pct)}%`, height: "100%",
                  background: C.gold, transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
                <span>{tier.next_tier.progress_pct}% to {tier.next_tier.name}</span>
                <span>{fmt(tier.next_tier.remaining)} more for {tier.next_tier.rate}%</span>
              </div>
            </>
          ) : tier.at_top_tier ? (
            <p style={{ margin: 0, fontSize: 11.5, color: "#34d399" }}>
              You are on the top tier.
            </p>
          ) : null}
        </Card>
      )}

      {/* ── Performance over time ── */}
      {performance.length > 0 && (
        <Card style={{ padding: 18 }}>
          <SectionTitle icon={TrendingUp}>Performance over time</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {performance.map(row => (
              <BarRow
                key={row.month}
                label={`${row.month} · ${row.referrals} new referral${row.referrals === 1 ? "" : "s"}`}
                value={row.commission}
                max={maxMonth}
                formatted={`$${fmt(row.commission)}`}
                color="#60A5FA"
              />
            ))}
          </div>
        </Card>
      )}

      {/* ── Commission breakdown ── */}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <Card style={{ padding: 18 }}>
          <SectionTitle>By status</SectionTitle>
          {byStatus.length ? byStatus.map(row => (
            <div key={row.status} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0" }}>
              <span style={{ color: "rgba(255,255,255,0.6)", textTransform: "capitalize" }}>{row.status}</span>
              <span style={{ color: "white", fontWeight: 700 }}>${fmt(row.total)}</span>
            </div>
          )) : <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>No commission yet.</p>}
        </Card>
        <Card style={{ padding: 18 }}>
          <SectionTitle>By commission type</SectionTitle>
          {byType.length ? byType.map(row => (
            <div key={row.type} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0" }}>
              <span style={{ color: "rgba(255,255,255,0.6)", textTransform: "capitalize" }}>
                {String(row.type).replace("_", " ")}
              </span>
              <span style={{ color: "white", fontWeight: 700 }}>${fmt(row.total)}</span>
            </div>
          )) : <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>No commission yet.</p>}
        </Card>
      </div>

      {/* ── Referral links ── */}
      <Card style={{ padding: 18 }}>
        <SectionTitle icon={Link2}>
          Your referral links
        </SectionTitle>
        <p style={{ margin: "0 0 12px", fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.55 }}>
          A game-specific link records which game you were promoting. Commission is still
          attributed to whichever game the player actually plays.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ReferralLinkRow
            code={links.referral_code}
            game=""
            label="General link"
            param={`?ref=${links.referral_code}`}
          />
          {links.games.map(g => (
            <ReferralLinkRow
              key={g.game}
              code={links.referral_code}
              game={g.game}
              label={g.label}
              param={g.param}
            />
          ))}
        </div>
      </Card>

      {/* ── Recent activity ── */}
      <Card style={{ padding: 18 }}>
        <SectionTitle icon={Activity}>Recent activity</SectionTitle>
        <Table
          headers={["", "Who", "Detail", "Amount", "When"]}
          isEmpty={!activity.length}
          emptyText="Nothing yet — activity from your referred players appears here."
          minWidth={520}
        >
          {activity.map((row, i) => (
            <Tr key={`${row.kind}-${row.at}-${i}`} index={i}>
              <Td>
                <Pill color={row.kind === "commission" ? "#34d399" : "#60A5FA"}>
                  {row.kind === "commission" ? "Commission" : "Referral"}
                </Pill>
              </Td>
              <Td>{row.label}</Td>
              <Td muted>
                {row.detail}
                {row.game_label ? ` · ${row.game_label}` : ""}
              </Td>
              <Td gold mono>{row.amount != null ? `$${fmt(row.amount)}` : "—"}</Td>
              <Td muted>{new Date(row.at).toLocaleDateString()}</Td>
            </Tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
