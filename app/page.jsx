"use client";

import { useEffect, useMemo, useState } from "react";

const ADMIN_TOKEN = "87800"; // mot de passe admin intégré comme demandé

// petits styles inline (pas de dépendances)
const styles = {
  container: { maxWidth: 1100, margin: "0 auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  bar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
  input: { padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8, minWidth: 160 },
  btn: { padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer" },
  btnPrimary: { padding: "8px 12px", borderRadius: 8, border: "1px solid #3b82f6", background: "#3b82f6", color: "#fff", cursor: "pointer" },
  pill: { padding: "2px 8px", borderRadius: 999, fontSize: 12, border: "1px solid #ddd", background: "#f7f7f7" },
  card: { border: "1px solid #eee", borderRadius: 12, padding: 12, marginBottom: 10 },
  table: { width: "100%", borderCollapse: "collapse" },
  thtd: { borderBottom: "1px solid #eee", padding: "8px 6px", textAlign: "left", verticalAlign: "top" },
  bubbleWrap: { display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" },
  bubble: (size, bg, border) => ({
    width: size,
    height: size,
    borderRadius: "50%",
    background: bg,
    border: `2px solid ${border}`,
    color: "#111",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 8,
    boxSizing: "border-box",
    cursor: "pointer",
    userSelect: "none",
  }),
  bubbleLabel: { fontSize: 12, lineHeight: 1.2 },
  small: { color: "#666", fontSize: 12 },
};

// Normalisation pour gérer les anciennes fiches {type, skills} => {items:[...]}
function normalizeEntry(e) {
  const items = Array.isArray(e.items)
    ? e.items
    : (() => {
        const list = [];
        if (e.type && e.skills) {
          String(e.skills)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((skill) => list.push({ type: String(e.type).toLowerCase(), skill }));
        }
        return list;
      })();

  return {
    id: e.id,
    firstName: String(e.firstName || "").trim(),
    lastName: String(e.lastName || "").trim(),
    phone: String(e.phone || "").trim(),
    createdAt: e.createdAt || null,
    items: items.map((it) => ({
      type: String(it.type || "").toLowerCase() === "offre" ? "offre" : "demande",
      skill: String(it.skill || "").trim(),
    })),
  };
}

// Regroupe par compétence
function buildSkillMap(entries) {
  const map = new Map();
  entries.forEach((e) => {
    e.items.forEach((it) => {
      if (!it.skill) return;
      const key = it.skill.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { skill: it.skill, offers: [], demands: [] });
      }
      const slot = map.get(key);
      if (it.type === "offre") slot.offers.push(e);
      else slot.demands.push(e);
    });
  });
  return map;
}

export default function Page() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list"); // "list" | "bubbles"
  const [detailSkill, setDetailSkill] = useState(null); // { skill, offers, demands } ou null

  // Formulaire
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState([{ type: "offre", skill: "" }]); // lignes dynamiques

  // ---------- Chargement ----------
  async function fetchEntries() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/entries?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.entries) ? data.entries.map(normalizeEntry) : [];
      // tri par nom puis date (desc)
      list.sort((a, b) => {
        const ln = a.lastName.localeCompare(b.lastName, "fr", { sensitivity: "base" });
        if (ln !== 0) return ln;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
      setEntries(list);
    } catch (e) {
      setError("Erreur chargement");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    fetchEntries();
  }, []);

  // ---------- Recherche ----------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const base =
        `${e.firstName} ${e.lastName} ${e.phone}`.toLowerCase().includes(q);
      const inSkills = e.items.some((it) =>
        `${it.type} ${it.skill}`.toLowerCase().includes(q)
      );
      return base || inSkills;
    });
  }, [entries, search]);

  // ---------- Vue bulles ----------
  const skillMap = useMemo(() => buildSkillMap(filtered), [filtered]);
  const bubbles = useMemo(() => {
    // Transforme la map en tableau avec taille
    const arr = Array.from(skillMap.values()).map((x) => {
      const total = x.offers.length + x.demands.length;
      // taille = base 80 + 10 * sqrt(total), bornée
      const size = Math.max(70, Math.min(180, 70 + Math.sqrt(total) * 18));
      // couleur : offre seule => #d1fae5, demande seule => #fde68a, mix => #e9d5ff
      let bg = "#fde68a";
      let border = "#f59e0b";
      if (x.offers.length && x.demands.length) {
        bg = "#e9d5ff";
        border = "#8b5cf6";
      } else if (x.offers.length) {
        bg = "#d1fae5";
        border = "#10b981";
      }
      return { ...x, size, bg, border, total };
    });
    // trier par total desc pour des bulles plus importantes en premier
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [skillMap]);

  // ---------- Ajout ----------
  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItemRow() {
    setItems((prev) => [...prev, { type: "demande", skill: "" }]);
  }
  function removeItemRow(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const cleanItems = items
        .map((it) => ({ type: it.type === "offre" ? "offre" : "demande", skill: String(it.skill || "").trim() }))
        .filter((it) => it.skill);
      if (!firstName.trim() || !lastName.trim() || cleanItems.length === 0) {
        setError("Prénom, Nom et au moins 1 compétence sont requis.");
        setBusy(false);
        return;
      }
      const body = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        items: cleanItems,
      };
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": ADMIN_TOKEN,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      // reset form
      setFirstName("");
      setLastName("");
      setPhone("");
      setItems([{ type: "offre", skill: "" }]);
      await fetchEntries();
    } catch (e) {
      console.error(e);
      setError("Erreur ajout");
    } finally {
      setBusy(false);
    }
  }

  // ---------- Suppression ----------
  async function handleDelete(id) {
    if (!id) return;
    if (!confirm("Supprimer cette fiche ?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/entries?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": ADMIN_TOKEN },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      await fetchEntries();
    } catch (e) {
      console.error(e);
      setError("Erreur suppression");
    } finally {
      setBusy(false);
    }
  }

  // ---------- Export backup ----------
  async function handleExport() {
    try {
      const res = await fetch(`/api/entries?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.download = `rers-backup-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Export impossible");
    }
  }

  return (
    <div style={styles.container}>
      <h1 style={{ margin: "6px 0 10px", fontSize: 26 }}>RERS — Annuaire & Réseau</h1>

      {/* barre du haut */}
      <div style={styles.bar}>
        <input
          style={{ ...styles.input, flex: 1 }}
          placeholder="Rechercher (nom, téléphone, compétence, offre/demande)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button style={styles.btn} onClick={() => fetchEntries()} disabled={loading}>
          {loading ? "Chargement…" : "Recharger"}
        </button>
        <button style={styles.btn} onClick={() => setView(view === "list" ? "bubbles" : "list")}>
          {view === "list" ? "Vue bulles" : "Vue liste"}
        </button>
        <button style={styles.btn} onClick={handleExport}>Exporter JSON</button>
        <span style={styles.pill}>{filtered.length} fiches</span>
      </div>

      {error ? (
        <div style={{ ...styles.card, borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>
          {error}
        </div>
      ) : null}

      {/* formulaire d’ajout */}
      <div style={styles.card}>
        <h2 style={{ margin: "4px 0 10px" }}>Ajouter une fiche</h2>
        <form onSubmit={handleAdd}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input style={styles.input} placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <input style={styles.input} placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            <input style={{ ...styles.input, minWidth: 220 }} placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>Offres / Demandes</div>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <select
                  value={it.type}
                  onChange={(e) => updateItem(idx, { type: e.target.value })}
                  style={{ ...styles.input, paddingRight: 28 }}
                >
                  <option value="offre">Offre</option>
                  <option value="demande">Demande</option>
                </select>
                <input
                  style={{ ...styles.input, flex: 1, minWidth: 260 }}
                  placeholder="Compétence (ex: Couture, Tarot, Informatique...)"
                  value={it.skill}
                  onChange={(e) => updateItem(idx, { skill: e.target.value })}
                />
                {items.length > 1 && (
                  <button type="button" style={styles.btn} onClick={() => removeItemRow(idx)}>
                    −
                  </button>
                )}
                {idx === items.length - 1 && (
                  <button type="button" style={styles.btn} onClick={addItemRow}>
                    + Ajouter
                  </button>
                )}
              </div>
            ))}
            <div style={styles.small}>Astuce : tu peux ajouter plusieurs lignes offre/demande pour la même personne.</div>
          </div>

          <button type="submit" style={styles.btnPrimary} disabled={busy}>
            {busy ? "En cours…" : "Enregistrer"}
          </button>
        </form>
      </div>

      {/* contenu principal */}
      {view === "list" ? (
        <div style={styles.card}>
          <h2 style={{ margin: "4px 0 10px" }}>Liste des fiches</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thtd}>Nom</th>
                  <th style={styles.thtd}>Téléphone</th>
                  <th style={styles.thtd}>Offres</th>
                  <th style={styles.thtd}>Demandes</th>
                  <th style={styles.thtd}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const offers = e.items.filter((it) => it.type === "offre").map((it) => it.skill);
                  const demands = e.items.filter((it) => it.type === "demande").map((it) => it.skill);
                  return (
                    <tr key={e.id}>
                      <td style={styles.thtd}>
                        <div style={{ fontWeight: 600 }}>
                          {e.lastName} {e.firstName}
                        </div>
                        <div style={styles.small}>{e.id}</div>
                      </td>
                      <td style={styles.thtd}>{e.phone || <span style={{ color: "#999" }}>—</span>}</td>
                      <td style={styles.thtd}>
                        {offers.length ? offers.join(", ") : <span style={{ color: "#999" }}>—</span>}
                      </td>
                      <td style={styles.thtd}>
                        {demands.length ? demands.join(", ") : <span style={{ color: "#999" }}>—</span>}
                      </td>
                      <td style={styles.thtd}>
                        <button style={styles.btn} onClick={() => handleDelete(e.id)} disabled={busy}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr>
                    <td style={styles.thtd} colSpan={5}>
                      <em>Aucun résultat.</em>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <h2 style={{ margin: "4px 0 10px" }}>Vue “bulles” par compétence</h2>
          <div style={styles.bubbleWrap}>
            {bubbles.map((b) => (
              <div
                key={b.skill}
                style={styles.bubble(b.size, b.bg, b.border)}
                title={`${b.skill} • ${b.offers.length} offre(s), ${b.demands.length} demande(s)`}
                onClick={() => setDetailSkill(b)}
              >
                <div style={styles.bubbleLabel}>
                  <div style={{ fontWeight: 700 }}>{b.skill}</div>
                  <div style={styles.small}>
                    {b.offers.length} off. · {b.demands.length} dem.
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* panneau de détail au clic */}
          {detailSkill && (
            <div style={{ ...styles.card, marginTop: 12, background: "#fafafa" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <h3 style={{ margin: 0 }}>Détail : {detailSkill.skill}</h3>
                <button style={styles.btn} onClick={() => setDetailSkill(null)}>Fermer</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Offres ({detailSkill.offers.length})</div>
                  {detailSkill.offers.length ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {detailSkill.offers.map((e) => (
                        <li key={`o-${detailSkill.skill}-${e.id}`}>
                          {e.lastName} {e.firstName} — <span style={styles.small}>{e.phone || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={styles.small}>Aucune offre</div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Demandes ({detailSkill.demands.length})</div>
                  {detailSkill.demands.length ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {detailSkill.demands.map((e) => (
                        <li key={`d-${detailSkill.skill}-${e.id}`}>
                          {e.lastName} {e.firstName} — <span style={styles.small}>{e.phone || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={styles.small}>Aucune demande</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ ...styles.small, marginTop: 10 }}>
        Conseil : fais régulièrement un <strong>Exporter JSON</strong> pour un petit backup local.
      </div>
    </div>
  );
}
