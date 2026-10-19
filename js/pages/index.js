import { chrome, signInPanel, $, h } from '../ui.js';
import { rewardSummary } from '../format.js';

const ctx = await chrome();
const slot = $('#signin-slot');
if (ctx.session) {
  slot.innerHTML = `<div class="stack center"><p>You're signed in.</p><a class="btn block" href="${ctx.role === 'business' ? 'business.html' : ctx.role === 'admin' ? 'admin.html' : 'app.html'}">Go to my ${ctx.role === 'business' ? 'business portal' : ctx.role === 'admin' ? 'admin view' : 'milestones'}</a></div>`;
} else signInPanel(slot, ctx.A);

try {
  const biz = await ctx.A.publicBusinesses();
  const featured = biz.filter((b) => b.featured).slice(0, 3);
  const withOffers = biz.filter((b) => b.offers?.length).slice(0, 6);
  $('#featured').innerHTML = (featured.length ? featured : withOffers.slice(0, 3)).map((b) => `
    <div class="offer ${b.featured ? 'featured' : ''}">
      <div class="row"><strong>${h(b.name)}</strong><span class="spacer"></span>${b.featured ? '<span class="pill gold">Featured sponsor</span>' : ''}</div>
      <div class="small muted">${h(b.town || '')}</div>
      ${(b.offers || []).slice(0, 2).map((o) => `<div class="small">🎁 ${h(o.title)} <span class="muted">(${h(rewardSummary(o))})</span></div>`).join('')}
    </div>`).join('') || '<p class="muted">Local businesses are joining now.</p>';
} catch (e) { $('#featured').innerHTML = '<p class="muted">Rewards will appear here.</p>'; }
