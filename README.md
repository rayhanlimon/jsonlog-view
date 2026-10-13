# jsonlog-view

Zero-dependency, streaming pretty-printer and filter for **JSONL logs** (one JSON object per line).

`tail -f app.log | jsonlog-view` turns a wall of JSON into readable, greppable lines — without loading a 200MB file into an editor.

## The problem

Apps log JSONL, but reading it is painful: editors choke on huge files, `jq` reprints raw JSON instead of summarizing, and full-featured viewers ([hl](https://github.com/pamburus/hl), BigFile) need installs or a GUI. Developers keep asking on Stack Overflow how to cleanly view large JSON logs, and complain that missing context crashes production debugging.

## What it does

- Streams stdin or files line-by-line (constant memory, works on GB-sized logs)
- Pretty summaries: `time LEVEL message (+extras)` instead of raw JSON walls
- Filters: `--level` (min severity), `--grep`, `--field key=value|!=|~=`, `--since/--until`, `--sample`
- `--stats` per-level counts + malformed-line count for CI health checks
- `-f` follows growing files like `tail -f` (with rotation handling)
- `--format pretty|compact|json`, `--show` extra fields, `--color auto|always|never`
- `--strict` fails CI when malformed lines appear

## Install

Requires Node 18+. No dependencies.

```sh
npm install -g jsonlog-view
# or from source:
git clone https://github.com/rayhanlimon/jsonlog-view && cd jsonlog-view
node bin/jsonlog-view.js --help
```

## Usage

```sh
# live tail
tail -f app.log | jsonlog-view

# errors only, with context fields
jsonlog-view --level error --show svc,err app.log

# field query + time window
jsonlog-view --field svc=api --since 2026-10-13T09:00:00Z app.log

# fast overview of a huge file: every 100th error
jsonlog-view --level error --sample 100 big.log

# health check in CI
jsonlog-view --stats app.log

# re-print matching lines as raw JSON for jq
jsonlog-view --format json --field err.code=E1 app.log | jq .
```

### Example

```
$ jsonlog-view --color=never app.log
2026-10-13T09:00:00Z INFO  server start (+1: svc)
2026-10-13T09:01:00Z ERROR db timeout (+2: svc,err)
2026-10-13T09:02:00Z WARN  slow query (+1: svc)
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | ok |
| 1 | `--strict` saw malformed lines |
| 2 | usage / file error |

## Field queries

| Form | Meaning | Example |
|------|---------|---------|
| `key=value` | exact match | `--field svc=api` |
| `key!=value` | not equal | `--field env!=prod` |
| `key~=sub` | case-insensitive substring | `--field msg~=timeout` |
| dotted keys | nested lookup | `--field err.code=E1` |

Level, severity, loglevel, lvl are auto-detected; `warning→warn`, `err→error`, `critical→fatal` aliases included.
Time fields auto-detected: `time, timestamp, ts, @timestamp, datetime`.

## Security notes

- Never prints anything beyond your log content; no network access, no telemetry.
- Malformed lines are counted, never executed.

## Limitations

- One JSON object per line (JSONL). Pretty-printed multi-line JSON is out of scope.
- No regex filters yet (substring `--grep` + field queries cover most triage).
- `-f` polls every 500ms; sub-second latency is not guaranteed.

## Roadmap

- [ ] `--regex` flag for pattern matching
- [ ] `--highlight` persistent keyword colors
- [ ] SARIF-ish summary for CI dashboards

## Development

```sh
npm test   # node --test test/*.test.js (15 tests, zero deps)
```

## License

MIT — see [LICENSE](LICENSE).
