/** Output formats: pretty (default), compact, json. No color by default; --color=always|auto|never. */
import { detectLevelField, detectMsgField, detectTimeField, normalizeLevel } from './filter.js';
import { getPath } from './parser.js';

const COLORS = { trace: 90, debug: 36, info: 32, warn: 33, error: 31, fatal: 35 };
const RESET = '\x1b[0m';

export function colorize(level, text, mode, streamIsTTY) {
  const use = mode === 'always' || (mode === 'auto' && streamIsTTY);
  if (!use) return text;
  const code = COLORS[normalizeLevel(level) ?? 'info'] ?? 37;
  return `\x1b[${code}m${text}${RESET}`;
}

export function summarize(line) {
  // one-line human summary: time LEVEL msg + leftover keys count
  const { obj } = line;
  const tField = detectTimeField(obj);
  const lField = detectLevelField(obj);
  const mField = detectMsgField(obj);
  const time = tField ? String(obj[tField]) : '-';
  const level = lField ? String(obj[lField]).toUpperCase().padEnd(5) : '?????';
  const msg = mField ? String(obj[mField]) : JSON.stringify(obj).slice(0, 120);
  const known = new Set([tField, lField, mField]);
  const extra = Object.keys(obj).filter(k => !known.has(k));
  const tail = extra.length ? ` (+${extra.length}: ${extra.slice(0, 4).join(',')})` : '';
  return { time, level: level.trim(), text: `${time} ${level} ${msg}${tail}` };
}

export function formatLine(line, { format = 'pretty', color = 'auto', isTTY = false, fields = null } = {}) {
  if (format === 'json') return line.raw;
  const s = summarize(line);
  if (format === 'compact') {
    const short = s.text.length > 200 ? s.text.slice(0, 197) + '...' : s.text;
    return colorize(s.level, short, color, isTTY);
  }
  // pretty: colored level line + indented extra fields
  const head = colorize(s.level, s.text, color, isTTY);
  if (!fields || fields.length === 0) return head;
  const picked = fields.map(f => `    ${f}=${JSON.stringify(getPath(line.obj, f) ?? null)}`).join('\n');
  return head + '\n' + picked;
}
