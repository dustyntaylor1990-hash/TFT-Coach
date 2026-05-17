// Cron job — runs every hour via Vercel Crons
// Pre-warms the TFT Academy cache before anyone asks for it
// This means the Meta tab always has fresh data ready instantly

import { doFullRefresh } from './tftacademy.js';

export default async function handler(req, res) {
  // Vercel cron jobs are authenticated with CRON_SECRET
  // Reject unauthorized calls
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const start = Date.now();
  console.log('[Cron] TFT Academy meta refresh starting...');

  try {
    const data = await doFullRefresh();
    const duration = Date.now() - start;
    console.log(`[Cron] Refresh complete: patch ${data.patch}, ${data.comps?.length} comps, ${duration}ms`);

    return res.status(200).json({
      success: true,
      patch: data.patch,
      compsRefreshed: data.comps?.length || 0,
      duration,
      refreshedAt: new Date().toISOString(),
    });
  } catch(e) {
    console.error('[Cron] Refresh failed:', e);
    return res.status(500).json({
      success: false,
      error: e.message,
    });
  }
}
