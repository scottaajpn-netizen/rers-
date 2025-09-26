"use client";
import { useEffect, useMemo, useState } from "react";

const ADMIN = "87800";

export default function Home() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setErrMsg("");
    try {
      const res = await fetch("/api/entries", { cache: "no-store" });
      const data = await res.json();
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
    } catch (e) {
      setErrMsg("Erreur chargement: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id) {
    if (!id) {
      alert("ID manquant");
      return;
    }
    if (!confirm("Supprimer cette fiche ?")) return;

    try {
      const res = await fetch(`/api/entries?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": ADMIN },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Suppression échouée");
      await load();
    } catch (e) {
      alert("Erreur suppression: " + (e?.message || e));
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const text = `${e.firstName || ""} ${e.lastName || ""} ${
        e.phone || ""
      } ${
        Array.isArray(e.items)
          ? e.items.map((i) => `${i.type} ${i.skill}`).join(" ")
          : ""
      }`.toLowerCase();
      return text.includes(q);
    });
  }, [entries, search]);

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <h1 style={{ margin: "6px 0 14px" }}>RERS — Adhérents</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher nom, tel, offre/demande, compétence…"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #d0d7de",
          }}
        />
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #d0d7de",
            background: "#f6f8fa",
          }}
        >
          {loading ? "…" : "Recharger"}
        </button>
      </div>

      {errMsg && (
        <div style={{ color: "crimson", marginBottom: 10 }}>{errMsg}</div>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {filtered.map((e) => (
          <li
            key={e.id}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>
                  {e.firstName} {e.lastName}
                </div>
                <div style={{ fontSize: 12, color: "#555" }}>{e.phone}</div>
              </div>

              <button
                onClick={() => handleDelete(e.id)}
                title="Supprimer"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #fca5a5",
                  background: "#fee2e2",
                }}
              >
                Supprimer
              </button>
            </div>

            {Array.isArray(e.items) && e.items.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                {e.items.map((it, i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      background:
                        it.type === "offre" ? "#eaffea" : "#e8f0ff",
                      fontSize: 12,
                    }}
                  >
                    {it.type === "offre" ? "🟢 Offre" : "🔵 Demande"} ·{" "}
                    {it.skill}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {!loading && filtered.length === 0 && (
        <div style={{ color: "#666" }}>Aucun résultat.</div>
      )}
    </main>
  );
}
