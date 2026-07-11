import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck, ShieldAlert, ShieldQuestion, Clock, Upload,
  FileText, Camera, AlertCircle,
} from "lucide-react";
import { API, affiliateFetch, fmtD } from "../helpers";

const C = {
  bg: "#06080E", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)",
  gold: "#D4AF37", green: "#34D399", red: "#F87171", blue: "#60A5FA",
};

const DOCUMENT_TYPES = [
  "Government ID",
  "Passport",
  "Driving License",
  "PAN Card (India)",
  "National ID",
  "Address Proof",
];

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 10, color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
};

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
  color: "white", fontSize: 13, outline: "none", boxSizing: "border-box",
};

function StatusBanner({ kind, title, message, icon: Icon }) {
  const colors = { pending: C.gold, approved: C.green, rejected: C.red, info: C.blue }[kind] || C.gold;
  return (
    <Card style={{ textAlign: "center", padding: 32 }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%", margin: "0 auto 14px",
        background: `${colors}18`, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={26} style={{ color: colors }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "white", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>{message}</div>
    </Card>
  );
}

function FileDrop({ label, required, file, onChange, icon: Icon }) {
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return (
    <div>
      <label style={labelStyle}>{label}{required && <span style={{ color: C.red }}> *</span>}</label>
      <label style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        borderRadius: 8, background: "rgba(255,255,255,0.05)",
        border: `1.5px dashed ${file ? C.gold : C.border}`, cursor: "pointer",
      }}>
        <input type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => onChange(e.target.files?.[0] || null)} />
        {previewUrl
          ? <img src={previewUrl} alt={label} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
          : <div style={{ width: 36, height: 36, borderRadius: 6, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={16} style={{ color: "rgba(255,255,255,0.35)" }} />
            </div>}
        <div style={{ fontSize: 12, color: file ? "white" : "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {file ? file.name : "Click to choose an image…"}
        </div>
      </label>
    </div>
  );
}

export default function KycTab({ onToast }) {
  const [status, setStatus] = useState(null); // raw /api/kyc/status/ response
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [documentNumber, setDocumentNumber] = useState("");
  const [docFront, setDocFront] = useState(null);
  const [docBack, setDocBack] = useState(null);
  const [selfie, setSelfie] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await affiliateFetch(`${API}/api/kyc/status/`);
    if (res?.ok) setStatus(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setError("");
    if (!documentType || !documentNumber.trim()) { setError("Document type and number are required."); return; }
    if (!docFront || !selfie) { setError("Front document image and selfie are required."); return; }

    const fd = new FormData();
    if (fullName.trim()) fd.append("full_name", fullName.trim());
    if (dob) fd.append("date_of_birth", dob);
    fd.append("document_type", documentType);
    fd.append("document_number", documentNumber.trim());
    fd.append("doc_front", docFront);
    if (docBack) fd.append("doc_back", docBack);
    fd.append("selfie", selfie);

    setSubmitting(true);
    const res = await affiliateFetch(`${API}/api/kyc/submit/`, { method: "POST", body: fd });
    setSubmitting(false);
    if (res?.ok) {
      onToast?.("KYC submitted — under review.", true);
      setDocFront(null); setDocBack(null); setSelfie(null);
      load();
    } else {
      const j = await res?.json().catch(() => ({}));
      setError(j?.error || "Failed to submit KYC.");
      onToast?.("Failed to submit KYC", false);
    }
  };

  if (loading || !status) return null;

  const kycStatus = status.kyc_status;
  const neverSubmitted = !status.submitted_at && kycStatus !== "approved";

  if (kycStatus === "approved") {
    return (
      <StatusBanner
        kind="approved" icon={ShieldCheck}
        title="KYC Verified"
        message={`Your affiliate KYC was approved${status.reviewed_at ? ` on ${fmtD(status.reviewed_at)}` : ""}. You're all set.`}
      />
    );
  }

  if (!neverSubmitted && kycStatus === "pending") {
    return (
      <StatusBanner
        kind="pending" icon={Clock}
        title="Under Review"
        message={`Your documents were submitted${status.submitted_at ? ` on ${fmtD(status.submitted_at)}` : ""} and are pending review by our team. We'll notify you once a decision is made.`}
      />
    );
  }

  // Not submitted yet, or previously rejected — show the upload form.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {kycStatus === "rejected" && (
        <Card style={{ borderColor: `${C.red}40`, background: `${C.red}0A` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <ShieldAlert size={18} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.red, marginBottom: 4 }}>KYC Rejected</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                {status.reject_reason || "No reason was provided."} Please correct the issue and resubmit below.
              </div>
            </div>
          </div>
        </Card>
      )}

      {neverSubmitted && kycStatus !== "rejected" && (
        <Card style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldQuestion size={18} style={{ color: C.gold, flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            KYC not submitted yet. Verifying your identity unlocks full affiliate payouts.
          </div>
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 14 }}>Submit KYC Documents</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} placeholder="As shown on document" />
          </div>
          <div>
            <label style={labelStyle}>Date of Birth</label>
            <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Document Type</label>
            <select value={documentType} onChange={e => setDocumentType(e.target.value)} style={inputStyle}>
              {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Document Number</label>
            <input value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} style={inputStyle} placeholder="Document number" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 16 }}>
          <FileDrop label="Document — Front" required file={docFront} onChange={setDocFront} icon={FileText} />
          <FileDrop label="Document — Back" file={docBack} onChange={setDocBack} icon={FileText} />
          <FileDrop label="Selfie with ID" required file={selfie} onChange={setSelfie} icon={Camera} />
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: 12, marginBottom: 14 }}>
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9,
            fontSize: 12.5, fontWeight: 700, background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`,
            color: "#07080F", border: "none", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? <>Submitting…</> : <><Upload size={13} /> Submit for Review</>}
        </button>
      </Card>
    </div>
  );
}
