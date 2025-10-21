// app/api/edit/route.js
import { list, put } from "@vercel/blob";

export const runtime = "edge";
const PREFIX = "rers/entries/";

const ok = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });

const err = (msg, status = 400) => ok({ error: msg }, status);
const isAdmin = (req) => req.headers.get("x-admin-token") === "87800";

export async function PUT(req) {
  if (!isAdmin(req)) return err("Unauthorized", 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON");
  }

  const id = String(body.id || "").trim();
  if (!id) return err("Missing ID", 400);

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
    updatedAt: new Date().toISOString(),
  };

  await put(`${PREFIX}${id}.json`, JSON.stringify(entry), {
    access: "public",
    contentType: "application/json; charset=utf-8",
  });

  return ok({ success: true, entry });
}
