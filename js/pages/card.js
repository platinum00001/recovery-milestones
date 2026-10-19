import { chrome, $, h, openShare, fmtDate, toast } from '../ui.js';
import { milestoneLabel } from '../milestones.js';

const ctx = await chrome();
const id = new URLSearchParams(location.search).get('id');
const el = $('#card');
const card = id ? await ctx.A.getCard(id).catch(() => null) : null;
if (!card) {
  el.innerHTML = `<div class="card center"><h1>Card not found</h1><p class="muted">This celebration card may have been removed.</p><a class="btn" href="index.html">Visit Recovery Milestones</a></div>`;
} else {
  const label = milestoneLabel(card.milestone_key);
  document.title = `${label}! · Recovery Milestones`;
  el.innerHTML = `<div class="celebration" role="img" aria-label="Celebration card: ${h(label)}">
      <div style="font-size:3rem" aria-hidden="true">🌱✨</div>
      <div class="sub">${card.display_name ? h(card.display_name) + ' is celebrating' : 'Celebrating'}</div>
      <h1>${h(label)}!</h1>
      <div class="sub">in recovery${card.milestone_date ? ' · ' + fmtDate(card.milestone_date) : ''}</div>
      ${card.message ? `<blockquote>“${h(card.message)}”</blockquote>` : ''}
      <div class="small" style="margin-top:22px;opacity:.85">Celebrated with Recovery Milestones by Root to Rise</div>
    </div>
    <div class="row no-print" style="justify-content:center;margin-top:20px">
      <button class="btn facebook" id="fb" type="button">Share to Facebook</button>
      <button class="btn ghost" id="copy" type="button">Copy link</button>
      <a class="btn ghost" href="app.html">Back to my milestones</a>
    </div>
    <p class="small muted center no-print" style="margin-top:12px">Facebook opens a share window — nothing is posted unless you press Post there. The link preview shows a general Root to Rise image, never your date.</p>`;
  $('#fb').onclick = () => openShare(location.href);
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(location.href); toast('Link copied.'); } catch { toast(location.href); } };
}
