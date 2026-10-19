// Daily check-in streaks — pure logic. `days` = array of 'YYYY-MM-DD' check-in dates (any order, duplicates ok).
// Mirrors milestones.my_streak() in SQL: the current streak stays alive until a full day is missed.
import { addDays } from './milestones.js';

export function computeStreak(days, today) {
  const set = new Set(days);
  const sorted = [...set].filter((d) => d <= today).sort();
  let best = 0, run = 0, prev = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const checkedToday = set.has(today);
  let cur = 0;
  let cursor = checkedToday ? today : addDays(today, -1);
  while (set.has(cursor)) { cur++; cursor = addDays(cursor, -1); }
  return { current: cur, best, checkedToday };
}
