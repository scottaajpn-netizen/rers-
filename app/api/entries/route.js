// app/api/entries/route.js
export const runtime = 'edge';
import { list, put } from '@vercel/blob';

const KEY = 'rers/data.json';
const BACKUP_PREFIX = 'rers/backups/data-';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || ''; // doit exister dans Vercel
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '87800'; // ton mot de passe admin

/* ----------------- utils http ----------------- */
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const checkAdmin = (req) => {
  const token = req.headers.get('x-admin-token') || '';
  return token && token === ADMIN_PASSWORD;
};

/* -------------- lecture/écriture blob -------------- */
async function findDataBlobUrl() {
  const { blobs } = await list({ prefix: KEY, token: BLOB_TOKEN });
  return blobs.length ? blobs[0].url : null;
}

// Retourne toujours { entries: [...] }
async function readData() {
  const url = await findDataBlobUrl();
  if (!url) return { entries: [] };
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return { entries: [] };
  let data;
  try {
    data = await res.json();
  } catch {
    return { entries: [] };
  }
  if (Array.isArray(data)) return { entries: data };
  if (data && Array.isArray(data.entries)) return { entries: data.entries };
  return { entries: [] };
}

async function backupData(entries) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await put(`${BACKUP_PREFIX}${ts}.json`, JSON.stringify({ entries }, null, 2), {
    access: 'private',
    addRandomSuffix: true,
    token: BLOB_TOKEN,
    contentType: 'application/json',
  });
}

async function writeData(entries) {
  return await put(KEY, JSON.stringify({ entries }, null, 2), {
    access: 'public',           // lecture publique pour le front
    addRandomSuffix: false,
    token: BLOB_TOKEN,
    contentType: 'application/json',
  });
}

/* -------------- normalisation de schéma -------------- */
// e.items (nouveau) OU (ancien) e.type + e.skills (string|array)
function toArray(v) {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  return String(v || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

function normalizeEntry(e) {
  if (Array.isArray(e?.items) && e.items.length) {
    // nettoie items
    const items = e.items
      .map(it => ({
        type: String(it?.type || '').toLowerCase().trim(),
        skill: String(it?.skill || '').trim(),
      }))
      .filter(it => it.type && it.skill);
    return { ...e, items };
  }
  // ancien format
  const oldType = String(e?.type || '').toLowerCase().trim() || 'offre';
  const skills = toArray(e?.skills);
  const items = skills.map(s => ({ type: oldType, skill: s }));
  const { type, skills: _drop, ...rest } = e;
  return { ...rest, items };
}

function normalizeAll(entries) {
  return entries.map(normalizeEntry);
}

/* ------------------- routes ------------------- */
export async function GET() {
  try {
    const { entries } = await readData();
    const norm = normalizeAll(entries);
    // si des entrées ont changé de forme, on réécrit pour stabiliser le fichier
    if (JSON.stringify(entries) !== JSON.stringify(norm)) {
      await backupData(norm);
      await writeData(norm);
    }
    return json({ entries: norm });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

export async function POST(req) {
  try {
    if (!checkAdmin(req)) return json({ error: 'Unauthorized' }, 401);
    const body = await req.json();

    // Construction d'une nouvelle entrée (accepte body.items ou {type, skills} et/ou wants)
    const base = {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7),
      firstName: String(body.firstName || '').trim(),
      lastName: String(body.lastName || '').trim(),
      phone: String(body.phone || '').trim(),
      createdAt: new Date().toISOString(),
    };

    let items = [];
    if (Array.isArray(body.items) && body.items.length) {
      items = body.items
        .map(it => ({
          type: String(it?.type || '').toLowerCase().trim(),
          skill: String(it?.skill || '').trim(),
        }))
        .filter(it => it.type && it.skill);
    } else {
      // compat : skills (offres) + wants (demandes) + type global
      const globalType = String(body.type || '').toLowerCase().trim();
      const offerSkills = toArray(body.skills);
      const wantSkills = toArray(body.wants);

      if (offerSkills.length) {
        const t = globalType || 'offre';
        items.push(...offerSkills.map(s => ({ type: t, skill: s })));
      }
      if (wantSkills.length) {
        items.push(...wantSkills.map(s => ({ type: 'demande', skill: s })));
      }
    }

    const entry = normalizeEntry({ ...base, items });

    // lecture + ajout + sauvegarde + écriture
    let { entries } = await readData();
    entries = normalizeAll(entries);
    entries.push(entry);

    await backupData(entries);
    await writeData(entries);

    // anti-conflit léger : relecture et vérif
    const { entries: after } = await readData();
    const found = after.some(e => e.id === entry.id);
    if (!found) {
      const merged = [...after, entry];
      await backupData(merged);
      await writeData(merged);
    }

    return json({ ok: true });
  } catch (e) {
    const msg = String(e?.message || e);
    if (/No token found/i.test(msg))
      return json({ error: 'Vercel Blob: token manquant (BLOB_READ_WRITE_TOKEN).' }, 500);
    if (/access must be "public"/i.test(msg))
      return json({ error: 'Vercel Blob: access doit être "public" pour data.json.' }, 500);
    return json({ error: msg }, 500);
  }
}

export async function DELETE(req) {
  try {
    if (!checkAdmin(req)) return json({ error: 'Unauthorized' }, 401);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { entries } = await readData();
    const norm = normalizeAll(entries);
    const next = norm.filter(e => e.id !== id);

    await backupData(next);
    await writeData(next);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}
