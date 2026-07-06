import React from "react";

const DOC_TYPES = ["Aadhaar Card", "Passport", "Driver License", "Voter ID", "PAN Card"];

export default function KYCPage({ api, authFetch }) {
  const [status,    setStatus]    = React.useState(null);   // existing KYC status
  const [loading,   setLoading]   = React.useState(true);
  const [submitting,setSubmitting]= React.useState(false);
  const [success,   setSuccess]   = React.useState(false);
  const [error,     setError]     = React.useState("");

  // Form fields
  const [fullName,    setFullName]    = React.useState("");
  const [dob,         setDob]         = React.useState("");
  const [docType,     setDocType]     = React.useState(DOC_TYPES[0]);
  const [docNumber,   setDocNumber]   = React.useState("");
  const [docFront,    setDocFront]    = React.useState(null);
  const [docBack,     setDocBack]     = React.useState(null);
  const [selfie,      setSelfie]      = React.useState(null);

  // Preview URLs
  const frontPreview  = docFront  ? URL.createObjectURL(docFront)  : null;
  const backPreview   = docBack   ? URL.createObjectURL(docBack)   : null;
  const selfiePreview = selfie    ? URL.createObjectURL(selfie)    : null;

  React.useEffect(() => {
    authFetch(`${api}/kyc/status/`)
      .then(r => r.json())
      .then(j => setStatus(j))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (!fullName.trim())   return setError("Full name is required.");
    if (!docNumber.trim())  return setError("Document number is required.");
    if (!docFront)          return setError("Front document image is required.");
    if (!selfie)            return setError("Selfie is required.");

    setSubmitting(true);
    const fd = new FormData();
    fd.append("full_name",       fullName);
    fd.append("date_of_birth",   dob);
    fd.append("document_type",   docType);
    fd.append("document_number", docNumber);
    fd.append("doc_front",       docFront);
    if (docBack) fd.append("doc_back", docBack);
    fd.append("selfie",          selfie);

    try {
      const r = await authFetch(`${api}/kyc/submit/`, { method: "POST", body: fd });
      const j = await r.json();
      if (r.ok) {
        setSuccess(true);
        setStatus({ kyc_status: "pending", submitted_at: new Date().toISOString() });
      } else {
        setError(j.error || "Submission failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  };

  if (loading) return <div style={styles.center}>Loading...</div>;

  // ── Already approved ──────────────────────────────────────────────────────
  if (status?.kyc_status === "approved") {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.badge, background: "#e8f5e9", color: "#22c55e" }}>
          ✅ Your KYC is Approved & Verified
        </div>
        <p style={{ color: "#6b7280", textAlign: "center" }}>
          Your identity has been verified. You have full access.
        </p>
      </div>
    );
  }

  // ── Pending ───────────────────────────────────────────────────────────────
  if (status?.kyc_status === "pending" && !success) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.badge, background: "#fff8e1", color: "#f59e0b" }}>
          🕐 KYC Under Review
        </div>
        <p style={{ color: "#6b7280", textAlign: "center" }}>
          Submitted on {new Date(status.submitted_at).toLocaleString()}.<br />
          Our team will verify your documents shortly.
        </p>
      </div>
    );
  }

  // ── Form (new / rejected / resubmit) ──────────────────────────────────────
  return (
    <div style={styles.container}>
      <h2 style={{ textAlign: "center", margin: "0 0 6px" }}>Identity Verification</h2>
      <p style={{ color: "#6b7280", textAlign: "center", margin: "0 0 24px", fontSize: 13 }}>
        Upload your documents to verify your identity.
      </p>

      {status?.kyc_status === "rejected" && (
        <div style={{ background: "#fdecea", color: "#ef4444", padding: "12px 16px", borderRadius: 10, marginBottom: 18, fontSize: 13 }}>
          ❌ Your previous submission was rejected.<br />
          <strong>Reason:</strong> {status.reject_reason || "No reason provided."}
        </div>
      )}

      {success && (
        <div style={{ background: "#e8f5e9", color: "#22c55e", padding: "12px 16px", borderRadius: 10, marginBottom: 18 }}>
          ✅ KYC submitted successfully! Under review.
        </div>
      )}

      {error && (
        <div style={{ background: "#fdecea", color: "#ef4444", padding: "12px 16px", borderRadius: 10, marginBottom: 18, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Fields */}
      <div style={styles.grid}>
        <Field label="Full Name *">
          <input style={styles.input} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="As on document" />
        </Field>

        <Field label="Date of Birth">
          <input style={styles.input} type="date" value={dob} onChange={e => setDob(e.target.value)} />
        </Field>

        <Field label="Document Type *">
          <select style={styles.input} value={docType} onChange={e => setDocType(e.target.value)}>
            {DOC_TYPES.map(d => <option key={d}>{d}</option>)}
          </select>
        </Field>

        <Field label="Document Number *">
          <input style={styles.input} value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="e.g. XXXX XXXX XXXX" />
        </Field>
      </div>

      {/* File uploads */}
      <div style={{ marginTop: 20 }}>
        <UploadField
          label="Document Front *"
          preview={frontPreview}
          onChange={e => setDocFront(e.target.files[0])}
        />
        <UploadField
          label="Document Back (optional)"
          preview={backPreview}
          onChange={e => setDocBack(e.target.files[0])}
        />
        <UploadField
          label="Selfie with Document *"
          preview={selfiePreview}
          onChange={e => setSelfie(e.target.files[0])}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: "100%", padding: "13px 0", marginTop: 24,
          background: submitting ? "#93c5fd" : "#3b82f6",
          color: "#fff", border: "none", borderRadius: 10,
          fontSize: 15, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Submitting..." : "Submit KYC"}
      </button>

      <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 12 }}>
        Your data is encrypted and used only for verification purposes.
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function UploadField({ label, preview, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
        {label}
      </label>
      <label style={{
        display: "block", border: "2px dashed #d1d5db", borderRadius: 10,
        padding: preview ? 0 : "24px 0", textAlign: "center",
        cursor: "pointer", overflow: "hidden", background: "#f9fafb",
      }}>
        {preview
          ? <img src={preview} alt={label} style={{ width: "100%", maxHeight: 160, objectFit: "cover" }} />
          : <span style={{ color: "#9ca3af", fontSize: 13 }}>📁 Click to upload</span>
        }
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={onChange} />
      </label>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    maxWidth: 560, margin: "0 auto", padding: "32px 20px",
    fontFamily: "sans-serif",
  },
  center: {
    display: "flex", alignItems: "center", justifyContent: "center",
    height: 200, color: "#9ca3af",
  },
  badge: {
    textAlign: "center", padding: "14px 20px",
    borderRadius: 12, fontSize: 16, fontWeight: 700, marginBottom: 12,
  },
  grid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
  },
  input: {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: "1px solid #d1d5db", fontSize: 13,
    outline: "none", boxSizing: "border-box", background: "#fff",
  },
};