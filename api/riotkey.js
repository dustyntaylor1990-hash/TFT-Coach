let sharedKey = '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const currentKey = sharedKey || process.env.RIOT_API_KEY || '';

  if (req.method === 'GET') {
    return res.status(200).json({
      hasKey: !!currentKey,
      masked: currentKey ? currentKey.slice(0, 10) + '...' + currentKey.slice(-4) : 'not set'
    });
  }

  if (req.method === 'POST') {
    const { key, adminPass } = req.body || {};
    const correctPass = process.env.ADMIN_PASS || 'fuckmikey';

    if (adminPass !== correctPass) return res.status(403).json({ error: 'Wrong password' });
    if (!key || !key.startsWith('RGAPI-')) return res.status(400).json({ error: 'Invalid key — must start with RGAPI-' });

    sharedKey = key;
    // Also sync to riot.js shared memory
    try { await fetch(`${process.env.VERCEL_URL ? 'https://'+process.env.VERCEL_URL : ''}/api/riot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setKey: key }) }); } catch(e) {}

    return res.status(200).json({
      success: true,
      masked: key.slice(0, 10) + '...' + key.slice(-4)
    });
  }
}
