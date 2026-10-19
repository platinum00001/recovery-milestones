// Shared page chrome (header, footer with crisis resources), helpers, sign-in panel, QR rendering.
import { api, IS_DEMO, CONFIG, SITE_URL } from './api.js';
import { escapeHTML } from './format.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const h = escapeHTML;

const LOGO = `<svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="38" r="20" fill="#f2a541"/><path d="M32 56V30" stroke="#fbf7f0" stroke-width="4" stroke-linecap="round"/><path d="M32 36c-10 0-14-8-14-14 8 0 14 4 14 14zM32 32c0-10 6-16 16-16 0 8-6 16-16 16z" fill="#6aa84f"/><path d="M14 56h36" stroke="#fbf7f0" stroke-width="4" stroke-linecap="round"/></svg>`;

const NAV = [
  ['index.html', 'Home'], ['app.html', 'My Milestones'], ['wall.html', 'Badge Wall'], ['map.html', 'Rewards Map'],
  ['coaches.html', 'Coaches'], ['business.html', 'For Businesses'], ['impact.html', 'Impact'],
];

export function toast(msg, ms = 3200) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.append(t); }
  t.textContent = msg; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => { t.style.display = 'none'; }, ms);
}

export function showError(e) { console.warn(e); toast(e?.message || String(e), 5000); }

export async function chrome() {
  const here = location.pathname.split('/').pop() || 'index.html';
  const A = await api();
  const session = await A.session();
  let role = null;
  if (session) { try { role = (await A.ensureProfile()).role; } catch { /* ignore */ } }
  const links = [...NAV];
  if (role === 'admin') links.push(['admin.html', 'Admin']);
  if (role === 'business') links.splice(1, 2, ['redeem.html', 'Redeem a code']);
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `<a class="skip" href="#main">Skip to content</a>
  <div class="wrap bar">
    <a class="brand" href="index.html">${LOGO}<span>Recovery Milestones<small>one day at a time</small></span></a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="site-nav">Menu</button>
  </div>
  <nav id="site-nav" class="wrap site-nav" aria-label="Main">
    ${links.map(([href, label]) => `<a href="${href}" ${href === here ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
    ${session ? `<a href="settings.html" ${here === 'settings.html' ? 'aria-current="page"' : ''}>Settings</a><a href="#" id="sign-out">Sign out</a>` : `<a href="index.html#signin">Sign in</a>`}
  </nav>`;
  document.body.prepend(header);
  if (IS_DEMO) {
    const bar = document.createElement('div');
    bar.className = 'demo-banner';
    bar.innerHTML = `<div class="wrap"><span><strong>Preview mode:</strong> not connected to Supabase yet. Sample data (all fictional) stays in this browser.</span>
      <span class="row"><label class="sr-only" for="demo-role">View as</label><select id="demo-role"><option value="">View as…</option><option value="member">Member (Sam)</option><option value="business">Business</option><option value="admin">Admin</option><option value="out">Signed out</option></select>
      <button class="btn small ghost" id="demo-reset" type="button">Reset sample data</button></span></div>`;
    header.after(bar);
    $('#demo-role').value = session ? session.user.id.replace('demo-', '') : 'out';
    $('#demo-role').addEventListener('change', async (e) => {
      const v = e.target.value; if (!v) return;
      if (v === 'out') await A.signOut(); else await A.demoSignIn(v);
      location.reload();
    });
    $('#demo-reset').addEventListener('click', async () => { await A.resetDemo(); location.reload(); });
  }
  $('.nav-toggle').addEventListener('click', (e) => {
    const nav = $('#site-nav'); const open = nav.classList.toggle('open'); e.target.setAttribute('aria-expanded', String(open));
  });
  $('#sign-out')?.addEventListener('click', async (e) => { e.preventDefault(); await A.signOut(); location.href = 'index.html'; });

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `<div class="wrap">
    <div class="crisis" role="region" aria-label="Crisis resources">
      <strong>Need help right now?</strong> Call or text <a href="tel:988"><strong>988</strong></a> (Suicide &amp; Crisis Lifeline, 24/7) ·
      SAMHSA National Helpline <a href="tel:18006624357"><strong>1-800-662-4357</strong></a> (free, confidential, 24/7) ·
      In an emergency call <a href="tel:911">911</a>.
    </div>
    <div class="cols">
      <div><strong>Recovery Milestones</strong><br><small>Celebrating recovery, one day at a time · ${h(CONFIG.ORG_TOWN)}</small></div>
      <div><a href="about.html">About</a><br><a href="privacy.html">Privacy policy</a><br><a href="sponsor.html">Sponsor Recovery Milestones</a><br><a href="impact.html">Funder impact</a></div>
      <div><a href="mailto:${h(CONFIG.CONTACT_EMAIL)}">${h(CONFIG.CONTACT_EMAIL)}</a><br><small>No ads. No tracking. We never sell your data.</small></div>
    </div></div>`;
  document.body.append(footer);
  return { A, session, role };
}

// Redirects to the sign-in panel when there is no session. Returns { A, session, profile }.
export async function requireSignIn(ctx) {
  if (!ctx.session) {
    const main = $('#main');
    main.innerHTML = `<div class="wrap"><div class="card center stack"><h1>Please sign in</h1><p class="muted">This page is just for you. Sign in to continue.</p><div id="signin-slot"></div></div></div>`;
    signInPanel($('#signin-slot'), ctx.A);
    return null;
  }
  const profile = await ctx.A.ensureProfile();
  return profile;
}

export function signInPanel(el, A) {
  const providers = CONFIG.AUTH_PROVIDERS || [];
  const fb = providers.includes('facebook'), gg = providers.includes('google');
  const anyOAuth = fb || gg;
  el.innerHTML = `<div class="stack" style="max-width:380px;margin:0 auto">
    ${gg ? `<button class="btn google block" data-provider="google" type="button"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> Continue with Google</button>` : ''}
    ${fb ? `<button class="btn facebook block" data-provider="facebook" type="button"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg> Continue with Facebook</button>` : ''}
    <form id="magic" class="stack" novalidate>
      <label for="magic-email" class="small muted" style="font-weight:600">${anyOAuth ? 'Or get a sign-in link by email' : 'Get a sign-in link by email'}</label>
      <div class="row"><input id="magic-email" type="email" autocomplete="email" placeholder="you@example.com" required style="flex:1;min-width:200px"><button class="btn secondary" type="submit">Email me a link</button></div>
    </form>
    <p class="small muted">${anyOAuth ? 'Google and Facebook with the same email address sign in to the same account. ' : ''}We only receive your name and email — never your contacts or posts, and we never post for you.</p>
  </div>`;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-provider]'); if (!b) return;
    b.disabled = true;
    try { await A.signInWith(b.dataset.provider); } catch (err) { showError(err); b.disabled = false; }
  });
  $('#magic', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#magic-email', el).value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Please enter a valid email address.');
    try { await A.signInEmail(email); if (A.demo) location.href = 'app.html'; else toast('Check your email for a sign-in link.', 6000); } catch (err) { showError(err); }
  });
}

// QR code as inline SVG using the vendored MIT qrcode-generator (global `qrcode`).
export function qrSVG(text, cellSize = 5) {
  if (typeof window.qrcode !== 'function') return '';
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize, margin: 2, scalable: true, alt: 'QR code for your reward', title: 'Reward QR code' });
}
export const redeemUrl = (code) => `${SITE_URL}/redeem.html?code=${encodeURIComponent(code)}`;
export const fbShare = (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
export function openShare(url) { window.open(fbShare(url), 'fbshare', 'width=626,height=436,noopener'); }

export function download(filename, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function formToObject(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') { if (el.dataset.multi) { (o[el.name] ||= []); if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked; }
    else o[el.name] = el.value.trim();
  }
  return o;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export { SITE_URL, CONFIG, IS_DEMO };
