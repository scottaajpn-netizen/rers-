"use client";

import { useEffect, useMemo, useState } from "react";

const ADMIN_TOKEN = "87800"; // mot de passe admin

function initials(first, last) {
  return `${(first?.[0] || "").toUpperCase()}${(last?.[0] || "").toUpperCase()}`;
}

export default function Page() {
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("list"); // "list" | "bubbles"
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [editingEntry, setEditingEntry] = useState(null);

  // Formulaire d’ajout
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState([{ type: "offre", skill: "" }]);

  // Charger les fiches
  async function fetchEntries() {
    setLoading(true);
    try {
      const res = await fetch("/api/entries", { cache: "no-store" });
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { fetchEntries(); }, []);

  // Ajouter une fiche
  async function handleAdd(e) {
    e.preventDefault();
    const cleanItems = items
      .map((it) => ({
        type: it.type === "offre" ? "offre" : "demande",
        skill: String(it.skill || "").trim(),
      }))
      .filter((it) => it.skill);

    if (!firstName.trim() || !lastName.trim() || !cleanItems.length) return;

    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
      body: JSON.stringify({ firstName, lastName, phone, items: cleanItems }),
    });

    setFirstName(""); setLastName(""); setPhone("");
    setItems([{ type: "offre", skill: "" }]);

    fetchEntries();
    pop("Fiche ajoutée ✅");
  }

  // Supprimer une fiche
  async function handleDelete(id) {
    if (!confirm("Supprimer cette fiche ?")) return;
    await fetch(`/api/entries?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-admin-token": ADMIN_TOKEN },
    });
    fetchEntries();
    pop("Fiche supprimée 🗑️");
  }

  // Modifier une fiche (via /api/edit)
  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editingEntry) return;

    const cleanItems = (editingEntry.items || [])
      .map((it) => ({
        type: it.type === "offre" ? "offre" : "demande",
        skill: String(it.skill || "").trim(),
      }))
      .filter((it) => it.skill);

    await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
      body: JSON.stringify({ ...editingEntry, items: cleanItems }),
    });

    setEditingEntry(null);
    fetchEntries();
    pop("Fiche mise à jour ✅");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      `${e.firstName} ${e.lastName} ${e.phone}`.toLowerCase().includes(q) ||
      (Array.isArray(e.items) && e.items.some((it) => `${it.type} ${it.skill}`.toLowerCase().includes(q)))
    );
  }, [entries, search]);

  // Bulles (agrégation par compétence)
  const bubbles = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      for (const it of e.items || []) {
        const k = (it.skill || "").trim().toLowerCase();
        if (!k) continue;
        if (!map.has(k)) map.set(k, { skill: it.skill, offres: 0, demandes: 0 });
        const b = map.get(k);
        if (it.type === "offre") b.offres++; else b.demandes++;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (b.offres + b.demandes) - (a.offres + a.demandes)
    );
  }, [entries]);

  function pop(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 1600);
  }

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
          </div>
          <button className="btn ghost" onClick={fetchEntries}>{loading ? "…" : "Recharger"}</button>
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

      {/* Formulaire d’ajout */}
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

          <div className="actions"><button className="btn primary" type="submit">Enregistrer</button></div>
        </form>
      </section>

      {/* VUE LISTE */}
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
                        <button className="btn ghost" onClick={() => setEditingEntry(e)} style={{ marginRight: 8 }}>Éditer</button>
                        <button className="btn danger light" onClick={() => handleDelete(e.id)}>Supprimer</button>
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

      {/* VUE BULLES (plus lisible) */}
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

      {/* MODAL ÉDITION */}
      {editingEntry && (
        <div className="modal" onClick={() => setEditingEntry(null)}>
          <div className="modalInner" onClick={(e) => e.stopPropagation()}>
            <div className="dHead"><h3>Modifier la fiche</h3><button className="icon" onClick={() => setEditingEntry(null)}>✕</button></div>
            <form onSubmit={handleEditSubmit} className="form">
              <div className="grid2">
                <div className="field"><label>Prénom</label><input className="input" value={editingEntry.firstName} onChange={(e) => setEditingEntry({ ...editingEntry, firstName: e.target.value })} /></div>
                <div className="field"><label>Nom</label><input className="input" value={editingEntry.lastName} onChange={(e) => setEditingEntry({ ...editingEntry, lastName: e.target.value })} /></div>
              </div>
              <div className="field"><label>Téléphone</label><input className="input" value={editingEntry.phone} onChange={(e) => setEditingEntry({ ...editingEntry, phone: e.target.value })} /></div>

              <div className="multi">
                <div className="multiHead">
                  <h3>Offres / Demandes</h3>
                  <button type="button" className="btn ghost" onClick={() => setEditingEntry({ ...editingEntry, items: [...(editingEntry.items || []), { type: "demande", skill: "" }] })}>+ Ajouter une ligne</button>
                </div>
                {(editingEntry.items || []).map((it, i) => (
                  <div className="row" key={i}>
                    <div className="chips">
                      <button type="button" className={`chip ${it.type === "offre" ? "on offre" : "offre"}`} onClick={() => setEditingEntry({ ...editingEntry, items: editingEntry.items.map((x, idx) => idx === i ? { ...x, type: "offre" } : x) })}>Offre</button>
                      <button type="button" className={`chip ${it.type === "demande" ? "on demande" : "demande"}`} onClick={() => setEditingEntry({ ...editingEntry, items: editingEntry.items.map((x, idx) => idx === i ? { ...x, type: "demande" } : x) })}>Demande</button>
                    </div>
                    <input className="input skill" placeholder="Compétence" value={it.skill} onChange={(e) => setEditingEntry({ ...editingEntry, items: editingEntry.items.map((x, idx) => idx === i ? { ...x, skill: e.target.value } : x) })}/>
                    {(editingEntry.items || []).length > 1 && <button type="button" className="icon danger" onClick={() => setEditingEntry({ ...editingEntry, items: editingEntry.items.filter((_, idx) => idx !== i) })}>✕</button>}
                  </div>
                ))}
              </div>

              <div className="actions" style={{ gap: 8 }}>
                <button className="btn primary" type="submit">Enregistrer</button>
                <button className="btn ghost" type="button" onClick={() => setEditingEntry(null)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
