import { chrome, $, h, CONFIG } from '../ui.js';
import { milestoneLabel } from '../milestones.js';
import { rewardSummary } from '../format.js';

const ctx = await chrome();
const biz = await ctx.A.publicBusinesses().catch(() => []);
const map = window.L.map('map', { scrollWheelZoom: false }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const targets = (ms) => ms.map((k) => (k === 'yN' ? 'every year after' : milestoneLabel(k))).join(', ');
const popup = (b) => `<strong>${h(b.name)}</strong>${b.featured ? ' ⭐' : ''}<br><span>${h(b.town || '')}</span>${(b.offers || []).map((o) => `<br>🎁 ${h(o.title)} <em>(${h(rewardSummary(o))})</em><br><small>For: ${h(targets(o.milestones))}</small>`).join('')}`;
const pts = [];
for (const b of biz) {
  if (typeof b.lat !== 'number' || typeof b.lng !== 'number') continue;
  const icon = window.L.divIcon({ className: '', html: `<div class="map-pin ${b.featured ? 'featured' : ''}" aria-hidden="true"></div>`, iconSize: [34, 34], iconAnchor: [14, 30], popupAnchor: [0, -28] });
  window.L.marker([b.lat, b.lng], { icon, title: b.name, alt: b.name, keyboard: true }).addTo(map).bindPopup(popup(b));
  pts.push([b.lat, b.lng]);
}
if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
$('#list').innerHTML = biz.length ? biz.map((b) => `<div class="offer ${b.featured ? 'featured' : ''}">
  <div class="row"><strong>${h(b.name)}</strong><span class="spacer"></span>${b.featured ? `<span class="pill gold">${h(b.tier_name || 'Featured sponsor')}</span>` : ''}</div>
  <div class="small muted">${h([b.address, b.town].filter(Boolean).join(' · '))}${b.website ? ` · <a href="${h(b.website)}" rel="noopener nofollow" target="_blank">Website</a>` : ''}</div>
  ${(b.offers || []).map((o) => `<div class="small">🎁 <strong>${h(o.title)}</strong> — ${h(rewardSummary(o))} · for ${h(targets(o.milestones))}</div>`).join('') || '<div class="small muted">No live offers right now.</div>'}
</div>`).join('') : '<p class="muted">No businesses listed yet.</p>';
