// Recovery Milestones — pure milestone logic (no DOM, no network).
// All dates are calendar dates as 'YYYY-MM-DD' strings in the member's local time zone.
// This mirrors milestones.milestone_date() / milestones_reached() in supabase/migrations/001_init.sql.

export const FIXED_MILESTONES = [
  { key: 'h24', label: '24 Hours', unit: 'day', n: 1 },
  { key: 'd30', label: '30 Days', unit: 'day', n: 30 },
  { key: 'd60', label: '60 Days', unit: 'day', n: 60 },
  { key: 'd90', label: '90 Days', unit: 'day', n: 90 },
  { key: 'm6', label: '6 Months', unit: 'month', n: 6 },
  { key: 'm9', label: '9 Months', unit: 'month', n: 9 },
];

// Targets a business can choose for an offer. 'yN' = every anniversary after the first year (2, 3, 4 ...).
export const OFFER_TARGETS = [
  { key: 'h24', label: '24 Hours' }, { key: 'd30', label: '30 Days' }, { key: 'd60', label: '60 Days' },
  { key: 'd90', label: '90 Days' }, { key: 'm6', label: '6 Months' }, { key: 'm9', label: '9 Months' },
  { key: 'y1', label: '1 Year' }, { key: 'yN', label: 'Every year after (2+ years)' },
];

export const CLAIM_WINDOW_DAYS = 30;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseISO(s) {
  const m = ISO.exec(String(s || ''));
  if (!m) throw new RangeError(`Invalid date: ${s}`);
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw new RangeError(`Invalid date: ${s}`);
  return { y, m: mo, d, t };
}

const pad = (n) => String(n).padStart(2, '0');
function fromUTC(t) { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }

export function addDays(iso, n) { return fromUTC(parseISO(iso).t + n * 86400000); }

// Calendar month addition that clamps to the end of the month, like Postgres (Jan 31 + 1 month = Feb 28/29).
export function addMonths(iso, n) {
  const { y, m, d } = parseISO(iso);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

export function daysBetween(a, b) { return Math.round((parseISO(b).t - parseISO(a).t) / 86400000); }

export function todayISO(date = new Date()) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }

export function isYearKey(key) { return /^y([1-9]\d*)$/.test(key); }
export function yearsOf(key) { return isYearKey(key) ? parseInt(key.slice(1), 10) : null; }

export function isMilestoneKey(key) { return FIXED_MILESTONES.some((f) => f.key === key) || isYearKey(key); }

export function milestoneLabel(key) {
  const f = FIXED_MILESTONES.find((x) => x.key === key);
  if (f) return f.label;
  const n = yearsOf(key);
  if (n) return n === 1 ? '1 Year' : `${n} Years`;
  if (key === 'yN') return 'Every year after';
  return key;
}

export function milestoneDate(cleanDate, key) {
  const f = FIXED_MILESTONES.find((x) => x.key === key);
  if (f) return f.unit === 'day' ? addDays(cleanDate, f.n) : addMonths(cleanDate, f.n);
  const n = yearsOf(key);
  if (n) return addMonths(cleanDate, 12 * n);
  throw new RangeError(`Unknown milestone: ${key}`);
}

// Ordered milestones from the clean date, through the first milestone after `untilDate`.
export function listMilestones(cleanDate, untilDate) {
  parseISO(cleanDate); parseISO(untilDate);
  const out = FIXED_MILESTONES.map((f) => ({ key: f.key, label: f.label, date: milestoneDate(cleanDate, f.key) }));
  for (let n = 1; ; n++) {
    const key = `y${n}`;
    const date = milestoneDate(cleanDate, key);
    out.push({ key, label: milestoneLabel(key), date });
    if (date > untilDate) break;
    if (n > 200) break;
  }
  return out;
}

export function reachedMilestones(cleanDate, today) {
  return listMilestones(cleanDate, today).filter((m) => m.date <= today);
}

export function nextMilestone(cleanDate, today) {
  return listMilestones(cleanDate, today).find((m) => m.date > today) || null;
}

export function milestonesOn(cleanDate, day) {
  if (day <= cleanDate) return [];
  return listMilestones(cleanDate, day).filter((m) => m.date === day).map((m) => m.key);
}

export function daysClean(cleanDate, today) { return Math.max(0, daysBetween(cleanDate, today)); }

// Does an offer target (e.g. 'y1' or 'yN') match a reached milestone key?
export function targetMatches(target, key) {
  if (target === key) return true;
  if (target === 'yN') { const n = yearsOf(key); return n !== null && n >= 2; }
  return false;
}

// Most recent reached milestone within the claim window that matches one of the offer's targets, or null.
export function eligibleMilestone(cleanDate, today, targets, windowDays = CLAIM_WINDOW_DAYS) {
  const reached = reachedMilestones(cleanDate, today).reverse();
  for (const m of reached) {
    if (daysBetween(m.date, today) > windowDays) break;
    if (targets.some((t) => targetMatches(t, m.key))) return m.key;
  }
  return null;
}

// Countdown from `now` (a Date) to local midnight at the start of `targetISO`.
export function countdown(targetISO, now = new Date()) {
  const { y, m, d } = parseISO(targetISO);
  const ms = Math.max(0, new Date(y, m - 1, d).getTime() - now.getTime());
  const s = Math.floor(ms / 1000);
  return { totalMs: ms, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

// Progress (0..1) from the previous milestone (or clean date) to the next one.
export function progressToNext(cleanDate, today) {
  const next = nextMilestone(cleanDate, today);
  if (!next) return 1;
  const reached = reachedMilestones(cleanDate, today);
  const from = reached.length ? reached[reached.length - 1].date : cleanDate;
  const span = daysBetween(from, next.date);
  return span <= 0 ? 1 : Math.min(1, Math.max(0, daysBetween(from, today) / span));
}

export function validateCleanDate(iso, today) {
  try { parseISO(iso); } catch { return 'Please enter a valid date.'; }
  if (iso < '1900-01-01') return 'Please enter a date after 1900.';
  if (iso > today) return 'Your clean date cannot be in the future.';
  return null;
}

// Badge tier for styling the chip wall.
export function badgeTier(key) {
  if (key === 'h24') return 'dawn';
  if (key.startsWith('d')) return 'sprout';
  if (key.startsWith('m')) return 'branch';
  const n = yearsOf(key) || 0;
  return n >= 10 ? 'crown' : n >= 5 ? 'canopy' : 'root';
}
