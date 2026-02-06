// ── Code Generation Engine ───────────────────────────────────────────────────
// Generate code snippets in cURL, Python, JavaScript, and Node.js from request config.

export type CodeLanguage = 'curl' | 'python' | 'javascript' | 'nodejs';

interface KVPair {
  key: string;
  value: string;
  enabled?: boolean;
}

export interface CodeGenRequest {
  method: string;
  url: string;
  headers: KVPair[] | Record<string, string>;
  params: KVPair[] | Record<string, string>;
  body?: unknown;
  bodyType?: string;
  timeout?: number;
}

// ── Normalise KV input ───────────────────────────────────────────────────────

function toRecord(input: KVPair[] | Record<string, string>): Record<string, string> {
  if (Array.isArray(input)) {
    const out: Record<string, string> = {};
    for (const item of input) {
      if (item.key && item.enabled !== false) out[item.key] = item.value;
    }
    return out;
  }
  return input;
}

// ── Main generator ───────────────────────────────────────────────────────────

export function generateCode(req: CodeGenRequest, language: CodeLanguage): string {
  // Normalise arrays → records once
  const normReq = {
    ...req,
    headers: toRecord(req.headers),
    params: toRecord(req.params),
  };
  const fullUrl = buildUrl(normReq.url, normReq.params);

  switch (language) {
    case 'curl':
      return generateCurl(normReq, fullUrl);
    case 'python':
      return generatePython(normReq, fullUrl);
    case 'javascript':
      return generateJavaScript(normReq, fullUrl);
    case 'nodejs':
      return generateNodejs(normReq, fullUrl);
    default:
      return '';
  }
}

// ── URL builder ──────────────────────────────────────────────────────────────

function buildUrl(url: string, params: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return url;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k) sp.append(k, v);
  }
  const qs = sp.toString();
  if (!qs) return url;
  return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** After normalisation, headers/params are always plain records */
type NormRequest = Omit<CodeGenRequest, 'headers' | 'params'> & {
  headers: Record<string, string>;
  params: Record<string, string>;
};

function hasBody(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function formatJsonBody(body: unknown): string | null {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return JSON.stringify(body, null, 2);
}

function escapeShell(s: string): string {
  return s.replace(/'/g, "'\\''");
}

// ── cURL ─────────────────────────────────────────────────────────────────────

function generateCurl(req: NormRequest, fullUrl: string): string {
  const parts: string[] = ['curl'];

  if (req.method !== 'GET') {
    parts.push(`-X ${req.method}`);
  }

  parts.push(`'${escapeShell(fullUrl)}'`);

  for (const [key, value] of Object.entries(req.headers)) {
    if (key) parts.push(`-H '${escapeShell(key)}: ${escapeShell(value)}'`);
  }

  if (hasBody(req.method) && req.body !== null && req.body !== undefined) {
    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (req.bodyType === 'form-data' || req.bodyType === 'x-www-form-urlencoded') {
      if (typeof req.body === 'object' && req.body !== null) {
        for (const [k, v] of Object.entries(req.body as Record<string, string>)) {
          parts.push(`-d '${escapeShell(k)}=${escapeShell(v)}'`);
        }
      } else {
        parts.push(`-d '${escapeShell(bodyStr)}'`);
      }
    } else {
      parts.push(`-d '${escapeShell(bodyStr)}'`);
    }
  }

  if (req.timeout) {
    parts.push(`--max-time ${req.timeout}`);
  }

  return parts.join(' \\\n  ');
}

// ── Python (requests) ────────────────────────────────────────────────────────

function generatePython(req: NormRequest, fullUrl: string): string {
  const lines: string[] = ['import requests', ''];

  const headerEntries = Object.entries(req.headers).filter(([k]) => k);
  if (headerEntries.length > 0) {
    lines.push('headers = {');
    for (const [k, v] of headerEntries) {
      lines.push(`    "${k}": "${v}",`);
    }
    lines.push('}');
    lines.push('');
  }

  const bodyStr = formatJsonBody(req.body);
  if (hasBody(req.method) && bodyStr) {
    if (req.bodyType === 'json') {
      lines.push('import json');
      lines.push('');
      lines.push(`payload = ${bodyStr}`);
      lines.push('');
    } else if (req.bodyType === 'form-data' || req.bodyType === 'x-www-form-urlencoded') {
      lines.push(`data = ${bodyStr}`);
      lines.push('');
    } else {
      lines.push(`data = """${bodyStr}"""`);
      lines.push('');
    }
  }

  const args: string[] = [`"${fullUrl}"`];
  if (headerEntries.length > 0) args.push('headers=headers');
  if (hasBody(req.method) && bodyStr) {
    if (req.bodyType === 'json') {
      args.push('json=payload');
    } else {
      args.push('data=data');
    }
  }
  if (req.timeout) args.push(`timeout=${req.timeout}`);

  const method = req.method.toLowerCase();
  lines.push(`response = requests.${method}(`);
  args.forEach((arg, i) => {
    lines.push(`    ${arg}${i < args.length - 1 ? ',' : ''}`);
  });
  lines.push(')');
  lines.push('');
  lines.push('print(response.status_code)');
  lines.push('print(response.json())');

  return lines.join('\n');
}

// ── JavaScript (fetch) ───────────────────────────────────────────────────────

function generateJavaScript(req: NormRequest, fullUrl: string): string {
  const lines: string[] = [];

  const opts: string[] = [];
  opts.push(`  method: "${req.method}"`);

  const headerEntries = Object.entries(req.headers).filter(([k]) => k);
  if (headerEntries.length > 0) {
    const headerLines = headerEntries.map(([k, v]) => `    "${k}": "${v}"`).join(',\n');
    opts.push(`  headers: {\n${headerLines}\n  }`);
  }

  const bodyStr = formatJsonBody(req.body);
  if (hasBody(req.method) && bodyStr) {
    if (req.bodyType === 'json') {
      opts.push(`  body: JSON.stringify(${bodyStr})`);
    } else {
      opts.push(`  body: ${JSON.stringify(bodyStr)}`);
    }
  }

  lines.push(`fetch("${fullUrl}", {`);
  lines.push(opts.join(',\n'));
  lines.push('})');
  lines.push('  .then(response => response.json())');
  lines.push('  .then(data => console.log(data))');
  lines.push('  .catch(error => console.error("Error:", error));');

  return lines.join('\n');
}

// ── Node.js (axios) ──────────────────────────────────────────────────────────

function generateNodejs(req: NormRequest, fullUrl: string): string {
  const lines: string[] = [
    'const axios = require("axios");',
    '',
  ];

  const configLines: string[] = [];
  configLines.push(`  method: "${req.method.toLowerCase()}"`);
  configLines.push(`  url: "${fullUrl}"`);

  const headerEntries = Object.entries(req.headers).filter(([k]) => k);
  if (headerEntries.length > 0) {
    const hl = headerEntries.map(([k, v]) => `    "${k}": "${v}"`).join(',\n');
    configLines.push(`  headers: {\n${hl}\n  }`);
  }

  const bodyStr = formatJsonBody(req.body);
  if (hasBody(req.method) && bodyStr) {
    configLines.push(`  data: ${bodyStr}`);
  }

  if (req.timeout) {
    configLines.push(`  timeout: ${req.timeout * 1000}`);
  }

  lines.push('axios({');
  lines.push(configLines.join(',\n'));
  lines.push('})');
  lines.push('  .then(response => {');
  lines.push('    console.log(response.status);');
  lines.push('    console.log(response.data);');
  lines.push('  })');
  lines.push('  .catch(error => {');
  lines.push('    console.error(error.message);');
  lines.push('  });');

  return lines.join('\n');
}

// ── Language metadata ────────────────────────────────────────────────────────

export const CODE_LANGUAGES: { id: CodeLanguage; label: string; icon: string }[] = [
  { id: 'curl', label: 'cURL', icon: '⌘' },
  { id: 'python', label: 'Python', icon: '🐍' },
  { id: 'javascript', label: 'JavaScript', icon: 'JS' },
  { id: 'nodejs', label: 'Node.js', icon: '⬢' },
];
