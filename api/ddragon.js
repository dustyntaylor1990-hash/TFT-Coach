export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  try {
    const vr = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await vr.json();
    const patch = versions[0];

    let itemsData = { data: {} };
    for (const url of [
      `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/tft-item.json`,
      `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/item.json`
    ]) {
      try {
        const r = await fetch(url);
        if (r.ok) {
          const d = await r.json();
          if (Object.keys(d.data || {}).length > 0) { itemsData = d; break; }
        }
      } catch(e) {}
    }

    let champsData = { data: {} };
    try {
      const r = await fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/tft-champion.json`);
      if (r.ok) champsData = await r.json();
    } catch(e) {}

    const items = {};
    for (const [key, item] of Object.entries(itemsData.data || {})) {
      if (!item.name) continue;
      items[key] = item.name;
      if (item.id != null) items[String(item.id)] = item.name;
    }

    const champions = {};
    for (const [key, champ] of Object.entries(champsData.data || {})) {
      if (!champ.name) continue;
      champions[key] = { name: champ.name, cost: champ.tier || 1 };
    }

    return res.status(200).json({ patch, items, champions });
  } catch (e) {
    try {
      const vr = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
      const vs = await vr.json();
      return res.status(200).json({ patch: vs[0], items: {}, champions: {} });
    } catch(e2) {
      return res.status(500).json({ error: e.message, patch: '', items: {}, champions: {} });
    }
  }
}
