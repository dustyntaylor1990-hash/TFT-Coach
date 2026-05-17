// Shared in-memory Riot key (survives warm function instances)
// Falls back to RIOT_API_KEY env var set in Vercel dashboard
let sharedKey = '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Internal: update shared key (called by riotkey.js)
  if (req.method === 'POST') {
    const { setKey } = req.body || {};
    if (setKey) { sharedKey = setKey; return res.status(200).json({ ok: true }); }
  }

  const { url, key: queryKey } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  // Priority: shared in-memory key → env var → key passed in query string (personal key fallback)
  const key = sharedKey || process.env.RIOT_API_KEY || queryKey || '';
  if (!key) return res.status(503).json({ error: 'No Riot API key configured. Paste one in the Keys bar on the site, or go to Admin in the Squad tab.' });

  try {
    const r = await fetch(decodeURIComponent(url), { headers: { 'X-Riot-Token': key } });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
