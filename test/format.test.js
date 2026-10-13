import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLine, colorize, summarize } from '../src/format.js';

test('json format re-prints raw', () => {
  const raw = '{\"level\":\"info\",\"msg\":\"hi\"}';
  assert.equal(formatLine({ obj: { level: 'info', msg: 'hi' }, raw }, { format: 'json' }), raw);
});

test('compact truncates long lines', () => {
  const out = formatLine({ obj: { level: 'info', msg: 'x'.repeat(500) }, raw: '{}' }, { format: 'compact', color: 'never' });
  assert.ok(out.length <= 220);
});

test('pretty includes time level msg + extras count', () => {
  const out = formatLine({ obj: { time: 'T', level: 'error', msg: 'boom', svc: 'api' }, raw: '{}' }, { color: 'never' });
  assert.ok(out.includes('boom') && out.includes('+1'));
});

test('pretty --show prints picked fields', () => {
  const out = formatLine({ obj: { level: 'info', msg: 'm', svc: 'api' }, raw: '{}' }, { color: 'never', fields: ['svc'] });
  assert.ok(out.includes('svc=\"api\"'));
});

test('colorize respects mode', () => {
  assert.ok(!colorize('error', 'x', 'never', true).includes('\x1b'));
  assert.ok(colorize('error', 'x', 'always', false).includes('\x1b[31m'));
  assert.ok(colorize('error', 'x', 'auto', false) === 'x');
});

test('summarize falls back when no msg field', () => {
  const s = summarize({ obj: { level: 'info', a: 1 } });
  assert.ok(s.text.includes('INFO') || s.text.includes('info'));
});
