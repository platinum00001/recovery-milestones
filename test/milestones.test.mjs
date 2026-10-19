import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/milestones.js';

test('fixed milestone dates', () => {
  const c = '2025-01-01';
  assert.equal(M.milestoneDate(c, 'h24'), '2025-01-02');
  assert.equal(M.milestoneDate(c, 'd30'), '2025-01-31');
  assert.equal(M.milestoneDate(c, 'd60'), '2025-03-02');
  assert.equal(M.milestoneDate(c, 'd90'), '2025-04-01');
  assert.equal(M.milestoneDate(c, 'm6'), '2025-07-01');
  assert.equal(M.milestoneDate(c, 'm9'), '2025-10-01');
  assert.equal(M.milestoneDate(c, 'y1'), '2026-01-01');
  assert.equal(M.milestoneDate(c, 'y5'), '2030-01-01');
});

test('month math clamps like Postgres', () => {
  assert.equal(M.addMonths('2025-08-31', 6), '2026-02-28');
  assert.equal(M.addMonths('2023-05-31', 9), '2024-02-29');
  assert.equal(M.milestoneDate('2024-02-29', 'y1'), '2025-02-28');
  assert.equal(M.milestoneDate('2024-02-29', 'y4'), '2028-02-29');
  assert.equal(M.addMonths('2025-11-15', 2), '2026-01-15');
});

test('labels and keys', () => {
  assert.equal(M.milestoneLabel('y1'), '1 Year');
  assert.equal(M.milestoneLabel('y12'), '12 Years');
  assert.equal(M.milestoneLabel('h24'), '24 Hours');
  assert.ok(M.isMilestoneKey('y3'));
  assert.ok(!M.isMilestoneKey('y0'));
  assert.ok(!M.isMilestoneKey('yN'));
});

test('reached and next milestone', () => {
  const r = M.reachedMilestones('2025-01-01', '2025-03-05').map((m) => m.key);
  assert.deepEqual(r, ['h24', 'd30', 'd60']);
  assert.equal(M.nextMilestone('2025-01-01', '2025-03-05').key, 'd90');
  assert.equal(M.nextMilestone('2025-01-01', '2025-01-01').key, 'h24');
  assert.deepEqual(M.reachedMilestones('2025-01-01', '2025-01-01'), []);
  const longR = M.reachedMilestones('2015-06-10', '2026-10-19').map((m) => m.key);
  assert.equal(longR.at(-1), 'y11');
  assert.equal(M.nextMilestone('2015-06-10', '2026-10-19').key, 'y12');
});

test('milestone on its exact day counts as reached', () => {
  assert.equal(M.reachedMilestones('2025-01-01', '2026-01-01').at(-1).key, 'y1');
  assert.equal(M.nextMilestone('2025-01-01', '2026-01-01').key, 'y2');
});

test('milestonesOn finds today\'s milestone(s)', () => {
  assert.deepEqual(M.milestonesOn('2025-01-01', '2025-01-31'), ['d30']);
  assert.deepEqual(M.milestonesOn('2025-01-01', '2028-01-01'), ['y3']);
  assert.deepEqual(M.milestonesOn('2025-01-01', '2025-02-01'), []);
  assert.deepEqual(M.milestonesOn('2025-01-01', '2025-01-01'), []);
});

test('daysClean', () => {
  assert.equal(M.daysClean('2025-01-01', '2025-01-01'), 0);
  assert.equal(M.daysClean('2024-01-01', '2025-01-01'), 366);
  assert.equal(M.daysClean('2025-03-08', '2025-03-10'), 2); // across DST change
});

test('offer target matching', () => {
  assert.ok(M.targetMatches('y1', 'y1'));
  assert.ok(!M.targetMatches('yN', 'y1'));
  assert.ok(M.targetMatches('yN', 'y2'));
  assert.ok(M.targetMatches('yN', 'y25'));
  assert.ok(!M.targetMatches('d30', 'd60'));
});

test('eligibleMilestone respects 30-day window and targets', () => {
  // 90 days reached on 2025-04-01
  assert.equal(M.eligibleMilestone('2025-01-01', '2025-04-10', ['d90']), 'd90');
  assert.equal(M.eligibleMilestone('2025-01-01', '2025-05-01', ['d90']), 'd90'); // exactly 30 days later
  assert.equal(M.eligibleMilestone('2025-01-01', '2025-05-02', ['d90']), null);
  assert.equal(M.eligibleMilestone('2025-01-01', '2025-04-10', ['d30', 'y1']), null);
  assert.equal(M.eligibleMilestone('2020-01-01', '2026-01-05', ['yN']), 'y6');
  assert.equal(M.eligibleMilestone('2025-01-01', '2026-01-05', ['yN']), null);
});

test('countdown to local midnight', () => {
  const now = new Date(2025, 0, 1, 12, 0, 0);
  const c = M.countdown('2025-01-03', now);
  assert.equal(c.days, 1); assert.equal(c.hours, 12); assert.equal(c.minutes, 0);
  assert.equal(M.countdown('2024-01-01', now).totalMs, 0);
});

test('progress and validation', () => {
  const p = M.progressToNext('2025-01-01', '2025-01-16'); // from h24 (Jan 2) to d30 (Jan 31)
  assert.ok(p > 0.45 && p < 0.55);
  assert.equal(M.validateCleanDate('2030-01-01', '2026-10-19'), 'Your clean date cannot be in the future.');
  assert.equal(M.validateCleanDate('2025-02-30', '2026-10-19'), 'Please enter a valid date.');
  assert.equal(M.validateCleanDate('2025-02-28', '2026-10-19'), null);
  assert.throws(() => M.parseISO('2025-13-01'));
});

test('badge tiers', () => {
  assert.equal(M.badgeTier('h24'), 'dawn');
  assert.equal(M.badgeTier('d60'), 'sprout');
  assert.equal(M.badgeTier('m9'), 'branch');
  assert.equal(M.badgeTier('y3'), 'root');
  assert.equal(M.badgeTier('y7'), 'canopy');
  assert.equal(M.badgeTier('y10'), 'crown');
});
