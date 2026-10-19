// Small pure helpers shared by pages, the demo backend and tests.
export const SUPPRESS_BELOW = 10;

// Small-number suppression for public/funder numbers: counts under 10 are shown as '<10'.
export function suppress(n, threshold = SUPPRESS_BELOW) {
  const v = Number(n) || 0;
  return v < threshold ? `<${threshold}` : v.toLocaleString('en-US');
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toCSV(rows, columns) {
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // avoid spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export function generateCode(len = 8, rand = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = rand(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
export function normalizeCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

export const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatTime12(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
}

export function rewardSummary(o) {
  if (o.reward_type === 'percent_off' && o.reward_value) return `${o.reward_value}% off`;
  if (o.reward_type === 'amount_off' && o.reward_value) return `$${o.reward_value} off`;
  if (o.reward_type === 'free_item') return 'Free item';
  return 'Special offer';
}
