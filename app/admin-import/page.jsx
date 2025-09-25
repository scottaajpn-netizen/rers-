"use client";
import { useState } from "react";

export default function AdminImportPage() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");

  async function loadCurrent() {
    setStatus("Chargement en cours…");
    try {
      const resp = await fetch("/api/entries", { cache: "no-store" });
      const data = await resp.json();
      setText(JSON.stringify(data, null, 2));
      setStatus("Jeu de données actuel chargé.");
    } catch (e) {
      setStatus("Erreur de chargement.");
    }
  }

  async function overwrite() {
    setStatus("Vérification du JSON…");
    let entries = null;
    try {
      const parsed = JSON.parse(text);
      entries = Array.isArray(parsed) ? parsed : parsed.entries;
      if (!Array.isArray(entries)) throw new Error("Format attendu: {entries:[...]} ou [...].");
    } catch (e) {
      setStatus("JSON invalide : " + e.message);
      return;
    }

    setStatus("Remplacement en cours…");
    try {
      const resp = await fetch("/api/entries?overwrite=1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": "87800",
        },
        body: JSON.stringify({ entries }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatus("Erreur: " + (data?.error || resp.status));
        return;
      }
      setStatus(`OK : ${data.replaced} entrées remplacées. Actualise la page principale.`);
    } catch (e) {
      setStatus("Erreur réseau: " + e.message);
    }
  }

  function downloadBackup() {
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rers-backup.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Import / Remplacement des données (admin)
      </h1>
      <p style={{ marginBottom: 12 }}>
        1) Clique « Charger actuel » pour voir le JSON en place (facultatif).<br/>
        2) Colle ici ton JSON complet (soit <code>{'{ entries:[...] }'}</code>, soit directement une liste <code>[...]</code>).<br/>
        3) Clique « Remplacer TOUT ».
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={loadCurrent}>Charger actuel</button>
        <button onClick={overwrite}>Remplacer TOUT</button>
        <button onClick={downloadBackup}>Télécharger le texte affiché</button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Colle ici ton JSON…'
        style={{ width: "100%", height: 420, fontFamily: "monospace", fontSize: 13 }}
      />
      <div style={{ marginTop: 10, color: "#555" }}>{status}</div>
    </div>
  );
}
