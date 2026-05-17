// MetaTFT Real Stats Proxy
// Fetches aggregated game statistics from MetaTFT
// These are real winrates from millions of Diamond+ games

const CACHE = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const METATFT_BASE = 'https://api.metatft.com/tft';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Origin': 'https://www.metatft.com',
  'Referer': 'https://www.metatft.com/',
};

async function fetchWithCache(key, url) {
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`MetaTFT ${res.status}: ${url}`);
  const data = await res.json();
  CACHE.set(key, { ts: Date.now(), data });
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');

  const { type, set = '17' } = req.query;

  try {
    let data;

    switch (type) {
      case 'augments': {
        // MetaTFT augments endpoint
        const raw = await fetchWithCache('augments_'+set,
          `${METATFT_BASE}/augments?set=${set}&rank=DIAMOND_PLUS&patch=current`
        );
        // Normalize the response
        const augments = (raw.augments || raw.data || []).map(a => ({
          name: a.name || a.augment_name || a.augmentName,
          avg_placement: parseFloat(a.avg_placement || a.avgPlacement || a.average_placement || 5),
          top4_rate: parseFloat(a.top4_rate || a.top4Rate || 0),
          win_rate: parseFloat(a.win_rate || a.winRate || 0),
          games: parseInt(a.games || a.total_games || a.count || 0),
          tier: a.tier,
          pick_rate: parseFloat(a.pick_rate || a.pickRate || 0),
        })).filter(a => a.name && a.avg_placement > 0);
        data = { augments, updatedAt: Date.now() };
        break;
      }

      case 'comps': {
        const raw = await fetchWithCache('comps_'+set,
          `${METATFT_BASE}/comps?set=${set}&rank=DIAMOND_PLUS&patch=current`
        );
        const comps = (raw.comps || raw.compositions || raw.data || []).map(c => ({
          name: c.name || c.comp_name || c.compName,
          avg_placement: parseFloat(c.avg_placement || c.avgPlacement || 5),
          top4_rate: parseFloat(c.top4_rate || c.top4Rate || 0),
          win_rate: parseFloat(c.win_rate || c.winRate || 0),
          games: parseInt(c.games || c.count || 0),
          tier: c.tier,
        })).filter(c => c.name && c.avg_placement > 0);
        data = { comps, updatedAt: Date.now() };
        break;
      }

      case 'items': {
        const raw = await fetchWithCache('items_'+set,
          `${METATFT_BASE}/items?set=${set}&rank=DIAMOND_PLUS&patch=current`
        );
        const items = (raw.items || raw.data || []).map(i => ({
          name: i.name || i.item_name,
          avg_placement: parseFloat(i.avg_placement || i.avgPlacement || 5),
          top4_rate: parseFloat(i.top4_rate || i.top4Rate || 0),
          win_rate: parseFloat(i.win_rate || i.winRate || 0),
          games: parseInt(i.games || i.count || 0),
        })).filter(i => i.name && i.avg_placement > 0);
        data = { items, updatedAt: Date.now() };
        break;
      }

      case 'champions': {
        const raw = await fetchWithCache('champions_'+set,
          `${METATFT_BASE}/champions?set=${set}&rank=DIAMOND_PLUS&patch=current`
        );
        const champions = (raw.champions || raw.data || []).map(c => ({
          name: c.name || c.champion_name,
          cost: c.cost || c.tier,
          avg_placement: parseFloat(c.avg_placement || 5),
          top4_rate: parseFloat(c.top4_rate || 0),
          games: parseInt(c.games || 0),
        })).filter(c => c.name);
        data = { champions, updatedAt: Date.now() };
        break;
      }

      default:
        return res.status(400).json({ error: 'Invalid type. Use: augments, comps, items, champions' });
    }

    return res.status(200).json(data);

  } catch (e) {
    console.error('[MetaTFT]', e.message);
    // Return empty but valid response so frontend gracefully degrades
    const emptyResponses = {
      augments: { augments: [], error: e.message },
      comps: { comps: [], error: e.message },
      items: { items: [], error: e.message },
      champions: { champions: [], error: e.message },
    };
    return res.status(200).json(emptyResponses[type] || { error: e.message });
  }
}
