#!/usr/bin/env node
/** jsonlog-view CLI — zero dependencies, streaming stdin/file. */
import fs from 'node:fs';
import readline from 'node:readline';
import { parseJsonLines } from '../src/parser.js';
import { makeFilter } from '../src/filter.js';
import { formatLine } from '../src/format.js';

const VERSION = '0.1.0';

function help() {
  console.log([
    'jsonlog-view ' + VERSION + ' — pretty JSONL log viewer (stdin or file, streaming)',
    '',
    'Usage:',
    '  tail -f app.log | jsonlog-view [options]     # live pipe (Ctrl-C to stop)',
    '  jsonlog-view [options] app.log                # file (re-reads growing files with -f)',
    '  jsonlog-view --stats app.log                  # per-level counts only',
    '',
    'Options:',
    '  --level <min>       trace|debug|info|warn|error|fatal (minimum severity)',
    '  --grep <text>       keep lines containing text (repeatable, case-insensitive)',
    '  --field <q>         key=value | key!=value | key~=substr (repeatable, dotted keys)',
    '  --since <ts>        keep events at/after timestamp (ISO or epoch)',
    '  --until <ts>        keep events at/before timestamp',
    '  --sample <n>        show every nth matching line (fast overview of huge files)',
    '  --format <f>        pretty (default) | compact | json (re-print raw JSON)',
    '  --show <keys>       comma list of extra fields to print under pretty lines',
    '  --color <m>         auto (default) | always | never',
    '  --stats             print per-level counts + malformed-line count, then exit',
    '  --max <n>           stop after n matching lines',
    '  -f                  follow file growth like tail -f (file mode only)',
    '  --strict            exit 1 if any malformed JSON line was seen',
    '',
    'Exit codes: 0 ok (or strict-clean), 1 strict failure or usage/file error is 2.',
  ].join('\n'));
}

function fail(msg) { console.error('jsonlog-view: ' + msg); process.exit(2); }

function parseTime(s) {
  if (/^\\d+$/.test(s)) {
    const n = Number(s);
    return s.length <= 10 ? n * 1000 : n;
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) fail(`Cannot parse timestamp: ${JSON.stringify(s)}`);
  return t;
}

function parseArgs(argv) {
  const a = { file: null, level: null, greps: [], fields: [], sinceMs: null, untilMs: null,
    sample: null, format: 'pretty', show: [], color: 'auto', stats: false, max: null,
    follow: false, strict: false };
  const rest = [...argv];
  while (rest.length) {
    const t = rest.shift();
    if (t === '--help' || t === '-h') { help(); process.exit(0); }
    else if (t === '--version' || t === '-v') { console.log(VERSION); process.exit(0); }
    else if (t === '--level') a.level = rest.shift() ?? fail('--level needs a value');
    else if (t.startsWith('--level=')) a.level = t.slice(8);
    else if (t === '--grep') a.greps.push(rest.shift() ?? fail('--grep needs a value'));
    else if (t.startsWith('--grep=')) a.greps.push(t.slice(7));
    else if (t === '--field') a.fields.push(rest.shift() ?? fail('--field needs a value'));
    else if (t.startsWith('--field=')) a.fields.push(t.slice(8));
    else if (t === '--since') a.sinceMs = parseTime(rest.shift() ?? fail('--since needs a value'));
    else if (t.startsWith('--since=')) a.sinceMs = parseTime(t.slice(8));
    else if (t === '--until') a.untilMs = parseTime(rest.shift() ?? fail('--until needs a value'));
    else if (t.startsWith('--until=')) a.untilMs = parseTime(t.slice(8));
    else if (t === '--sample') a.sample = Number(rest.shift() ?? fail('--sample needs a value'));
    else if (t.startsWith('--sample=')) a.sample = Number(t.slice(9));
    else if (t === '--format') a.format = rest.shift() ?? fail('--format needs a value');
    else if (t.startsWith('--format=')) a.format = t.slice(9);
    else if (t === '--show') a.show.push(...String(rest.shift() ?? fail('--show needs a value')).split(',').map(s => s.trim()).filter(Boolean));
    else if (t.startsWith('--show=')) a.show.push(...t.slice(7).split(',').map(s => s.trim()).filter(Boolean));
    else if (t === '--color') a.color = rest.shift() ?? fail('--color needs a value');
    else if (t.startsWith('--color=')) a.color = t.slice(8);
    else if (t === '--stats') a.stats = true;
    else if (t === '--max') a.max = Number(rest.shift() ?? fail('--max needs a value'));
    else if (t.startsWith('--max=')) a.max = Number(t.slice(6));
    else if (t === '-f') a.follow = true;
    else if (t === '--strict') a.strict = true;
    else if (t.startsWith('-')) fail(`Unknown option: ${t}`);
    else if (a.file == null) a.file = t;
    else fail(`Unexpected argument: ${t}`);
  }
  if (!['pretty', 'compact', 'json'].includes(a.format)) fail(`--format must be pretty|compact|json`);
  if (!['auto', 'always', 'never'].includes(a.color)) fail(`--color must be auto|always|never`);
  if (a.sample != null && !(a.sample >= 1)) fail('--sample must be >= 1');
  if (a.max != null && !(a.max >= 1)) fail('--max must be >= 1');
  return a;
}

const args = parseArgs(process.argv.slice(2));
const filter = makeFilter({ level: args.level, greps: args.greps, fields: args.fields,
  sinceMs: args.sinceMs, untilMs: args.untilMs, sample: args.sample });
const isTTY = process.stdout.isTTY === true;
const fmtOpts = { format: args.format, color: args.color, isTTY, fields: args.show };
let shown = 0, malformed = 0, matched = 0, total = 0;
const levelCounts = {};

function handleParsed(p) {
  total++;
  if (!p.ok) { malformed++; return; }
  if (!filter.test(p.obj, p.raw)) return;
  matched++;
  const lvl = String(p.obj.level ?? p.obj.severity ?? 'info').toLowerCase();
  levelCounts[lvl] = (levelCounts[lvl] ?? 0) + 1;
  if (!args.stats) {
    console.log(formatLine(p, fmtOpts));
    shown++;
  }
  if (args.max != null && matched >= args.max) shutdown(0);
}

function printStats() {
  console.log(JSON.stringify({ total, matched, malformed, levels: levelCounts }, null, 2));
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (args.stats) printStats();
  let finalCode = code;
  if (args.strict && malformed > 0) finalCode = 1;
  process.exit(finalCode);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGPIPE', () => shutdown(0));

if (args.file) {
  // file mode: read once, optionally follow growth
  let offset = 0, leftover = '';
  async function readOnce() {
    let fh;
    try { fh = await fs.promises.open(args.file, 'r'); }
    catch { fail(`Cannot read file: ${args.file}`); }
    try {
      const st = await fh.stat();
      if (st.size < offset) { offset = 0; leftover = ''; } // truncated/rotated
      if (st.size === offset) return;
      const buf = Buffer.alloc(st.size - offset);
      await fh.read(buf, 0, buf.length, offset);
      offset = st.size;
      const chunk = leftover + buf.toString('utf8');
      const lines = chunk.split(/\r?\n/);
      leftover = lines.pop() ?? '';
      for (const parsed of parseJsonLines(lines)) handleParsed(parsed);
    } finally { await fh.close(); }
  }
  await readOnce();
  if (args.follow) {
    setInterval(readOnce, 500);
  } else {
    if (leftover.trim() !== '') {
      for (const parsed of parseJsonLines([leftover])) handleParsed(parsed);
    }
    shutdown(0);
  }
} else {
  if (args.follow) fail('-f needs a file argument');
  if (process.stdin.isTTY) { help(); process.exit(2); }
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    for (const parsed of parseJsonLines([line])) handleParsed(parsed);
    if (shuttingDown) break;
  }
  shutdown(0);
}
