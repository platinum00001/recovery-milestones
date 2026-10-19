// Headless browser smoke test (PREVIEW MODE): loads every page as signed-out / member / business / admin,
// fails on any JS error, exercises a few flows, and saves screenshots to preview-*.png.
// Usage: node tools/smoke.mjs   (needs Chrome/Chromium; set CHROME_PATH if not /usr/bin/google-chrome)
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.SMOKE_PORT || 47311), BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const results = [];
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`[pageerror] ${page.url()} ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|favicon/.test(m.text())) errors.push(`[console] ${page.url()} ${m.text()}`); });
page.on('requestfailed', (r) => { if (!/tile\.openstreetmap/.test(r.url())) errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`); });
page.on('dialog', (d) => d.accept('DELETE'));

async function as(role) {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0' });
  await page.evaluate((r) => { const k = 'rm-milestones-demo-v1'; const s = JSON.parse(localStorage.getItem(k)); s.session = r ? `demo-${r}` : null; localStorage.setItem(k, JSON.stringify(s)); }, role);
}
async function visit(path, shot, { mobile = false, check } = {}) {
  await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 900 });
  const before = errors.length;
  await page.goto(`${BASE}/${path}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 400));
  let ok = true, note = '';
  if (check) { try { note = (await check()) || ''; } catch (e) { ok = false; note = e.message; } }
  if (shot) { await page.evaluate(() => window.scrollTo(0, 0)); await new Promise((r) => setTimeout(r, 150)); await page.screenshot({ path: `${root}preview-${shot}.png`, fullPage: true }); }
  ok = ok && errors.length === before;
  results.push({ path, shot, ok, note });
}
const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
const must = async (cond, msg) => { if (!(await cond)) throw new Error(msg); };

// fresh state
await page.goto(`${BASE}/index.html`); await page.evaluate(() => localStorage.clear());
await as(null);
await visit('index.html', 'home', { check: async () => must(page.$('#magic-email'), 'email sign-in form missing') });
await visit('index.html', 'home-mobile', { mobile: true });
for (const p of ['map.html', 'impact.html', 'sponsor.html', 'coaches.html', 'privacy.html', 'about.html', 'note.html?t=demo-note-token', 'unsubscribe.html?token=nope', 'card.html?id=missing', 'wall.html?u=sam-example']) {
  const shot = { 'map.html': 'map', 'impact.html': 'impact', 'sponsor.html': 'sponsor', 'coaches.html': 'coaches', 'note.html?t=demo-note-token': 'supporter-note' }[p];
  await visit(p, shot, { check: p === 'impact.html' ? async () => { const t = await text('#stats'); await must(t.includes('<10') || /\d/.test(t), 'no stats'); return t.replace(/\s+/g, ' ').slice(0, 120); }
    : p === 'map.html' ? async () => { await must(page.$('.leaflet-container'), 'map not initialised'); return `${(await page.$$('.map-pin')).length} pins`; }
    : p === 'wall.html?u=sam-example' ? async () => must((await text('#public')).includes('private'), 'wall should be private by default') : undefined });
}

// member
await as('member');
await visit('app.html', 'member-dashboard', { check: async () => {
  await must((await text('#days')) === '95', 'days should be 95');
  await must((await text('#next-label')) === '6 Months', 'next should be 6 Months');
  await page.click('#checkin'); await new Promise((r) => setTimeout(r, 200));
  await must((await text('#streak')).includes('7'), 'streak should be 7 after check-in');
  await page.click('[data-claim]'); await new Promise((r) => setTimeout(r, 300));
  await must(page.$('#code-dialog[open] svg'), 'QR dialog should open with SVG');
  await page.screenshot({ path: `${root}preview-reward-code.png` });
  await page.click('#code-dialog button'); return 'check-in + claim + QR ok';
} });
await visit('app.html', 'member-dashboard-mobile', { mobile: true });
await visit('wall.html', 'badge-wall', { check: async () => { await must((await page.$$('.chip:not(.locked)')).length === 4, '4 badges'); await page.click('[data-act=approved]'); return 'note approved'; } });
await visit('settings.html', 'settings', { check: async () => { await page.type('#sp-name', 'Jo'); await page.type('#sp-email', 'jo@example.org'); await page.click('[name=consent_confirmed]'); await page.click('#supporter-form button[type=submit]'); await new Promise((r) => setTimeout(r, 300)); await must((await text('#supporters')).includes('Jo'), 'supporter added'); return 'supporter added'; } });
// celebration card flow
await visit('app.html', null, { check: async () => { await page.type('#card-msg', 'One day at a time'); await Promise.all([page.waitForNavigation(), page.click('#card-form button[type=submit]')]); return page.url(); } });
await visit(page.url().replace(BASE + '/', ''), 'celebration-card', { check: async () => { await must((await text('.celebration h1')) === '90 Days!', 'card label'); await must(!(await text('.celebration')).match(/20\d\d/), 'date must be hidden by default'); return 'card hides date'; } });
// public wall opt-in
await page.goto(`${BASE}/wall.html`); await page.waitForSelector('#wall-privacy'); await page.click('[name=wall_public]'); await new Promise((r) => setTimeout(r, 300));
await visit('wall.html?u=sam-example', 'public-wall', { check: async () => must((await page.$$('.note')).length >= 1, 'approved notes shown') });

// business
await as('business');
await visit('business.html', 'business-portal', { check: async () => must((await text('#offers')).includes('Free coffee'), 'offers listed') });
const memberCode = await page.evaluate(() => JSON.parse(localStorage.getItem('rm-milestones-demo-v1')).claims.find((c) => c.offer_id === 'o1')?.code);
await visit(`redeem.html?code=${memberCode}`, 'redeem', { check: async () => { await page.click('#redeem-form button'); await new Promise((r) => setTimeout(r, 300)); await must((await text('#result')).includes('Redeemed'), 'redeemed'); await page.screenshot({ path: `${root}preview-redeem.png` }); return 'code redeemed'; } });

// admin
await as('admin');
await visit('admin.html', 'admin', { check: async () => must((await page.$$('#summary .stat')).length >= 10, 'summary cards') });

await browser.close(); server.kill();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.path}${r.shot ? `  → preview-${r.shot}.png` : ''}${r.note ? `  (${r.note})` : ''}`);
if (errors.length) { console.log('\nErrors:'); for (const e of errors) console.log('  ' + e); }
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} page checks passed, ${errors.length} JS/console errors`);
process.exit(failed || errors.length ? 1 : 0);
