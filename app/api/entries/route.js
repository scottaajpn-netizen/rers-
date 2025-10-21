// app/api/entries/route.js
import { list, put, del } from "@vercel/blob";

export const runtime = "edge";

// On stocke 1 fichier JSON par fiche (plus fiable que data.json unique)
const PREFIX = "rers/entries/";

// --- petits utilitaires ---
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
  // tri simple : Nom puis Prénom
  entries.sort(
    (a, b) =>
      (a.lastName || "").localeCompare(b.lastName || "") ||
      (a.firstName || "").localeCompare(b.firstName || "")
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

  const id =
    String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7);

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

  // IMPORTANT: access "public" pour éviter les erreurs d’accès
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

  // tolérant : accepte aussi le body { id: "..." } ou des headers alternatifs
  if (!id) {
    try {
      const body = await req.json();
      if (body?.id) id = String(body.id);
    } catch {}
  }
  if (!id) id = req.headers.get("x-entry-id") || req.headers.get("x-id") || "";

  if (!id) return err("Missing id", 400);

  const path = `${PREFIX}${id}.json`;
  const { blobs } = await list({ prefix: path, limit: 1 });
  const target = blobs?.[0] && blobs[0].pathname === path ? blobs[0] : null;

  if (!target) return err("Not found", 404);

  await del(target.url);
  return ok({ ok: true });
}
// --- METTRE À JOUR UNE FICHE EXISTANTE (PATCH) ---
export async function PATCH(req) {
  if (!isAdmin(req)) return err("Unauthorized", 401);

  const url = new URL(req.url);
  let id = url.searchParams.get("id") || "";

  if (!id) return err("Missing id", 400);

  const path = `${PREFIX}${id}.json`;

  // Vérifie si la fiche existe déjà
  const { blobs } = await list({ prefix: path, limit: 1 });
  const target = blobs?.[0] && blobs[0].pathname === path ? blobs[0] : null;
  if (!target) return err("Not found", 404);

  // Charge la fiche actuelle
  let current = {};
  try {
    const res = await fetch(target.url, { cache: "no-store" });
    if (res.ok) current = await res.json();
  } catch {}

  // Lit les nouvelles données envoyées par le site
  let body;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON");
  }

  // Met à jour les champs
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
    firstName: String(body.firstName || current.firstName || "").trim(),
    lastName: String(body.lastName || current.lastName || "").trim(),
    phone: String(body.phone || current.phone || "").trim(),
    items,
    updatedAt: new Date().toISOString(),
  };

  // Enregistre la nouvelle version (remplace l’ancien fichier)
  await put(path, JSON.stringify(entry), {
    access: "public",
    contentType: "application/json; charset=utf-8",
  });

  return ok(entry, 200);
}

