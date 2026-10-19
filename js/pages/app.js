import { chrome, requireSignIn, $, h, toast, showError, qrSVG, redeemUrl, fmtDate, SITE_URL } from '../ui.js';
import * as M from '../milestones.js';
import { rewardSummary } from '../format.js';

const ctx = await chrome();
const profile = await requireSignIn(ctx);
if (profile) await render(profile);

async function render(p) {
  const A = ctx.A;
  if (p.role === 'business') { $('#main .wrap').insertAdjacentHTML('afterbegin', `<div class="notice">This is a business account. <a href="business.html">Go to the business portal</a>.</div>`); }
  if (!p.clean_date) return renderSetup(p);
  const today = M.todayISO();
  await A.syncBadges();
  const days = M.daysClean(p.clean_date, today);
  const reached = M.reachedMilestones(p.clean_date, today);
  const next = M.nextMilestone(p.clean_date, today);
  const last = reached.at(-1);
  const pct = Math.round(M.progressToNext(p.clean_date, today) * 100);

  $('#hello').textContent = p.display_name ? `Welcome back, ${p.display_name}` : 'Welcome back';
  $('#days').textContent = days.toLocaleString('en-US');
  $('#days-label').textContent = days === 1 ? 'day' : 'days';
  $('#last').innerHTML = last ? `Latest milestone: <strong>${h(last.label)}</strong> (${fmtDate(last.date)})` : 'Your first milestone is just ahead.';
  $('#next-label').textContent = next ? next.label : '';
  $('#next-date').textContent = next ? fmtDate(next.date) : '';
  $('#progress').style.width = pct + '%';
  $('#progress').parentElement.setAttribute('aria-valuenow', String(pct));
  const tick = () => {
    const c = M.countdown(next.date);
    $('#countdown').innerHTML = `<div><b>${c.days}</b>days</div><div><b>${c.hours}</b>hours</div><div><b>${c.minutes}</b>min</div><div><b>${c.seconds}</b>sec</div>`;
  };
  tick(); setInterval(tick, 1000);

  // timeline
  const all = M.listMilestones(p.clean_date, next ? M.addDays(next.date, 400) : today).slice(0, Math.max(reached.length + 3, 9));
  $('#timeline').innerHTML = all.map((m) => `<li class="${m.date <= today ? 'done' : m.key === next?.key ? 'next' : ''}"><span class="dot" aria-hidden="true"></span><span><strong>${h(m.label)}</strong> <span class="muted small">${fmtDate(m.date)}</span></span><span class="spacer"></span>${m.date <= today ? '<span class="pill">Reached</span>' : m.key === next?.key ? '<span class="pill warn">Next</span>' : ''}</li>`).join('');

  // streak
  const showStreak = (s) => {
    $('#streak').innerHTML = `<span class="flame" aria-hidden="true">🔥</span><div><div><strong>${s.current}</strong>-day check-in streak</div><div class="small muted">Best: ${s.best} days</div></div>`;
    const b = $('#checkin'); b.disabled = s.checkedToday; b.textContent = s.checkedToday ? 'Checked in today ✓' : "I'm here today";
  };
  showStreak(await A.getStreak());
  $('#checkin').onclick = async () => { try { showStreak(await A.checkIn()); toast('Checked in. Proud of you for showing up.'); } catch (e) { showError(e); } };

  // card maker
  $('#card-key').innerHTML = reached.slice().reverse().map((m) => `<option value="${m.key}">${h(m.label)}</option>`).join('') || '<option value="">Reach your first milestone to make a card</option>';
  $('#card-name').disabled = !p.display_name;
  $('#card-name-hint').textContent = p.display_name ? '' : '(add a display name in Settings first)';
  $('#card-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.key.value) return toast('Make a card once you reach your first milestone.');
    try {
      const id = await A.createCard({ milestone_key: f.key.value, show_name: f.show_name.checked, show_date: f.show_date.checked, message: f.message.value });
      location.href = `card.html?id=${encodeURIComponent(id)}`;
    } catch (err) { showError(err); }
  };

  await renderRewards();
}

async function renderRewards() {
  const A = ctx.A;
  const [offers, claims] = await Promise.all([A.myOffers(), A.myClaims()]);
  const eligible = offers.filter((o) => o.eligible_key && o.my_claims < o.per_user_limit && !o.sold_out);
  $('#rewards').innerHTML = eligible.length ? eligible.map((o) => `
    <div class="offer ${o.featured ? 'featured' : ''}">
      <div class="row"><strong>${h(o.title)}</strong><span class="spacer"></span><span class="pill">${h(M.milestoneLabel(o.eligible_key))}</span>${o.featured ? '<span class="pill gold">Featured</span>' : ''}</div>
      <div class="small muted">${h(o.business_name)}${o.town ? ' · ' + h(o.town) : ''} · ${h(rewardSummary(o))}${o.expires_on ? ' · offer ends ' + fmtDate(o.expires_on) : ''}</div>
      ${o.description ? `<p class="small" style="margin:.4em 0">${h(o.description)}</p>` : ''}
      ${o.redemption_rules ? `<p class="small muted" style="margin:.2em 0 .6em">How to redeem: ${h(o.redemption_rules)}</p>` : ''}
      <button class="btn small" data-claim="${h(o.id)}" type="button">Claim reward</button>
    </div>`).join('') : `<p class="muted">No rewards to claim right now. Rewards open for 30 days after each milestone. <a href="map.html">See all local rewards</a>.</p>`;
  $('#rewards').onclick = async (e) => {
    const b = e.target.closest('[data-claim]'); if (!b) return;
    b.disabled = true;
    try { const c = await A.claimReward(b.dataset.claim); showCode(c.code, offers.find((o) => o.id === b.dataset.claim)?.title); await renderRewards(); }
    catch (err) { showError(err); b.disabled = false; }
  };
  $('#codes').innerHTML = claims.length ? claims.map((c) => `
    <div class="offer">
      <div class="row"><span class="code">${h(c.code)}</span><span class="spacer"></span><span class="pill ${c.status === 'redeemed' ? '' : 'warn'}">${c.status === 'redeemed' ? 'Used ' + fmtDate(c.redeemed_at) : 'Ready to use'}</span></div>
      <div class="small">${h(c.offer_title)} — ${h(c.business_name)}</div>
      <div class="small muted">${h(M.milestoneLabel(c.milestone_key))} reward${c.expires_on ? ' · use by ' + fmtDate(c.expires_on) : ''}</div>
      ${c.status === 'issued' ? `<button class="btn small ghost" data-qr="${h(c.code)}" data-title="${h(c.offer_title)}" type="button">Show QR code</button>` : ''}
    </div>`).join('') : '<p class="muted">Codes you claim will appear here.</p>';
  $('#codes').onclick = (e) => { const b = e.target.closest('[data-qr]'); if (b) showCode(b.dataset.qr, b.dataset.title); };
}

function showCode(code, title) {
  const d = $('#code-dialog');
  $('#code-body').innerHTML = `<h2>Your reward code</h2><p class="small">${h(title || '')}</p><div class="center stack"><div class="qr">${qrSVG(redeemUrl(code))}</div><div class="code">${h(code)}</div>
    <p class="small muted">Show this at the business. They scan it or type the code. It works once.</p></div>`;
  d.showModal();
}

function renderSetup(p) {
  $('#dash').hidden = true;
  const s = $('#setup'); s.hidden = false;
  const f = $('#setup-form');
  f.clean_date.max = M.todayISO();
  f.display_name.value = p.display_name || '';
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = M.validateCleanDate(f.clean_date.value, M.todayISO());
    if (err) return toast(err);
    try { await ctx.A.updateProfile({ clean_date: f.clean_date.value, display_name: f.display_name.value.trim() || null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' }); location.reload(); }
    catch (e2) { showError(e2); }
  };
}
