import { chrome, $, h, CONFIG } from '../ui.js';

const ctx = await chrome();
const tiers = await ctx.A.sponsorTiers().catch(() => []);
const mail = (t) => `mailto:${CONFIG.CONTACT_EMAIL}?subject=${encodeURIComponent('Sponsoring Recovery Milestones' + (t ? ` (${t.name})` : ''))}&body=${encodeURIComponent('Hi Recovery Milestones team,\n\nOur business would like to sponsor Recovery Milestones.\n\nBusiness name:\nTown:\nTier:\n\nThanks!')}`;
$('#tiers').innerHTML = tiers.map((t) => {
  const link = CONFIG.PAYMENTS_ENABLED && CONFIG.PAYMENT_MODE === 'payment_links' && CONFIG.STRIPE_PAYMENT_LINKS?.[t.key];
  const cta = CONFIG.PAYMENTS_ENABLED
    ? (link ? `<a class="btn block" href="${h(link)}" rel="noopener">Sponsor with a card</a>` : `<a class="btn block" href="business.html#sponsor">Start in the business portal</a>`)
    : `<a class="btn block" href="${mail(t)}">Contact us to sponsor</a>`;
  return `<div class="card tier"><h3>${h(t.name)}</h3><div class="price">$${(t.price_cents / 100).toFixed(0)}<span class="small muted">/${t.billing_interval === 'one_time' ? 'once' : t.billing_interval}</span></div>
    <ul>${t.perks.map((p) => `<li>${h(p)}</li>`).join('')}</ul>${cta}</div>`;
}).join('');
$('#free-note').innerHTML = `Listing your business and posting milestone rewards is <strong>always free</strong>. Featured spots are optional and help keep Recovery Milestones free.`;
$('#contact').href = mail();
if (!CONFIG.PAYMENTS_ENABLED) $('#pay-note').textContent = 'Online payment is not switched on yet — email us and we will send an invoice or payment link.';
