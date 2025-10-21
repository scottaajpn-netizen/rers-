"use client";

import { useEffect, useMemo, useState } from "react";

const ADMIN_TOKEN = "87800"; // mot de passe admin

function initials(first, last) {
  return `${(first?.[0] || "").toUpperCase()}${(last?.[0] || "").toUpperCase()}`;
}

export default function Page() {
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("list");
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
      setEntries(data.entries || []);
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
        skill: it.skill.trim(),
      }))
      .filter((it) => it.skill);
    if (!firstName.trim() || !lastName.trim() || !cleanItems.length) return;
    await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
      body: JSON.stringify({ firstName, lastName, phone, items: cleanItems }),
    });
    setFirstName("");
    setLastName("");
    setPhone("");
    setItems([{ type: "offre", skill: "" }]);
    fetchEntries();
    pop("Fiche ajoutée ✅");
  }

  // Supprimer une fiche
  async function handleDelete(id) {
    if (!confirm("Supprimer cette fiche ?")) return;
    await fetch(`/api/entries?id=${id}`, {
      method: "DELETE",
      headers: { "x-admin-token": ADMIN_TOKEN },
    });
    fetchEntries();
    pop("Fiche supprimée 🗑️");
  }

  // Modifier une fiche
  async function handleEditSubmit(e) {
    e.preventDefault();
    const cleanItems = editingEntry.items
      .map((it) => ({
        type: it.type === "offre" ? "offre" : "demande",
        skill: it.skill.trim(),
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
      e.items.some((it) => `${it.type} ${it.skill}`.toLowerCase().includes(q))
    );
  }, [entries, search]);

  function pop(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 1500);
  }

  // Calcul des bulles
  const bubbles = useMemo(() => {
    const map = {};
    entries.forEach((e) =>
      e.items.forEach((it) => {
        const key = it.skill.toLowerCase();
        if (!map[key]) map[key] = { skill: it.skill, offres: 0, demandes: 0 };
        if (it.type === "offre") map[key].offres++;
        else map[key].demandes++;
      })
    );
    return Object.values(map).sort((a, b) => b.offres + b.demandes - (a.offres + a.demandes));
  }, [entries]);

  return (
    <div className="container">
      <header className="header">
        <h1>RERS</h1>
        <p>Réseau d’échanges de savoirs</p>
        <div className="tabs">
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Liste</button>
          <button className={view === "bubbles" ? "active" : ""} onClick={() => setView("bubbles")}>Bulles</button>
          <button onClick={fetchEntries}>🔄</button>
        </div>
      </header>

      <input
        placeholder="Rechercher une fiche..."
        className="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* === FORMULAIRE AJOUT === */}
      <form className="card" onSubmit={handleAdd}>
        <h2>Ajouter une fiche</h2>
        <div className="row">
          <input placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          <input placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {items.map((it, i) => (
          <div key={i} className="row small">
            <select
              value={it.type}
              onChange={(e) =>
                setItems(items.map((x, idx) => (idx === i ? { ...x, type: e.target.value } : x)))
              }
            >
              <option value="offre">Offre</option>
              <option value="demande">Demande</option>
            </select>
            <input
              placeholder="Compétence"
              value={it.skill}
              onChange={(e) =>
                setItems(items.map((x, idx) => (idx === i ? { ...x, skill: e.target.value } : x)))
              }
            />
            {items.length > 1 && (
              <button type="button" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>
                ❌
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setItems([...items, { type: "demande", skill: "" }])}>
          + Ajouter une ligne
        </button>
        <button type="submit">Enregistrer</button>
      </form>

      {/* === VUE LISTE === */}
      {view === "list" && (
        <div className="card">
          <h2>Liste des fiches ({filtered.length})</h2>
          {filtered.map((e) => (
            <div key={e.id} className="entry">
              <div className="info">
                <div className="avatar">{initials(e.firstName, e.lastName)}</div>
                <div>
                  <strong>{e.firstName} {e.lastName}</strong>
                  <p>{e.phone}</p>
                </div>
              </div>
              <div className="tags">
                {e.items.filter(it => it.type === "offre").map((it, i) => <span key={i} className="tag offre">{it.skill}</span>)}
                {e.items.filter(it => it.type === "demande").map((it, i) => <span key={i} className="tag demande">{it.skill}</span>)}
              </div>
              <div className="actions">
                <button onClick={() => setEditingEntry(e)}>✏️ Éditer</button>
                <button onClick={() => handleDelete(e.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === VUE BULLES === */}
      {view === "bubbles" && (
        <div className="bubbles">
          {bubbles.map((b, i) => (
            <div key={i} className="bubble" title={`${b.skill} (${b.offres} off. / ${b.demandes} dem.)`}>
              <span>{b.skill}</span>
              <small>{b.offres}·{b.demandes}</small>
            </div>
          ))}
        </div>
      )}

      {/* === POPUP EDITION === */}
      {editingEntry && (
        <div className="modal">
          <div className="modal-content">
            <h2>Modifier la fiche</h2>
            <form onSubmit={handleEditSubmit}>
              <input
                value={editingEntry.firstName}
                onChange={(e) => setEditingEntry({ ...editingEntry, firstName: e.target.value })}
                placeholder="Prénom"
              />
              <input
                value={editingEntry.lastName}
                onChange={(e) => setEditingEntry({ ...editingEntry, lastName: e.target.value })}
                placeholder="Nom"
              />
              <input
                value={editingEntry.phone}
                onChange={(e) => setEditingEntry({ ...editingEntry, phone: e.target.value })}
                placeholder="Téléphone"
              />
              {editingEntry.items.map((it, i) => (
                <div key={i} className="row small">
                  <select
                    value={it.type}
                    onChange={(e) =>
                      setEditingEntry({
                        ...editingEntry,
                        items: editingEntry.items.map((x, idx) =>
                          idx === i ? { ...x, type: e.target.value } : x
                        ),
                      })
                    }
                  >
                    <option value="offre">Offre</option>
                    <option value="demande">Demande</option>
                  </select>
                  <input
                    value={it.skill}
                    onChange={(e) =>
                      setEditingEntry({
                        ...editingEntry,
                        items: editingEntry.items.map((x, idx) =>
                          idx === i ? { ...x, skill: e.target.value } : x
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <div className="actions">
                <button type="submit">💾 Enregistrer</button>
                <button type="button" onClick={() => setEditingEntry(null)}>❌ Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        body { font-family: system-ui, sans-serif; background: #fafafa; color: #1a1a1a; }
        .container { max-width: 900px; margin: auto; padding: 20px; }
        .header { display: flex; align-items: center; justify-content: space-between; }
        .tabs button { margin: 0 4px; padding: 6px 12px; border: none; border-radius: 8px; background: #eee; }
        .tabs .active { background: #6366f1; color: white; }
        .card { background: white; padding: 16px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin: 12px 0; }
        .row { display: flex; gap: 8px; margin-bottom: 8px; }
        .small select, .small input { flex: 1; }
        input, select { padding: 8px; border: 1px solid #ddd; border-radius: 8px; width: 100%; }
        .entry { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eee; padding: 8px 0; }
        .avatar { background: #e0e7ff; border-radius: 50%; width: 36px; height: 36px; display: grid; place-items: center; font-weight: bold; }
        .tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag { font-size: 12px; padding: 3px 8px; border-radius: 999px; }
        .offre { background: #ecfdf5; color: #065f46; }
        .demande { background: #fef3c7; color: #92400e; }
        .actions button { background: none; border: none; cursor: pointer; margin-left: 4px; font-size: 14px; }
        .bubbles { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; }
        .bubble { background: white; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); transition: all .2s; }
        .bubble:hover { transform: translateY(-4px); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; justify-content: center; align-items: center; }
        .modal-content { background: white; padding: 20px; border-radius: 12px; width: 90%; max-width: 500px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .toast { position: fixed; bottom: 20px; right: 20px; background: #1a1a1a; color: white; padding: 10px 16px; border-radius: 8px; }
      `}</style>
    </div>
  );
}
