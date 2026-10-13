/** Streaming JSONL parser: one JSON object per line, tolerant of blanks.
 * Never loads the whole file: yields { ok, obj|error, lineNo, raw } per line.
 */
export function* parseJsonLines(lines) {
  let lineNo = 0;
  for (const raw of lines) {
    lineNo++;
    if (raw.trim() === '') continue;
    try {
      yield { ok: true, obj: JSON.parse(raw), lineNo, raw };
    } catch (e) {
      yield { ok: false, error: e instanceof Error ? e.message : String(e), lineNo, raw };
    }
  }
}

/** Extract nested value by dotted path, e.g. 'err.code'. Returns undefined if missing. */
export function getPath(obj, dotted) {
  if (!dotted) return obj;
  const parts = dotted.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}
