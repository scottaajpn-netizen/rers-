"use client";
import { useEffect, useMemo, useState } from "react";

const ADMIN_TOKEN = "87800";

// ----------- outils -----------
function normalizeEntry(e) {
  const items = Array.isArray(e.items)
    ? e.items
    : [];
  return {
    id: e.id,
    firstName: e.firstName || "",
    lastName: e.lastName || "",
    phone: e.phone || "",
    createdAt: e.createdAt || null,
    items: items.map((it) => ({
      type: it.type === "offre" ? "offre" : "demande",
      skill: it.skill || "",
    })),
  };
}

function initials(first, last) {
  const a = (last || "").trim()[0] || "";
  const b = (first || "").trim()[0] || "";
  return (a + b).toUpperCase();
}

// ----------- page principale -----------
export default function Page() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);

  // Formulaire de création
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState([{ type: "offre", skill: "" }]);

  // ---- fonctions utilitaires ----
  function pop(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  async function fetchEntries() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/entries?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Erreur réseau");
      const data = await res.json();
      const list = Array.isArray(data.entries) ? data.entries.map(normalizeEntry) : [];
      list.sort((a, b) => a.lastName.localeCompare(b.lastName, "fr", { sensitivity: "base" }));
      setEntries(list);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les fiches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchEntries(); }, []);

  // ---- création d’une fiche ----
  function addItemRow() {
    setItems([...items, { type: "demande", skill: "" }]);
  }

  function updateItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function removeItemRow(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const cleanItems = items
        .map((it) => ({
          type: it.type === "offre" ? "offre" : "demande",
          skill: String(it.skill || "").trim(),
        }))
        .filter((it) => it.skill);

      if (!firstName.trim() || !lastName.trim() || cleanItems.length === 0) {
        setError("Prénom, Nom et au moins une compétence sont requis.");
        setBusy(false);
        return;
      }

      const body = { firstName, lastName, phone, items: cleanItems };
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erreur serveur");

      setFirstName(""); setLastName(""); setPhone(""); setItems([{ type: "offre", skill: "" }]);
      await fetchEntries();
      pop("Fiche ajoutée ✅");
    } catch {
      setError("Erreur lors de l’ajout.");
    } finally {
      setBusy(false);
    }
  }

  // ---- suppression ----
  async function handleDelete(id) {
    if (!id || !confirm("Supprimer cette fiche ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/entries?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": ADMIN_TOKEN },
      });
      if (!res.ok) throw new Error("Erreur");
      await fetchEntries();
      pop("Fiche supprimée 🗑️");
    } catch {
      setError("Erreur suppression.");
    } finally {
      setBusy(false);
    }
  }

  // ---- édition ----
  function startEdit(e) {
    setEditing({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      phone: e.phone,
      items: e.items?.length ? e.items.map(it => ({ ...it })) : [{ type: "offre", skill: "" }]
    });
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 50);
  }

  function cancelEdit() { setEditing(null); }

  function updateEditingField(field, value) {
    setEditing((prev) => ({ ...prev, [field]: value }));
  }

  function updateEditingItem(i, patch) {
    setEditing((prev) => ({
      ...prev,
      items: prev.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    }));
  }

  function addEditingRow() {
    setEditing((prev) => ({ ...prev, items: [...prev.items, { type: "demande", skill: "" }] }));
  }

  function removeEditingRow(i) {
    setEditing((prev) => ({ ...prev, items: prev.items.filter((_, idx) => idx !== i) }));
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const cleanItems = (editing.items || [])
        .map(it => ({ type: it.type === "offre" ? "offre" : "demande", skill: String(it.skill || "").trim() }))
        .filter(it => it.skill);

      const body = {
        firstName: editing.firstName.trim(),
        lastName: editing.lastName.trim(),
        phone: editing.phone.trim(),
        items: cleanItems,
      };

      const res = await fetch(`/api/entries?id=${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      await fetchEntries();
      pop("Fiche mise à jour ✅");
      setEditing(null);
    } catch {
      setError("Erreur lors de la mise à jour.");
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      `${e.firstName} ${e.lastName} ${e.phone}`.toLowerCase().includes(q) ||
      e.items.some((it) => `${it.type} ${it.skill}`.toLowerCase().includes(q))
    );
  }, [entries, search]);

  return (
    <div className="wrap">
      <header className="top">
        <h1>RERS</h1>
        <button className="btn" onClick={fetchEntries}>Recharger</button>
      </header>

      <div className="search">
        <input className="input" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <span>{filtered.length} fiches</span>
      </div>

      {toast && <div className="toast">{toast}</div>}
      {error && <div className="alert">{error}</div>}

      <section className="card">
        <h2>Ajouter une fiche</h2>
        <form onSubmit={handleAdd}>
          <input placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          <input placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {items.map((it, i) => (
            <div key={i}>
              <select value={it.type} onChange={(e) => updateItem(i, { type: e.target.value })}>
                <option value="offre">Offre</option>
                <option value="demande">Demande</option>
              </select>
              <input placeholder="Compétence" value={it.skill} onChange={(e) => updateItem(i, { skill: e.target.value })} />
              {items.length > 1 && <button type="button" onClick={() => removeItemRow(i)}>✕</button>}
            </div>
          ))}
          <button type="button" onClick={addItemRow}>+ Ajouter une ligne</button>
          <button type="submit" disabled={busy}>{busy ? "..." : "Enregistrer"}</button>
        </form>
      </section>

      <section className="card">
        <h2>Liste des fiches</h2>
        <table>
          <thead>
            <tr><th>Nom</th><th>Téléphone</th><th>Offres</th><th>Demandes</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td>{e.lastName} {e.firstName}</td>
                <td>{e.phone || "—"}</td>
                <td>{e.items.filter(it => it.type === "offre").map(it => it.skill).join(", ") || "—"}</td>
                <td>{e.items.filter(it => it.type === "demande").map(it => it.skill).join(", ") || "—"}</td>
                <td>
                  <button onClick={() => startEdit(e)}>Éditer</button>
                  <button onClick={() => handleDelete(e.id)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && (
        <section className="card">
          <h2>Modifier la fiche</h2>
          <input value={editing.firstName} onChange={(e) => updateEditingField("firstName", e.target.value)} placeholder="Prénom" />
          <input value={editing.lastName} onChange={(e) => updateEditingField("lastName", e.target.value)} placeholder="Nom" />
          <input value={editing.phone} onChange={(e) => updateEditingField("phone", e.target.value)} placeholder="Téléphone" />

          {editing.items.map((it, i) => (
            <div key={i}>
              <select value={it.type} onChange={(e) => updateEditingItem(i, { type: e.target.value })}>
                <option value="offre">Offre</option>
                <option value="demande">Demande</option>
              </select>
              <input value={it.skill} onChange={(e) => updateEditingItem(i, { skill: e.target.value })} />
              {editing.items.length > 1 && (
                <button type="button" onClick={() => removeEditingRow(i)}>✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addEditingRow}>+ Ajouter une ligne</button>

          <div style={{ marginTop: 8 }}>
            <button onClick={saveEdit} disabled={busy}>Enregistrer les modifications</button>
            <button onClick={cancelEdit}>Annuler</button>
          </div>
        </section>
      )}
    </div>
  );
}
