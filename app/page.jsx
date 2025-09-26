"use client";

import { useEffect, useMemo, useState } from "react";

const ADMIN_TOKEN = "87800"; // mot de passe admin

// ---------- utils ----------
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
function buildSkillMap(entries) {
  const map = new Map();
  entries.forEach((e) =>
    e.items.forEach((it) => {
      if (!it.skill) return;
      const k = it.skill.toLowerCase();
      if (!map.has(k)) map.set(k, { skill: it.skill, offers: [], demands: [] });
      const b = map.get(k);
      (it.type === "offre" ? b.offers : b.demands).push(e);
    })
  );
  return map;
}
function initials(first, last) {
  const a = (last || "").trim()[0] || "";
  const b = (first || "").trim()[0] || "";
  return (a + b).toUpperCase();
}

// ---------- page ----------
export default function Page() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list"); // list | bubbles
  const [detailSkill, setDetailSkill] = useState(null);

  // form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState([{ type: "offre", skill: "" }]);

  async function fetchEntries() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/entries?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.entries) ? data.entries.map(normalizeEntry) : [];
      list.sort((a, b) => a.lastName.localeCompare(b.lastName, "fr", { sensitivity: "base" }));
      setEntries(list);
    } catch (e) {
      console.error(e);
      setError("Erreur chargement.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { fetchEntries(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const base = `${e.firstName} ${e.lastName} ${e.phone}`.toLowerCase().includes(q);
      const inSkills = e.items.some((it) => `${it.type} ${it.skill}`.toLowerCase().includes(q));
      return base || inSkills;
    });
  }, [entries, search]);

  const skillMap = useMemo(() => buildSkillMap(filtered), [filtered]);
  const bubbles = useMemo(() => {
    const arr = Array.from(skillMap.values()).map((x) => {
      const total = x.offers.length + x.demands.length;
      const size = Math.max(72, Math.min(180, 68 + Math.sqrt(total) * 18));
      const kind = x.offers.length && x.demands.length ? "mix" : x.offers.length ? "offre" : "demande";
      return { ...x, total, size, kind };
    });
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [skillMap]);

  // form helpers
  function updateItem(i, patch) { setItems((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it))); }
  function addItemRow() { setItems((p) => [...p, { type: "demande", skill: "" }]); }
  function removeItemRow(i) { setItems((p) => p.filter((_, idx) => idx !== i)); }

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
      const body = { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), items: cleanItems };
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setFirstName(""); setLastName(""); setPhone(""); setItems([{ type: "offre", skill: "" }]);
      await fetchEntries(); pop("Fiche ajoutée ✅");
    } catch (e) { console.error(e); setError("Erreur ajout."); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!id || !confirm("Supprimer cette fiche ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/entries?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": ADMIN_TOKEN } });
      if (!res.ok) throw new Error(await res.text());
      await fetchEntries(); pop("Fiche supprimée 🗑️");
    } catch (e) { console.error(e); setError("Erreur suppression."); }
    finally { setBusy(false); }
  }

  async function handleExport() {
    try {
      const res = await fetch(`/api/entries?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rers-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      a.click(); URL.revokeObjectURL(url); pop("Export JSON prêt 📦");
    } catch { alert("Export impossible"); }
  }
  function pop(m) { setToast(m); setTimeout(() => setToast(""), 1700); }

  return (
    <div className="wrap">
      {/* header */}
      <header className="top">
        <div className="brand">
          <div className="glyph">✴︎</div>
          <div className="btxt">
            <h1>RERS</h1>
            <p>Annuaire — échanges de savoirs</p>
          </div>
        </div>
        <div className="controls">
          <div className="seg">
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>Liste</button>
            <button className={view === "bubbles" ? "on" : ""} onClick={() => setView("bubbles")}>Bulles</button>
          </div>
          <button className="btn ghost" onClick={fetchEntries}>{loading ? "…" : "Recharger"}</button>
          <button className="btn" onClick={handleExport}>Exporter</button>
        </div>
      </header>

      {/* search */}
      <div className="search">
        <input
          className="input"
          placeholder="Rechercher (nom, téléphone, compétence, offre/demande)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="pill">{filtered.length} fiches</span>
      </div>

      {error && <div className="alert">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      {/* form */}
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
              <button type="button" className="btn ghost" onClick={addItemRow}>+ Ajouter une ligne</button>
            </div>
            {items.map((it, i) => (
              <div className="row" key={i}>
                <div className="chips">
                  <button type="button" className={`chip ${it.type === "offre" ? "on offre" : "offre"}`} onClick={() => updateItem(i, { type: "offre" })}>Offre</button>
                  <button type="button" className={`chip ${it.type === "demande" ? "on demande" : "demande"}`} onClick={() => updateItem(i, { type: "demande" })}>Demande</button>
                </div>
                <input className="input skill" placeholder="Ex: Couture, Tarot, Informatique…" value={it.skill} onChange={(e) => updateItem(i, { skill: e.target.value })}/>
                {items.length > 1 && <button type="button" className="icon danger" onClick={() => removeItemRow(i)} title="Retirer">✕</button>}
              </div>
            ))}
          </div>

          <div className="actions">
            <button className="btn primary" disabled={busy} type="submit">{busy ? "En cours…" : "Enregistrer"}</button>
          </div>
        </form>
      </section>

      {/* content */}
      {view === "list" ? (
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
                  const offers = e.items.filter((it) => it.type === "offre").map((it) => it.skill);
                  const demands = e.items.filter((it) => it.type === "demande").map((it) => it.skill);
                  return (
                    <tr key={e.id} title={`${e.lastName} ${e.firstName}`}>
                      <td>
                        <div className="who">
                          <div className="avatar" aria-hidden="true">{initials(e.firstName, e.lastName)}</div>
                          <div className="wcol">
                            <strong>{e.lastName} {e.firstName}</strong>
                            {/* ID retiré de l’affichage */}
                          </div>
                        </div>
                      </td>
                      <td>
                        {e.phone ? (
                          <a className="tel" href={`tel:${e.phone.replace(/\s+/g, "")}`}>{e.phone}</a>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        {offers.length ? (
                          <div className="tags">{offers.map((s, i) => <span className="tag off" key={i}>{s}</span>)}</div>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        {demands.length ? (
                          <div className="tags">{demands.map((s, i) => <span className="tag dem" key={i}>{s}</span>)}</div>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td className="right">
                        <button className="btn danger light" onClick={() => handleDelete(e.id)} disabled={busy}>Supprimer</button>
                      </td>
                    </tr>
                  );
                })}
                {loading && (
                  <tr><td colSpan={5}><div className="skeleton">Chargement…</div></td></tr>
                )}
                {!loading && !filtered.length && (
                  <tr><td colSpan={5}><em>Aucun résultat.</em></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="cardHead"><h2>Bulles par compétence</h2><span className="hint">Clique pour voir les correspondances</span></div>
          <div className="bubbles">
            {bubbles.map((b) => (
              <div
                key={b.skill}
                className={`bubble ${b.kind}`}
                style={{ width: b.size, height: b.size }}
                onClick={() => setDetailSkill(b)}
                title={`${b.skill} • ${b.offers.length} offre(s), ${b.demands.length} demande(s)`}
              >
                <div className="bLbl">
                  <div className="bTitle">{b.skill}</div>
                  <div className="bMeta">{b.offers.length} off. · {b.demands.length} dem.</div>
                </div>
              </div>
            ))}
          </div>

          {detailSkill && (
            <div className="drawer" onClick={() => setDetailSkill(null)}>
              <div className="drawerInner" onClick={(e) => e.stopPropagation()}>
                <div className="dHead">
                  <h3>{detailSkill.skill}</h3>
                  <button className="icon" onClick={() => setDetailSkill(null)}>✕</button>
                </div>
                <div className="cols">
                  <div>
                    <div className="colTitle">Offres ({detailSkill.offers.length})</div>
                    {detailSkill.offers.length ? (
                      <ul className="list">
                        {detailSkill.offers.map((e) => <li key={`o-${e.id}`}><strong>{e.lastName} {e.firstName}</strong> <span className="muted">— {e.phone || "—"}</span></li>)}
                      </ul>
                    ) : <div className="muted">Aucune offre</div>}
                  </div>
                  <div>
                    <div className="colTitle">Demandes ({detailSkill.demands.length})</div>
                    {detailSkill.demands.length ? (
                      <ul className="list">
                        {detailSkill.demands.map((e) => <li key={`d-${e.id}`}><strong>{e.lastName} {e.firstName}</strong> <span className="muted">— {e.phone || "—"}</span></li>)}
                      </ul>
                    ) : <div className="muted">Aucune demande</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="foot">Pense à exporter régulièrement (sauvegarde locale).</footer>

      {/* styles */}
      <style jsx global>{`
        /* Font & reset */
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box}
        body{margin:0;font-family:"Plus Jakarta Sans",system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:linear-gradient(160deg,#f7f9ff,#eef2ff);color:#0f172a}

        :root{
          --panel:#ffffffcc; --border:#e6e9f5; --shadow:0 10px 30px rgba(15,23,42,.08);
          --brand:#6366f1; --brand2:#06b6d4; --ok:#10b981; --warn:#f59e0b; --danger:#ef4444;
          --ink:#0f172a; --muted:#64748b;
        }

        .wrap{max-width:1100px;margin:0 auto;padding:20px}

        .top{
          display:flex;justify-content:space-between;align-items:center;gap:12px;
          background:linear-gradient(120deg,#eef2ff 0%, #fff 30%, #e0f7ff 100%);
          border:1px solid #ffffff; border-radius:16px; padding:14px 16px; box-shadow:var(--shadow)
        }
        .brand{display:flex;align-items:center;gap:12px}
        .glyph{
          width:40px;height:40px;border-radius:12px;display:grid;place-items:center;
          background:radial-gradient(120% 120% at 0% 0%, #a5b4fc 0%, #67e8f9 80%); color:#0b1020; font-weight:900
        }
        .btxt h1{font-size:18px;margin:0;font-weight:800}
        .btxt p{margin:0;color:var(--muted);font-size:12px}
        .controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .seg{display:flex;gap:4px;border-radius:10px;background:#f4f6ff;border:1px solid var(--border);padding:4px}
        .seg button{border:0;background:transparent;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:700}
        .seg .on{background:#fff; box-shadow:inset 0 -2px 0 #eaeefe}

        .btn{border:1px solid #7780ff;background:linear-gradient(180deg,#7c83ff,#646cff);color:#fff;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer;box-shadow:0 8px 18px rgba(99,102,241,.25)}
        .btn:hover{filter:brightness(1.03)}
        .btn.ghost{background:#fff;color:#111;border:1px solid var(--border);box-shadow:none}
        .btn.primary{border-color:#3b82f6;background:linear-gradient(180deg,#66a6ff,#3b82f6)}
        .btn.danger{border-color:#fecaca;background:linear-gradient(180deg,#ff8b8b,#ef4444)}
        .btn.danger.light{background:#fff;color:#ef4444;border-color:#fecaca}

        .search{display:flex;align-items:center;gap:10px;margin:14px 0}
        .input{width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:#fff;outline:none}
        .input:focus{box-shadow:0 0 0 4px rgba(99,102,241,.12)}
        .pill{font-size:12px;color:var(--muted);padding:6px 10px;background:#fff;border:1px solid var(--border);border-radius:999px}

        .alert{padding:10px 12px;border-radius:12px;margin:10px 0;border:1px solid #ffd1d6;background:#fff1f2;color:#991b1b}
        .toast{position:fixed;right:20px;bottom:20px;background:#111;color:#fff;padding:10px 12px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25)}

        .card{background:var(--panel);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.7);border-radius:16px;padding:14px;box-shadow:var(--shadow)}
        .card + .card{margin-top:14px}
        .cardHead{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
        .card h2{margin:0}
        .hint{font-size:12px;color:var(--muted)}

        .form .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        @media (max-width:780px){.form .grid2{grid-template-columns:1fr}}
        .field{display:flex;flex-direction:column;gap:6px}
        .field label{font-size:12px;color:#475569;font-weight:700}
        .multi{margin-top:10px}
        .multiHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .row{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
        .chips{display:flex;gap:6px;background:#f8fafc;border:1px solid var(--border);padding:4px;border-radius:999px}
        .chip{border:0;background:transparent;padding:6px 10px;border-radius:999px;cursor:pointer;font-weight:800}
        .chip.on{background:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
        .chip.offre{color:#047857}.chip.demande{color:#a16207}
        .skill{min-width:280px;flex:1}
        .icon{border:1px solid var(--border);background:#fff;padding:6px 9px;border-radius:10px;cursor:pointer}
        .icon.danger{color:#ef4444;border-color:#fecaca}
        .actions{display:flex;justify-content:flex-end;margin-top:8px}

        .tableWrap{overflow:auto}
        .tbl{width:100%;border-collapse:collapse}
        .tbl th,.tbl td{border-bottom:1px solid #eef2ff;padding:12px 8px;text-align:left;vertical-align:top}
        .tbl thead th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#475569}
        .who{display:flex;align-items:center;gap:10px}
        .avatar{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-weight:900;color:#0b1020;background:radial-gradient(120% 120% at 0% 0%, #a5b4fc 0%, #67e8f9 80%)}
        .wcol strong{font-weight:800}
        .right{text-align:right}
        .tel{text-decoration:none;color:#0f172a}
        .muted{color:#6b7280}
        .tags{display:flex;gap:6px;flex-wrap:wrap}
        .tag{padding:4px 9px;border-radius:999px;font-size:12px;border:1px solid var(--border);background:#fff}
        .tag.off{border-color:#bbf7d0;background:#f0fdf4;color:#065f46}
        .tag.dem{border-color:#fde68a;background:#fffbeb;color:#92400e}
        .skeleton{height:16px;background:linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9);background-size:200% 100%;animation:sh 1.1s infinite}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}

        .bubbles{display:flex;flex-wrap:wrap;gap:16px}
        .bubble{display:flex;align-items:center;justify-content:center;border-radius:50%;text-align:center;color:#0b1020;padding:8px;cursor:pointer;user-select:none;box-shadow:0 8px 20px rgba(15,23,42,.12), inset 0 0 0 2px rgba(255,255,255,.7);transition:transform .12s, box-shadow .12s}
        .bubble:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(15,23,42,.16), inset 0 0 0 2px rgba(255,255,255,.9)}
        .bubble.offre{background:radial-gradient(100% 100% at 30% 30%, #bbf7d0, #34d399)}
        .bubble.demande{background:radial-gradient(100% 100% at 30% 30%, #fde68a, #f59e0b)}
        .bubble.mix{background:radial-gradient(100% 100% at 30% 30%, #e9d5ff, #8b5cf6)}
        .bLbl{line-height:1.2}
        .bTitle{font-weight:800}
        .bMeta{font-size:12px;opacity:.85}

        .drawer{position:fixed;inset:0;background:rgba(2,6,23,.35);display:flex;align-items:flex-end;justify-content:center;padding:20px}
        .drawerInner{width:min(900px,100%);background:#fff;border-radius:16px;padding:16px;box-shadow:var(--shadow)}
        .dHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        @media (max-width:780px){.cols{grid-template-columns:1fr}}
        .colTitle{font-weight:800;margin-bottom:6px}
        .list{margin:0;padding-left:18px}

        .foot{margin:14px 0;color:#64748b;font-size:13px;text-align:center}
      `}</style>
    </div>
  );
}
