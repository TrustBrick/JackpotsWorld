import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  LifeBuoy, MessageCircle, Send, Mail, Phone, Clock,
  HelpCircle, ChevronDown, PlusCircle, CheckCircle2,
} from "lucide-react";
import { C } from "../../constants";
import { authFetch, API, fmtDT } from "../../helpers";
import { Spinner } from "../../components/SharedUI";
// MULTILINGUAL-CHAT: new imports — local preview feature, all no-ops while disabled
import SupportLanguageSelector from "../../../support/SupportLanguageSelector";
import { fetchSupportConfig } from "../../../../services/translationService";
import TicketMessage from "../../../support/TicketMessage";

// MULTILINGUAL-CHAT: chat language is stored separately from the site's
// i18n language (User.preferred_language / Sidebar's selector) so picking a
// language here never switches the rest of the dashboard's UI text.
const CHAT_LANG_STORAGE_KEY = "support_chat_language";

function SectionHeader({ color, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, background: color }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {children}
      </div>
    </div>
  );
}

function Card({ children, style = {}, ...rest }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: "16px 18px", ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

const CHANNELS = [
  { labelKey: "sidebar.whatsapp", Icon: MessageCircle, color: "#25d366", statusKey: "support.comingSoon" },
  { labelKey: "sidebar.telegram", Icon: Send, color: "#0088cc", statusKey: "support.comingSoon" },
  { labelKey: "support.liveChat", Icon: LifeBuoy, color: C.blue, statusKey: "support.chatNow", onClick: () => window.dispatchEvent(new CustomEvent("open-chat")) },
  { labelKey: "support.emailSupport", Icon: Mail, color: C.gold, status: "support@jackpotsworld.casino" },
];

const FAQ = [
  { q: "How do I withdraw my winnings?", a: "Withdraw at Casino (WAC) from your Wallet tab, then request a payout via your registered contact — our team processes it manually for now." },
  { q: "Why is my Rolling Points balance not increasing?", a: "Rolling Points are only added for casinos you've actually deposited into. Check your Travel History tab to confirm the entry was recorded." },
  { q: "How long does a support ticket take to resolve?", a: "Most tickets are answered within 24 hours during our support hours below." },
];

function FaqAccordionItem({ faq, isOpen, onToggle }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{faq.q}</span>
        <ChevronDown size={14} style={{ color: C.gold, flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {isOpen && (
        <p style={{ padding: "0 14px 12px", fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{faq.a}</p>
      )}
    </div>
  );
}

export default function SupportTab({ onToast }) {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // MULTILINGUAL-CHAT: off by default until the config fetch confirms
  // otherwise — everything below this stays inert (no selector, no
  // translated-reply rendering) when the feature flag is off.
  const [multilingualEnabled, setMultilingualEnabled] = useState(false);
  const [supportedLanguages, setSupportedLanguages] = useState([]);
  const [chatLanguage, setChatLanguage] = useState(
    () => localStorage.getItem(CHAT_LANG_STORAGE_KEY) || "en"
  );

  useEffect(() => {
    fetchSupportConfig().then(cfg => {
      setMultilingualEnabled(!!cfg.enabled);
      setSupportedLanguages(cfg.supported_languages || []);
    });
  }, []);

  const changeChatLanguage = (code) => {
    setChatLanguage(code);
    localStorage.setItem(CHAT_LANG_STORAGE_KEY, code);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/api/support/tickets/`);
      if (r?.ok) setTickets((await r.json()).results || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitTicket = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) { onToast?.(t("support.pleaseFillBoth"), false); return; }
    setSubmitting(true);
    try {
      const r = await authFetch(`${API}/api/support/tickets/`, {
        method: "POST",
        body: JSON.stringify(
          multilingualEnabled ? { subject, message, preferred_language: chatLanguage } : { subject, message }
        ),
      });
      if (r?.ok) {
        onToast?.(t("support.ticketSubmitted"), true);
        setSubject(""); setMessage("");
        load();
      } else {
        onToast?.(t("support.failedToSubmit"), false);
      }
    } catch {
      onToast?.(t("system.networkError"), false);
    }
    setSubmitting(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${C.blue}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LifeBuoy size={16} style={{ color: C.blue }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>{t("sidebar.liveSupport")}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{t("support.subtitle")}</div>
        </div>
      </div>

      {/* Contact channels */}
      <div>
        <SectionHeader color={C.blue}>{t("support.contactChannels")}</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {CHANNELS.map(ch => (
            <Card
              key={ch.labelKey}
              style={ch.onClick ? { cursor: "pointer" } : undefined}
              {...(ch.onClick ? { onClick: ch.onClick, role: "button" } : {})}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${ch.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ch.Icon size={14} style={{ color: ch.color }} />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "white" }}>{t(ch.labelKey)}</div>
              </div>
              <div style={{ fontSize: 11, color: ch.onClick ? C.blue : "rgba(255,255,255,0.4)", fontWeight: ch.onClick ? 700 : 400 }}>{ch.statusKey ? t(ch.statusKey) : ch.status}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* Support availability */}
      <div>
        <SectionHeader color={C.gold}>{t("support.supportAvailability")}</SectionHeader>
        <Card style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Clock size={15} style={{ color: C.gold, flexShrink: 0 }} />
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
            {t("support.availabilityText")}
          </div>
        </Card>
      </div>

      {/* Raise a ticket */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <SectionHeader color={C.green}>{t("support.raiseATicket")}</SectionHeader>
          {/* MULTILINGUAL-CHAT: chat-only language selector — only rendered
              when the feature flag is on. This never touches i18next, so it
              only affects how this ticket is translated, not the rest of
              the dashboard's UI language. */}
          {multilingualEnabled && (
            <div style={{ width: 180 }}>
              <SupportLanguageSelector
                C={C}
                value={chatLanguage}
                options={supportedLanguages}
                onChange={changeChatLanguage}
              />
            </div>
          )}
        </div>
        <Card>
          <form onSubmit={submitTicket} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={t("support.subject")}
              style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none" }}
            />
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t("support.describeIssue")}
              rows={3}
              style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "white", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }}
            />
            <button
              type="submit"
              disabled={submitting}
              style={{
                alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6,
                padding: "9px 18px", borderRadius: 9, fontSize: 12.5, fontWeight: 700,
                background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`, color: "#07080F",
                border: "none", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1,
              }}
            >
              <PlusCircle size={13} /> {submitting ? t("support.submitting") : t("support.submitTicket")}
            </button>
          </form>
        </Card>

        {/* Existing tickets */}
        {loading ? <Spinner /> : tickets.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {tickets.map(tk => (
              <Card key={tk.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "white" }}>{tk.subject}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{fmtDT(tk.created_at)}</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, flexShrink: 0,
                    background: tk.status === "resolved" || tk.status === "closed" ? `${C.green}18` : `${C.orange}18`,
                    color: tk.status === "resolved" || tk.status === "closed" ? C.green : C.orange,
                  }}>
                    {tk.status.replace("_", " ")}
                  </span>
                </div>
                {/* MULTILINGUAL-CHAT: reply shown in the customer's language,
                    English kept visible as a small secondary line. Nothing
                    renders here at all while the feature flag is off. */}
                {multilingualEnabled && tk.admin_reply && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    <TicketMessage
                      C={C}
                      primaryText={tk.admin_reply_translated || tk.admin_reply}
                      secondaryLabel="English"
                      secondaryText={tk.admin_reply_translated ? tk.admin_reply : null}
                    />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* FAQ shortcut */}
      <div>
        <SectionHeader color={C.purple}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><HelpCircle size={11} /> {t("support.faqShortcut")}</span>
        </SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FAQ.map((faq, i) => (
            <FaqAccordionItem key={i} faq={faq} isOpen={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
          ))}
        </div>
      </div>
    </div>
  );
}
