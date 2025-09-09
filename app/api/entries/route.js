import { NextResponse } from "next/server";
import { list, put } from "@vercel/blob";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const KEY = "rers/data.json";
const ADMIN_TOKEN = "87800"; // mot de passe admin en dur

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN; // <- lu à l'exécution

async function readStore() {
  // Cherche le blob en utilisant le token
  const { blobs } = await list({ prefix: KEY, token: TOKEN });
  const hit = blobs.find(b => b.pathname === KEY);
  if (!hit) return { entries: [] };
  const res = await fetch(hit.url, { cache: "no-store" });
  if (!res.ok) return { entries: [] };
  return await res.json();
}

async function writeStore(obj) {
  await put(KEY, JSON.stringify(obj, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    token: TOKEN, // <- important
  });
}

function isAdmin(req) {
  return (req.headers.get("x-admin-token") || "") === ADMIN_TOKEN;
}

export async function GET() {
  try {
    const data = await readStore();
    return NextResponse.json({ entries: data.entries || [] }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Erreur lecture" },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const body = await req.json();
    const required = ["firstName", "lastName", "phone", "type", "skills"];
    for (const k of required) {
      if (!String(body?.[k] || "").trim()) {
        return NextResponse.json({ error: `Champ manquant: ${k}` }, { status: 400 });
      }
    }
    const entry = {
      id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7),
      firstName: String(body.first
