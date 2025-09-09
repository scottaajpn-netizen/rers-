"use client";
import { useEffect, useMemo, useState } from "react";

const ADMIN_TOKEN = "87800";

const styles = {
  wrap: { maxWidth: 1100, margin: "24px auto", padding: 16 },
  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
    marginBottom: 16,
  },
  h2: { fontSize: 20, margin: "0 0 12px" },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ddd",
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ddd",
    outline: "none",
    background: "#fff",
  },
  btn: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  },
  btnGhost: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    overflow: "hidden",
    borderRadius: 10,
    border: "1px solid #eee",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    background: "#fafafa",
    borderBottom: "1px solid #eee",
    fontWeight: 600,
  },
  td: { padding: "10px 12px", borderBottom: "1px solid #f2f2f2", verticalAlign: "top" },
  chip: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid transparent",
  },
};

function tone(type) {
  if (type === "offre") return { bg: "#eaffea", bd: "#94d19a" }; // vert
  if (type === "demande") return { bg: "#eaf2ff", bd: "#a7bff5" }; // bleu
  return { bg: "#f6f6f6", bd: "#e0e0e0" };
}

// ——— util: normalisation + similarité Jaccard simple
const STOP = new Set(["de","la","le","les","des","du","et","en","à","au","aux","d","l","un","une","pour","avec","sur","dans","par","ou"]);
function tokenize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w && !STOP.has(w));
}
function jaccard(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return inter / union;
}

export default function Page() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  // form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("offre");
  const [skills, setSkills] = useState("");

  async function loadEntries() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/entries", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (e) {
      setError("Erreur chargement : " + (e?.message || "inconnue"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEntries(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = { firstName, lastName, phone, type, skills };
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": ADMIN_TOKEN
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

      // Optimiste : on met à jour localement sans attendre un rechargement lourd
      setEntries(prev => [data.entry, ...prev]);

      // reset form
      setFirstName(""); setLastName(""); setPhone(""); setType("offre"); setSkills("");
    } catch (e) {
      setError("Erreur ajout : " + (e?.message || "inconnue"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!id) return;
    if (!confirm("Supprimer cette entrée ?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/entries?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": ADMIN_TOKEN }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      // Optimiste
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      setError("Erreur suppression : " + (e?.message || "inconnue"));
    } finally {
      setBusy(false);
    }
  }

  function fmtPhone(p) {
    const s = String(p || "").replace(/\D/g, "");
    return s.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      (e.firstName + " " + e.lastName).toLowerCase().includes(q) ||
      e.skills.toLowerCase().includes(q) ||
      e.phone.replace(/\D/g, "").includes(q.replace(/\D/g, ""))
    );
  }, [entries, query]);

  // Correspondances offre↔demande (seuil ajustable)
  const matches = useMemo(() => {
    const offres = filtered.filter(e => e.type === "offre");
    const demandes = filtered.filter(e => e.type === "demande");
    const pairs = [];
    const THRESH = 0.35; // ajuste si besoin
    for (const d of demandes) {
      const scored = offres
        .map(o => ({ o, score: jaccard(d.skills, o.skills) }))
        .filter(x => x.score >= THRESH)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (scored.length) {
        pairs.push({ demande: d, offres: scored });
      }
    }
    return pairs;
  }, [filtered]);

  return (
    <div style={styles.wrap}>
      <div style={{ ...styles.card, borderColor: "#dcdcdc" }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>RERS – Réseau d’échanges réciproques de savoir</h1>
        <p style={{ margin: "6px 0 0", color: "#666" }}>
          Ajoutez des <b>offres</b> et des <b>demandes</b>, supprimez, recherchez, et voyez les correspondances.
        </p>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleAdd} style={styles.card}>
        <h2 style={styles.h2}>Ajouter une entrée</h2>
        <div style={styles.row}>
          <div>
            <label>Prénom</label>
            <input style={styles.input} value={firstName} onChange={e => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label>Nom</label>
            <input style={styles.input} value={lastName} onChange={e => setLastName(e.target.value)} required />
          </div>
        </div>
        <div style={{ ...styles.row, marginTop: 12 }}>
          <div>
            <label>Téléphone</label>
            <input style={styles.input} value={phone} onChange={e => setPhone(e.target.value)} required />
          </div>
          <div>
            <label>Type</label>
            <select style={styles.select} value={type} onChange={e => setType(e.target.value)}>
              <option value="offre">Offre</option>
              <option value="demande">Demande</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Compétences (mots clés)</label>
          <input
            style={styles.input}
            placeholder="ex: cuisine italienne, aide aux devoirs, Excel, jardinage..."
            value={skills}
            onChange={e => setSkills(e.target.value)}
            required
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={busy} style={styles.btn}>{busy ? "En cours..." : "Ajouter"}</button>
          <button type="button" onClick={loadEntries} disabled={loading} style={styles.btnGhost}>
            {loading ? "Rechargement..." : "Recharger"}
          </button>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher..."
            style={{ ...styles.input, maxWidth: 260 }}
          />
        </div>
        {error ? <div style={{ marginTop: 8, color: "#b00020" }}>{error}</div> : null}
      </form>

      {/* Correspondances */}
      <div style={styles.card}>
        <h2 style={styles.h2}>Correspondances (offre ↔ demande)</h2>
        {!matches.length ? (
          <div style={{ color: "#666" }}>Aucune correspondance trouvée pour l’instant.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {matches.map((m, idx) => {
              const tD = tone("demande");
              return (
                <div key={idx} style={{ border: "1px solid #f1e3a0", background: "#fff9d6", borderRadius: 10, padding: 12 }}>
                  <div style={{ marginBottom: 8, fontWeight: 600 }}>Demande</div>
                  <div style={{ background: tD.bg, border: `1px solid ${tD.bd}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <div><b>{m.demande.firstName} {m.demande.lastName}</b> • {fmtPhone(m.demande.phone)}</div>
                    <div style={{ color: "#444" }}>{m.demande.skills}</div>
                  </div>
                  <div style={{ marginBottom: 6, fontWeight: 600 }}>Offres compatibles</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {m.offres.map(({ o, score }) => {
                      const tO = tone("offre");
                      return (
                        <div key={o.id} style={{ background: tO.bg, border: `1px solid ${tO.bd}`, borderRadius: 8, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div><b>{o.firstName} {o.lastName}</b> • {fmtPhone(o.phone)}</div>
                            <span style={{ ...styles.chip, background: "#fff", borderColor: "#eccb4e" }}>
                              Similarité {(score * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div style={{ color: "#444", marginTop: 4 }}>{o.skills}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          L’algorithme compare les mots clés (Jaccard). Ajuste ta recherche ou le seuil dans le code si besoin.
        </div>
      </div>

      {/* Tableau des entrées */}
      <div style={styles.card}>
        <h2 style={styles.h2}>Toutes les entrées ({filtered.length})</h2>
        {loading ? (
          <div>Chargement…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Nom</th>
                  <th style={styles.th}>Téléphone</th>
                  <th style={styles.th}>Compétences</th>
                  <th style={styles.th}>Créé</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const t = tone(e.type);
                  return (
                    <tr key={e.id} style={{ background: e.type === "offre" ? t.bg : e.type === "demande" ? t.bg : "transparent" }}>
                      <td style={styles.td}>
                        <span style={{ ...styles.chip, background: "#fff", borderColor: t.bd }}>{e.type}</span>
                      </td>
                      <td style={styles.td}><b>{e.firstName} {e.lastName}</b></td>
                      <td style={styles.td}>{fmtPhone(e.phone)}</td>
                      <td style={styles.td}>{e.skills}</td>
                      <td style={styles.td}>{new Date(e.createdAt).toLocaleString("fr-FR")}</td>
                      <td style={styles.td}>
                        <button
                          onClick={() => handleDelete(e.id)}
                          style={{ ...styles.btnGhost, borderColor: "#e33", color: "#e33" }}
                          title="Supprimer"
                          disabled={busy}
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr><td style={styles.td} colSpan={6}>&nbsp;Aucune donnée.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          <span style={{ ...styles.chip, background: tone("offre").bg, borderColor: tone("offre").bd }}>Offre</span>{" "}
          <span style={{ ...styles.chip, background: tone("demande").bg, borderColor: tone("demande").bd }}>Demande</span>{" "}
          <span style={{ ...styles.chip, background: "#fff9d6", borderColor: "#f1e3a0" }}>Correspondance</span>
        </div>
      </div>
    </div>
  );
}
