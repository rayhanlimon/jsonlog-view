/** Filter engine: --level, --grep, --field queries, --since/--until, --sample. */
import { getPath } from './parser.js';

const KNOWN_LEVELS = ['trace', 'debug', 'info', 'warn', 'warning', 'error', 'fatal'];

export function normalizeLevel(value) {
  if (value == null) return null;
  const s = String(value).toLowerCase();
  if (s === 'warning') return 'warn';
  if (s === 'err') return 'error';
  if (s === 'critical' || s === 'crit') return 'fatal';
  return KNOWN_LEVELS.includes(s) ? s : null;
}

export function detectLevelField(obj) {
  for (const k of ['level', 'severity', 'loglevel', 'log_level', 'lvl']) {
    if (obj[k] != null) return k;
  }
  return null;
}

export function detectTimeField(obj) {
  for (const k of ['time', 'timestamp', 'ts', '@timestamp', 'datetime']) {
    if (obj[k] != null) return k;
  }
  return null;
}

export function detectMsgField(obj) {
  for (const k of ['msg', 'message', 'log', 'text', 'event']) {
    if (obj[k] != null) return k;
  }
  return null;
}

/** minimum level gating: error includes error+fatal; warn includes warn+error+fatal; etc. */
const RANK = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };

export function levelPasses(objLevel, minLevel) {
  if (!minLevel) return true;
  const a = normalizeLevel(objLevel);
  const b = normalizeLevel(minLevel);
  if (a == null) return false;
  if (b == null) return true;
  return (RANK[a] ?? 0) >= (RANK[b] ?? 0);
}

export function parseFieldQuery(s) {
  // key=value (exact) or key~=substring or key!=value ; value may be quoted
  const m = /^([A-Za-z0-9_.@-]+)\s*(=|!=|~=)\s*(.*)$/.exec(s);
  if (!m) throw new Error(`Bad --field query: ${JSON.stringify(s)} (want key=value, key!=value or key~=substr)`);
  let value = m[3].trim();
  const q = value.match(/^(['\"])(.*)\\1$/);
  if (q) value = q[2];
  return { key: m[1], op: m[2], value };
}

export function fieldMatches(obj, q) {
  const actual = getPath(obj, q.key);
  const a = actual == null ? '' : String(actual);
  if (q.op === '=') return a === q.value;
  if (q.op === '!=') return a !== q.value;
  return a.toLowerCase().includes(q.value.toLowerCase());
}

export function timePasses(obj, timeField, sinceMs, untilMs) {
  if (sinceMs == null && untilMs == null) return true;
  if (!timeField) return true; // no timestamp: don't exclude
  const t = Date.parse(obj[timeField]);
  if (Number.isNaN(t)) return true;
  if (sinceMs != null && t < sinceMs) return false;
  if (untilMs != null && t > untilMs) return false;
  return true;
}

export function makeFilter(opts) {
  const fields = (opts.fields ?? []).map(parseFieldQuery);
  const greps = (opts.greps ?? []).map(g => g.toLowerCase());
  let count = 0;
  return {
    test(obj, raw) {
      const lvlField = detectLevelField(obj);
      if (!levelPasses(lvlField ? obj[lvlField] : null, opts.level)) return false;
      const tField = opts.timeField ?? detectTimeField(obj);
      if (!timePasses(obj, tField, opts.sinceMs, opts.untilMs)) return false;
      for (const q of fields) if (!fieldMatches(obj, q)) return false;
      if (greps.length) {
        const hay = raw.toLowerCase();
        if (!greps.every(g => hay.includes(g))) return false;
      }
      count++;
      if (opts.sample != null && opts.sample > 0 && count % opts.sample !== 0) return false;
      return true;
    },
  };
}
