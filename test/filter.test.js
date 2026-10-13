import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLevel, levelPasses, parseFieldQuery, fieldMatches, timePasses, makeFilter, detectLevelField } from '../src/filter.js';

test('level aliases normalized', () => {
  assert.equal(normalizeLevel('warning'), 'warn');
  assert.equal(normalizeLevel('ERR'), 'error');
  assert.equal(normalizeLevel('CRITICAL'), 'fatal');
  assert.equal(normalizeLevel('bogus'), null);
});

test('minimum severity gating', () => {
  assert.ok(levelPasses('error', 'warn'));
  assert.ok(!levelPasses('info', 'warn'));
  assert.ok(levelPasses('fatal', 'error'));
  assert.ok(levelPasses(null, null));
});

test('field query parse + match incl dotted', () => {
  const q = parseFieldQuery('err.code=E1');
  assert.ok(fieldMatches({ err: { code: 'E1' } }, q));
  assert.ok(!fieldMatches({ err: { code: 'E2' } }, q));
  const sub = parseFieldQuery('msg~=timeout');
  assert.ok(fieldMatches({ msg: 'Request TIMEOUT here' }, sub));
  const ne = parseFieldQuery('a!=b');
  assert.ok(fieldMatches({ a: 'x' }, ne));
  assert.throws(() => parseFieldQuery('nope'), /Bad --field/);
});

test('time window', () => {
  const obj = { time: '2026-10-13T09:00:00Z' };
  const t = Date.parse('2026-10-13T09:00:00Z');
  assert.ok(timePasses(obj, 'time', t - 1000, t + 1000));
  assert.ok(!timePasses(obj, 'time', t + 1000, null));
  assert.ok(timePasses({ x: 1 }, null, t, null)); // no timestamp: keep
});

test('combined filter + sample', () => {
  const f = makeFilter({ level: 'warn', greps: ['db'], fields: ['svc=api'], sample: 2 });
  const keep = { level: 'error', msg: 'db timeout', svc: 'api' };
  const dropLvl = { level: 'info', msg: 'db timeout', svc: 'api' };
  const dropGrep = { level: 'error', msg: 'ok', svc: 'api' };
  assert.ok(!f.test(dropLvl, JSON.stringify(dropLvl)));
  assert.ok(!f.test(dropGrep, JSON.stringify(dropGrep)));
  // sample=2: 1st match skipped, 2nd shown
  assert.ok(!f.test(keep, JSON.stringify(keep)));
  assert.ok(f.test(keep, JSON.stringify(keep)));
});

test('detectLevelField variants', () => {
  assert.equal(detectLevelField({ severity: 'error' }), 'severity');
  assert.equal(detectLevelField({ x: 1 }), null);
});
