import { chrome, requireSignIn, $, h, showError, fmtDate } from '../ui.js';
import { milestoneLabel } from '../milestones.js';
import { normalizeCode } from '../format.js';

const ctx = await chrome();
const p = await requireSignIn(ctx);
if (p) {
  const f = $('#redeem-form');
  const pre = new URLSearchParams(location.search).get('code');
  if (pre) f.code.value = normalizeCode(pre);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const code = normalizeCode(f.code.value);
    if (code.length < 6) return;
    const out = $('#result');
    try {
      const r = await ctx.A.redeemCode(code);
      if (r.ok) out.innerHTML = `<div class="notice ok"><strong>✅ Redeemed!</strong> ${h(r.offer_title)} — ${h(milestoneLabel(r.milestone_key))} milestone. Congratulate them!</div>`;
      else if (r.reason === 'already_redeemed') out.innerHTML = `<div class="notice err"><strong>Already used</strong> on ${fmtDate(r.redeemed_at)} (${h(r.offer_title)}).</div>`;
      else out.innerHTML = `<div class="notice err"><strong>Expired</strong> on ${fmtDate(r.expires_on)} (${h(r.offer_title)}).</div>`;
      f.code.value = '';
    } catch (err) { out.innerHTML = `<div class="notice err">${h(err.message)}</div>`; }
  };
} else $('#redeem-card').hidden = true;
