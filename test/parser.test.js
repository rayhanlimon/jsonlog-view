import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonLines, getPath } from '../src/parser.js';

test('parses valid lines, skips blanks', () => {
  const out = [...parseJsonLines(['{\"a\":1}', '', '   ', '{\"b\":2}'])];
  assert.equal(out.length, 2);
  assert.ok(out.every(o => o.ok));
  assert.equal(out[0].obj.a, 1);
});

test('malformed lines report error with lineNo, keep going', () => {
  const out = [...parseJsonLines(['{\"a\":1}', 'NOT JSON', '{\"b\":2}'])];
  assert.equal(out.length, 3);
  assert.ok(!out[1].ok);
  assert.equal(out[1].lineNo, 2);
  assert.ok(out[2].ok);
});

test('getPath dotted + missing', () => {
  assert.equal(getPath({ err: { code: 'E1' } }, 'err.code'), 'E1');
  assert.equal(getPath({ a: 1 }, 'x.y'), undefined);
  assert.equal(getPath(null, 'a'), undefined);
});
