"use client";

import { useEffect, useMemo, useState } from "react";

const ADMIN_TOKEN = "87800"; // mot de passe admin intégré

// ---------- Helpers ----------
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
  entries.forEach((e) => {
    e.items.forEach((it) => {
      if (!it.skill) return;
      const key = it.skill.toLowerCase();
      if (!map.has(key)) map.set(key, { skill: it.skill, offers: [], demands: [] });
      const slot = map.get(key);
      if (it.type === "offre") slot.offers.push(e);
      else slot.demands.push(e);
    });
  });
  return map;
}

export default function Page() {
  // data
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list"); // list | bubbles
  const [detailSkill, setDetailSkill] = useState(null);

  // form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState([{ type: "offre", skill: "" }]);

  // toast
  const [toast, setToast] = useState("");

  // fetch
  async function fetchEntries() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/entries?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.entries) ? data.entries.map(normalizeEntry) : [];
      list.sort((a, b) => {
        const ln = a.lastName.localeCompare(b.lastName, "fr", { sensitivity: "base" });
        if (ln !== 0) return ln;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
      setEntries(list);
    } catch (e) {
      console.error(e);
      setError("Erreur chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEntries();
  }, []);

  // search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const base = `${e.firstName} ${e.lastName} ${e.phone}`.toLowerCase().includes(q);
      const inSkills = e.items.some((it) => `${it.type} ${it.skill}`.toLowerCase().includes(q));
      return base || inSkills;
    });
  }, [entries, search]);

  // bubbles
  const skillMap = useMemo(() => buildSkillMap(filtered), [filtered]);
  const bubbles = useMemo(() => {
    const arr = Array.from(skillMap.values()).map((x) => {
      const total = x.offers.length + x.demands.length;
      const size = Math.max(72, Math.min(190, 70 + Math.sqrt(total) * 18));
      const kind = x.offers.length && x.demands.length ? "mix" : x.offers.length ? "offre" : "demande";
      return { ...x, total, size, kind };
    });
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [skillMap]);

  // form rows
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
      setFirstName("");
      setLastName("");
      setPhone("");
      setItems([{ type: "offre", skill: "" }]);
      await fetchEntries();
      pop("Fiche ajoutée ✅");
    } catch (e) {
      console.error(e);
      setError("Erreur ajout");
    } finally {
      setBusy(false);
    }
  }

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
      pop("Fiche supprimée 🗑️");
    } catch (e) {
      console.error(e);
      setError("Erreur suppression");
    } finally {
      setBusy(false);
    }
  }

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
      pop("Export JSON prêt 📦");
    } catch (e) {
      console.error(e);
      alert("Export impossible");
    }
  }

  function pop(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }

  return (
    <div className="wrap">
      {/* Topbar */}
      <header className="topbar">
        <div className="brand">
          <span className="logo">✳︎</span>
          <div>
            <div className="title">RERS</div>
            <div className="subtitle">Annuaire & Réseau d’échanges</div>
          </div>
        </div>

        <div className="actions">
          <div className="segment">
            <button
              className={`seg ${view === "list" ? "active" : ""}`}
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              title="Vue liste"
            >
              Liste
            </button>
            <button
              className={`seg ${view === "bubbles" ? "active" : ""}`}
              onClick={() => setView("bubbles")}
              aria-pressed={view === "bubbles"}
              title="Vue bulles"
            >
              Bulles
            </button>
          </div>

          <button className="btn ghost" onClick={() => fetchEntries()} disabled={loading}>
            {loading ? "Chargement…" : "Recharger"}
          </button>
          <button className="btn" onClick={handleExport}>Exporter</button>
        </div>
      </header>

      {/* Search bar */}
      <div className="searchbar">
        <input
          className="input"
          placeholder="Rechercher (nom, téléphone, compétence, offre/demande)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="counter">{filtered.length} fiches</span>
      </div>

      {/* Error / Toast */}
      {error ? <div className="alert error">{error}</div> : null}
      {toast ? <div className="toast">{toast}</div> : null}

      {/* Form */}
      <section className="card">
        <div className="cardHead">
          <h2>Ajouter une fiche</h2>
          <span className="hint">Renseigne le nom et ajoute une ou plusieurs lignes Offre/Demande</span>
        </div>

        <form onSubmit={handleAdd} className="form">
          <div className="grid2">
            <div className="field">
              <label>Prénom</label>
              <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="field">
              <label>Nom</label>
              <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Téléphone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06..." />
          </div>

          <div className="multi">
            <div className="multiHead">
              <h3>Offres / Demandes</h3>
              <button type="button" className="btn ghost" onClick={addItemRow}>+ Ajouter une ligne</button>
            </div>

            {items.map((it, idx) => (
              <div className="row" key={idx}>
                <div className="toggle">
                  <button
                    type="button"
                    className={`chip ${it.type === "offre" ? "chip-offre active" : "chip-offre"}`}
                    onClick={() => updateItem(idx, { type: "offre" })}
                  >
                    Offre
                  </button>
                  <button
                    type="button"
                    className={`chip ${it.type === "demande" ? "chip-demande active" : "chip-demande"}`}
                    onClick={() => updateItem(idx, { type: "demande" })}
                  >
                    Demande
                  </button>
                </div>
                <input
                  className="input skill"
                  placeholder="Compétence (ex: Couture, Tarot, Informatique...)"
                  value={it.skill}
                  onChange={(e) => updateItem(idx, { skill: e.target.value })}
                />
                {items.length > 1 && (
                  <button type="button" className="iconBtn danger" onClick={() => removeItemRow(idx)} title="Retirer cette ligne">
                    ✖
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="formActions">
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "En cours…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </section>

      {/* Content */}
      {view === "list" ? (
        <section className="card">
          <div className="cardHead">
            <h2>Liste des fiches</h2>
          </div>

          <div className="tableWrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Téléphone</th>
                  <th>Offres</th>
                  <th>Demandes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  filtered.map((e) => {
                    const offers = e.items.filter((it) => it.type === "offre").map((it) => it.skill);
                    const demands = e.items.filter((it) => it.type === "demande").map((it) => it.skill);
                    return (
                      <tr key={e.id}>
                        <td>
                          <div className="name">
                            <strong>{e.lastName} {e.firstName}</strong>
                            <span className="id">{e.id}</span>
                          </div>
                        </td>
                        <td>{e.phone || <span className="muted">—</span>}</td>
                        <td>
                          {offers.length ? (
                            <div className="badges">
                              {offers.map((s, i) => (
                                <span className="badge offre" key={i}>{s}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {demands.length ? (
                            <div className="badges">
                              {demands.map((s, i) => (
                                <span className="badge demande" key={i}>{s}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <button className="btn danger light" onClick={() => handleDelete(e.id)} disabled={busy}>
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                {loading && (
                  <tr>
                    <td colSpan={5}><div className="skeleton">Chargement…</div></td>
                  </tr>
                )}
                {!loading && !filtered.length && (
                  <tr>
                    <td colSpan={5}><em>Aucun résultat.</em></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="cardHead">
            <h2>Vue “bulles” par compétence</h2>
            <span className="hint">Clique une bulle pour voir les correspondances</span>
          </div>

          <div className="bubbles">
            {bubbles.map((b) => (
              <div
                key={b.skill}
                className={`bubble ${b.kind}`}
                style={{ width: b.size, height: b.size }}
                title={`${b.skill} • ${b.offers.length} offre(s), ${b.demands.length} demande(s)`}
                onClick={() => setDetailSkill(b)}
              >
                <div className="bubbleLabel">
                  <div className="bubbleTitle">{b.skill}</div>
                  <div className="bubbleMeta">{b.offers.length} off. · {b.demands.length} dem.</div>
                </div>
              </div>
            ))}
          </div>

          {detailSkill && (
            <div className="drawer">
              <div className="drawerInner">
                <div className="drawerHead">
                  <h3>Détail : {detailSkill.skill}</h3>
                  <button className="iconBtn" onClick={() => setDetailSkill(null)} title="Fermer">✕</button>
                </div>
                <div className="cols">
                  <div>
                    <div className="colHead">Offres ({detailSkill.offers.length})</div>
                    {detailSkill.offers.length ? (
                      <ul className="list">
                        {detailSkill.offers.map((e) => (
                          <li key={`o-${detailSkill.skill}-${e.id}`}>
                            <strong>{e.lastName} {e.firstName}</strong> <span className="muted">— {e.phone || "—"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <div className="muted">Aucune offre</div>}
                  </div>
                  <div>
                    <div className="colHead">Demandes ({detailSkill.demands.length})</div>
                    {detailSkill.demands.length ? (
                      <ul className="list">
                        {detailSkill.demands.map((e) => (
                          <li key={`d-${detailSkill.skill}-${e.id}`}>
                            <strong>{e.lastName} {e.firstName}</strong> <span className="muted">— {e.phone || "—"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <div className="muted">Aucune demande</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="foot">
        Pense à faire un <strong>Export</strong> de temps en temps (sauvegarde locale).
      </footer>

      {/* ------------ Styles ------------- */}
      <style jsx global>{`
        :root{
          --bg: #f6f8ff;
          --bg2:#eef2ff;
          --panel: rgba(255,255,255,.78);
          --border:#e5e7eb;
          --shadow: 0 10px 30px rgba(2,6,23,.08);
          --brand: #7c3aed;
          --brand2: #06b6d4;
          --ok:#10b981;
          --warn:#f59e0b;
          --danger:#ef4444;
          --ink:#0f172a;
          --muted:#6b7280;
        }
        *{box-sizing:border-box}
        body{margin:0;background: linear-gradient(160deg,var(--bg),var(--bg2)); color:var(--ink);}
        .wrap{max-width:1100px;margin:0 auto;padding:20px;}
        .topbar{
          display:flex;align-items:center;justify-content:space-between;gap:12px;
          padding:14px 16px;border-radius:16px;
          background: radial-gradient(140% 120% at 0% 0%, #8b5cf6 0%, #22d3ee 60%, #ffffff 100%);
          color:#0b1020; box-shadow:var(--shadow);
          border:1px solid rgba(255,255,255,.5);
        }
        .brand{display:flex;align-items:center;gap:12px}
        .logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;
          background:rgba(255,255,255,.85); font-weight:900; color:#6d28d9;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,.04);
        }
        .title{font-weight:800; letter-spacing:.2px}
        .subtitle{font-size:12px; opacity:.8}
        .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .segment{display:flex;background:rgba(255,255,255,.5); padding:4px;border-radius:10px; gap:4px}
        .seg{border:0;background:transparent;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:600}
        .seg.active{background:#fff; box-shadow: 0 1px 0 rgba(0,0,0,.03);}

        .searchbar{display:flex;align-items:center;gap:10px;margin:14px 0}
        .input{
          width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--border);
          background:#fff; outline:none; transition: box-shadow .15s,border .15s;
        }
        .input:focus{box-shadow:0 0 0 4px rgba(124,58,237,.12); border-color:#c4b5fd}
        .counter{font-size:12px;color:var(--muted);padding:6px 10px;background:#fff;border:1px solid var(--border);border-radius:999px}

        .btn{
          border:1px solid #6d28d9;background:linear-gradient(180deg,#8b5cf6,#7c3aed);
          color:#fff;padding:9px 12px;border-radius:10px;cursor:pointer;font-weight:700;
          box-shadow:0 6px 16px rgba(124,58,237,.25);
        }
        .btn:hover{filter:brightness(1.03)}
        .btn.ghost{
          background:#fff;border:1px solid var(--border);color:#111;box-shadow:none
        }
        .btn.danger{border-color:var(--danger);background:linear-gradient(180deg,#f87171,#ef4444)}
        .btn.danger.light{background:#fff;color:var(--danger);border-color:#fecaca}
        .btn.primary{border-color:#2563eb;background:linear-gradient(180deg,#60a5fa,#3b82f6);}

        .alert{padding:10px 12px;border-radius:12px;margin:10px 0;border:1px solid var(--border);}
        .alert.error{background:#fff1f2;color:#991b1b;border-color:#fecdd3}

        .toast{
          position:fixed; right:20px; bottom:20px; z-index:30;
          background:#111; color:#fff; padding:10px 12px; border-radius:10px;
          box-shadow:0 10px 30px rgba(0,0,0,.25); opacity:.96;
          animation: pop .18s ease-out;
        }
        @keyframes pop{from{transform:scale(.92);opacity:.7}to{transform:scale(1);opacity:.96}}

        .card{
          background:var(--panel); border:1px solid rgba(255,255,255,.6);
          border-radius:16px; padding:14px; box-shadow: var(--shadow);
          backdrop-filter: blur(6px);
        }
        .card + .card{margin-top:14px}
        .cardHead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}
        .card h2{margin:0}
        .hint{font-size:12px;color:var(--muted)}

        .form .grid2{display:grid; grid-template-columns:1fr 1fr; gap:10px}
        @media (max-width:780px){ .form .grid2{grid-template-columns:1fr} }
        .field{display:flex;flex-direction:column;gap:6px}
        .field label{font-size:12px;color:#374151;font-weight:600}
        .multi{margin-top:10px}
        .multiHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .row{display:flex;gap:8px;align-items:center;margin-bottom:8px; flex-wrap:wrap}
        .toggle{display:flex;gap:6px;background:#fafafa;border:1px solid var(--border);padding:4px;border-radius:999px}
        .chip{border:0;background:transparent;padding:6px 10px;border-radius:999px;cursor:pointer;font-weight:700}
        .chip-offre{color:#047857}
        .chip-demande{color:#b45309}
        .chip.active{background:#fff; box-shadow: inset 0 0 0 1px rgba(0,0,0,.05)}
        .skill{min-width:280px;flex:1}
        .iconBtn{border:1px solid var(--border); background:#fff; padding:6px 9px; border-radius:10px; cursor:pointer}
        .iconBtn.danger{color:var(--danger);border-color:#fecaca}
        .formActions{display:flex;justify-content:flex-end;margin-top:8px}

        .tableWrap{overflow:auto}
        .tbl{width:100%; border-collapse: collapse}
        .tbl th,.tbl td{border-bottom:1px solid #eef2ff; padding:10px 8px; text-align:left; vertical-align:top}
        .tbl thead th{font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:#475569}
        .name{display:flex;flex-direction:column}
        .id{font-size:11px;color:#94a3b8}
        .muted{color:#6b7280}
        .badges{display:flex; gap:6px; flex-wrap:wrap}
        .badge{padding:4px 8px; border-radius:999px; font-size:12px; border:1px solid var(--border); background:#fff}
        .badge.offre{border-color:#bbf7d0; background:#ecfdf5; color:#065f46}
        .badge.demande{border-color:#fde68a; background:#fffbeb; color:#92400e}
        .skeleton{height:16px;background:linear-gradient(90deg,#f1f5f9, #e2e8f0, #f1f5f9); background-size:200% 100%; animation:sh 1.2s infinite}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}

        .bubbles{display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start}
        .bubble{
          display:flex; align-items:center; justify-content:center; text-align:center; padding:8px;
          border-radius:50%; cursor:pointer; user-select:none; color:#0b1020;
          box-shadow: 0 8px 20px rgba(15,23,42,.12), inset 0 0 0 2px rgba(255,255,255,.65);
          transition: transform .12s ease-out, box-shadow .12s ease-out;
        }
        .bubble:hover{ transform: translateY(-2px); box-shadow: 0 12px 26px rgba(15,23,42,.16), inset 0 0 0 2px rgba(255,255,255,.9);}
        .bubble.offre{ background: radial-gradient(100% 100% at 30% 30%, #bbf7d0, #34d399);}
        .bubble.demande{ background: radial-gradient(100% 100% at 30% 30%, #fde68a, #f59e0b);}
        .bubble.mix{ background: radial-gradient(100% 100% at 30% 30%, #e9d5ff, #8b5cf6);}
        .bubbleLabel{line-height:1.2}
        .bubbleTitle{font-weight:800}
        .bubbleMeta{font-size:12px; opacity:.85}

        .drawer{
          position: fixed; inset: 0; background: rgba(2,6,23,.35);
          display:flex; align-items:flex-end; justify-content:center; padding:20px;
        }
        .drawerInner{
          width:min(900px, 100%); background:#fff; border-radius:16px; padding:16px; box-shadow:var(--shadow);
        }
        .drawerHead{display:flex; align-items:center; justify-content:space-between; margin-bottom:8px}
        .cols{display:grid; grid-template-columns:1fr 1fr; gap:16px}
        @media (max-width:780px){ .cols{grid-template-columns:1fr} }
        .colHead{font-weight:800; margin-bottom:6px}
        .list{margin:0; padding-left:18px}
        .foot{margin:14px 0; color:#64748b; font-size:13px; text-align:center}
      `}</style>
    </div>
  );
}
