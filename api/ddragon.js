export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  try {
    // Get latest patch
    const vr = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await vr.json();
    const patch = versions[0];

    // Fetch TFT items (with fallback to regular items)
    let itemsData = { data: {} };
    for (const url of [
      `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/tft-item.json`,
      `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/item.json`
    ]) {
      try {
        const r = await fetch(url);
        if (r.ok) { const d = await r.json(); if (Object.keys(d.data||{}).length > 0) { itemsData = d; break; } }
      } catch(e) {}
    }

    // Fetch TFT champions
    let champsData = { data: {} };
    try {
      const r = await fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/tft-champion.json`);
      if (r.ok) champsData = await r.json();
    } catch(e) {}

    // Build items map: id -> name
    const items = {};
    for (const [key, item] of Object.entries(itemsData.data || {})) {
      if (!item.name) continue;
      items[key] = item.name;
      if (item.id != null) items[String(item.id)] = item.name;
    }

    // Build champions map: key -> { name, cost }
    const champions = {};
    for (const [key, champ] of Object.entries(champsData.data || {})) {
      if (!champ.name) continue;
      champions[key] = { name: champ.name, cost: champ.tier || 1 };
    }

    return res.status(200).json({ patch, items, champions });
  } catch (e) {
    return res.status(500).json({ error: e.message, patch: '', items: {}, champions: {} });
  }
}
