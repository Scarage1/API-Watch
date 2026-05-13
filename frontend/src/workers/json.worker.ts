/**
 * JSON Worker — Offloads heavy JSON operations from the main thread.
 *
 * Handles:
 *  - JSON parsing (large payloads that would block the UI)
 *  - JSON formatting/pretty-printing
 *  - JSON syntax highlighting (returns pre-tokenized HTML)
 *  - JSON path search
 *
 * Communication via postMessage/onmessage with typed payloads.
 */

// ── Types ────────────────────────────────────────────────────
interface WorkerRequest {
  id: string;
  type: 'parse' | 'format' | 'highlight' | 'search';
  payload: string;
  options?: {
    indent?: number;
    query?: string;
    maxDepth?: number;
  };
}

interface WorkerResponse {
  id: string;
  type: WorkerRequest['type'];
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

// ── Syntax highlighting tokens ───────────────────────────────
const TOKEN_COLORS = {
  key: '#c792ea',
  string: '#c3e88d',
  number: '#f78c6c',
  boolean: '#89ddff',
  null: '#ff5370',
  bracket: '#89ddff',
  comma: '#676e95',
} as const;

function highlightJSON(json: string, maxLength = 500_000): string {
  // For extremely large payloads, skip highlighting
  if (json.length > maxLength) {
    return `<span style="color:#a6accd">${escapeHtml(json)}</span>`;
  }

  return json.replace(
    /("(?:\\.|[^"\\])*")\s*(:?)|\b(true|false)\b|\bnull\b|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|([[\]{}])|([,])/g,
    (match, str, colon, bool, num, bracket, comma) => {
      if (str) {
        if (colon) {
          return `<span style="color:${TOKEN_COLORS.key}">${escapeHtml(str)}</span>${colon}`;
        }
        return `<span style="color:${TOKEN_COLORS.string}">${escapeHtml(str)}</span>`;
      }
      if (bool) return `<span style="color:${TOKEN_COLORS.boolean}">${match}</span>`;
      if (match === 'null') return `<span style="color:${TOKEN_COLORS.null}">null</span>`;
      if (num) return `<span style="color:${TOKEN_COLORS.number}">${match}</span>`;
      if (bracket) return `<span style="color:${TOKEN_COLORS.bracket}">${match}</span>`;
      if (comma) return `<span style="color:${TOKEN_COLORS.comma}">${match}</span>`;
      return match;
    }
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── JSON path search ─────────────────────────────────────────
function searchJSON(obj: unknown, query: string, path = ''): string[] {
  const results: string[] = [];
  const lowerQuery = query.toLowerCase();

  if (typeof obj === 'string' && obj.toLowerCase().includes(lowerQuery)) {
    results.push(path || '$');
  } else if (typeof obj === 'number' && String(obj).includes(query)) {
    results.push(path || '$');
  } else if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => {
        results.push(...searchJSON(item, query, `${path}[${idx}]`));
      });
    } else {
      for (const [key, value] of Object.entries(obj)) {
        const childPath = path ? `${path}.${key}` : `$.${key}`;
        // Match on key name too
        if (key.toLowerCase().includes(lowerQuery)) {
          results.push(childPath);
        }
        results.push(...searchJSON(value, query, childPath));
      }
    }
  }

  return results.slice(0, 100); // Cap at 100 results
}

// ── Worker message handler ───────────────────────────────────
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload, options } = event.data;
  const start = performance.now();

  const respond = (success: boolean, result?: unknown, error?: string) => {
    const response: WorkerResponse = {
      id,
      type,
      success,
      result,
      error,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
    };
    self.postMessage(response);
  };

  try {
    switch (type) {
      case 'parse': {
        const parsed = JSON.parse(payload);
        respond(true, parsed);
        break;
      }

      case 'format': {
        const indent = options?.indent ?? 2;
        const parsed = JSON.parse(payload);
        const formatted = JSON.stringify(parsed, null, indent);
        respond(true, formatted);
        break;
      }

      case 'highlight': {
        // Parse first to validate, then format + highlight
        const parsed = JSON.parse(payload);
        const indent = options?.indent ?? 2;
        const formatted = JSON.stringify(parsed, null, indent);
        const highlighted = highlightJSON(formatted);
        respond(true, { html: highlighted, lineCount: formatted.split('\n').length });
        break;
      }

      case 'search': {
        const query = options?.query || '';
        if (!query) {
          respond(true, []);
          break;
        }
        const parsed = JSON.parse(payload);
        const paths = searchJSON(parsed, query);
        respond(true, paths);
        break;
      }

      default:
        respond(false, undefined, `Unknown operation: ${type}`);
    }
  } catch (err) {
    respond(false, undefined, err instanceof Error ? err.message : 'Worker error');
  }
};
