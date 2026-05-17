// TFT Academy Live Meta — Auto-updating cache system
// Stale-while-revalidate: serves cached data instantly, refreshes in background
// Cron job at /api/cron-meta pre-warms this cache every hour

// ── In-memory cache (survives warm Vercel function instances) ─────────────
let CACHE = {
  data: null,
  fetchedAt: 0,
  patch: null,
  etag: null,
};

const CACHE_FRESH_MS  = 30 * 60 * 1000;  // 30 min — serve without refetch
const CACHE_STALE_MS  = 2 * 60 * 60 * 1000; // 2 hr — serve stale while revalidating
const ACADEMY_COMPS_URL = 'https://tftacademy.com/tierlist/comps';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://tftacademy.com/',
  'Cache-Control': 'no-cache',
};

const COMP_SLUGS = [
  'set-17-dark-star',
  'set-17-dark-star-snipers',
  'set-17-graves-vex-9-5',
  'set-17-corki-riven',
  'set-17-vanguard-asol-flex',
  'set-17-yi-marauders',
  'set-17-fountain-lulu',
  'set-17-dark-star-lissandra',
  'set-17-karma-lb-duo',
  'set-17-nova-yi',
  'set-17-veigar-printer',
  'set-17-samira-knock-up-copy',
];

// Parse the tier list page to get current comp ordering
async function parseTierList() {
  const res = await fetch(ACADEMY_COMPS_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`TFT Academy tier list returned ${res.status}`);
  const html = await res.text();

  const patchMatch = html.match(/Patch\s+([\d.]+)/);
  const patch = patchMatch ? patchMatch[1].trim() : '17.3';

  // Extract last updated time
  const updatedMatch = html.match(/Last Updated.*?(\d+\s+\w+\s+ago|\w+\s+ago)/i);
  const lastUpdated = updatedMatch ? updatedMatch[1] : 'recently';

  // Extract tier sections — find slugs under each tier label
  const tierOrder = { S: [], A: [], B: [], C: [], X: [] };
  const tierRegex = /([SABC])\s+tier[\s\S]*?(?=[SABC]\s+tier|X\s+tier|$)/gi;
  let tierMatch;
  while ((tierMatch = tierRegex.exec(html)) !== null) {
    const tier = tierMatch[1].toUpperCase();
    const section = tierMatch[0];
    const slugMatches = [...section.matchAll(/\/tierlist\/comps\/(set-17-[\w-]+)/g)];
    tierOrder[tier] = [...new Set(slugMatches.map(m => m[1]))];
  }

  return { patch, lastUpdated, tierOrder };
}

// Parse an individual comp page
async function parseComp(slug) {
  try {
    const res = await fetch(`https://tftacademy.com/tierlist/comps/${slug}`, { headers: HEADERS });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract meta description (Dishsoap/Frodan notes)
    const descMatch = html.match(/meta-description:\s*([^\n]+)/);
    const note = descMatch ? descMatch[1].trim().replace(/&gt;/g,'>')  : '';

    // Extract playstyle
    const styleMatch = html.match(/Playstyle:\s*([^(\n]+)/);
    const style = styleMatch ? styleMatch[1].trim() : '';

    // Extract difficulty
    const diffMatch = html.match(/\((EASY|MEDIUM|HARD)\)/i);
    const difficulty = diffMatch ? diffMatch[1] : '';

    // Extract champion IDs in order (these are the board units)
    const champAll = [...html.matchAll(/champion_icons\/(TFT17_[\w]+)\.webp/g)].map(m => m[1]);
    // First set = main board, second set = early units  
    const uniqueChamps = [...new Set(champAll)];

    // Extract item IDs (per champion, in DOM order)
    const itemAll = [...html.matchAll(/\/items\/(TFT[\w]+)\.webp/g)].map(m => m[1]);
    const uniqueItems = [...new Set(itemAll)];

    // Extract augment IDs
    const augAll = [...html.matchAll(/\/augments\/(TFT[\w]+)\.webp/g)].map(m => m[1]);
    const uniqueAugs = [...new Set(augAll)];

    // Extract augment priority order
    const prioMatches = [...html.matchAll(/\b(ECON|ITEMS|COMBAT|EMBLEM)\b/g)].map(m => m[1]);
    const augPrio = [...new Set(prioMatches)];

    // Extract comp name
    const nameMatch = html.match(/# Comps\s+(.+?)(?:\[|\n)/);
    const name = nameMatch ? nameMatch[1].trim() : slug.replace(/set-17-/,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

    // Extract item priority (components listed in priority order)
    const itemPrioMatches = [...html.matchAll(/Item_([A-Z][A-Za-z]+)\.webp.*?Item_([A-Z][A-Za-z]+)\.webp/g)];

    // Check for trend badges
    const isRising = html.includes('Rising');
    const isFalling = html.includes('Falling');
    const isNew = html.includes('>New<');
    const trend = isNew ? 'new' : isRising ? 'rising' : isFalling ? 'falling' : null;

    // Determine tier from context
    const sTier = html.match(/S\s+tier[\s\S]{0,200}set-17-[\w-]+/);
    const tier = sTier ? 'S' : 'A'; // default A, will be overridden by tier list

    return {
      slug, name, note, style, difficulty, trend, tier,
      champs: uniqueChamps,
      items: uniqueItems,
      augments: uniqueAugs,
      augPrio,
      fetchedAt: Date.now(),
    };
  } catch(e) {
    console.error(`Failed to fetch ${slug}:`, e.message);
    return null;
  }
}

// Full refresh — fetches tier list + all comp pages
export async function doFullRefresh() {
  console.log('[TFT Academy] Starting full refresh...');
  const start = Date.now();

  const tierInfo = await parseTierList();
  console.log(`[TFT Academy] Tier list parsed, patch ${tierInfo.patch}`);

  // Get all slugs from tier list + fallback list
  const allSlugs = [...new Set([
    ...tierInfo.tierOrder.S,
    ...tierInfo.tierOrder.A,
    ...tierInfo.tierOrder.B.slice(0,4),
    ...COMP_SLUGS,
  ])].slice(0, 15);

  // Fetch all comps in parallel with rate limiting
  const results = await Promise.allSettled(
    allSlugs.map((slug, i) => 
      new Promise(resolve => setTimeout(async () => {
        resolve(await parseComp(slug));
      }, i * 200)) // stagger by 200ms to avoid rate limiting
    )
  );

  const comps = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  // Assign tiers from tier list
  comps.forEach(comp => {
    for (const [tier, slugs] of Object.entries(tierInfo.tierOrder)) {
      if (slugs.includes(comp.slug)) { comp.tier = tier; break; }
    }
  });

  const data = {
    patch: tierInfo.patch,
    lastUpdated: tierInfo.lastUpdated,
    tierOrder: tierInfo.tierOrder,
    comps,
    refreshedAt: Date.now(),
    refreshDuration: Date.now() - start,
  };

  CACHE.data = data;
  CACHE.fetchedAt = Date.now();
  CACHE.patch = tierInfo.patch;

  console.log(`[TFT Academy] Refresh complete: ${comps.length} comps in ${Date.now()-start}ms`);
  return data;
}

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const now = Date.now();
  const age = now - CACHE.fetchedAt;
  const isFresh = age < CACHE_FRESH_MS;
  const isStale = age < CACHE_STALE_MS;

  // If fresh → serve immediately
  if (isFresh && CACHE.data) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', Math.round(age/1000)+'s');
    res.setHeader('Cache-Control', 'public, s-maxage=1800');
    return res.status(200).json(CACHE.data);
  }

  // If stale → serve stale AND revalidate in background
  if (isStale && CACHE.data) {
    res.setHeader('X-Cache', 'STALE');
    res.setHeader('X-Cache-Age', Math.round(age/1000)+'s');
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    // Fire background refresh (don't await)
    doFullRefresh().catch(e => console.error('Background refresh failed:', e));
    return res.status(200).json({
      ...CACHE.data,
      _stale: true,
      _refreshing: true,
    });
  }

  // Cache empty or too old → fetch fresh
  try {
    const data = await doFullRefresh();
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, s-maxage=1800');
    return res.status(200).json(data);
  } catch(e) {
    console.error('TFT Academy fetch failed:', e);
    // Return empty structure so frontend falls back gracefully
    return res.status(200).json({
      patch: '17.3',
      tierOrder: { S: [], A: [], B: [], C: [] },
      comps: [],
      error: e.message,
      fallback: true,
    });
  }
}
