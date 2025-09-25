// app/api/entries/route.js
import { list, put, del } from "@vercel/blob";

export const runtime = "edge";

// Un blob par fiche, sous ce préfixe :
const ENTRY_PREFIX = "rers/entries/";
// Ancien fichier unique (pour migration automatique si présent)
const LEGACY_INDEX = "rers/data.json";

// ---- utils ----
function isAdmin(req) {
  // mot de passe admin
  return req.headers.get("x-admin-token") === "87800";
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
  // Ancien format { type, skills: "A, B, C" }
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

// charge toutes les fiches (avec migration si besoin)
async function loadAllEntries() {
  // On liste les blobs d'entrées
  let { blobs } = await list({ prefix: ENTRY_PREFIX, limit: 10000 });

  // Si on n’en trouve aucune, on tente de migrer depuis l’ancien fichier unique
  if (!blobs || blobs.length === 0) {
    const legacy = (await list({ prefix: LEGACY_INDEX, limit: 1 })).blobs?.find(
      (b) => b.pathname === LEGACY_INDEX
    );
    if (legacy) {
      const resp = await fetch(legacy.url, { cache: "no-store" });
      if (resp.ok) {
        const json = await resp.json().catch(() => ({ entries: [] }));
        const arr = Array.isArray(json.entries) ? json.entries : [];
        // migration : on écrit 1 blob par entrée
        await Promise.all(
          arr.map(async (raw) => {
            const entry = normalizeEntry(raw);
            if (!entry.id) {
              entry.id =
                String(Date.now()) +
                "-" +
                Math.random().toString(36).slice(2, 7);
            }
            const path = ENTRY_PREFIX + entry.id + ".json";
            await put(path, JSON.stringify(entry, null, 2), {
              access: "public",
              contentType: "application/json",
              addRandomSuffix: false,
            });
          })
        );
      }
      // on reliste après migration
      blobs = (await list({ prefix: ENTRY_PREFIX, limit: 10000 })).blobs || [];
    }
  }

  // On récupère le contenu des blobs avec une petite limite de parallélisme
  const entries = [];
  const concurrency = 10;
  let i = 0;

  async function worker() {
    while (i < blobs.length) {
      const idx = i++;
      const b = blobs[idx];
      try {
        const r = await fetch(b.url, { cache: "no-store" });
        if (!r.ok) continue;
        const e = await r.json().catch(() => null);
        if (e) entries.push(normalizeEntry(e));
      } catch {}
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, blobs.length) }, () => worker())
  );

  // tri du plus récent au plus ancien
  entries.sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
  return entries;
}

// ---- GET ----
export async function GET() {
  const entries = await loadAllEntries();
  return new Response(JSON.stringify({ entries }, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    status: 200,
  });
}

// ---- POST ----
// 1) Ajout simple d'une entrée
// 2) Remplacement total si query ?overwrite=1 (supprime toutes les anciennes et crée les nouvelles)
export async function POST(req) {
  const { searchParams } = new URL(req.url);
  const overwrite = searchParams.get("overwrite") === "1";

  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  if (overwrite) {
    const body = await req.json().catch(() => ({}));
    const incoming =
      Array.isArray(body) ? body : Array.isArray(body.entries) ? body.entries : null;
    if (!Array.isArray(incoming)) {
      return new Response(JSON.stringify({ error: "Bad payload" }), {
        status: 400,
      });
    }

    // supprime tout l'existant
    const existing = (await list({ prefix: ENTRY_PREFIX, limit: 10000 })).blobs || [];
    await Promise.all(
      existing.map(async (b) => {
        try {
          await del(b.url);
        } catch {}
      })
    );

    // écrit les nouvelles
    const normalized = incoming.map(normalizeEntry);
    await Promise.all(
      normalized.map(async (e) => {
        if (!e.id) {
          e.id =
            String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7);
        }
        const path = ENTRY_PREFIX + e.id + ".json";
        await put(path, JSON.stringify(e, null, 2), {
          access: "public",
          contentType: "application/json",
          addRandomSuffix: false,
        });
      })
    );

    return new Response(
      JSON.stringify({ ok: true, replaced: normalized.length }, null, 2),
      { headers: { "content-type": "application/json" }, status: 200 }
    );
  }

  // Ajout simple
  const body = await req.json().catch(() => ({}));
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

  const path = ENTRY_PREFIX + entry.id + ".json";
  await put(path, JSON.stringify(entry, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });

  return new Response(JSON.stringify({ ok: true, entry }, null, 2), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

// ---- DELETE ----
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

  // chemin exact du blob
  const exactPath = ENTRY_PREFIX + id + ".json";
  // on tente par URL directe si on la trouve, sinon on essaie par pathname
  const { blobs } = await list({ prefix: exactPath, limit: 10 });
  const target =
    blobs?.find((b) => b.pathname === exactPath) || blobs?.[0] || null;

  if (!target) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
    });
  }

  await del(target.url);

  return new Response(JSON.stringify({ ok: true }, null, 2), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
