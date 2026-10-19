import { chrome, requireSignIn, $, h, toast, showError, openShare, fmtDate, SITE_URL } from '../ui.js';
import * as M from '../milestones.js';

const ctx = await chrome();
const slug = new URLSearchParams(location.search).get('u');

const chip = (key, when, locked = false) => `<div class="chip ${locked ? 'locked' : M.badgeTier(key)}"><div class="coin" aria-hidden="true">${h(M.milestoneLabel(key))}</div><div><strong>${h(M.milestoneLabel(key))}</strong></div>${when ? `<div class="when">${h(when)}</div>` : ''}<span class="sr-only">${locked ? 'Not yet reached' : 'Reached'}</span></div>`;

if (slug) await publicView(slug); else await ownerView();

async function publicView(s) {
  $('#owner').hidden = true;
  const v = $('#public'); v.hidden = false;
  const w = await ctx.A.publicWall(s).catch(() => null);
  if (!w || w.private) { v.innerHTML = `<div class="card center"><h1>This wall is private</h1><p class="muted">The owner hasn't made their badge wall public. Recovery is personal — that's okay.</p></div>`; return; }
  document.title = `${w.display_name ? w.display_name + "'s" : 'A'} recovery badge wall · Recovery Milestones`;
  v.innerHTML = `<div class="card stack"><h1>${w.display_name ? h(w.display_name) + "'s" : 'A'} recovery badge wall</h1>
    ${w.clean_date ? `<p class="muted">Clean since ${fmtDate(w.clean_date)}</p>` : ''}
    <div class="badges">${w.badges.map((b) => chip(b.key, b.reached_on ? fmtDate(b.reached_on) : '')).join('')}</div>
    <div class="row"><button class="btn facebook" id="share" type="button">Share to Facebook</button><span class="small muted">Celebrated with Recovery Milestones by Root to Rise</span></div></div>
    <h2 style="margin-top:24px">Notes of encouragement</h2>
    <div class="stack">${w.notes.length ? w.notes.map((n) => `<div class="note"><p style="margin:0">${h(n.message)}</p><div class="small muted">— ${h(n.author_name)}</div></div>`).join('') : '<p class="muted">No notes yet.</p>'}</div>`;
  $('#share').onclick = () => openShare(location.href);
}

async function ownerView() {
  const p = await requireSignIn(ctx);
  if (!p) { $('#owner').hidden = true; return; }
  const A = ctx.A;
  if (!p.clean_date) { $('#owner').innerHTML = `<div class="card"><p>Add your clean date on <a href="app.html">My Milestones</a> to start earning badges.</p></div>`; return; }
  const today = M.todayISO();
  const badges = await A.syncBadges();
  const next = M.listMilestones(p.clean_date, today).filter((m) => m.date > today).slice(0, 2);
  $('#my-badges').innerHTML = badges.map((b) => chip(b.milestone_key, fmtDate(b.reached_on))).join('') + next.map((m) => chip(m.key, 'Coming ' + fmtDate(m.date), true)).join('');
  const wallUrl = `${SITE_URL}/wall.html?u=${encodeURIComponent(p.wall_slug)}`;
  const f = $('#wall-privacy');
  f.wall_public.checked = p.wall_public; f.show_name_public.checked = p.show_name_public; f.wall_show_date.checked = p.wall_show_date;
  const syncLink = () => {
    $('#wall-link').hidden = !f.wall_public.checked;
    $('#wall-url').value = wallUrl;
  };
  syncLink();
  f.onchange = async () => {
    try { await A.updateProfile({ wall_public: f.wall_public.checked, show_name_public: f.show_name_public.checked, wall_show_date: f.wall_show_date.checked }); syncLink(); toast('Privacy settings saved.'); }
    catch (e) { showError(e); }
  };
  $('#copy-wall').onclick = async () => { try { await navigator.clipboard.writeText(wallUrl); toast('Link copied.'); } catch { $('#wall-url').select(); } };
  $('#share-wall').onclick = () => openShare(wallUrl);
  $('#view-wall').href = wallUrl;
  await renderNotes();
}

async function renderNotes() {
  const notes = await ctx.A.myNotes();
  $('#notes').innerHTML = notes.length ? notes.map((n) => `<div class="note stack">
      <div class="row"><strong>${h(n.author_name)}</strong><span class="spacer"></span><span class="pill ${n.status === 'pending' ? 'warn' : ''}">${n.status === 'pending' ? 'Waiting for you' : n.status === 'approved' ? 'Shown on wall' : 'Hidden'}</span></div>
      <p style="margin:0">${h(n.message)}</p>
      <div class="row">${n.status !== 'approved' ? `<button class="btn small secondary" data-act="approved" data-id="${h(n.id)}" type="button">Show on my wall</button>` : ''}
      ${n.status !== 'hidden' ? `<button class="btn small ghost" data-act="hidden" data-id="${h(n.id)}" type="button">Hide</button>` : ''}
      <button class="btn small ghost" data-act="delete" data-id="${h(n.id)}" type="button">Delete</button></div></div>`).join('')
    : '<p class="muted">When supporters leave notes, they show up here first. Only notes you approve appear on your wall.</p>';
  $('#notes').onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    try { if (b.dataset.act === 'delete') await ctx.A.deleteNote(b.dataset.id); else await ctx.A.moderateNote(b.dataset.id, b.dataset.act); await renderNotes(); }
    catch (err) { showError(err); }
  };
}
