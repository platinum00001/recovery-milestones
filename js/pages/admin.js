import { chrome, requireSignIn, $, h, toast, showError, download, fmtDate, formToObject } from '../ui.js';
import { milestoneLabel, todayISO } from '../milestones.js';
import { toCSV } from '../format.js';

const table = (head, body) => `<div class="table-wrap"><table><thead><tr>${head.map((x) => `<th>${h(x)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${h(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="muted">No data yet</td></tr>`}</tbody></table></div>`;

const ctx = await chrome();
const p = await requireSignIn(ctx);
if (!p) $('#admin').hidden = true;
else if (p.role !== 'admin') $('#admin').innerHTML = '<div class="card"><h1>Admins only</h1><p class="muted">Ask the Root to Rise team if you need access.</p></div>';
else await render();

async function render() {
  const A = ctx.A;
  const s = await A.adminSummary();
  const labels = { members: 'Members', members_with_date: 'Members with clean date', active_members_90d: 'Active (signed in, 90 days)', checkins_30d: 'Check-ins (30 days)', businesses_approved: 'Businesses approved', businesses_pending: 'Businesses pending', businesses_featured: 'Featured sponsors', offers_active: 'Active offers', codes_issued: 'Codes issued', codes_redeemed: 'Codes redeemed', cards_created: 'Celebration cards', supporters: 'Supporters', notes_left: 'Notes left', email_optins: 'Email opt-ins', coach_requests_open: 'Open coach requests' };
  $('#summary').innerHTML = Object.entries(labels).map(([k, l]) => `<div class="card stat"><b>${(s[k] ?? 0).toLocaleString('en-US')}</b><span class="small">${l}</span></div>`).join('');
  if (s.demo) $('#summary').insertAdjacentHTML('beforebegin', '<p class="notice">Preview numbers (sample data).</p>');

  const rows = await A.adminStats();
  const months = [...new Set(rows.map((r) => r.month))].sort().reverse();
  const totals = months.map((m) => {
    const rs = rows.filter((r) => r.month === m);
    const sum = (k) => rs.reduce((a, r) => a + Number(r[k] || 0), 0);
    return { month: m.slice(0, 7), signups: sum('signups'), milestones_reached: sum('milestones_reached'), codes_issued: sum('codes_issued'), codes_redeemed: sum('codes_redeemed'), cards_created: sum('cards_created') };
  });
  $('#by-month').innerHTML = table(['Month', 'Signups', 'Milestones reached', 'Codes issued', 'Codes redeemed', 'Cards'], totals.map((t) => [t.month, t.signups, t.milestones_reached, t.codes_issued, t.codes_redeemed, t.cards_created]));
  const byKey = {};
  for (const r of rows) if (r.milestone_key !== 'all') { const o = (byKey[r.milestone_key] ||= { reached: 0, issued: 0, redeemed: 0 }); o.reached += +r.milestones_reached; o.issued += +r.codes_issued; o.redeemed += +r.codes_redeemed; }
  $('#by-milestone').innerHTML = table(['Milestone', 'Reached', 'Codes issued', 'Codes redeemed'], Object.entries(byKey).map(([k, v]) => [milestoneLabel(k), v.reached, v.issued, v.redeemed]));
  $('#csv-month').onclick = () => download(`recovery-milestones-by-month-${todayISO()}.csv`, toCSV(totals), 'text/csv');
  $('#csv-detail').onclick = () => download(`recovery-milestones-detail-${todayISO()}.csv`, toCSV(rows.map((r) => ({ ...r, milestone: r.milestone_key === 'all' ? 'all' : milestoneLabel(r.milestone_key) })), ['month', 'milestone_key', 'milestone', 'signups', 'milestones_reached', 'codes_issued', 'codes_redeemed', 'cards_created']), 'text/csv');
  $('#csv-summary').onclick = () => download(`recovery-milestones-summary-${todayISO()}.csv`, toCSV(Object.entries(labels).map(([k, l]) => ({ metric: l, value: s[k] ?? 0 }))), 'text/csv');

  await renderBusinesses();
  await renderCoaches();
  await renderRequests();
}


async function renderBusinesses() {
  const list = await ctx.A.adminBusinesses();
  const tiers = await ctx.A.sponsorTiers();
  $('#businesses').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Business</th><th>Status</th><th>Featured</th><th>Sponsor requests</th><th></th></tr></thead><tbody>${list.map((b) => `
    <tr data-id="${h(b.id)}"><td><strong>${h(b.name)}</strong><div class="small muted">${h(b.town || '')} ${b.contact_email ? '· ' + h(b.contact_email) : ''} · ${b.offers} offers · ${b.redeemed} redeemed</div></td>
    <td><select name="status">${['pending', 'approved', 'suspended'].map((x) => `<option ${x === b.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
    <td><label class="check small"><input type="checkbox" name="featured" ${b.featured ? 'checked' : ''}> Featured</label>
      <select name="sponsor_tier"><option value="">No tier</option>${tiers.map((t) => `<option value="${h(t.key)}" ${t.key === b.sponsor_tier ? 'selected' : ''}>${h(t.name)}</option>`).join('')}</select>
      <input type="date" name="featured_until" value="${h(b.featured_until || '')}" aria-label="Featured until"></td>
    <td class="small">${(b.sponsorship_requests || []).map((r) => `${h(r.tier)} (${h(r.status)}, ${fmtDate(r.created_at)})`).join('<br>') || '—'}</td>
    <td><button class="btn small secondary" data-save type="button">Save</button></td></tr>`).join('')}</tbody></table></div>`;
  $('#businesses').onclick = async (e) => {
    if (!e.target.closest('[data-save]')) return;
    const tr = e.target.closest('tr');
    const v = (n) => tr.querySelector(`[name=${n}]`);
    try { await ctx.A.adminSetBusiness(tr.dataset.id, { status: v('status').value, featured: v('featured').checked, sponsor_tier: v('sponsor_tier').value, featured_until: v('featured_until').value }); toast('Business updated.'); }
    catch (err) { showError(err); }
  };
}

async function renderCoaches() {
  const list = await ctx.A.adminCoaches();
  $('#coaches').innerHTML = table(['Coach', 'Area', 'Example?', 'Active'], list.map((c) => [c.display_name, c.service_area || '', c.is_example ? 'Example' : 'Real', c.active ? 'Yes' : 'No']))
    + `<div class="row" style="margin-top:8px">${list.map((c) => `<button class="btn small ghost" data-del="${h(c.id)}" type="button">Remove ${h(c.display_name)}</button>`).join('')}</div>`;
  $('#coaches').onclick = async (e) => { const b = e.target.closest('[data-del]'); if (b && confirm('Remove this coach?')) { await ctx.A.adminDeleteCoach(b.dataset.del); await renderCoaches(); } };
  $('#coach-form').onsubmit = async (e) => {
    e.preventDefault();
    const o = formToObject(e.target);
    try { await ctx.A.adminSaveCoach({ display_name: o.display_name, bio: o.bio, service_area: o.service_area, availability: o.availability, specialties: o.specialties.split(',').map((x) => x.trim()).filter(Boolean), languages: (o.languages || 'English').split(',').map((x) => x.trim()).filter(Boolean), is_example: o.is_example, active: true }); e.target.reset(); await renderCoaches(); toast('Coach saved.'); }
    catch (err) { showError(err); }
  };
}

async function renderRequests() {
  const list = await ctx.A.adminCoachRequests();
  $('#requests').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Received</th><th>Name &amp; contact</th><th>Message</th><th>Status</th></tr></thead><tbody>${list.map((r) => `
    <tr><td class="small">${fmtDate(r.created_at)}</td><td>${h(r.name)}<div class="small muted">${h(r.preferred_contact)}: ${h(r.email || '')} ${h(r.phone || '')}</div></td><td class="small">${h(r.message || '')}</td>
    <td><select data-req="${h(r.id)}">${['new', 'contacted', 'closed'].map((x) => `<option ${x === r.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No coach requests yet.</p>';
  $('#requests').onchange = async (e) => { const s = e.target.closest('[data-req]'); if (s) { await ctx.A.adminSetCoachRequest(s.dataset.req, s.value); toast('Updated.'); } };
}
