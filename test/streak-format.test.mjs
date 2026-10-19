import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStreak } from '../js/streak.js';
import { suppress, toCSV, generateCode, normalizeCode, formatTime12, escapeHTML } from '../js/format.js';

test('streak: empty', () => assert.deepEqual(computeStreak([], '2026-10-19'), { current: 0, best: 0, checkedToday: false }));
test('streak: checked in today and previous days', () => {
  assert.deepEqual(computeStreak(['2026-10-17', '2026-10-18', '2026-10-19'], '2026-10-19'), { current: 3, best: 3, checkedToday: true });
});
test('streak: alive until a full day is missed', () => {
  assert.equal(computeStreak(['2026-10-17', '2026-10-18'], '2026-10-19').current, 2);
  assert.equal(computeStreak(['2026-10-16', '2026-10-17'], '2026-10-19').current, 0);
});
test('streak: best across gaps, across month ends, duplicates ignored', () => {
  const s = computeStreak(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-02', '2026-10-10', '2026-10-19'], '2026-10-19');
  assert.equal(s.best, 4); assert.equal(s.current, 1);
});
test('suppression shows <10 for small counts', () => {
  assert.equal(suppress(0), '<10'); assert.equal(suppress(9), '<10');
  assert.equal(suppress(10), '10'); assert.equal(suppress(1234), '1,234');
});
test('csv escapes quotes, commas and formula prefixes', () => {
  const csv = toCSV([{ a: 'x,y', b: 'say "hi"', c: '=SUM(1)' }]);
  assert.equal(csv, 'a,b,c\r\n"x,y","say ""hi""",\'=SUM(1)');
});
test('codes use unambiguous alphabet', () => {
  const c = generateCode(8);
  assert.match(c, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(normalizeCode(' ab-cd 23 '), 'ABCD23');
});
test('misc format', () => {
  assert.equal(formatTime12('19:30'), '7:30 PM'); assert.equal(formatTime12('00:05'), '12:05 AM');
  assert.equal(escapeHTML('<b a="1">'), '&lt;b a=&quot;1&quot;&gt;');
});
