/**
 * Register.jsx — Public VIP registration form
 *
 * For visitors who don't want to create an account — just submit interest.
 * Matches AuthModal design system exactly (same tokens, atoms, patterns).
 *
 * Fields: Full name, Country (live API), WhatsApp number (country-aware dial code),
 *         Destination, Package, VIP deals opt-in, Pro tips opt-in
 *
 * No duplicate checks (not needed — not tied to auth).
 * Strict phone validation per country digit count.
 * Submits to POST /api/register/
 */

import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  User, Globe, Phone, MapPin, Package, Bell, BellOff,
  CheckCircle2, AlertCircle, ArrowRight, Loader2,
  ChevronDown, Search, Lock, Star,
} from "lucide-react";
import { useAutoFetch } from "../hooks/useAutoFetch";
import { fetchLocations } from "../services/locationService";
import { fetchTourPackages } from "../services/landingService";

const API = import.meta.env.VITE_API_URL;

// ─── Design tokens (identical to AuthModal) ───────────────────────────────────
const C = {
  bg:          "#0d1117",
  surface:     "#161b22",
  surfaceHi:   "#1c2128",
  border:      "#30363d",
  gold:        "#d4af37",
  goldLight:   "#e8c84a",
  goldGlow:    "rgba(212,175,55,0.09)",
  goldGlow2:   "rgba(212,175,55,0.18)",
  text:        "#e6edf3",
  muted:       "#8b949e",
  dim:         "#484f58",
  green:       "#3fb950",
  greenBorder: "rgba(63,185,80,0.35)",
  greenBg:     "rgba(63,185,80,0.07)",
  red:         "#f85149",
  redBorder:   "rgba(248,81,73,0.35)",
  redBg:       "rgba(248,81,73,0.07)",
  yellow:      "#e3b341",
};

// ─── Static option fallbacks (used only until the admin-managed lists load) ───
const FALLBACK_DESTINATIONS = ["Macao", "Philippines", "India", "Sri Lanka", "Vietnam"];

const FALLBACK_PACKAGES = [
  "VIP",
  "Classic",
  "Premium",
  "Prestige",
  "Signature",
  "Elite",
  "Royal",
  "Sovereign",
];

// ─── Atoms (same as AuthModal) ────────────────────────────────────────────────

function FocusInput({ type = "text", value, onChange, placeholder, hasError, hasOk,
  extraStyle, onKeyDown, disabled, maxLength, ...rest }) {
  const [focus, setFocus] = useState(false);
  const base = {
    width: "100%", padding: "10px 13px", fontSize: 14,
    color: C.text, background: "transparent",
    border: `1.5px solid ${hasError ? C.redBorder : hasOk ? C.greenBorder : focus ? C.gold : C.border}`,
    borderRadius: 8, outline: "none",
    boxShadow: focus && !hasError ? `0 0 0 3px ${C.goldGlow}` : "none",
    transition: "border 0.15s, box-shadow 0.15s",
    boxSizing: "border-box", fontFamily: "inherit",
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "text",
    ...extraStyle,
  };
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={base} onKeyDown={onKeyDown} disabled={disabled} maxLength={maxLength}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} {...rest} />
  );
}

const Label = ({ children, optional }) => (
  <div style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, marginBottom: 6,
    letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
    {children}
    {optional && <span style={{ fontWeight: 400, color: C.dim, textTransform: "none",
      letterSpacing: 0, fontSize: 10 }}>(optional)</span>}
  </div>
);

const Hint = ({ color, icon: Icon, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11,
    color, marginTop: 5 }}>
    <Icon size={10} />{children}
  </div>
);

function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      style={{
        display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 13px",
        background: C.redBg, border: `1.5px solid ${C.redBorder}`,
        borderRadius: 8, marginBottom: 14, fontSize: 12.5,
        color: C.red, lineHeight: 1.5,
      }}>
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{msg}
    </motion.div>
  );
}

function GoldBtn({ onClick, loading, disabled, children }) {
  const off = loading || disabled;
  return (
    <motion.button
      whileHover={!off ? { scale: 1.01, filter: "brightness(1.1)" } : {}}
      whileTap={!off ? { scale: 0.98 } : {}}
      onClick={onClick} disabled={off}
      style={{
        width: "100%", padding: "12px 16px", fontSize: 13.5, fontWeight: 800,
        letterSpacing: "0.04em",
        background: off ? "rgba(212,175,55,0.08)" : `linear-gradient(135deg, ${C.gold}, #b8941e)`,
        color: off ? C.dim : "#08080a",
        border: "none", borderRadius: 8, cursor: off ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        transition: "all 0.15s", marginTop: 8, fontFamily: "inherit",
        boxShadow: off ? "none" : "0 2px 18px rgba(212,175,55,0.28)",
      }}>
      {loading
        ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />Please wait…</>
        : <>{children}<ArrowRight size={14} /></>}
    </motion.button>
  );
}

// ─── Country selector (same as AuthModal) ─────────────────────────────────────

function CountrySelector({ value, onChange, countries, loading }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const [focus,  setFocus]  = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = countries.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.dial_code.includes(search)
  );

  const selected = countries.find((c) => c.code === value);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%", padding: "10px 13px", fontSize: 14,
          color: selected ? C.text : C.muted,
          background: C.bg,
          border: `1.5px solid ${focus || open ? C.gold : C.border}`,
          borderRadius: 8, outline: "none", cursor: "pointer",
          boxShadow: (focus || open) ? `0 0 0 3px ${C.goldGlow}` : "none",
          transition: "border 0.15s, box-shadow 0.15s",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {loading
            ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite", color: C.muted }} />
            : <Globe size={13} color={C.muted} />}
          {selected
            ? <span>{selected.flag} {selected.name} <span style={{ color: C.muted, fontSize: 12 }}>({selected.dial_code})</span></span>
            : <span style={{ color: C.dim }}>Select country…</span>}
        </span>
        <ChevronDown size={13} color={C.muted}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
              background: C.surfaceHi, border: `1.5px solid ${C.gold}`,
              borderRadius: 10, zIndex: 300,
              boxShadow: "0 16px 48px rgba(0,0,0,0.6)", overflow: "hidden",
            }}
          >
            <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, position: "relative" }}>
              <Search size={12} style={{
                position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)",
                color: C.muted, pointerEvents: "none",
              }} />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country…"
                style={{
                  width: "100%", padding: "7px 10px 7px 28px", fontSize: 12,
                  background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.text, outline: "none",
                  boxSizing: "border-box", fontFamily: "inherit",
                }} />
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {filtered.length === 0
                ? <div style={{ padding: "14px", textAlign: "center", color: C.dim, fontSize: 12 }}>No countries found</div>
                : filtered.map((c) => (
                  <button key={c.code} type="button"
                    onClick={() => { onChange(c); setOpen(false); setSearch(""); }}
                    style={{
                      width: "100%", padding: "9px 14px", fontSize: 12.5,
                      background: c.code === value ? "rgba(212,175,55,0.1)" : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                      color: c.code === value ? C.gold : C.text,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      fontFamily: "inherit", borderBottom: `1px solid rgba(48,54,61,0.4)`,
                    }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{c.flag}</span>
                      <span>{c.name}</span>
                    </span>
                    <span style={{ color: C.muted, fontSize: 11 }}>{c.dial_code}</span>
                  </button>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Phone input (dial code pill + number) ────────────────────────────────────

function PhoneInput({ value, country, onChange, hasError, hasOk }) {
  const [focus, setFocus] = useState(false);
  const border = hasError ? C.redBorder : hasOk ? C.greenBorder : focus ? C.gold : C.border;
  const shadow = focus && !hasError ? `0 0 0 3px ${C.goldGlow}` : "none";

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    onChange(digits);
  };

  return (
    <div  style={{
      display: "flex", gap: 8,
    }}>
      {/* Dial code pill */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minWidth: 80, padding: "10px 12px",
        background: C.bg, border: `1.5px solid ${C.border}`,
        borderRadius: 8, fontSize: 13,
        color: country ? C.text : C.dim,
        fontWeight: 600, flexShrink: 0, userSelect: "none",
        transition: "border 0.15s",
      }}>
        {country ? `${country.flag} ${country.dial_code}` : "+—"}
      </div>

      {/* Number input */}
      <div style={{ flex: 1 }}>
        <input
          type="tel"
          value={value}
          onChange={handleChange}
          placeholder={country ? "Phone number" : "Select country first"}
          disabled={!country}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            width: "100%", padding: "10px 13px", fontSize: 14,
            color: C.text, background: C.bg,
            border: `1.5px solid ${border}`,
            borderRadius: 8, outline: "none",
            boxShadow: shadow,
            transition: "border 0.15s, box-shadow 0.15s",
            boxSizing: "border-box", fontFamily: "inherit",
            opacity: !country ? 0.5 : 1,
            cursor: !country ? "not-allowed" : "text",
            letterSpacing: "0.04em",
          }}
        />
      </div>
    </div>
  );
}

// ─── Styled select ────────────────────────────────────────────────────────────

function StyledSelect({ value, onChange, options, placeholder, hasError, icon: Icon }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      {Icon && (
        <span style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: C.muted, pointerEvents: "none", display: "flex", zIndex: 1,
        }}>
          <Icon size={13} />
        </span>
      )}
      <select
        value={value}
        onChange={onChange}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%", padding: `10px 36px 10px ${Icon ? "36px" : "13px"}`, fontSize: 14,
          color: value ? C.text : C.dim,
          background: C.bg,
          border: `1.5px solid ${hasError ? C.redBorder : focus ? C.gold : C.border}`,
          borderRadius: 8, outline: "none", cursor: "pointer",
          boxShadow: focus ? `0 0 0 3px ${C.goldGlow}` : "none",
          transition: "border 0.15s, box-shadow 0.15s",
          boxSizing: "border-box", fontFamily: "inherit",
          appearance: "none", WebkitAppearance: "none",
        }}>
        <option value="" disabled style={{ background: C.surface, color: C.muted }}>{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} style={{ background: C.surface, color: C.text }}>{o}</option>
        ))}
      </select>
      <ChevronDown size={13} color={C.muted} style={{
        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
        pointerEvents: "none",
      }} />
    </div>
  );
}

// ─── Toggle checkbox card ─────────────────────────────────────────────────────

function ToggleCard({ id, checked, onChange, icon: Icon, title, desc, accentColor = C.gold }) {
  return (
    <label htmlFor={id} style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "12px 14px", borderRadius: 9, cursor: "pointer",
      border: `1.5px solid ${checked ? accentColor + "50" : C.border}`,
      background: checked ? `rgba(212,175,55,0.06)` : "transparent",
      transition: "all 0.18s", marginBottom: 8,
    }}>
      <input type="checkbox" id={id} checked={checked} onChange={onChange}
        style={{ display: "none" }} />
      <div style={{
        width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
        border: `1.5px solid ${checked ? accentColor : C.border}`,
        background: checked ? accentColor : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
      }}>
        {checked && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#08080a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          {Icon && <Icon size={11} color={checked ? accentColor : C.muted} />}
          <span style={{ fontSize: 13, fontWeight: 600, color: checked ? C.text : C.muted }}>
            {title}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </label>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────────

function Divider({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 16px" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: C.dim,
        letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ onReset }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      style={{ textAlign: "center", padding: "32px 0" }}>
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 20, delay: 0.1 }}
        style={{
          width: 64, height: 64, borderRadius: "50%",
          background: C.greenBg, border: `2px solid ${C.greenBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
        <CheckCircle2 size={30} color={C.green} />
      </motion.div>
      <div style={{ fontSize: 19, fontWeight: 800, color: C.text, marginBottom: 10,
        fontFamily: "Manrope, sans-serif", letterSpacing: "-0.01em" }}>
        You're on the list!
      </div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 28, maxWidth: 280, margin: "0 auto 28px" }}>
        Our VIP concierge team will reach outwithin 24 hours with your exclusive package details.
      </div>
      <GoldBtn onClick={onReset} loading={false} disabled={false}>
        Register another interest
      </GoldBtn>
    </motion.div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

export default function Register() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [name,        setName]        = useState("");
  const [country,     setCountry]     = useState(null);
  const [phone,       setPhone]       = useState("");
  const [destination, setDestination] = useState("");
  const [pkg,         setPkg]         = useState("");
  const [vipDeals,    setVipDeals]    = useState(false);
  const [proTips,     setProTips]     = useState(false);

  const [countries,        setCountries]        = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);

  const { data: locationsData } = useAutoFetch(fetchLocations, {}, { intervalMs: 60_000 });
  const DESTINATIONS = Array.isArray(locationsData) && locationsData.length > 0
    ? locationsData.map(l => l.name)
    : FALLBACK_DESTINATIONS;

  const { data: tourPackagesData } = useAutoFetch(fetchTourPackages, {}, { intervalMs: 60_000 });
  const PACKAGES = Array.isArray(tourPackagesData) && tourPackagesData.length > 0
    ? tourPackagesData.map(p => p.name)
    : FALLBACK_PACKAGES;

  const [errors,    setErrors]    = useState({});
  const [loading,   setLoading]   = useState(false);
  const [apiError,  setApiError]  = useState("");
  const [submitted, setSubmitted] = useState(false);

  // ── Fetch countries ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/auth/countries/`)
      .then((r) => r.json())
      .then((data) => setCountries(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setCountriesLoading(false));
  }, []);

  // ── Phone digit length validation ──────────────────────────────────────────
  // restcountries doesn't give us per-country digit counts,
  // so we use a sensible range: 4–15 digits (ITU-T E.164 standard)
  const phoneDigits   = phone.replace(/\D/g, "");
  const phoneOk       = phoneDigits.length >= 4 && phoneDigits.length <= 15;
  const phoneStarted  = phoneDigits.length > 0;

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!name.trim() || name.trim().length < 2)
      e.name = "Full name must be at least 2 characters";
    if (!country)
      e.country = "Please select your country";
    if (phoneStarted && !phoneOk)
      e.phone = "Enter a valid phone number (4–15 digits)";
    if (!destination)
      e.destination = "Please select a destination";
    if (!pkg)
      e.package = "Please select a package";
    return e;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({}); setApiError(""); setLoading(true);

    try {
      const res = await fetch(`${API}/api/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name:              name.trim(),
          country:                country.name,          // store full name for this model
          whatsapp_number:        phone ? country.dial_code + phoneDigits : "",
          destination,
          package:                pkg,
          interested_in_vip_deals: vipDeals,
          interested_in_pro_tips:  proTips,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data?.detail || data?.errors?.whatsapp_number?.[0] || "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setApiError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const clearErr = (field) => setErrors((p) => { const n = { ...p }; delete n[field]; return n; });

  const reset = () => {
    setName(""); setCountry(null); setPhone(""); setDestination("");
    setPkg(""); setVipDeals(false); setProTips(false);
    setErrors({}); setApiError(""); setSubmitted(false);
  };

  const W = { marginBottom: 15 };

  // ─── Page shell ──────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        select option { background: #0d1117 !important; color: #e6edf3 !important; }
        input::placeholder { color: rgba(139,148,158,0.5) !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: 'transparent',
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "32px 16px",
        // fontFamily: "'Manrope', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background glow orbs */}
        <div style={{
          position: "absolute", top: "10%", left: "20%",
          width: 400, height: 400, borderRadius: "50%",
          background: "rgba(212,175,55,0.04)", filter: "blur(80px)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "10%", right: "15%",
          width: 300, height: 300, borderRadius: "50%",
          background: "rgba(212,175,55,0.03)", filter: "blur(60px)",
          pointerEvents: "none",
        }} />

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          style={{
            width: "100%", maxWidth: 460,
            background: 'rgba(22, 27, 34, 0.55)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: 16,
            border: `1px solid ${C.border}`,
            boxShadow: `0 0 0 1px rgba(212,175,55,0.06), 0 32px 80px rgba(0,0,0,0.7)`,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* ── Header ── */}
          <div style={{
  padding: "26px 28px 20px",
  background: 'rgba(28, 33, 40, 0.6)',
  borderBottom: `1px solid ${C.border}`,
  position: "relative", overflow: "hidden",
}}>
  {/* Glow orb */}
  <div style={{
    position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)",
    width: 240, height: 120, borderRadius: "50%",
    background: "rgba(212,175,55,0.1)", filter: "blur(40px)", pointerEvents: "none",
  }} />

  {/* ── Logo + Title in one row ── */}
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, position: "relative" }}>
    <img
      src="/images/jackpotsworld_watermark.png"
      alt="Jackpots World"
      style={{
        width: 48,
        height: 48,
        objectFit: "contain",
        borderRadius: "50%",
        border: "1px solid rgba(212,175,55,0.3)",
        background: "rgba(0,0,0,0.4)",
        padding: 3,
        flexShrink: 0,
      }}
      onError={e => { e.currentTarget.style.display = 'none' }}
    />
    <div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff",
        lineHeight: 1.1 }}>
        <div className="flex flex-col leading-none">
    <span className="font-bold text-xl md:text-2xl gold-text font-black tracking-wider">Jackpots</span>
    <span className="font-body text-xs tracking-[0.4em] text-gold/70 uppercase">World</span>
  </div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em", marginTop: 2 }}>
        VIP Access
      </div>
    </div>
  </div>

  {/* Badge */}
  <div id="register" style={{
    display: "inline-flex", alignItems: "center", gap: 6,
    background: "rgba(212,175,55,0.1)", border: `1px solid rgba(212,175,55,0.3)`,
    borderRadius: 20, padding: "3px 12px", marginBottom: 10,
    position: "relative",
  }}>
    <Star size={9} color={C.gold} fill={C.gold} />
    <span style={{ fontSize: 10, fontWeight: 700, color: C.gold,
      letterSpacing: "0.12em", textTransform: "uppercase" }}>
      Exclusive VIP Registration
    </span>
  </div>

  <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, position: "relative" }}>
    Registred Successfully
  </div>
</div>

          {/* ── Body ── */}
          <div style={{ padding: "24px 28px 28px", overflowY: "auto", maxHeight: "80vh" }}>
            <AnimatePresence mode="wait">
              {submitted ? (
                <SuccessScreen key="success" onReset={reset} />
              ) : (
                <motion.div key="form"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                  <Divider>Personal Information</Divider>

                  {/* Full name */}
                  <div style={W}>
                    <Label>
                      <User size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                      Full name
                    </Label>
                    <FocusInput
                      value={name}
                      onChange={(e) => { setName(e.target.value); clearErr("name"); }}
                      placeholder="Jane Smith"
                      hasError={!!errors.name}
                      hasOk={name.trim().length >= 2 && !errors.name}
                    />
                    {errors.name && <Hint color={C.red} icon={AlertCircle}>{errors.name}</Hint>}
                  </div>

                  {/* Country */}
                  <div style={W}>
                    <Label>
                      <Globe size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                      Country
                    </Label>
                    <CountrySelector
                      value={country?.code || ""}
                      onChange={(c) => { setCountry(c); setPhone(""); clearErr("country"); }}
                      countries={countries}
                      loading={countriesLoading}
                    />
                    {errors.country && <Hint color={C.red} icon={AlertCircle}>{errors.country}</Hint>}
                  </div>

                  {/* WhatsApp / Phone */}
                  <div style={W}>
                    <Label>
                      <Phone size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                      WhatsApp number
                    </Label>
                    <PhoneInput
                      value={phoneDigits}
                      country={country}
                      onChange={(v) => { setPhone(v); clearErr("phone"); }}
                      hasError={!!errors.phone}
                      hasOk={phoneStarted && phoneOk}
                    />
                    {errors.phone
                      ? <Hint color={C.red} icon={AlertCircle}>{errors.phone}</Hint>
                      : phoneStarted && !phoneOk
                        ? <Hint color={C.yellow} icon={AlertCircle}>Enter a valid number (4–15 digits)</Hint>
                        : phoneStarted && phoneOk
                          ? <Hint color={C.green} icon={CheckCircle2}>Looks good</Hint>
                          : null}
                  </div>

                  <Divider>Travel Preferences</Divider>

                  {/* Destination */}
                  <div style={W}>
                    <Label>
                      <MapPin size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                      Preferred destination
                    </Label>
                    <StyledSelect
                      value={destination}
                      onChange={(e) => { setDestination(e.target.value); clearErr("destination"); }}
                      options={DESTINATIONS}
                      placeholder="Select destination…"
                      hasError={!!errors.destination}
                      icon={MapPin}
                    />
                    {errors.destination && <Hint color={C.red} icon={AlertCircle}>{errors.destination}</Hint>}
                  </div>

                  {/* Package */}
                  <div style={W}>
                    <Label>
                      <Package size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                      Package
                    </Label>
                    <StyledSelect
                      value={pkg}
                      onChange={(e) => { setPkg(e.target.value); clearErr("package"); }}
                      options={PACKAGES}
                      placeholder="Select a package…"
                      hasError={!!errors.package}
                      icon={Package}
                    />
                    {errors.package && <Hint color={C.red} icon={AlertCircle}>{errors.package}</Hint>}
                  </div>

                  <Divider>Notifications</Divider>

                  <ToggleCard
                    id="vip-deals"
                    checked={vipDeals}
                    onChange={() => setVipDeals((v) => !v)}
                    icon={Star}
                    title="Exclusive VIP deals & priority access"
                    desc="Get early access to premium offers, exclusive packages, and priority booking."
                  />
                  <ToggleCard
                    id="pro-tips"
                    checked={proTips}
                    onChange={() => setProTips((v) => !v)}
                    icon={Bell}
                    title="Pro tips & winning strategies"
                    desc="Insider guides, game strategies, odds insights, and expert advice."
                  />

                  {apiError && <ErrBox msg={apiError} />}

                  <GoldBtn onClick={handleSubmit} loading={loading}
                    disabled={!name.trim() || !country || !destination || !pkg}>
                    Unlock VIP Access
                  </GoldBtn>

                  {/* Trust badge */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 6, marginTop: 14, fontSize: 11, color: C.dim,
                  }}>
                    <Lock size={10} />
                    Your details are 100% secure &amp; confidential
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </>
  );
}