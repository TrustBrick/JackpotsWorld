import React, { useState, useEffect } from "react";
import { Heart, MapPin, Globe, X } from "lucide-react";
import { C } from "../../constants";
import { authFetch, API } from "../../helpers";
import { Card, Spinner } from "../../components/SharedUI";

export default function FavouritesTab({ onToast }) {
  const [favs, setFavs]       = useState({ countries: [], casinos: [] });
  const [loading, setLoading] = useState(true);
  const [favTab, setFavTab]   = useState("casinos");
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    authFetch(`${API}/api/user/favourites/`)
      .then(r => r.json())
      .then(d => { setFavs({ countries: d.countries || [], casinos: d.casinos || [] }); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const removeFav = async (type, id) => {
    setRemoving(id);
    const r = await authFetch(`${API}/api/user/favourites/${id}/`, { method: "DELETE" });
    if (r.ok) {
      setFavs(prev => ({ ...prev, [type]: prev[type].filter(f => f.id !== id) }));
      onToast("Removed from favourites");
    } else {
      onToast("Failed to remove", false);
    }
    setRemoving(null);
  };

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["casinos", "🏛️ Casinos"], ["countries", "🌍 Countries"]].map(([t, l]) => (
          <button key={t} onClick={() => setFavTab(t)} style={{
            padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${favTab === t ? `${C.pink}40` : C.border}`,
            background: favTab === t ? `${C.pink}12` : "transparent",
            color: favTab === t ? C.pink : "rgba(255,255,255,0.4)",
          }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : favTab === "casinos" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {favs.casinos.map(c => (
            <Card key={c.id} style={{ position: "relative" }}>
              <RemoveBtn id={c.id} removing={removing} onRemove={() => removeFav("casinos", c.id)} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: `${C.gold}15`, border: `1px solid ${C.gold}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                  🏛️
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: "white", fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={9} />{c.country}
                  </div>
                </div>
              </div>
              {c.rating && (
                <div style={{ fontSize: 11, color: C.gold }}>{"★".repeat(Math.floor(c.rating))} {c.rating}</div>
              )}
            </Card>
          ))}
          {favs.casinos.length === 0 && (
            <EmptyState icon={<Heart size={32} />} text="No favourite casinos yet" />
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {favs.countries.map(c => (
            <Card key={c.id} style={{ position: "relative" }}>
              <RemoveBtn id={c.id} removing={removing} onRemove={() => removeFav("countries", c.id)} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>{c.flag || "🌍"}</div>
              <div style={{ fontWeight: 700, color: "white", fontSize: 15, marginBottom: 4 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{c.casino_count || 0} casinos</div>
            </Card>
          ))}
          {favs.countries.length === 0 && (
            <EmptyState icon={<Globe size={32} />} text="No favourite countries yet" />
          )}
        </div>
      )}
    </div>
  );
}

function RemoveBtn({ id, removing, onRemove }) {
  return (
    <button
      onClick={onRemove}
      disabled={removing === id}
      style={{
        position: "absolute", top: 12, right: 12,
        width: 26, height: 26, borderRadius: 6,
        background: "rgba(248,113,113,0.1)",
        border: "1px solid rgba(248,113,113,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "#F87171",
      }}
    >
      <X size={11} />
    </button>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 48, color: "rgba(255,255,255,0.2)" }}>
      <div style={{ opacity: 0.2, margin: "0 auto 12px", width: "fit-content" }}>{icon}</div>
      {text}
    </div>
  );
}