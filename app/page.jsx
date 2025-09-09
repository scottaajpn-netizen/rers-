"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import "./globals.css";

// --- CONFIG SIMPLIFIÉE --- //
const ADMIN_TOKEN = "87800"; // tu m’as demandé de l’intégrer en dur
const API_URL = "/api/entries";

// couleur stable par compétence
function colorForSkill(skill) {
  const s = (skill || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 80% 85%)`; // fond pastel
}
function borderColorForSkill(skill) {
  const s = (skill || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 45%)`; // pour la bordure
}

// normalise et prend la première compétence comme "clé de regroupement"
function primarySkill(skills) {
  if (!skills) return "Autre";
  const first = String(skills).split(/[;,/|]/)[0] || skills;
  return first.trim() || "Autre";
}

export default function Page() {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [adding, setAdding]     = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const viewTokenRef = useRef(null); // pour VIEW_PASSWORD si activé côté serveur

  // form
  const [firstName, setFirst] = useState("");
  const [lastName,  setLast]  = useState("");
  const [phone,     setPhone] = useState("");
  const [type,      setType]  = useState("offre");
  const [skills,    setSkills]= useState("");

  // charge au montage + bouton recharger
  async function fetchEntries(opts = { forcePrompt: false }) {
    setLoading(true);
    try {
      let headers = {};
      // si on a déjà un view token en localStorage, on le met
      const saved = window.localStorage.getItem("rers_view_token") || "";
      if (saved) headers["x-view-token"] = saved;
      if (opts.forcePrompt) {
        const ask = window.prompt("Mot de passe lecture (si demandé par le serveur) :") || "";
        viewTokenRef.current = ask;
        if (ask) {
          window.localStorage.setItem("rers_view_token", ask);
          headers["x-view-token"] = ask;
        }
      }

      const res = await fetch(API_URL, { headers, cache: "no-store" });
      if (res.status === 401) {
        // serveur protégé par VIEW_PASSWORD : on redemande proprement
        const ask = window.prompt("Mot de passe lecture requis :") || "";
        viewTokenRef.current = ask;
        if (ask) {
          window.localStorage.setItem("rers_view_token", ask);
          const retry = await fetch(API_URL, { headers: { "x-view-token": ask }, cache: "no-store" });
          if (!retry.ok) throw new Error(await retry.text());
          const data = await retry.json();
          setEntries(data.entries || []);
        } else {
          setEntries([]);
        }
      } else {
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (e) {
      alert("Erreur chargement : " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEntries();
  }, []);

  async function onAdd(e) {
    e.preventDefault();
    setAdding(true);
    try {
      const body = { firstName, lastName, phone, type, skills };
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": ADMIN_TOKEN,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Erreur ajout");
      }
      setFirst(""); setLast(""); setPhone(""); setType("offre"); setSkills("");
      await fetchEntries();
    } catch (e) {
      alert("Erreur ajout : " + (e?.message || e));
    } finally {
      setAdding(false);
    }
  }

  async function onDelete(id) {
    if (!id) return;
    if (!confirm("Supprimer cette entrée ?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": ADMIN_TOKEN },
      });
      if (!res.ok) throw new Error(await res.text());
      setEntries((cur) => cur.filter((e) => e.id !== id));
    } catch (e) {
      alert("Erreur suppression : " + (e?.message || e));
    } finally {
      setDeletingId(null);
    }
  }

  // regroupement par compétence (clé = première compétence)
  const groups = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const key = primarySkill(e.skills) || "Autre";
      if (!map.has(key)) map.set(key, { skill: key, offres: [], demandes: [] });
      if (e.type === "offre") map.get(key).offres.push(e);
      else map.get(key).demandes.push(e);
    }
    // ordre : groupes avec plus de « matchs » en premier (min(offres, demandes))
    return [...map.values()].sort((a, b) => {
      const ma = Math.min(a.offres.length, a.demandes.length);
      const mb = Math.min(b.offres.length, b.demandes.length);
      return mb - ma || (b.offres.length + b.demandes.length) - (a.offres.length + a.demandes.length);
    });
  }, [entries]);

  return (
    <div className="container">
      <h1>RERS – Réseau d’échanges réciproques de savoir</h1>

      <div className="toolbar">
        <button className="btn" onClick={() => fetchEntries()} disabled={loading}>
          {loading ? "Rechargement…" : "Recharger"}
        </button>
        <span className="badge">Total: {entries.length}</span>
        <span className="small">Les bulles sont colorées par compétence. Bordure <b>pleine</b> = offre, <b>pointillée</b> = demande.</span>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="sectionTitle">Ajouter une personne</div>
        <form onSubmit={onAdd} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(6,minmax(0,1fr))" }}>
          <input className="input" placeholder="Prénom" value={firstName}  onChange={(e)=>setFirst(e.target.value)} />
          <input className="input" placeholder="Nom"    value={lastName}   onChange={(e)=>setLast(e.target.value)} />
          <input className="input" placeholder="Téléphone" value={phone}  onChange={(e)=>setPhone(e.target.value)} />
          <select className="select" value={type} onChange={(e)=>setType(e.target.value)}>
            <option value="offre">Offre</option>
            <option value="demande">Demande</option>
          </select>
          <input className="input" placeholder="Compétences (ex: couture, tricot)" value={skills} onChange={(e)=>setSkills(e.target.value)} />
          <button className="btn" disabled={adding}>{adding ? "Ajout…" : "Ajouter"}</button>
        </form>
      </div>

      <div className="sectionTitle">Réseau par compétence</div>

      {groups.map((g) => {
        const bg = colorForSkill(g.skill);
        const bc = borderColorForSkill(g.skill);
        const matchCount = Math.min(g.offres.length, g.demandes.length);
        return (
          <div className="group" key={g.skill} style={{ borderColor: bc, background: bg }}>
            <div className="groupHeader">
              <div className="skillSwatch" style={{ background: bc }} />
              <strong>{g.skill}</strong>
              <span className="badge">Offres: {g.offres.length}</span>
              <span className="badge">Demandes: {g.demandes.length}</span>
              {matchCount > 0 && <span className="badge">Matchs possibles: {matchCount}</span>}
            </div>

            <div className="columns">
              <div>
                <div className="columnTitle">Offres</div>
                <div className="bubbles">
                  {g.offres.map((e) => (
                    <div
                      key={e.id}
                      className="bubble offre"
                      style={{ background: bg, borderColor: bc }}
                      title={e.skills}
                    >
                      <span className="name">{e.firstName} {e.lastName}</span>
                      <span className="phone">{e.phone}</span>
                      <span className="skillTag">{primarySkill(e.skills)}</span>
                      <button
                        className="del"
                        onClick={() => onDelete(e.id)}
                        disabled={deletingId === e.id}
                        aria-label="Supprimer"
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="columnTitle">Demandes</div>
                <div className="bubbles">
                  {g.demandes.map((e) => (
                    <div
                      key={e.id}
                      className="bubble demande"
                      style={{ background: bg, borderColor: bc, borderStyle: "dashed" }}
                      title={e.skills}
                    >
                      <span className="name">{e.firstName} {e.lastName}</span>
                      <span className="phone">{e.phone}</span>
                      <span className="skillTag">{primarySkill(e.skills)}</span>
                      <button
                        className="del"
                        onClick={() => onDelete(e.id)}
                        disabled={deletingId === e.id}
                        aria-label="Supprimer"
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {groups.length === 0 && (
        <div className="small">Aucune entrée pour le moment.</div>
      )}
    </div>
  );
}
