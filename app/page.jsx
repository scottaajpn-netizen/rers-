"use client";
import { useEffect, useMemo, useState } from "react";

const ADMIN_TOKEN = "87800"; // admin intégré

export default function Home() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");

  // --- Recherche & filtre ---
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // all | offre | demande

  // --- Form state ---
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [items, setItems] = useState([{ type: "offre", skill: "" }]);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Charger les données
  async function load() {
    try {
      setLoading(true);
      setFetchErr("");
      const res = await fetch("/api/entries", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur de chargement");
      // Compat anciennes entrées
      const normalized = (data.entries || []).map((e) => {
        if (Array.isArray(e.items)) return e;
        const t = String(e.type || "").toLowerCase();
        const skillsRaw = String(e.skills || "");
        const derived = skillsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => ({ type: t || "offre", skill: s }));
        return { ...e, items: derived };
      });
      setEntries(normalized);
    } catch (e) {
      setFetchErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Lignes Type+Compétence
  const addRow = () => setItems((prev) => [...prev, { type: "offre", skill: "" }]);
  const removeRow = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, patch) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  // Soumission
  async function onSubmit(e) {
    e.preventDefault();
    setSaveErr("");
    setSaving(true);
    try {
      const normalizedItems = items
        .map((it) => ({
          type: String(it.type || "").trim().toLowerCase(),
          skill: String(it.skill || "").trim(),
        }))
        .filter((it) => it.skill);

      if (!firstName.trim() || !phone.trim() || !normalizedItems.length) {
        setSaveErr("Prénom, téléphone et au moins une compétence sont requis.");
        setSaving(false);
        return;
      }

      const body = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        items: normalizedItems,
      };

      const res = await fetch("/api/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": ADMIN_TOKEN,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur ajout");

      setEntries((prev) => [data.entry, ...prev]); // optimistic
      setFirstName(""); setLastName(""); setPhone(""); setItems([{ type: "offre", skill: "" }]);
    } catch (e) {
      setSaveErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  // Suppression
  async function onDelete(id) {
    if (!confirm("Supprimer cette entrée ?")) return;
    try {
      const res = await fetch("/api/entries", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": ADMIN_TOKEN,
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur suppression");
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      alert(String(e?.message || e));
    }
  }

  // --- Utils Highlight ---
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function Highlight({ text, query }) {
    if (!query) return <>{text}</>;
    try {
      const re = new RegExp(`(${escapeRegExp(query)})`, "ig");
      const parts = String(text).split(re);
      return parts.map((p, i) =>
        re.test(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>
      );
    } catch {
      return <>{text}</>;
    }
  }

  // --- Filtrage ---
  const filteredEntries = useMemo(() => {
    const qn = q.trim().toLowerCase();
    const tf = typeFilter;
    return entries.filter((e) => {
      const name = `${e.firstName || ""} ${e.lastName || ""}`.toLowerCase();
      const phone = String(e.phone || "").toLowerCase();
      const items = e.items || [];

      const matchesQuery =
        !qn ||
        name.includes(qn) ||
        phone.includes(qn) ||
        items.some(
          (it) =>
            String(it.skill || "").toLowerCase().includes(qn) ||
            String(it.type || "").toLowerCase().includes(qn)
        );

      if (!matchesQuery) return false;
      if (tf === "all") return true;

      const isOffre = tf === "offre";
      return items.some((it) =>
        String(it.type || "").toLowerCase().startsWith(isOffre ? "o" : "d")
      );
    });
  }, [entries, q, typeFilter]);

  // Groupes par compétence et suggestions basés sur l’ensemble filtré
  const bySkill = useMemo(() => {
    const map = new Map();
    for (const e of filteredEntries) {
      for (const it of e.items || []) {
        const skill = (it.skill || "").toLowerCase();
        if (!skill) continue;
        if (!map.has(skill)) map.set(skill, { skill, offers: [], demands: [] });
        const bucket = map.get(skill);
        const person = {
          id: e.id,
          name: `${e.firstName || ""} ${e.lastName || ""}`.trim(),
          phone: e.phone || "",
        };
        if ((it.type || "").toLowerCase().startsWith("d")) bucket.demands.push(person);
        else bucket.offers.push(person);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.offers.length + b.demands.length - (a.offers.length + a.demands.length)
    );
  }, [filteredEntries]);

  const suggestions = useMemo(() => {
    const out = [];
    for (const b of bySkill) {
      if (!b.offers.length || !b.demands.length) continue;
      const limit = Math.min(5, b.offers.length * b.demands.length);
      let c = 0;
      for (const o of b.offers) {
        for (const d of b.demands) {
          if (o.id === d.id) continue;
          out.push({ skill: b.skill, offer: o, demand: d });
          c++;
          if (c >= limit) break;
        }
        if (c >= limit) break;
      }
    }
    return out;
  }, [bySkill]);

  return (
    <div className="wrap">
      <h1>RERS — Réseau d’échanges réciproques de savoirs</h1>

      <section className="card">
        <h2>Ajouter une personne</h2>
        <form onSubmit={onSubmit} className="form">
          <div className="grid2">
            <label>
              Prénom*
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label>
              Nom
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
            <label>
              Téléphone*
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>

          <div className="items">
            <div className="itemsHead">
              <span>Type</span>
              <span>Compétence</span>
              <span></span>
            </div>
            {items.map((it, idx) => (
              <div className="itemRow" key={idx}>
                <select
                  value={it.type}
                  onChange={(e) => updateRow(idx, { type: e.target.value })}
                >
                  <option value="offre">Offre</option>
                  <option value="demande">Demande</option>
                </select>
                <input
                  placeholder="ex: couture, anglais, jardinage…"
                  value={it.skill}
                  onChange={(e) => updateRow(idx, { skill: e.target.value })}
                />
                <button
                  type="button"
                  className="btn subtle"
                  onClick={() => removeRow(idx)}
                  disabled={items.length === 1}
                  title="Supprimer cette ligne"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn" onClick={addRow}>
              + Ajouter une ligne
            </button>
          </div>

          {saveErr && <p className="err">Erreur ajout : {saveErr}</p>}
          <button className="btn primary" disabled={saving}>
            {saving ? "Envoi…" : "Enregistrer"}
          </button>
        </form>
      </section>

      <section className="card">
        <div className="headerRow">
          <h2>Personnes ({filteredEntries.length}/{entries.length})</h2>

          <div className="searchRow">
            <input
              className="search"
              placeholder="Rechercher (nom, tél., compétence, offre/demande)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button className="btn subtle" onClick={() => setQ("")} title="Effacer">
                Effacer
              </button>
            )}
            <select
              className="typeSelect"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              title="Filtrer par type"
            >
              <option value="all">Tous types</option>
              <option value="offre">Offres</option>
              <option value="demande">Demandes</option>
            </select>
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "Actualisation…" : "Recharger"}
            </button>
          </div>
        </div>

        {fetchErr && <p className="err">Erreur chargement : {fetchErr}</p>}

        <div className="list">
          {filteredEntries.map((e) => (
            <div key={e.id} className="entry">
              <div className="who">
                <strong>
                  <Highlight
                    text={`${e.firstName || ""} ${e.lastName || ""}`.trim()}
                    query={q}
                  />
                </strong>
                <div className="phone">
                  <Highlight text={e.phone} query={q} />
                </div>
              </div>
              <div className="chips">
                {(e.items || []).map((it, i) => {
                  const t = (it.type || "").toLowerCase();
                  const isDem = t.startsWith("d");
                  return (
                    <span key={i} className={"chip " + (isDem ? "dem" : "off")}>
                      <Highlight text={isDem ? "Demande" : "Offre"} query={q} /> ·{" "}
                      <Highlight text={it.skill} query={q} />
                    </span>
                  );
                })}
              </div>
              <button className="btn danger" onClick={() => onDelete(e.id)}>
                Supprimer
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Bulles par compétence</h2>
        <p className="muted">
          Taille = volume total (offres + demandes). Couleur verte/orange selon la proportion.
          (Filtré par votre recherche)
        </p>
        <div className="bubbles">
          {bySkill.map((b) => {
            const total = b.offers.length + b.demands.length;
            const size = Math.min(180, 70 + Math.round(20 * Math.sqrt(total)));
            const pctOff = total ? Math.round((b.offers.length / total) * 100) : 0;
            const deg = Math.round((pctOff / 100) * 360);
            const style = {
              width: size + "px",
              height: size + "px",
              background: `conic-gradient(#10b981 0 ${deg}deg, #f59e0b ${deg}deg 360deg)`,
            };
            return (
              <div key={b.skill} className="bubble" style={style} title={b.skill}>
                <div className="bubbleLabel">
                  <div className="bubbleSkill"><Highlight text={b.skill} query={q} /></div>
                  <div className="bubbleCounts">
                    <span className="offCount">{b.offers.length} off.</span>
                    <span className="demCount">{b.demands.length} dem.</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Suggestions de mises en relation</h2>
        {suggestions.length === 0 ? (
          <p className="muted">Aucune paire trouvée (ajoute des offres et des demandes sur une même compétence).</p>
        ) : (
          <ul className="suggests">
            {suggestions.map((s, i) => (
              <li key={i}>
                <strong><Highlight text={s.skill} query={q} /></strong> :{" "}
                <span className="tag off">{s.offer.name}</span> ↔{" "}
                <span className="tag dem">{s.demand.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <style jsx>{`
        .wrap { max-width: 1000px; margin: 24px auto; padding: 0 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
        h1 { font-size: 24px; margin-bottom: 16px; }
        h2 { font-size: 18px; margin: 0 0 12px; }
        .card { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 16px; margin: 16px 0; }
        .form label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
        input, select { padding: 10px; border: 1px solid #ddd; border-radius: 8px; }
        .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 12px; }
        .items { margin-top: 8px; }
        .itemsHead { display: grid; grid-template-columns: 140px 1fr 40px; font-size: 12px; color: #666; margin-bottom: 4px; }
        .itemRow { display: grid; grid-template-columns: 140px 1fr 40px; gap: 8px; margin: 6px 0; }
        .btn { border: 1px solid #ddd; background: #fafafa; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
        .btn:hover { background: #f2f2f2; }
        .btn.primary { background: #111827; color: #fff; border-color: #111827; }
        .btn.danger { background: #ef4444; color: #fff; border-color: #ef4444; }
        .btn.subtle { background: #fff; }
        .headerRow { display: flex; flex-direction: column; gap: 10px; }
        .searchRow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .search { flex: 1 1 280px; min-width: 220px; }
        .typeSelect { min-width: 150px; }
        .list { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
        .entry { display: grid; grid-template-columns: 1fr 2fr auto; gap: 10px; align-items: center; border: 1px solid #f1f1f1; border-radius: 10px; padding: 10px; }
        .who strong { font-size: 15px; }
        .phone { font-size: 12px; color: #666; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip { padding: 6px 10px; border-radius: 999px; font-size: 12px; }
        .chip.off { background: #e6f9f2; color: #065f46; border: 1px solid #b7f0df; }
        .chip.dem { background: #fff4e5; color: #92400e; border: 1px solid #fde6c7; }
        .err { color: #b91c1c; margin: 8px 0; }
        .muted { color: #6b7280; font-size: 13px; }
        .bubbles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; align-items: start; }
        .bubble { border-radius: 999px; position: relative; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 6px rgba(255,255,255,0.75), 0 4px 14px rgba(0,0,0,0.08); }
        .bubbleLabel { text-align: center; padding: 6px; }
        .bubbleSkill { font-weight: 600; font-size: 13px; text-transform: capitalize; color: #111; }
        .bubbleCounts { font-size: 12px; color: #444; display: flex; gap: 8px; justify-content: center; }
        .offCount { color: #065f46; }
        .demCount { color: #92400e; }
        .suggests { display: grid; gap: 8px; padding-left: 18px; }
        .tag { padding: 2px 8px; border-radius: 999px; font-size: 12px; }
        .tag.off { background: #e6f9f2; color: #065f46; border: 1px solid #b7f0df; }
        .tag.dem { background: #fff4e5; color: #92400e; border: 1px solid #fde6c7; }
        mark { background: #fff59d; padding: 0 2px; border-radius: 3px; }
      `}</style>
    </div>
  );
}
