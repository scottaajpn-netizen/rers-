import { list, put } from '@vercel/blob';

export const runtime = 'edge';

const KEY = 'rers/data.json';
const ADMIN = '87800'; // mot de passe admin

function isAdmin(req) {
  const token = req.headers.get('x-admin-token') || '';
  return token === ADMIN;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Charge le JSON (le crée en public s'il n'existe pas)
async function loadData() {
  const { blobs } = await list({ prefix: KEY });
  if (!blobs.length) {
    const initial = { entries: [] };
    await put(KEY, JSON.stringify(initial, null, 2), {
      access: 'public',                // << IMPORTANT
      contentType: 'application/json',
      addRandomSuffix: false,          // << on garde le nom fixe
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return initial;
  }
  const url = blobs[0].url;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json().catch(() => ({ entries: [] }));
  if (!Array.isArray(data.entries)) data.entries = [];
  return data;
}

// Sauvegarde le JSON (toujours en public)
async function saveData(data) {
  await put(KEY, JSON.stringify(data, null, 2), {
    access: 'public',                  // << IMPORTANT
    contentType: 'application/json',
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

// GET: liste des entrées
export async function GET() {
  const data = await loadData();
  return json({ entries: data.entries });
}

// POST: ajout d'une entrée
export async function POST(req) {
  if (!isAdmin(req)) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const data = await loadData();

  const entry = {
    id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7),
    firstName: String(body.firstName || '').trim(),
    lastName: String(body.lastName || '').trim(),
    phone: String(body.phone || '').trim(),
    items: Array.isArray(body.items)
      ? body.items
          .map(it => ({
            type: it?.type === 'demande' ? 'demande' : 'offre',
            skill: String(it?.skill || '').trim(),
          }))
          .filter(it => it.skill)
      : [],
    createdAt: new Date().toISOString(),
  };

  data.entries.unshift(entry);
  await saveData(data);
  return json({ ok: true, entry });
}

// DELETE: suppression par id (?id=xxx)
export async function DELETE(req) {
  if (!isAdmin(req)) return json({ error: 'Unauthorized' }, 401);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || '';
  if (!id) return json({ error: 'Missing id' }, 400);

  const data = await loadData();
  const before = data.entries.length;
  data.entries = data.entries.filter(e => e.id !== id);
  if (data.entries.length === before) return json({ error: 'Not found' }, 404);

  await saveData(data);
  return json({ ok: true });
}
