export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  const riotKey = process.env.RIOT_API_KEY;

  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  if (!riotKey) return res.status(500).json({ error: 'RIOT_API_KEY not configured in Vercel environment variables' });

  try {
    const response = await fetch(decodeURIComponent(url), {
      headers: { 'X-Riot-Token': riotKey },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
