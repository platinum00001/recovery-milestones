import { chrome, signInPanel, $, h, toast, showError, formToObject, fmtDate, CONFIG } from '../ui.js';
import { OFFER_TARGETS, milestoneLabel } from '../milestones.js';
import { rewardSummary } from '../format.js';

const ctx = await chrome();
const A = ctx.A;
const main = $('#biz');

if (!ctx.session) {
  $('#biz-intro').hidden = false;
  signInPanel($('#biz-signin'), A);
} else {
  const p = await A.ensureProfile();
  const b = await A.myBusiness();
  if (!b) renderRegister(p); else await renderPortal(b);
}

function renderRegister(p) {
  $('#biz-intro').hidden = false; $('#biz-signin').innerHTML = '';
  const r = $('#register'); r.hidden = false;
  if (p.role === 'admin') r.insertAdjacentHTML('afterbegin', '<p class="notice">You are an admin; registering a business keeps your admin role.</p>');
  $('#register-form').onsubmit = async (e) => {
    e.preventDefault();
    const o = formToObject(e.target);
    if (!o.agree) return toast('Please agree to the partner promises.');
    try { await A.becomeBusiness(o); toast('Thanks! Your business is pending review.'); location.reload(); } catch (err) { showError(err); }
  };
}

async function renderPortal(b) {
  main.hidden = false;
  $('#biz-name').textContent = b.name;
  $('#biz-status').innerHTML = b.status === 'approved' ? '<span class="pill">Approved — your offers are live</span>' : b.status === 'pending' ? '<span class="pill warn">Pending review — offers go live once approved</span>' : '<span class="pill warn">Suspended — contact us</span>';
  if (b.featured) $('#biz-status').insertAdjacentHTML('beforeend', ' <span class="pill gold">Featured sponsor</span>');
  if (new URLSearchParams(location.search).get('sponsor') === 'thanks') toast('Thank you for sponsoring Root to Rise!');

  // profile + geocoding
  const pf = $('#bprofile-form');
  for (const k of ['name', 'description', 'contact_email', 'phone', 'website', 'address', 'town', 'state', 'lat', 'lng']) if (pf[k]) pf[k].value = b[k] ?? '';
  pf.onsubmit = async (e) => {
    e.preventDefault();
    const o = formToObject(pf);
    const lat = o.lat === '' ? null : Number(o.lat), lng = o.lng === '' ? null : Number(o.lng);
    if ((lat !== null && !(lat >= -90 && lat <= 90)) || (lng !== null && !(lng >= -180 && lng <= 180))) return toast('Latitude/longitude look off.');
    try { await A.updateBusiness({ ...o, lat, lng, state: (o.state || '').toUpperCase().slice(0, 2) }); toast('Business profile saved.'); } catch (err) { showError(err); }
  };
  let lastGeocode = 0;
  $('#geocode').onclick = async () => {
    // Nominatim usage policy: max 1 request/second, no autocomplete, cache results, attribute OSM.
    const q = [pf.address.value, pf.town.value, pf.state.value, 'USA'].filter(Boolean).join(', ');
    if (!pf.address.value && !pf.town.value) return toast('Enter an address or town first.');
    if (Date.now() - lastGeocode < 1500) return toast('One moment…');
    lastGeocode = Date.now();
    const cacheKey = 'geo:' + q.toLowerCase();
    let hit = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    try {
      if (!hit) {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(q)}&email=${encodeURIComponent(CONFIG.NOMINATIM_EMAIL)}`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        const arr = await res.json();
        if (!arr.length) return toast('Address not found — you can type latitude/longitude instead.');
        hit = { lat: +(+arr[0].lat).toFixed(5), lng: +(+arr[0].lon).toFixed(5), name: arr[0].display_name };
        localStorage.setItem(cacheKey, JSON.stringify(hit));
      }
      pf.lat.value = hit.lat; pf.lng.value = hit.lng;
      toast('Found: ' + hit.name.slice(0, 80) + ' — press Save to keep it.', 6000);
    } catch (err) { showError(new Error('Lookup failed. You can type coordinates instead.')); }
  };

  // offers
  const of = $('#offer-form');
  $('#targets').innerHTML = OFFER_TARGETS.map((t) => `<label class="check"><input type="checkbox" name="milestones" data-multi="1" value="${t.key}"> ${h(t.label)}</label>`).join('');
  const resetForm = () => { of.reset(); of.id.value = ''; $('#offer-submit').textContent = 'Post offer'; };
  of.onsubmit = async (e) => {
    e.preventDefault();
    const o = formToObject(of);
    if (!o.milestones.length) return toast('Choose at least one milestone.');
    try { await A.saveOffer({ ...o, id: o.id || undefined, business_id: b.id, active: o.active }); toast('Offer saved.'); resetForm(); await renderOffers(b); } catch (err) { showError(err); }
  };
  $('#offer-cancel').onclick = resetForm;
  await renderOffers(b);
  await renderClaims();

  // sponsorship CTA
  const tiers = await A.sponsorTiers();
  $('#sponsor-tiers').innerHTML = tiers.map((t) => `<option value="${h(t.key)}">${h(t.name)} — $${(t.price_cents / 100).toFixed(0)}/${t.billing_interval === 'one_time' ? 'once' : t.billing_interval}</option>`).join('');
  $('#sponsor-form').onsubmit = async (e) => {
    e.preventDefault();
    const tier = $('#sponsor-tiers').value;
    try {
      if (CONFIG.PAYMENTS_ENABLED && CONFIG.PAYMENT_MODE === 'checkout') { location.href = await A.startCheckout(tier); return; }
      await A.requestSponsorship(tier);
      const link = CONFIG.PAYMENTS_ENABLED && CONFIG.STRIPE_PAYMENT_LINKS?.[tier];
      if (link) { location.href = link; return; }
      location.href = `mailto:${CONFIG.CONTACT_EMAIL}?subject=${encodeURIComponent(`Featured sponsor: ${b.name} (${tier})`)}&body=${encodeURIComponent(`Hi Root to Rise,\n\nWe'd like to become a ${tier} sponsor.\n\nBusiness: ${b.name}\nTown: ${b.town || ''}\n\nThanks!`)}`;
      toast('Request saved — we opened an email to Root to Rise.');
    } catch (err) { showError(err); }
  };
}

async function renderOffers(b) {
  const offers = await A.myBusinessOffers(b.id);
  const of = $('#offer-form');
  $('#offers').innerHTML = offers.length ? offers.map((o) => `<div class="offer">
    <div class="row"><strong>${h(o.title)}</strong><span class="spacer"></span><span class="pill ${o.active ? '' : 'warn'}">${o.active ? 'Active' : 'Paused'}</span></div>
    <div class="small muted">${h(rewardSummary(o))} · for ${h(o.milestones.map((k) => (k === 'yN' ? 'every year after' : milestoneLabel(k))).join(', '))}${o.expires_on ? ' · ends ' + fmtDate(o.expires_on) : ''} · limit ${o.per_user_limit} per person${o.total_limit ? ` · ${o.total_limit} total` : ''}</div>
    <div class="row" style="margin-top:8px"><button class="btn small ghost" data-edit="${h(o.id)}" type="button">Edit</button><button class="btn small ghost" data-del="${h(o.id)}" type="button">Delete</button></div></div>`).join('') : '<p class="muted">No offers yet. Post your first one below.</p>';
  $('#offers').onclick = async (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) {
      const o = offers.find((x) => x.id === ed.dataset.edit);
      for (const k of ['id', 'title', 'description', 'reward_type', 'reward_value', 'starts_on', 'expires_on', 'redemption_rules', 'per_user_limit', 'total_limit']) of[k].value = o[k] ?? '';
      of.active.checked = o.active;
      for (const c of of.querySelectorAll('input[name=milestones]')) c.checked = o.milestones.includes(c.value);
      $('#offer-submit').textContent = 'Save changes'; of.scrollIntoView({ behavior: 'smooth' });
    }
    if (del && confirm('Delete this offer? Codes already issued for it will stop working.')) { await A.deleteOffer(del.dataset.del); await renderOffers(b); }
  };
}

async function renderClaims() {
  const claims = await A.businessClaims();
  const redeemed = claims.filter((c) => c.status === 'redeemed').length;
  $('#claim-stats').textContent = `${claims.length} codes issued · ${redeemed} redeemed`;
  $('#claims').innerHTML = claims.length ? `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Offer</th><th>Milestone</th><th>Status</th></tr></thead><tbody>${claims.slice(0, 50).map((c) => `<tr><td><code>${h(c.code)}</code></td><td>${h(c.offer_title)}</td><td>${h(milestoneLabel(c.milestone_key))}</td><td>${c.status === 'redeemed' ? 'Redeemed ' + fmtDate(c.redeemed_at) : 'Issued' + (c.expires_on ? ', use by ' + fmtDate(c.expires_on) : '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No codes claimed yet.</p>';
}
