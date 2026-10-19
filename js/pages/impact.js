import { chrome, $, fmtDate } from '../ui.js';

const ctx = await chrome();
const s = await ctx.A.impact().catch(() => null);
if (s) {
  const items = [['milestones_celebrated', 'Milestones celebrated', '🌱'], ['rewards_redeemed', 'Rewards redeemed', '🎁'], ['active_businesses', 'Active local businesses', '🏪'], ['supporters_engaged', 'Supporters engaged', '💚']];
  $('#stats').innerHTML = items.map(([k, label, icon]) => `<div class="card stat"><div aria-hidden="true" style="font-size:1.6rem">${icon}</div><b>${s[k]}</b><span>${label}</span></div>`).join('');
  $('#updated').textContent = `Updated ${fmtDate(s.updated_at)}${s.demo ? ' · preview numbers (sample data)' : ''}`;
}
