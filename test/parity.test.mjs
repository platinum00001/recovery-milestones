// Checks js/milestones.js and the SQL milestone functions agree. Skips when no local Postgres test DB is available.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { milestoneDate, eligibleMilestone, addDays } from '../js/milestones.js';

function psql(sql) {
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-X', '-A', '-t', '-d', process.env.DB || 'rm_test', '-c', sql], { encoding: 'utf8' }).trim();
}
let available = true;
try { psql('select milestones.milestone_date(current_date, \'d30\')'); } catch { available = false; }

test('SQL and JS milestone dates agree', { skip: !available && 'no local rm_test database (run test/run-sql-tests.sh first)' }, () => {
  const keys = ['h24', 'd30', 'd60', 'd90', 'm6', 'm9', 'y1', 'y2', 'y4', 'y10'];
  const dates = [];
  for (let d = '2019-12-25'; d < '2021-03-10'; d = addDays(d, 3)) dates.push(d);
  dates.push('2024-02-29', '2023-08-31', '2023-05-31', '2023-01-31');
  const sql = `select c::text || '|' || k || '|' || milestones.milestone_date(c, k)::text from unnest(array[${dates.map((d) => `'${d}'::date`).join(',')}]) c, unnest(array[${keys.map((k) => `'${k}'`).join(',')}]) k`;
  const rows = psql(sql).split('\n');
  assert.equal(rows.length, dates.length * keys.length);
  for (const r of rows) { const [c, k, v] = r.split('|'); assert.equal(milestoneDate(c, k), v, `${c} ${k}`); }
});

test('SQL and JS eligibility agree', { skip: !available && 'no local rm_test database' }, () => {
  const cases = [['2025-01-01', '2025-04-10', ['d90']], ['2025-01-01', '2025-05-02', ['d90']], ['2020-01-01', '2026-01-05', ['yN']], ['2025-10-01', '2026-10-15', ['y1', 'd30']], ['2026-10-18', '2026-10-19', ['h24']]];
  for (const [c, t, targets] of cases) {
    const v = psql(`select coalesce(milestones.eligible_milestone('${c}', '${t}', array[${targets.map((x) => `'${x}'`).join(',')}]), 'null')`);
    assert.equal(String(eligibleMilestone(c, t, targets)), v, `${c} ${t} ${targets}`);
  }
});
