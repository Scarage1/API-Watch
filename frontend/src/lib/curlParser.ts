/**
 * cURL Command Parser
 *
 * Parses cURL commands into structured request objects that can be loaded
 * into API-Watch request tabs. Supports common cURL flags:
 *   -X / --request    HTTP method
 *   -H / --header     Headers
 *   -d / --data       Body data
 *   --data-raw        Raw body data
 *   --data-binary     Binary body data
 *   --data-urlencode  URL-encoded body data
 *   -u / --user       Basic auth (user:password)
 *   -A / --user-agent User-Agent header
 *   -b / --cookie     Cookies
 *   -e / --referer    Referer header
 *   --compressed      Accept-Encoding header
 *   -k / --insecure   Disable SSL verification
 *   --connect-timeout Timeout
 *   -L / --location   Follow redirects
 *   -F / --form       Multipart form data
 */

export interface ParsedCurlRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  body?: string;
  bodyType: 'none' | 'json' | 'text' | 'form-data' | 'x-www-form-urlencoded';
  timeout?: number;
  auth?: {
    type: 'basic';
    username: string;
    password: string;
  };
}

/**
 * Tokenise a cURL command string, correctly handling quoted strings,
 * escaped characters, and line continuations (backslash-newline).
 */
function tokenize(input: string): string[] {
  // Normalise line continuations
  let raw = input
    .replace(/\\\r?\n\s*/g, ' ')   // backslash + newline
    .replace(/\r?\n/g, ' ')         // bare newlines
    .trim();

  // Strip leading "curl" keyword
  if (/^curl\s/i.test(raw)) {
    raw = raw.slice(4).trim();
  }

  const tokens: string[] = [];
  let i = 0;

  while (i < raw.length) {
    // Skip whitespace
    if (/\s/.test(raw[i])) {
      i++;
      continue;
    }

    let token = '';

    if (raw[i] === "'" ) {
      // Single-quoted string — no escapes
      i++; // skip opening quote
      while (i < raw.length && raw[i] !== "'") {
        token += raw[i++];
      }
      i++; // skip closing quote
    } else if (raw[i] === '"') {
      // Double-quoted string — handle backslash escapes
      i++; // skip opening quote
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === '\\' && i + 1 < raw.length) {
          const next = raw[i + 1];
          if (next === '"' || next === '\\' || next === '$' || next === '`') {
            token += next;
            i += 2;
            continue;
          }
        }
        token += raw[i++];
      }
      i++; // skip closing quote
    } else {
      // Unquoted token
      while (i < raw.length && !/\s/.test(raw[i])) {
        if (raw[i] === '\\' && i + 1 < raw.length) {
          token += raw[i + 1];
          i += 2;
          continue;
        }
        token += raw[i++];
      }
    }

    if (token !== '') {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Parse a cURL command string into a structured request object.
 *
 * @param curlCommand - The cURL command to parse
 * @returns ParsedCurlRequest with method, url, headers, body, etc.
 * @throws Error if the input is not a valid cURL command
 */
export function parseCurl(curlCommand: string): ParsedCurlRequest {
  const trimmed = curlCommand.trim();
  if (!trimmed) {
    throw new Error('Empty cURL command');
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    throw new Error('Could not parse cURL command');
  }

  let method = '';
  let url = '';
  const headers: Record<string, string> = {};
  const dataFragments: string[] = [];
  const formParts: Array<{ key: string; value: string }> = [];
  let auth: ParsedCurlRequest['auth'] | undefined;
  let timeout: number | undefined;
  let isFormData = false;

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // ── Method ─────────────────────────────────────────
    if (token === '-X' || token === '--request') {
      method = (tokens[++i] || 'GET').toUpperCase();
    }
    // ── Headers ────────────────────────────────────────
    else if (token === '-H' || token === '--header') {
      const headerStr = tokens[++i] || '';
      const colonIdx = headerStr.indexOf(':');
      if (colonIdx > 0) {
        const key = headerStr.slice(0, colonIdx).trim();
        const value = headerStr.slice(colonIdx + 1).trim();
        headers[key] = value;
      }
    }
    // ── Body data ──────────────────────────────────────
    else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii'
    ) {
      dataFragments.push(tokens[++i] || '');
    }
    // ── URL-encoded data ───────────────────────────────
    else if (token === '--data-urlencode') {
      dataFragments.push(tokens[++i] || '');
    }
    // ── Form data ──────────────────────────────────────
    else if (token === '-F' || token === '--form') {
      isFormData = true;
      const formStr = tokens[++i] || '';
      const eqIdx = formStr.indexOf('=');
      if (eqIdx > 0) {
        formParts.push({
          key: formStr.slice(0, eqIdx),
          value: formStr.slice(eqIdx + 1),
        });
      }
    }
    // ── Basic auth ─────────────────────────────────────
    else if (token === '-u' || token === '--user') {
      const authStr = tokens[++i] || '';
      const colonIdx = authStr.indexOf(':');
      if (colonIdx > 0) {
        auth = {
          type: 'basic',
          username: authStr.slice(0, colonIdx),
          password: authStr.slice(colonIdx + 1),
        };
      }
    }
    // ── User-Agent ─────────────────────────────────────
    else if (token === '-A' || token === '--user-agent') {
      headers['User-Agent'] = tokens[++i] || '';
    }
    // ── Cookie ─────────────────────────────────────────
    else if (token === '-b' || token === '--cookie') {
      headers['Cookie'] = tokens[++i] || '';
    }
    // ── Referer ────────────────────────────────────────
    else if (token === '-e' || token === '--referer') {
      headers['Referer'] = tokens[++i] || '';
    }
    // ── Compressed ─────────────────────────────────────
    else if (token === '--compressed') {
      if (!headers['Accept-Encoding']) {
        headers['Accept-Encoding'] = 'gzip, deflate, br';
      }
    }
    // ── Timeout ────────────────────────────────────────
    else if (token === '--connect-timeout' || token === '--max-time' || token === '-m') {
      const val = parseInt(tokens[++i] || '10', 10);
      if (!isNaN(val)) timeout = val;
    }
    // ── Flags that consume the next token (skip) ──────
    else if (
      token === '-o' || token === '--output' ||
      token === '-c' || token === '--cookie-jar' ||
      token === '-C' || token === '--continue-at' ||
      token === '-w' || token === '--write-out' ||
      token === '--resolve' ||
      token === '--cacert' ||
      token === '--cert' ||
      token === '--key' ||
      token === '--proxy'
    ) {
      i++; // skip argument
    }
    // ── Boolean flags (no arg) ─────────────────────────
    else if (
      token === '-k' || token === '--insecure' ||
      token === '-L' || token === '--location' ||
      token === '-s' || token === '--silent' ||
      token === '-S' || token === '--show-error' ||
      token === '-v' || token === '--verbose' ||
      token === '-i' || token === '--include' ||
      token === '-I' || token === '--head' ||
      token === '-g' || token === '--globoff' ||
      token === '-N' || token === '--no-buffer'
    ) {
      if (token === '-I' || token === '--head') {
        if (!method) method = 'HEAD';
      }
    }
    // ── Combined short flags (e.g. -sSL) ───────────────
    else if (/^-[a-zA-Z]{2,}$/.test(token)) {
      // Expand combined flags — just detect HEAD if 'I' is present
      if (token.includes('I') && !method) method = 'HEAD';
    }
    // ── URL (anything else that looks like a URL) ──────
    else if (!token.startsWith('-')) {
      url = token;
    }

    i++;
  }

  // If no URL was found, throw
  if (!url) {
    throw new Error('No URL found in cURL command');
  }

  // Default method based on data presence
  if (!method) {
    method = dataFragments.length > 0 || formParts.length > 0 ? 'POST' : 'GET';
  }

  // ── Parse URL params ──────────────────────────────────
  const params: Record<string, string> = {};
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    // Rebuild URL without query string
    url = urlObj.origin + urlObj.pathname;
  } catch {
    // URL may be relative or malformed — leave as-is
  }

  // ── Determine body and body type ──────────────────────
  let body: string | undefined;
  let bodyType: ParsedCurlRequest['bodyType'] = 'none';

  if (isFormData && formParts.length > 0) {
    bodyType = 'form-data';
    const formObj: Record<string, string> = {};
    formParts.forEach((p) => { formObj[p.key] = p.value; });
    body = JSON.stringify(formObj, null, 2);
  } else if (dataFragments.length > 0) {
    const rawBody = dataFragments.join('&');

    // Try to detect JSON
    try {
      JSON.parse(rawBody);
      bodyType = 'json';
      body = rawBody;
      // Auto-add Content-Type if not set
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    } catch {
      // Check for URL-encoded form: key=value&key=value
      if (/^[^=&]+=[^&]*(&[^=&]+=[^&]*)*$/.test(rawBody)) {
        bodyType = 'x-www-form-urlencoded';
        body = rawBody;
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else {
        bodyType = 'text';
        body = rawBody;
      }
    }
  }

  // If Content-Type header hints at JSON, override
  const ct = headers['Content-Type'] || headers['content-type'] || '';
  if (ct.includes('application/json') && body && bodyType !== 'json') {
    try {
      JSON.parse(body);
      bodyType = 'json';
    } catch { /* keep original type */ }
  }

  return {
    method,
    url,
    headers,
    params,
    body,
    bodyType,
    timeout,
    auth,
  };
}

/**
 * Quick check whether a string looks like a cURL command.
 */
export function isCurlCommand(input: string): boolean {
  const trimmed = input.trim();
  return /^curl\s/i.test(trimmed) || /^curl$/i.test(trimmed);
}

/**
 * Try to format/pretty-print a body string based on body type.
 */
export function formatBody(body: string | undefined, bodyType: string): string {
  if (!body) return '';
  if (bodyType === 'json') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}
