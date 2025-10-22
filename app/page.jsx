"use client";

import { useEffect, useMemo, useState } from "react";

const ADMIN_TOKEN = "87800"; // mot de passe admin

function initials(first, last) {
  return `${(first?.[0] || "").toUpperCase()}${(last?.[0] || "").toUpperCase()}`;
}

export default function Page() {
  // données / UI
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("list"); // "list" | "bubbles" | "stats"
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");

  // création
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [items, setItems]         = useState([{ type: "offre", skill: "" }]);

  // édition (popup)
  const [editingEntry, setEditingEntry] = useState(null); // { id, firstName, lastName, phone, items:[] }

  function pop(msg) { setToast(msg); setTimeout(() => setToast(""), 1600); }

  async function fetchEntries() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/entries", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (e) {
      console.error(e);
      setError("Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { fetchEntries(); }, []);

  // ---- export JSON ----
  async function handleExport() {
    try {
      const res = await fetch(`/api/entries?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rers-backup-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      pop("Export JSON prêt 📦");
    } catch (e) {
      console.error(e);
      setError("Export impossible.");
    }
  }

  // ---- création ----
  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const cleanItems = items
        .map((it) => ({ type: it.type === "offre" ? "offre" : "demande", skill: String(it.skill || "").trim() }))
        .filter((it) => it.skill);

      if (!firstName.trim() || !lastName.trim() || !cleanItems.length) {
        setError("Prénom, Nom et au moins une compétence sont requis.");
        setBusy(false);
        return;
      }

      const body = { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), items: cleanItems };
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());

      setFirstName(""); setLastName(""); setPhone(""); setItems([{ type: "offre", skill: "" }]);
      await fetchEntries();
      pop("Fiche ajoutée ✅");
    } catch (e) {
      console.error(e);
      setError("Erreur lors de l’ajout.");
    } finally {
      setBusy(false);
    }
  }

  // ---- suppression ----
  async function handleDelete(id) {
    if (!id || !confirm("Supprimer cette fiche ?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/entries?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": ADMIN_TOKEN },
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchEntries();
      pop("Fiche supprimée 🗑️");
    } catch (e) {
      console.error(e);
      setError("Erreur suppression.");
    } finally {
      setBusy(false);
    }
  }

  // ---- édition ----
  function startEdit(e) {
    setEditingEntry({
      id: e.id,
      firstName: e.firstName || "",
      lastName:  e.lastName  || "",
      phone:     e.phone     || "",
      items: Array.isArray(e.items) && e.items.length ? e.items.map(it => ({ type: it.type, skill: it.skill })) : [{ type: "offre", skill: "" }]
    });
  }

  async function handleEdit(ev) {
    ev.preventDefault();
    if (!editingEntry) return;
    setBusy(true);
    setError("");
    try {
      const cleanItems = (editingEntry.items || [])
        .map(it => ({ type: it.type === "offre" ? "offre" : "demande", skill: String(it.skill || "").trim() }))
        .filter(it => it.skill);

      if (!editingEntry.firstName.trim() || !editingEntry.lastName.trim() || !cleanItems.length) {
        setError("Prénom, Nom et au moins une compétence sont requis.");
        setBusy(false);
        return;
      }

      const body = {
        firstName: editingEntry.firstName.trim(),
        lastName:  editingEntry.lastName.trim(),
        phone:     editingEntry.phone.trim(),
        items:     cleanItems,
      };

      // PATCH sur la même route, avec l'id en query
      const res = await fetch(`/api/entries?id=${encodeURIComponent(editingEntry.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());

      setEditingEntry(null);
      await fetchEntries();
      pop("Fiche modifiée ✅");
    } catch (e) {
      console.error(e);
      setError("Erreur modification.");
    } finally {
      setBusy(false);
    }
  }

  // ---- recherche & agrégations ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      `${e.firstName} ${e.lastName} ${e.phone}`.toLowerCase().includes(q) ||
      (Array.isArray(e.items) && e.items.some((it) => `${it.type} ${it.skill}`.toLowerCase().includes(q)))
    );
  }, [entries, search]);

  // Agrégations globales (offres/demandes séparées)
  const { cloudOffers, cloudDemands, topOffers, topDemands, maxOffer, maxDemand } = useMemo(() => {
    const offers = new Map();
    const demands = new Map();
    for (const e of entries) {
      for (const it of e.items || []) {
        const key = (it.skill || "").trim();
        if (!key) continue;
        if (it.type === "offre") offers.set(key, (offers.get(key) || 0) + 1);
        else demands.set(key, (demands.get(key) || 0) + 1);
      }
    }
    const toArray = (m) => Array.from(m.entries()).map(([skill, count]) => ({ skill, count }));
    const cloudOffers = toArray(offers).sort((a,b)=>b.count-a.count);
    const cloudDemands = toArray(demands).sort((a,b)=>b.count-a.count);
    const maxOffer = cloudOffers[0]?.count || 1;
    const maxDemand = cloudDemands[0]?.count || 1;
    const topOffers = cloudOffers.slice(0, 15);
    const topDemands = cloudDemands.slice(0, 15);
    return { cloudOffers, cloudDemands, topOffers, topDemands, maxOffer, maxDemand };
  }, [entries]);

  // Bulles (mix offres/demandes)
  const bubbles = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      for (const it of e.items || []) {
        const key = (it.skill || "").trim().toLowerCase();
        if (!key) continue;
        if (!map.has(key)) map.set(key, { skill: it.skill, offres: 0, demandes: 0 });
        const b = map.get(key);
        if (it.type === "offre") b.offres++; else b.demandes++;
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.offres + b.demandes) - (a.offres + a.demandes));
  }, [entries]);

  return (
    <div className="rers-container">
      <header className="rers-top">
        <div className="rers-brand">
          <div className="rers-glyph">✴︎</div>
          <div>
            <h1 className="rers-title">RERS</h1>
            <p className="rers-sub">Annuaire — échanges de savoirs</p>
          </div>
        </div>

        <div className="rers-controls">
          <div className="rers-seg">
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>Liste</button>
            <button className={view === "bubbles" ? "on" : ""} onClick={() => setView("bubbles")}>Bulles</button>
            <button className={view === "stats" ? "on" : ""} onClick={() => setView("stats")}>Stats</button>
          </div>
          <button className="btn ghost" onClick={fetchEntries}>{loading ? "…" : "Recharger"}</button>
          <button className="btn" onClick={handleExport}>Exporter</button>
        </div>
      </header>

      <div className="rers-search">
        <input
          className="input"
          placeholder="Rechercher (nom, téléphone, compétence, offre/demande)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="pill">{filtered.length} fiches</span>
      </div>

      {/* Ajout */}
      <section className="card">
        <div className="cardHead">
          <h2>Ajouter une fiche</h2>
          <span className="hint">Nom + une ou plusieurs lignes Offre/Demande.</span>
        </div>

        <form onSubmit={handleAdd} className="form">
          <div className="grid2">
            <div className="field"><label>Prénom</label><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div className="field"><label>Nom</label><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
          </div>
          <div className="field"><label>Téléphone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06…" /></div>

          <div className="multi">
            <div className="multiHead">
              <h3>Offres / Demandes</h3>
              <button type="button" className="btn ghost" onClick={() => setItems([...items, { type: "demande", skill: "" }])}>+ Ajouter une ligne</button>
            </div>
            {items.map((it, i) => (
              <div className="row" key={i}>
                <div className="chips">
                  <button type="button" className={`chip ${it.type === "offre" ? "on offre" : "offre"}`} onClick={() => setItems(items.map((x, idx) => idx === i ? { ...x, type: "offre" } : x))}>Offre</button>
                  <button type="button" className={`chip ${it.type === "demande" ? "on demande" : "demande"}`} onClick={() => setItems(items.map((x, idx) => idx === i ? { ...x, type: "demande" } : x))}>Demande</button>
                </div>
                <input className="input skill" placeholder="Ex: Couture, Tarot, Informatique…" value={it.skill} onChange={(e) => setItems(items.map((x, idx) => idx === i ? { ...x, skill: e.target.value } : x))}/>
                {items.length > 1 && <button type="button" className="icon danger" onClick={() => setItems(items.filter((_, idx) => idx !== i))} title="Retirer">✕</button>}
              </div>
            ))}
          </div>

          <div className="actions"><button className="btn primary" type="submit" disabled={busy}>{busy ? "..." : "Enregistrer"}</button></div>
        </form>
      </section>

      {/* Liste */}
      {view === "list" && (
        <section className="card">
          <div className="cardHead"><h2>Liste des fiches</h2></div>
          <div className="tableWrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Téléphone</th>
                  <th>Offres</th>
                  <th>Demandes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {!loading && filtered.map((e) => {
                  const offers = (e.items || []).filter((it) => it.type === "offre").map((it) => it.skill);
                  const demands = (e.items || []).filter((it) => it.type === "demande").map((it) => it.skill);
                  return (
                    <tr key={e.id} title={`${e.lastName} ${e.firstName}`}>
                      <td>
                        <div className="who">
                          <div className="avatar" aria-hidden="true">{initials(e.firstName, e.lastName)}</div>
                          <div className="wcol"><strong>{e.lastName} {e.firstName}</strong></div>
                        </div>
                      </td>
                      <td>{e.phone ? <a className="tel" href={`tel:${e.phone.replace(/\s+/g, "")}`}>{e.phone}</a> : <span className="muted">—</span>}</td>
                      <td>{offers.length ? <div className="tags">{offers.map((s, i) => <span className="tag off" key={i}>{s}</span>)}</div> : <span className="muted">—</span>}</td>
                      <td>{demands.length ? <div className="tags">{demands.map((s, i) => <span className="tag dem" key={i}>{s}</span>)}</div> : <span className="muted">—</span>}</td>
                      <td className="right">
                        <button className="btn ghost" onClick={() => startEdit(e)} style={{ marginRight: 8 }} disabled={busy}>Éditer</button>
                        <button className="btn danger light" onClick={() => handleDelete(e.id)} disabled={busy}>Supprimer</button>
                      </td>
                    </tr>
                  );
                })}
                {loading && (<tr><td colSpan={5}><div className="skeleton">Chargement…</div></td></tr>)}
                {!loading && !filtered.length && (<tr><td colSpan={5}><em>Aucun résultat.</em></td></tr>)}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Bulles */}
      {view === "bubbles" && (
        <section className="card">
          <div className="cardHead"><h2>Bulles par compétence</h2><span className="hint">Taille = popularité, chiffre = off./dem.</span></div>
          <div className="bubblesGrid">
            {bubbles.map((b) => {
              const total = b.offres + b.demandes;
              const size = Math.max(84, Math.min(168, 64 + Math.sqrt(total) * 18));
              const kind = b.offres && b.demandes ? "mix" : b.offres ? "offre" : "demande";
              return (
                <div key={b.skill} className={`bubble ${kind}`} style={{ width: size, height: size }} title={`${b.skill} • ${b.offres} off. · ${b.demandes} dem.`}>
                  <div className="bLbl">
                    <div className="bTitle">{b.skill}</div>
                    <div className="bMeta">{b.offres} · {b.demandes}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Stats (Nuage + Barres) */}
      {view === "stats" && (
        <section className="card">
          <div className="cardHead">
            <h2>Stats visuelles</h2>
            <span className="hint">Nuage = “beau”, Barres = le plus lisible en public.</span>
          </div>

          <div className="grid2">
            {/* Nuage OFFRES */}
            <div>
              <h3>Nuage — Offres</h3>
              <div className="cloud">
                {cloudOffers.map(({ skill, count }) => {
                  const w = 12 + Math.round(22 * Math.sqrt(count / (maxOffer || 1))); // 12–34px
                  const o = 0.5 + 0.5 * (count / (maxOffer || 1)); // 0.5–1
                  return (
                    <span key={`off-${skill}`} className="cloudItem off" style={{ fontSize: w, opacity: o }} title={`${skill} — ${count} offre(s)`}>
                      {skill}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Nuage DEMANDES */}
            <div>
              <h3>Nuage — Demandes</h3>
              <div className="cloud">
                {cloudDemands.map(({ skill, count }) => {
                  const w = 12 + Math.round(22 * Math.sqrt(count / (maxDemand || 1)));
                  const o = 0.5 + 0.5 * (count / (maxDemand || 1));
                  return (
                    <span key={`dem-${skill}`} className="cloudItem dem" style={{ fontSize: w, opacity: o }} title={`${skill} — ${count} demande(s)`}>
                      {skill}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid2" style={{ marginTop: 12 }}>
            {/* Barres OFFRES */}
            <div>
              <h3>Top — Offres</h3>
              <div className="bars">
                {topOffers.map(({ skill, count }) => {
                  const pct = Math.round((count / (maxOffer || 1)) * 100);
                  return (
                    <div key={`bo-${skill}`} className="barRow">
                      <div className="barLabel">{skill}</div>
                      <div className="barOuter">
                        <div className="barInner off" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="barCount">{count}</div>
                    </div>
                  );
                })}
                {!topOffers.length && <div className="muted">Aucune donnée.</div>}
              </div>
            </div>

            {/* Barres DEMANDES */}
            <div>
              <h3>Top — Demandes</h3>
              <div className="bars">
                {topDemands.map(({ skill, count }) => {
                  const pct = Math.round((count / (maxDemand || 1)) * 100);
                  return (
                    <div key={`bd-${skill}`} className="barRow">
                      <div className="barLabel">{skill}</div>
                      <div className="barOuter">
                        <div className="barInner dem" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="barCount">{count}</div>
                    </div>
                  );
                })}
                {!topDemands.length && <div className="muted">Aucune donnée.</div>}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Modal d’édition */}
      {editingEntry && (
        <div className="modal" onClick={() => setEditingEntry(null)}>
          <div className="modalInner" onClick={(e) => e.stopPropagation()}>
            <div className="dHead">
              <h3>Modifier la fiche</h3>
              <button className="icon" onClick={() => setEditingEntry(null)}>✕</button>
            </div>
            <form onSubmit={handleEdit} className="form">
              <div className="grid2">
                <div className="field"><label>Prénom</label><input className="input" value={editingEntry.firstName} onChange={(e) => setEditingEntry({ ...editingEntry, firstName: e.target.value })} /></div>
                <div className="field"><label>Nom</label><input className="input" value={editingEntry.lastName} onChange={(e) => setEditingEntry({ ...editingEntry, lastName: e.target.value })} /></div>
              </div>
              <div className="field"><label>Téléphone</label><input className="input" value={editingEntry.phone} onChange={(e) => setEditingEntry({ ...editingEntry, phone: e.target.value })} /></div>

              <div className="multi">
                <div className="multiHead">
                  <h3>Offres / Demandes</h3>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setEditingEntry({ ...editingEntry, items: [...(editingEntry.items || []), { type: "demande", skill: "" }] })}
                  >+ Ajouter une ligne</button>
                </div>
                {(editingEntry.items || []).map((it, i) => (
                  <div className="row" key={i}>
                    <div className="chips">
                      <button
                        type="button"
                        className={`chip ${it.type === "offre" ? "on offre" : "offre"}`}
                        onClick={() => setEditingEntry({ ...editingEntry, items: editingEntry.items.map((x, idx) => idx === i ? { ...x, type: "offre" } : x) })}
                      >Offre</button>
                      <button
                        type="button"
                        className={`chip ${it.type === "demande" ? "on demande" : "demande"}`}
                        onClick={() => setEditingEntry({ ...editingEntry, items: editingEntry.items.map((x, idx) => idx === i ? { ...x, type: "demande" } : x) })}
                      >Demande</button>
                    </div>
                    <input
                      className="input skill"
                      placeholder="Compétence"
                      value={it.skill}
                      onChange={(e) => setEditingEntry({ ...editingEntry, items: editingEntry.items.map((x, idx) => idx === i ? { ...x, skill: e.target.value } : x) })}
                    />
                    {(editingEntry.items || []).length > 1 && (
                      <button type="button" className="icon danger" onClick={() => setEditingEntry({ ...editingEntry, items: editingEntry.items.filter((_, idx) => idx !== i) })}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              <div className="actions" style={{ gap: 8 }}>
                <button className="btn primary" type="submit" disabled={busy}>{busy ? "..." : "Enregistrer"}</button>
                <button className="btn ghost" type="button" onClick={() => setEditingEntry(null)} disabled={busy}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {error && <div className="toast" style={{ background:"#b91c1c" }}>{error}</div>}
    </div>
  );
}
