// app/api/entries/route.js
import { list, put, del } from "@vercel/blob";

export const runtime = "edge";

// 1 fiche JSON par fichier : rers/entries/<id>.json
const PREFIX = "rers/entries/";

// --- utilitaires ---
const ok = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });

const err = (msg, status = 400) => ok({ error: msg }, status);
const isAdmin = (req) => req.headers.get("x-admin-token") === "87800";

// --- LISTER TOUTES LES FICHES ---
export async function GET() {
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const entries = [];
  for (const b of blobs) {
    try {
      const res = await fetch(b.url, { cache: "no-store" });
      if (res.ok) entries.push(await res.json());
    } catch {}
  }
  // Tri Nom puis Prénom (insensible aux accents/majuscules de base côté fr)
  entries.sort(
    (a, b) =>
      (a.lastName || "").localeCompare(b.lastName || "", "fr", { sensitivity: "base" }) ||
      (a.firstName || "").localeCompare(b.firstName || "", "fr", { sensitivity: "base" })
  );
  return ok({ entries });
}

// --- AJOUTER UNE FICHE ---
export async function POST(req) {
  if (!isAdmin(req)) return err("Unauthorized", 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON");
  }

  const id = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7);

  const items = Array.isArray(body.items)
    ? body.items
        .map((it) => ({
          type: it?.type === "offre" ? "offre" : "demande",
          skill: String(it?.skill || "").trim(),
        }))
        .filter((it) => it.skill)
    : [];

  const entry = {
    id,
    firstName: String(body.firstName || "").trim(),
    lastName: String(body.lastName || "").trim(),
    phone: String(body.phone || "").trim(),
    items,
    createdAt: new Date().toISOString(),
  };

  await put(`${PREFIX}${id}.json`, JSON.stringify(entry), {
    access: "public",
    contentType: "application/json; charset=utf-8",
  });

  return ok(entry, 201);
}

// --- SUPPRIMER UNE FICHE ---
export async function DELETE(req) {
  if (!isAdmin(req)) return err("Unauthorized", 401);

  const url = new URL(req.url);
  let id = url.searchParams.get("id") || "";

  if (!id) {
    try {
      const body = await req.json();
      if (body?.id) id = String(body.id);
    } catch {}
  }
  if (!id) id = req.headers.get("x-entry-id") || req.headers.get("x-id") || "";
  if (!id) return err("Missing id", 400);

  const path = `${PREFIX}${id}.json`;

  // Recherche robuste du blob cible
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const target = blobs.find((b) => b.pathname === path);

  if (!target) return err("Not found", 404);

  await del(target.url);
  return ok({ ok: true });
}

// --- METTRE À JOUR UNE FICHE (PATCH) ---
export async function PATCH(req) {
  if (!isAdmin(req)) return err("Unauthorized", 401);

  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get("id") || "").trim();
  if (!id) return err("Missing id", 400);

  const path = `${PREFIX}${id}.json`;

  // Localiser le blob existant
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const target = blobs.find((b) => b.pathname === path);
  if (!target) return err("Not found", 404);

  // Charger l'existant pour préserver createdAt si possible
  let current = {};
  try {
    const res = await fetch(target.url, { cache: "no-store" });
    if (res.ok) current = await res.json();
  } catch {}

  // Body reçu
  let body;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON");
  }

  // Nettoyage des items
  const items = Array.isArray(body.items)
    ? body.items
        .map((it) => ({
          type: it?.type === "offre" ? "offre" : "demande",
          skill: String(it?.skill || "").trim(),
        }))
        .filter((it) => it.skill)
    : current.items || [];

  const entry = {
    ...current,
    id,
    firstName:
      body.firstName !== undefined
        ? String(body.firstName || "").trim()
        : current.firstName || "",
    lastName:
      body.lastName !== undefined
        ? String(body.lastName || "").trim()
        : current.lastName || "",
    phone:
      body.phone !== undefined
        ? String(body.phone || "").trim()
        : current.phone || "",
    items,
    createdAt: current.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Pour éviter toute duplication de blob résiduel, on supprime puis on ré-écrit
  await del(target.url);
  await put(path, JSON.stringify(entry), {
    access: "public",
    contentType: "application/json; charset=utf-8",
  });

  return ok(entry, 200);
}
