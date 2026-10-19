import { chrome, requireSignIn, $, h, toast, showError, download, formToObject, fmtDate } from '../ui.js';
import { validateCleanDate, todayISO } from '../milestones.js';
import { DAYS_OF_WEEK, formatTime12 } from '../format.js';

const ctx = await chrome();
const p = await requireSignIn(ctx);
if (p) await render(p); else $('#settings').hidden = true;

async function render(p) {
  const A = ctx.A;
  const pf = $('#profile-form');
  pf.display_name.value = p.display_name || '';
  pf.clean_date.value = p.clean_date || ''; pf.clean_date.max = todayISO();
  const tzs = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone').filter((z) => z.startsWith('America/')) : ['America/New_York'];
  pf.timezone.innerHTML = [...new Set([p.timezone, ...tzs])].map((z) => `<option ${z === p.timezone ? 'selected' : ''}>${h(z)}</option>`).join('');
  pf.show_name_public.checked = p.show_name_public; pf.wall_public.checked = p.wall_public; pf.wall_show_date.checked = p.wall_show_date;
  pf.onsubmit = async (e) => {
    e.preventDefault();
    const o = formToObject(pf);
    if (o.clean_date) { const err = validateCleanDate(o.clean_date, todayISO()); if (err) return toast(err); }
    try { await A.updateProfile({ display_name: o.display_name || null, clean_date: o.clean_date || null, timezone: o.timezone, show_name_public: o.show_name_public, wall_public: o.wall_public, wall_show_date: o.wall_show_date }); await A.syncBadges(); toast('Saved.'); }
    catch (err) { showError(err); }
  };

  const prefs = await A.getPrefs();
  const ef = $('#email-form');
  ef.email_milestones.checked = prefs.email_milestones; ef.email_reminders.checked = prefs.email_reminders;
  ef.onchange = async () => { try { await A.updatePrefs({ email_milestones: ef.email_milestones.checked, email_reminders: ef.email_reminders.checked }); toast('Email choices saved.'); } catch (e) { showError(e); } };

  // linked sign-in methods
  try {
    const ids = await A.identities();
    $('#identities').innerHTML = `Signed in with: ${ids.map((i) => `<span class="pill">${h(i)}</span>`).join(' ')} ` +
      ['google', 'facebook'].filter((x) => !ids.includes(x)).map((x) => `<button class="btn small ghost" data-link="${x}" type="button">Also link ${x[0].toUpperCase() + x.slice(1)}</button>`).join(' ');
    $('#identities').onclick = async (e) => { const b = e.target.closest('[data-link]'); if (b) { try { await A.linkIdentity(b.dataset.link); } catch (err) { showError(err); } } };
  } catch { /* optional */ }

  await renderSupporters();
  const sf = $('#supporter-form');
  sf.onsubmit = async (e) => {
    e.preventDefault();
    const o = formToObject(sf);
    if (!o.consent_confirmed) return toast('Please confirm they agreed to hear from Recovery Milestones.');
    try { await A.addSupporter(o); sf.reset(); toast('Supporter added.'); await renderSupporters(); } catch (err) { showError(err); }
  };

  await renderReminders();
  const rf = $('#reminder-form');
  rf.day_of_week.innerHTML = DAYS_OF_WEEK.map((d, i) => `<option value="${i}">${d}</option>`).join('');
  rf.onsubmit = async (e) => {
    e.preventDefault();
    const o = formToObject(rf);
    if (!o.label || !o.meet_time) return toast('Add a label and time.');
    try { await A.addReminder(o); rf.reset(); toast('Reminder added.' + (ef.email_reminders.checked ? '' : ' Turn on meeting reminder emails above to receive it.')); await renderReminders(); } catch (err) { showError(err); }
  };

  $('#export').onclick = async () => { try { download(`recovery-milestones-my-data-${todayISO()}.json`, JSON.stringify(await A.exportMyData(), null, 2), 'application/json'); } catch (e) { showError(e); } };
  $('#delete').onclick = async () => {
    const typed = prompt('This permanently deletes your Recovery Milestones profile, badges, codes, cards, supporters, notes, reminders and check-ins.\n\nType DELETE to confirm.');
    if (typed !== 'DELETE') return;
    try { await A.deleteMyData(); alert('Your data has been deleted.'); location.href = 'index.html'; } catch (e) { showError(e); }
  };
}

async function renderSupporters() {
  const list = await ctx.A.listSupporters();
  $('#supporters').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Relationship</th><th>Milestone emails</th><th></th></tr></thead><tbody>${list.map((s) => `
    <tr><td>${h(s.name)}<div class="small muted">${h(s.email)}</div></td><td>${h(s.relationship)}</td>
    <td>${s.unsubscribed ? '<span class="pill warn">They unsubscribed</span>' : `<label class="check"><input type="checkbox" data-notify="${h(s.id)}" ${s.notify_on_milestones ? 'checked' : ''}> Email them on my milestones</label>`}</td>
    <td><button class="btn small ghost" data-remove="${h(s.id)}" type="button">Remove</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No supporters yet.</p>';
  $('#supporters').onchange = async (e) => { const c = e.target.closest('[data-notify]'); if (c) { try { await ctx.A.updateSupporter(c.dataset.notify, { notify_on_milestones: c.checked }); toast('Saved.'); } catch (err) { showError(err); } } };
  $('#supporters').onclick = async (e) => { const b = e.target.closest('[data-remove]'); if (b && confirm('Remove this supporter?')) { await ctx.A.removeSupporter(b.dataset.remove); await renderSupporters(); } };
}

async function renderReminders() {
  const list = await ctx.A.listReminders();
  $('#reminders').innerHTML = list.length ? `<ul class="timeline">${list.map((r) => `<li class="${r.active ? 'done' : ''}"><span class="dot" aria-hidden="true"></span><span><strong>${h(r.label)}</strong> <span class="small muted">${DAYS_OF_WEEK[r.day_of_week]}s at ${formatTime12(r.meet_time)}</span></span><span class="spacer"></span>
    <label class="check small"><input type="checkbox" data-active="${h(r.id)}" ${r.active ? 'checked' : ''}> On</label><button class="btn small ghost" data-del="${h(r.id)}" type="button">Delete</button></li>`).join('')}</ul>` : '<p class="muted">No meeting reminders yet.</p>';
  $('#reminders').onchange = async (e) => { const c = e.target.closest('[data-active]'); if (c) await ctx.A.updateReminder(c.dataset.active, { active: c.checked }); };
  $('#reminders').onclick = async (e) => { const b = e.target.closest('[data-del]'); if (b) { await ctx.A.deleteReminder(b.dataset.del); await renderReminders(); } };
}
