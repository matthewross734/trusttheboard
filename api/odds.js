// Trust The Board: live college-football spreads and totals from The Odds API.
// The key stays on the server (Vercel > Settings > Environment Variables > ODDS_API_KEY).
// Vercel keeps one shared copy of the answer and only asks the provider again once that
// copy is older than the refresh window, however many people load the site.
//
// Refresh window (Eastern time): Sunday to Wednesday every 6 hours, Thursday to Saturday every hour.
// Optional overrides: ODDS_REFRESH_MINUTES_EARLY (default 360), ODDS_REFRESH_MINUTES_LATE (default 60),
// ODDS_51_GAMES (how many games get a 51+ price lookup, default 10; 0 turns it off).
// Cost: 2 credits per refresh (spreads + totals, US books).

const mode = xs => {
  if (!xs.length) return null;
  const n = {};
  xs.forEach(x => { n[x] = (n[x] || 0) + 1; });
  const top = Math.max(...Object.values(n));
  const best = Object.keys(n).filter(k => n[k] === top).map(Number).sort((a, b) => a - b);
  return best[Math.floor((best.length - 1) / 2)];
};
const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };

module.exports = async (req, res) => {
  const day = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const early = ['Sun', 'Mon', 'Tue', 'Wed'].includes(day);
  const mins = Math.max(5, early ? num(process.env.ODDS_REFRESH_MINUTES_EARLY, 360) : num(process.env.ODDS_REFRESH_MINUTES_LATE, 60));
  const reply = (body, ttl) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=' + ttl);
    res.status(200).send(JSON.stringify(body));
  };
  const key = process.env.ODDS_API_KEY;
  if (!key) return reply({ ok: false, why: 'no key', games: [] }, 300);
  try {
    const url = 'https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds' +
      '?regions=us&markets=spreads,totals&oddsFormat=american&dateFormat=iso&apiKey=' + encodeURIComponent(key);
    const r = await fetch(url);
    console.log('odds api status', r.status, 'credits used by this call', r.headers.get('x-requests-last'),
      'remaining', r.headers.get('x-requests-remaining'));
    if (!r.ok) return reply({ ok: false, why: 'provider ' + r.status, games: [] }, 900);
    const now = Date.now(), games = [];
    for (const ev of await r.json()) {
      const t = Date.parse(ev.commence_time);
      if (!(t > now)) continue;                       // skip games in progress: those are in-play lines
      const sp = [], tot = [];
      for (const b of ev.bookmakers || []) for (const m of b.markets || []) {
        if (m.key === 'spreads') { const o = (m.outcomes || []).find(o => o.name === ev.home_team); if (o && typeof o.point === 'number') sp.push(o.point); }
        if (m.key === 'totals') { const o = (m.outcomes || []).find(o => o.name === 'Over'); if (o && typeof o.point === 'number') tot.push(o.point); }
      }
      if (!sp.length || !tot.length) continue;
      games.push({
        id: ev.id, h: ev.home_team, a: ev.away_team,
        d: new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
        sp: mode(sp), tot: mode(tot), n: sp.length
      });
    }
    return reply({ ok: true, at: new Date(now).toISOString(), every: mins, n51: num(process.env.ODDS_51_GAMES, 10), games }, mins * 60);
  } catch (e) {
    console.log('odds api error', String(e));
    return reply({ ok: false, why: 'error', games: [] }, 900);
  }
};
