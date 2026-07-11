import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const C = {
  bg: "#06080E", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)",
  gold: "#D4AF37", green: "#34D399", red: "#F87171", blue: "#60A5FA",
};

const faqs = [
  { q: "How does affiliate approval work?", a: "Applications are reviewed by our team before your account is activated. You'll see your status reflected here, and can log in as soon as it's approved." },
  { q: "How and when do I get paid?", a: "Commissions are calculated on every referred deposit and paid out directly to your account. Check the Referred Users tab for a running per-referral breakdown." },
  { q: "How is my commission rate set?", a: "Your rate starts at the Starter tier and increases automatically as your active referral count grows — see the Commission tab for the full tier table." },
  { q: "Can I promote more than one partner casino?", a: "Yes — your affiliate link covers our entire network of partner casinos, events, and promotions." },
  { q: "Is there a limit to how much I can earn?", a: "There is no cap on commission earnings. The more active players you refer, the higher your tier and payout." },
];

function FaqItem({ faq, isOpen, onToggle }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", paddingRight: 14 }}>{faq.q}</span>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ color: C.gold, flexShrink: 0 }}>
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: "hidden" }}
          >
            <p style={{ padding: "0 18px 14px", fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{faq.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FaqTab() {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {faqs.map((faq, i) => (
        <FaqItem
          key={i}
          faq={faq}
          isOpen={openFaq === i}
          onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
        />
      ))}
    </div>
  );
}
