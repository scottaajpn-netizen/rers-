// app/api/entries/route.js
// API Edge pour lire/ajouter/supprimer des entrées RERS dans un JSON stocké sur Vercel Blob.
//
// ⚙️ Prérequis côté Vercel (Project Settings → Environment Variables)
// - BLOB_READ_WRITE_TOKEN = <ton token Blob Read/Write>
//
// 🔐 Sécurité basique
// - Écriture/Suppression : nécessite l'en-tête HTTP `x-admin-token: 87800`.
// - Lecture : publique via cette route (le blob lui-même reste public, mais son URL n'est pas exposée).
//
// ❗️Important pour ton plan actuel : access doit être "public" (sinon erreur "access must be \"public\"").
//    On garde addRandomSuffix:false pour avoir un chemin stable.

export const runtime = "edge";

import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";

const KEY = "rers/data.json";
const ADMIN_TOKEN = "87800";
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// --- utilitaires ---

function isAdmin(req) {
  const header = req.headers.get("x-admin-token") || "";
  return header === ADMIN_TOKEN;
}

async function getBlobUrl() {
  // Cherche le blob exact "rers/data.json"
  const { blobs } = await list({ prefix: KEY, token: TOKEN });
  const found = blobs.find((b) => b.pathname === KEY);
  return found ? found.url : null;
}

async function readStore() {
  const url = await getBlobUrl();
  if (!url) return { entries: [] }; // première écriture si vide
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Lecture du blob impossible");
  return await res.json();
}

async function writeStore(obj) {
  // Écrit en public (exigé par ton plan actuel) avec un chemin stable
  await put(KEY, JSON.stringify(obj, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    token: TOKEN,
  });
}

// --- Handlers ---

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
    const entry = {
      id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7),
      firstName: String(body.firstName || "").trim(),
      lastName: String(body.lastName || "").trim(),
      phone: String(body.phone || "").trim(),
      type: String(body.type || "").trim(), // "offre" | "demande"
      skills: String(body.skills || "").trim(),
      createdAt: new Date().toISOString(),
    };

    // Validation ultra-simple
    if (!entry.firstName || !entry.phone || !entry.type) {
      return NextResponse.json(
        { error: "Champs requis manquants (firstName, phone, type)." },
        { status: 400 }
      );
    }

    const store = await readStore();
    const next = Array.isArray(store.entries) ? store.entries.slice() : [];
    next.unshift(entry); // on insère en tête
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
