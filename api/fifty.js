// Trust The Board: the price on a team scoring 51+ points, one game per request.
// Reads the alternate team totals ladder and takes Over 50.5 for each team
// (the same bet as DraftKings' Team Totals (Bands) 51+). DraftKings first, otherwise the best US price.
// Each game is cached on its own; a lookup costs 1 credit.
// Optional: ODDS_51_REFRESH_MINUTES (default 360).

module.exports = async (req, res) => {
  const p = parseInt(process.env.ODDS_51_REFRESH_MINUTES, 10);
  const mins = Math.max(15, Number.isFinite(p) && p > 0 ? p : 360);
  const reply = (body, ttl) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=' + ttl);
    res.status(200).send(JSON.stringify(body));
  };
  const key = process.env.ODDS_API_KEY;
  const id = String((req.query && req.query.id) || '');
  if (!key || !/^[a-f0-9]{32}$/.test(id)) return reply({ ok: false, why: key ? 'bad id' : 'no key' }, 3600);
  try {
    const url = 'https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/events/' + id +
      '/odds?regions=us&markets=alternate_team_totals&oddsFormat=american&apiKey=' + encodeURIComponent(key);
    const r = await fetch(url);
    console.log('51+ lookup', id, 'status', r.status, 'credits used', r.headers.get('x-requests-last'),
      'remaining', r.headers.get('x-requests-remaining'));
    if (!r.ok) return reply({ ok: false, why: 'provider ' + r.status }, 900);
    const ev = await r.json(), teams = {}, top = {};
    for (const b of ev.bookmakers || []) for (const m of b.markets || []) {
      if (m.key !== 'alternate_team_totals') continue;
      for (const o of m.outcomes || []) {
        if (o.name !== 'Over' || !o.description || typeof o.point !== 'number') continue;
        if (b.key === 'draftkings') top[o.description] = Math.max(top[o.description] || 0, o.point);
        if (o.point !== 50.5 || typeof o.price !== 'number') continue;
        const cur = teams[o.description], dk = b.key === 'draftkings';
        if (!cur || (dk && cur.book !== 'draftkings') || (!dk && cur.book !== 'draftkings' && o.price > cur.price))
          teams[o.description] = { price: o.price, book: b.key, title: b.title };
      }
    }
    return reply({ ok: true, id, at: new Date().toISOString(), teams, dkTop: top }, mins * 60);
  } catch (e) {
    console.log('51+ lookup error', String(e));
    return reply({ ok: false, why: 'error' }, 900);
  }
};
