"use client";

import { useEffect, useMemo, useState } from "react";

const ADMIN_TOKEN = "87800"; // mot de passe admin intégré comme demandé

// petits styles inline (pas de dépendances)
const styles = {
  container: { maxWidth: 1100, margin: "0 auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  bar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
  input: { padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8, minWidth: 160 },
  btn: { padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer" },
  btnPrimary: { padding: "8px 12px", borderRadius: 8, border: "1px solid #3b82f6", background: "#3b82f6", color: "#fff", cursor: "pointer" },
  pill: { padding: "2px 8px", borderRadius: 999, fontSize: 12, border: "1px solid #ddd", background: "#f7f7f7" },
  card: { border: "1px solid #eee", borderRadius: 12, padding: 12, marginBottom: 10 },
  table: { width: "100%", borderCollapse: "collapse" },
  thtd: { borderBottom: "1px solid #eee", padding: "8px 6px", textAlign: "left", verticalAlign: "top" },
  bubbleWrap: { display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" },
  bubble: (size, bg, border) => ({
    width: size,
    height: size,
    borderRadius: "50%",
    background: bg,
    border: `2px solid ${border}`,
    color: "#111",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 8,
    boxSizing: "border-box",
    cursor: "pointer",
    userSelect: "none",
  }),
  bubbleLabel: { fontSize: 12, lineHeight: 1.2 },
  small: { color: "#666", fontSize: 12 },
};

// Normalisation pour gérer les anciennes fiches {type, skills} => {items:[...]}
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

// Regroupe par compétence
function buildSkillMap(entries) {
  const map = new Map();
  entries.forEach((e) => {
    e.items.forEach((it) => {
      if (!it.skill) return;
      const key = it.skill.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { skill: it.skill, offers: [], demands: [] });
      }
      const slot = map.get(key);
      if (it.type === "offre") slot.offers.push(e);
      else slot.demands.push(e);
    });
  });
  return map;
}

export default function Page() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("list"); // "list" | "bubbles"
  const [detailSkill, setDetailSkill] = useState(null); // { skill, offers, demands } ou null

  // Formulaire
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState([{ type: "offre", skill: "" }]); // lignes dynamiques

  // ---------- Chargement ----------
  async function fetchEntries() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/entries?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.entries) ? data.entries.map(normalizeEntry) : [];
      // tri par nom puis date (desc)
      list.sort((a, b) => {
        const ln = a.lastName.localeCompare(b.lastName, "fr", { sensitivity: "base" });
        if (ln !== 0) return ln;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
      setEntries(list);
    } catch (e) {
      setError("Erreur chargement");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    fetchEntries();
  }, []);

  // ---------- Recherche ----------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const base =
        `${e.firstName} ${e.lastName} ${e.phone}`.toLowerCase().includes(q);
      const inSkills = e.items.some((it) =>
        `${it.type} ${it.skill}`.toLowerCase().includes(q)
      );
      return base || inSkills;
    });
  }, [entries, search]);

  // ---------- Vue bulles ----------
  const skillMa
