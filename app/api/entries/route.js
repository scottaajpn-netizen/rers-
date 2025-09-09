// app/api/entries/route.js
export const runtime = "edge";

import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";

const KEY = "rers/data.json";
const ADMIN_TOKEN = "87800";
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// ---------- Utils ----------
function isAdmin(req) {
  const header = req.headers.get("x-admin-token") || "";
  return header === ADMIN_TOKEN;
}

async function getBlobUrl() {
  const { blobs } = await list({ prefix: KEY, token: TOKEN });
  const found = blobs.find((b) => b.pathname === KEY);
  return found ? found.url : null;
}

async function readStore() {
  const url = await getBlobUrl();
  if (!url) return { entries: [] };
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Lecture du blob impossible");
  return await res.json();
}

async function writeStore(obj) {
  await put(KEY, JSON.stringify(obj, null, 2), {
    access: "public",              // requis sur ton plan actuel
    addRandomSuffix: false,        // chemin stable
    contentType: "application/json",
    token: TOKEN,
  });
}

// Normalise ce qui arrive du front :
// - body.items?: [{ type, skill }]
// - ou bien body.type + body.skills (string, séparé par virgules)
function normalizeItems(body) {
  // items déjà fournis
  if (Array.isArray(body.items)) {
    return body.items
      .map((it) => ({
        type: String(it?.type || "").trim().toLowerCase(),
        skill: String(it?.skill || "").trim(),
      }))
      .filter((it) => it.skill);
  }

  // compat: type + skills (séparés par virgules)
  const t = String(body.type || "").trim().toLowerCase();
  const skillsRaw = String(body.skills || "").trim();
  if (!t && !skillsRaw) return [];

  const skills = skillsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return skills.map((s) => ({ type: t, skill: s }));
}

// ---------- Handlers ----------
export async function GET() {
  try {
    if (!TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN manquant (Project Settings → Environment Variables)." },
        { status: 500 }
      );
    }
    const data = await readStore();
    return NextResponse.json({ ok: true, entries: data.entries || [] });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    if (!TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN manquant (Project Settings → Environment Variables)." },
        { status: 500 }
      );
    }
    if (!isAdmin(req)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const items = normalizeItems(body);

    if (!items.length) {
      return NextResponse.json(
        { error: "Au moins une ligne Type + Compétence est requise." },
        { status: 400 }
      );
    }

    const entry = {
      id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7),
      firstName: String(body.firstName || "").trim(),
      lastName: String(body.lastName || "").trim(),
      phone: String(body.phone || "").trim(),
      items, // [{ type: 'offre'|'demande', skill: '...' }, ...]
      createdAt: new Date().toISOString(),
    };

    if (!entry.firstName || !entry.phone) {
      return NextResponse.json(
        { error: "Champs requis manquants (firstName, phone)." },
        { status: 400 }
      );
    }

    const store = await readStore();
    const next = Array.isArray(store.entries) ? store.entries.slice() : [];
    next.unshift(entry);
    await writeStore({ entries: next });

    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    if (!TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN manquant (Project Settings → Environment Variables)." },
        { status: 500 }
      );
    }
    if (!isAdmin(req)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await req.json().catch(() => ({}));
    if (!id) {
      return NextResponse.json({ error: "id requis" }, { status: 400 });
    }

    const store = await readStore();
    const before = Array.isArray(store.entries) ? store.entries : [];
    const after = before.filter((e) => e.id !== id);
    await writeStore({ entries: after });

    return NextResponse.json({ ok: true, id, removed: before.length - after.length });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
