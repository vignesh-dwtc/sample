// Light, non-polluting smoke test of the live site (no puzzle solving, no accounts claimed,
// so production leaderboards stay clean). Usage: node scripts/smoke-live.mjs <url>
const U = process.argv[2] || 'https://playnest-yz8u.onrender.com';
const results = [];
const check = (name, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
async function get(path, opts = {}) {
  const r = await fetch(U + path, opts);
  const body = await r.text();
  let json; try { json = JSON.parse(body); } catch { json = null; }
  return { status: r.status, body, json };
}
try {
  const h = await get('/api/health'); check('health', h.status === 200);
  const v = await get('/api/version'); check('version', v.status === 200, v.json?.commit?.slice(0, 7) || 'no commit');
  const home = await get('/'); check('home page', home.status === 200 && home.body.includes('<div id="root">'));
  for (const p of ['/play/lexicon', '/play/target', '/play/flip', '/play/reflex', '/party', '/detective', '/leaderboard', '/profile']) {
    const r = await get(p); check(`route ${p}`, r.status === 200);
  }
  const g = await get('/api/auth/guest', { method: 'POST' }); check('guest account', g.status === 200);
  const auth = { headers: { Authorization: 'Bearer ' + g.json?.token } };
  const prof = await get('/api/profile', auth); check('profile', prof.status === 200);
  const daily = await get('/api/daily', auth); check('daily status', daily.status === 200);
  for (const game of ['lexicon', 'target', 'flip']) {
    const r = await get('/api/daily/' + game, auth); check(`daily ${game}`, r.status === 200);
  }
  const lb = await get('/api/leaderboard?game=xp&period=all', auth); check('leaderboard', lb.status === 200);
  const sw = await get('/sw.js'); check('service worker', sw.status === 200);
} catch (e) {
  check('request', false, e.message);
}
console.log(results.join('\n'));
const failed = results.filter((l) => l.startsWith('FAIL')).length;
console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
