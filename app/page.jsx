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
  const [quickFilter, setQuickFilter] = useState("all"); // "all" | "offre" | "demande"

  // création
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [items, setItems]         = useState([{ type: "offre", skill: "" }]);

  // édition inline (dans la liste)
  const [inlineEditId, setInlineEditId] = useState(null); // id en édition
  const [inlineDraft, setInlineDraft]   = useState(null); // { id, firstName, lastName, phone, items:[] }

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

  // ---- export CSV ----
  function handleExportCSV() {
    try {
      const escape = (s) => `"${String(s || "").replace(/"/g, '""')}"`;
      const flat = entries.map(e => ({
        id: e.id,
        nom: `${e.lastName || ""} ${e.firstName || ""}`.trim(),
        tel: e.phone || "",
        offres: (e.items||[]).filter(i => i.type === "offre").map(i => i.skill).join(", "),
        demandes: (e.items||[]).filter(i => i.type === "demande").map(i => i.skill).join(", ")
      }));
      const headers = Object.keys(flat[0] || { id:"", nom:"", tel:"", offres:"", demandes:"" });
      const lines = [
        headers.join(";"),
        ...flat.map(r => headers.map(h => escape(r[h])).join(";"))
      ].join("\n");
      const blob = new Blob([lines], { type:"text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rers-export-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      pop("Export CSV prêt 📋");
    } catch (e) {
      console.error(e);
      setError("Export CSV impossible.");
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

  // ---- édition inline ----
  function startInlineEdit(e) {
    setInlineEditId(e.id);
    setInlineDraft({
      id: e.id,
      firstName: e.firstName || "",
      lastName:  e.lastName  || "",
      phone:     e.phone     || "",
      items: Array.isArray(e.items) && e.items.length ? e.items.map(it => ({ type: it.type, skill: it.skill })) : [{ type: "offre", skill: "" }]
    });
  }
  function cancelInlineEdit() {
    setInlineEditId(null);
    setInlineDraft(null);
  }
  function updateDraftItem(i, patch) {
    setInlineDraft(d => ({ ...d, items: d.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  }
  function addDraftItem() {
    setInlineDraft(d => ({ ...d, items: [...d.items, { type:"demande", skill:"" }] }));
  }
  function removeDraftItem(i) {
    setInlineDraft(d => ({ ...d, items: d.items.filter((_, idx) => idx !== i) }));
  }

  async function saveInlineEdit() {
    if (!inlineDraft) return;
    setBusy(true);
    setError("");
    try {
      const cleanItems = (inlineDraft.items || [])
        .map(it => ({ type: it.type === "offre" ? "offre" : "demande", skill: String(it.skill || "").trim() }))
        .filter(it => it.skill);

      if (!inlineDraft.firstName.trim() || !inlineDraft.lastName.trim() || !cleanItems.length) {
        setError("Prénom, Nom et au moins une compétence sont requis.");
        setBusy(false);
        return;
      }

      const body = {
        firstName: inlineDraft.firstName.trim(),
        lastName:  inlineDraft.lastName.trim(),
        phone:     inlineDraft.phone.trim(),
        items:     cleanItems,
      };

      const res = await fetch(`/api/entries?id=${encodeURIComponent(inlineDraft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());

      setInlineEditId(null);
      setInlineDraft(null);
      await fetchEntries();
      pop("Fiche modifiée ✅");
    } catch (e) {
      console.error(e);
      setError("Erreur modification.");
    } finally {
      setBusy(false);
    }
  }

  // ---- recherche + filtres ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bySearch = (arr) => {
      if (!q) return arr;
      return arr.filter((e) =>
        `${e.firstName} ${e.lastName} ${e.phone}`.toLowerCase().includes(q) ||
        (Array.isArray(e.items) && e.items.some((it) => `${it.type} ${it.skill}`.toLowerCase().includes(q)))
      );
    };
    const byQuick = (arr) => {
      if (quickFilter === "all") return arr;
      return arr.filter((e) =>
        (e.items || []).some((it) => it.type === quickFilter)
      );
    };
    return byQuick(bySearch(entries));
  }, [entries, search, quickFilter]);

  // Agrégations bulles (mix offres/demandes)
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
          </div>
          <div className="rers-seg">
            <button className={quickFilter === "all" ? "on" : ""} onClick={() => setQuickFilter("all")}>Tout</button>
            <button className={quickFilter === "offre" ? "on" : ""} onClick={() => setQuickFilter("offre")}>Offres</button>
            <button className={quickFilter === "demande" ? "on" : ""} onClick={() => setQuickFilter("demande")}>Demandes</button>
          </div>
          <button className="btn ghost" onClick={fetchEntries}>{loading ? "…" : "Recharger"}</button>
          <button className="btn" onClick={handleExport}>Export JSON</button>
          <button className="btn" onClick={handleExportCSV}>Export CSV</button>
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

                  // Ligne en mode édition inline ?
                  const isEditing = inlineEditId === e.id;

                  return (
                    <tr key={e.id} title={`${e.lastName} ${e.firstName}`}>
                      <td>
                        <div className="who">
                          <div className="avatar" aria-hidden="true">{initials(e.firstName, e.lastName)}</div>
                          <div className="wcol">
                            {isEditing ? (
                              <div className="grid2">
                                <input className="input" value={inlineDraft.firstName} onChange={(ev) => setInlineDraft(d => ({ ...d, firstName: ev.target.value }))} placeholder="Prénom"/>
                                <input className="input" value={inlineDraft.lastName} onChange={(ev) => setInlineDraft(d => ({ ...d, lastName: ev.target.value }))} placeholder="Nom"/>
                              </div>
                            ) : (
                              <strong>{e.lastName} {e.firstName}</strong>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        {isEditing ? (
                          <input className="input" value={inlineDraft.phone} onChange={(ev) => setInlineDraft(d => ({ ...d, phone: ev.target.value }))} placeholder="06…"/>
                        ) : (
                          e.phone ? <a className="tel" href={`tel:${e.phone.replace(/\s+/g, "")}`}>{e.phone}</a> : <span className="muted">—</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <div>
                            {(inlineDraft.items || []).map((it, i) => (
                              <div className="row" key={`e-off-${i}`}>
                                <div className="chips">
                                  <button type="button" className={`chip ${it.type === "offre" ? "on offre" : "offre"}`} onClick={() => updateDraftItem(i, { type:"offre" })}>Offre</button>
                                  <button type="button" className={`chip ${it.type === "demande" ? "on demande" : "demande"}`} onClick={() => updateDraftItem(i, { type:"demande" })}>Demande</button>
                                </div>
                                <input className="input skill" placeholder="Compétence" value={it.skill} onChange={(ev) => updateDraftItem(i, { skill: ev.target.value })}/>
                                {(inlineDraft.items || []).length > 1 && (
                                  <button type="button" className="icon danger" onClick={() => removeDraftItem(i)}>✕</button>
                                )}
                              </div>
                            ))}
                            <button type="button" className="btn ghost" onClick={addDraftItem}>+ Ajouter</button>
                          </div>
                        ) : (
                          offers.length ? <div className="tags">{offers.map((s, i) => <span className="tag off" key={i}>{s}</span>)}</div> : <span className="muted">—</span>
                        )}
                      </td>

                      <td>
                        {!isEditing ? (
                          demands.length ? <div className="tags">{demands.map((s, i) => <span className="tag dem" key={i}>{s}</span>)}</div> : <span className="muted">—</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>

                      <td className="right">
                        {!isEditing ? (
                          <>
                            <button className="btn ghost" onClick={() => startInlineEdit(e)} style={{ marginRight: 8 }} disabled={busy}>Éditer</button>
                            <button className="btn danger light" onClick={() => handleDelete(e.id)} disabled={busy}>Supprimer</button>
                          </>
                        ) : (
                          <>
                            <button className="btn primary" onClick={saveInlineEdit} disabled={busy} style={{ marginRight: 8 }}>{busy ? "..." : "Enregistrer"}</button>
                            <button className="btn ghost" onClick={cancelInlineEdit} disabled={busy}>Annuler</button>
                          </>
                        )}
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
          <div className="cardHead"><h2>Bulles par compétence</h2><span className="hint">Clique pour filtrer la liste</span></div>
          <div className="bubblesGrid">
            {bubbles.map((b) => {
              const total = b.offres + b.demandes;
              const size = Math.max(84, Math.min(168, 64 + Math.sqrt(total) * 18));
              const kind = b.offres && b.demandes ? "mix" : b.offres ? "offre" : "demande";
              return (
                <div
                  key={b.skill}
                  className={`bubble ${kind}`}
                  style={{ width: size, height: size, cursor:"pointer" }}
                  title={`${b.skill} • ${b.offres} off. · ${b.demandes} dem.`}
                  onClick={() => { setSearch(b.skill); setView("list"); }}
                >
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

      {toast && <div className="toast">{toast}</div>}
      {error && <div className="toast" style={{ background:"#b91c1c" }}>{error}</div>}
    </div>
  );
}
