import { chrome, signInPanel, $, h, toast, showError, formToObject } from '../ui.js';

const CONSENT_TEXT = 'I agree that Root to Rise (Inspiration Is Everywhere) may store this request and contact me by the method I chose to help connect me with a recovery coach. I understand this is not emergency or medical care, and I can ask for this request to be deleted at any time.';
const ctx = await chrome();
const coaches = await ctx.A.coaches().catch(() => []);
$('#coach-list').innerHTML = coaches.length ? coaches.map((c) => `<div class="card stack">
  <div class="row"><h3 style="margin:0">${h(c.display_name)}</h3><span class="spacer"></span>${c.is_example ? '<span class="pill example">Example profile</span>' : ''}</div>
  <p class="small" style="margin:0">${h(c.bio || '')}</p>
  <div class="small muted">${h(c.service_area || '')}${c.languages?.length ? ' · ' + h(c.languages.join(', ')) : ''}${c.availability ? ' · ' + h(c.availability) : ''}</div>
  <div class="row">${(c.specialties || []).map((s) => `<span class="pill">${h(s)}</span>`).join('')}</div>
  <button class="btn small ghost" data-coach="${h(c.id)}" data-name="${h(c.display_name)}" type="button">Request this coach</button></div>`).join('') : '<p class="muted">Coach profiles are coming soon. You can still request a coach below.</p>';
$('#consent-text').textContent = CONSENT_TEXT;
const f = $('#coach-form');
f.coach_id.innerHTML = `<option value="">Any coach — match me</option>` + coaches.map((c) => `<option value="${h(c.id)}">${h(c.display_name)}</option>`).join('');
$('#coach-list').onclick = (e) => { const b = e.target.closest('[data-coach]'); if (b) { f.coach_id.value = b.dataset.coach; f.scrollIntoView({ behavior: 'smooth' }); f.name.focus(); } };
if (!ctx.session) { $('#coach-signin').hidden = false; signInPanel($('#coach-signin-slot'), ctx.A); f.hidden = true; }
f.onsubmit = async (e) => {
  e.preventDefault();
  const o = formToObject(f);
  if (!o.consent) return toast('Please tick the consent box so we can contact you.');
  if (!o.email && !o.phone) return toast('Add an email or phone number.');
  try { await ctx.A.requestCoach({ ...o, consent_text: CONSENT_TEXT }); f.innerHTML = '<div class="notice ok"><strong>Request received.</strong> A Root to Rise team member will reach out. If you need help right now, call or text 988.</div>'; }
  catch (err) { showError(err); }
};
