// app/api/entries/route.js
import { list, put } from "@vercel/blob";

export const runtime = "edge";
const KEY = "rers/data.json";

// --- helpers ---
async function ensureFile() {
  const { blobs } = await list({ prefix: KEY, limit: 1000 });
  const exact = blobs.find((b) => b.pathname === KEY);
  if (!exact) {
    const init = { entries: [] };
    const res = await put(KEY, JSON.stringify(init, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });
    return { url: res.url, entries: [] };
  }
  const resp = await fetch(exact.url, { cache: "no-store" });
  if (!resp.ok) return { url: exact.url, entries: [] };
  const json = await resp.json().catch(() => ({ entries: [] }));
  const entries = Array.isArray(json.entries) ? json.entries : [];
  return { url: exact.url, entries };
}

function normalizeEntry(e) {
  if (Array.isArray(e.items)) {
    return {
      id: String(e.id || ""),
      firstName: String(e.firstName || "").trim(),
      lastName: String(e.lastName || "").trim(),
      phone: String(e.phone || "").trim(),
      items: e.items
        .filter((it) => it && it.type && it.skill)
        .map((it) => ({
          type: String(it.type).toLowerCase() === "offre" ? "offre" : "demande",
          skill: String(it.skill).trim(),
        })),
      createdAt: e.createdAt || new Date().toISOString(),
    };
  }
  // Ancien format: { type, skills: "A, B, C" }
  const legacyType = String(e.type || "").toLowerCase();
  const baseType = legacyType.includes("offre") ? "offre" : "demande";
  const skillsRaw = String(e.skills || "");
  const skills = skillsRaw
    .split(/[,;|]/g)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    id: String(e.id || ""),
    firstName: String(e.firstName || "").trim(),
    lastName: String(e.lastName || "").trim(),
    phone: String(e.phone || "").trim(),
    items: skills.map((skill) => ({ type: baseType, skill })),
    createdAt: e.createdAt || new Date().toISOString(),
  };
}

function isAdmin(req) {
  return req.headers.get("x-admin-token") === "87800"; // mot de passe admin
}

// --- GET : lire toutes les entrées (conversion auto anciens formats) ---
export async function GET() {
  const { entries } = await ensureFile();
  const normalized = entries.map(normalizeEntry);
  normalized.sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
  return new Response(JSON.stringify({ entries: normalized }, null, 2), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    status: 200,
  });
}

// --- POST : ajouter UNE entrée OU tout remplacer (overwrite=1) ---
export async function POST(req) {
  const { searchParams } = new URL(req.url);
  const overwrite = searchParams.get("overwrite") === "1";

  if (overwrite) {
    if (!isAdmin(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }
    const body = await req.json().catch(() => ({}));
    const incoming =
      Array.isArray(body)
        ? body
        : Array.isArray(body.entries)
        ? body.entries
        : null;

    if (!Array.isArray(incoming)) {
      return new Response(JSON.stringify({ error: "Bad payload" }), {
        status: 400,
      });
    }

    const normalized = incoming.map(normalizeEntry);
    await put(KEY, JSON.stringify({ entries: normalized }, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });
    return new Response(
      JSON.stringify({ ok: true, replaced: normalized.length }, null, 2),
      { headers: { "content-type": "application/json" }, status: 200 }
    );
  }

  // Ajout d'une entrée
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }
  const body = await req.json().catch(() => ({}));
  const { entries } = await ensureFile();

  const safeItems = Array.isArray(body.items)
    ? body.items
        .filter((it) => it && it.type && it.skill)
        .map((it) => ({
          type: String(it.type).toLowerCase() === "offre" ? "offre" : "demande",
          skill: String(it.skill).trim(),
        }))
    : [];

  const entry = {
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7),
    firstName: String(body.firstName || "").trim(),
    lastName: String(body.lastName || "").trim(),
    phone: String(body.phone || "").trim(),
    items: safeItems,
    createdAt: new Date().toISOString(),
  };

  const next = [entry, ...entries];
  await put(KEY, JSON.stringify({ entries: next }, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });

  return new Response(JSON.stringify({ ok: true, entry }, null, 2), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

// --- DELETE : supprimer par id ---
export async function DELETE(req) {
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400,
    });
  }

  const { entries } = await ensureFile();
  const next = entries.filter((e) => String(e.id) !== String(id));

  await put(KEY, JSON.stringify({ entries: next }, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });

  return new Response(JSON.stringify({ ok: true }, null, 2), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
