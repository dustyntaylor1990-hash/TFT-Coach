export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');
  try {
    const versionsRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await versionsRes.json();
    const latest = versions[0];
    const itemsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/tft-item.json`);
    const itemsData = await itemsRes.json();
    const champsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/tft-champion.json`);
    const champsData = await champsRes.json();
    const items = {};
    Object.entries(itemsData.data || {}).forEach(([key, item]) => {
      items[key] = item.name;
      if (item.id !== undefined) items[String(item.id)] = item.name;
    });
    const champions = {};
    Object.entries(champsData.data || {}).forEach(([key, champ]) => {
      champions[key] = { name: champ.name, cost: champ.tier || 1, traits: champ.traits || [] };
    });
    return res.status(200).json({ patch: latest, items, champions });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
