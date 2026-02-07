// ── Code Generation Engine ───────────────────────────────────────────────────
// Generate code snippets in cURL, Python, JavaScript, and Node.js from request config.

export type CodeLanguage = 'curl' | 'python' | 'javascript' | 'nodejs' | 'go' | 'php' | 'java' | 'csharp';

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
    case 'go':
      return generateGo(normReq, fullUrl);
    case 'php':
      return generatePhp(normReq, fullUrl);
    case 'java':
      return generateJava(normReq, fullUrl);
    case 'csharp':
      return generateCsharp(normReq, fullUrl);
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

// ── Go (net/http) ────────────────────────────────────────────────────────────

function generateGo(req: NormRequest, fullUrl: string): string {
  const lines: string[] = [
    'package main',
    '',
    'import (',
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
  ];

  const bodyStr = formatJsonBody(req.body);
  if (hasBody(req.method) && bodyStr) {
    lines.splice(5, 0, '\t"strings"');
  }
  if (req.timeout) {
    lines.splice(5, 0, '\t"time"');
  }

  lines.push(')', '', 'func main() {');

  if (hasBody(req.method) && bodyStr) {
    lines.push(`\tpayload := strings.NewReader(\`${bodyStr}\`)`);
    lines.push('');
    lines.push(`\treq, err := http.NewRequest("${req.method}", "${fullUrl}", payload)`);
  } else {
    lines.push(`\treq, err := http.NewRequest("${req.method}", "${fullUrl}", nil)`);
  }

  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');

  for (const [k, v] of Object.entries(req.headers).filter(([k]) => k)) {
    lines.push(`\treq.Header.Set("${k}", "${v}")`);
  }

  lines.push('');

  if (req.timeout) {
    lines.push(`\tclient := &http.Client{Timeout: ${req.timeout} * time.Second}`);
  } else {
    lines.push('\tclient := &http.Client{}');
  }

  lines.push('\tresp, err := client.Do(req)');
  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');
  lines.push('\tdefer resp.Body.Close()');
  lines.push('');
  lines.push('\tbody, _ := io.ReadAll(resp.Body)');
  lines.push('\tfmt.Println(resp.StatusCode)');
  lines.push('\tfmt.Println(string(body))');
  lines.push('}');

  return lines.join('\n');
}

// ── PHP (cURL) ───────────────────────────────────────────────────────────────

function generatePhp(req: NormRequest, fullUrl: string): string {
  const lines: string[] = ['<?php', '', '$ch = curl_init();', ''];

  lines.push(`curl_setopt($ch, CURLOPT_URL, "${fullUrl}");`);
  lines.push('curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);');

  if (req.method !== 'GET') {
    lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "${req.method}");`);
  }

  const headerEntries = Object.entries(req.headers).filter(([k]) => k);
  if (headerEntries.length > 0) {
    lines.push('');
    lines.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [');
    for (const [k, v] of headerEntries) {
      lines.push(`    "${k}: ${v}",`);
    }
    lines.push(']);');
  }

  const bodyStr = formatJsonBody(req.body);
  if (hasBody(req.method) && bodyStr) {
    lines.push('');
    lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${bodyStr.replace(/'/g, "\\'")}');`);
  }

  if (req.timeout) {
    lines.push(`curl_setopt($ch, CURLOPT_TIMEOUT, ${req.timeout});`);
  }

  lines.push('');
  lines.push('$response = curl_exec($ch);');
  lines.push('$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);');
  lines.push('curl_close($ch);');
  lines.push('');
  lines.push('echo "Status: $httpCode\\n";');
  lines.push('echo $response;');

  return lines.join('\n');
}

// ── Java (HttpClient) ────────────────────────────────────────────────────────

function generateJava(req: NormRequest, fullUrl: string): string {
  const lines: string[] = [
    'import java.net.URI;',
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
  ];

  const bodyStr = formatJsonBody(req.body);
  if (req.timeout) {
    lines.push('import java.time.Duration;');
  }

  lines.push('');
  lines.push('public class ApiRequest {');
  lines.push('    public static void main(String[] args) throws Exception {');
  lines.push(`        HttpClient client = HttpClient.newHttpClient();`);
  lines.push('');

  // Build request
  lines.push(`        HttpRequest request = HttpRequest.newBuilder()`);
  lines.push(`            .uri(URI.create("${fullUrl}"))`);

  if (hasBody(req.method) && bodyStr) {
    lines.push(`            .method("${req.method}", HttpRequest.BodyPublishers.ofString("""`);
    lines.push(`                ${bodyStr}`);
    lines.push(`                """))`);
  } else if (req.method !== 'GET') {
    lines.push(`            .method("${req.method}", HttpRequest.BodyPublishers.noBody())`);
  }

  for (const [k, v] of Object.entries(req.headers).filter(([k]) => k)) {
    lines.push(`            .header("${k}", "${v}")`);
  }

  if (req.timeout) {
    lines.push(`            .timeout(Duration.ofSeconds(${req.timeout}))`);
  }

  lines.push('            .build();');
  lines.push('');
  lines.push('        HttpResponse<String> response = client.send(');
  lines.push('            request, HttpResponse.BodyHandlers.ofString()');  
  lines.push('        );');
  lines.push('');
  lines.push('        System.out.println(response.statusCode());');
  lines.push('        System.out.println(response.body());');
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

// ── C# (HttpClient) ─────────────────────────────────────────────────────────

function generateCsharp(req: NormRequest, fullUrl: string): string {
  const lines: string[] = [
    'using System;',
    'using System.Net.Http;',
    'using System.Text;',
    'using System.Threading.Tasks;',
    '',
    'class Program',
    '{',
    '    static async Task Main()',
    '    {',
    '        using var client = new HttpClient();',
  ];

  if (req.timeout) {
    lines.push(`        client.Timeout = TimeSpan.FromSeconds(${req.timeout});`);
  }

  lines.push('');

  const bodyStr = formatJsonBody(req.body);

  if (req.method === 'GET') {
    lines.push(`        var response = await client.GetAsync("${fullUrl}");`);
  } else {
    if (hasBody(req.method) && bodyStr) {
      const ct = req.headers['Content-Type'] || 'application/json';
      lines.push(`        var content = new StringContent(`);
      lines.push(`            @"${bodyStr.replace(/"/g, '""')}",`);
      lines.push(`            Encoding.UTF8,`);
      lines.push(`            "${ct}"`);
      lines.push('        );');
      lines.push('');
    }

    for (const [k, v] of Object.entries(req.headers).filter(([k]) => k && k !== 'Content-Type')) {
      lines.push(`        client.DefaultRequestHeaders.Add("${k}", "${v}");`);
    }

    if (req.method === 'POST') {
      lines.push(`        var response = await client.PostAsync("${fullUrl}", ${hasBody(req.method) && bodyStr ? 'content' : 'null'});`);
    } else if (req.method === 'PUT') {
      lines.push(`        var response = await client.PutAsync("${fullUrl}", ${hasBody(req.method) && bodyStr ? 'content' : 'null'});`);
    } else if (req.method === 'DELETE') {
      lines.push(`        var response = await client.DeleteAsync("${fullUrl}");`);
    } else {
      lines.push(`        var request = new HttpRequestMessage(new HttpMethod("${req.method}"), "${fullUrl}");`);
      if (hasBody(req.method) && bodyStr) {
        lines.push('        request.Content = content;');
      }
      lines.push('        var response = await client.SendAsync(request);');
    }
  }

  lines.push('');
  lines.push('        var body = await response.Content.ReadAsStringAsync();');
  lines.push('        Console.WriteLine((int)response.StatusCode);');
  lines.push('        Console.WriteLine(body);');
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

// ── Language metadata ────────────────────────────────────────────────────────

export const CODE_LANGUAGES: { id: CodeLanguage; label: string; icon: string }[] = [
  { id: 'curl', label: 'cURL', icon: '⌘' },
  { id: 'python', label: 'Python', icon: '🐍' },
  { id: 'javascript', label: 'JavaScript', icon: 'JS' },
  { id: 'nodejs', label: 'Node.js', icon: '⬢' },
  { id: 'go', label: 'Go', icon: '🔵' },
  { id: 'php', label: 'PHP', icon: '🐘' },
  { id: 'java', label: 'Java', icon: '☕' },
  { id: 'csharp', label: 'C#', icon: '#' },
];
