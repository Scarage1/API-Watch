/**
 * Environment variable interpolation utilities.
 *
 * Replaces {{VARIABLE_NAME}} placeholders in strings and objects
 * with values from the active environment.
 *
 * Rules:
 *   - Pattern: {{VARIABLE_NAME}} (double curly braces)
 *   - Variable names: letters, digits, underscores, hyphens, dots, $-prefix for dynamic
 *   - Unresolved variables are left as-is
 *   - Nested interpolation is not supported
 */

/** Regex matching {{VAR_NAME}} and {{$dynamicVar}} */
const VAR_PATTERN = /\{\{(\$?[A-Za-z0-9_.-]+)\}\}/g;

// ── Dynamic Variables ────────────────────────────────────────────────────────

/**
 * Built-in dynamic variable generators.
 * Usage: {{$randomUUID}}, {{$timestamp}}, etc.
 */
const DYNAMIC_GENERATORS: Record<string, () => string> = {
  $randomUUID: () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  $timestamp: () => Math.floor(Date.now() / 1000).toString(),
  $isoTimestamp: () => new Date().toISOString(),
  $randomInt: () => Math.floor(Math.random() * 10000).toString(),
  $randomEmail: () => `user${Math.floor(Math.random() * 99999)}@test.example.com`,
  $randomString: () => Math.random().toString(36).slice(2, 10),
  $randomBoolean: () => (Math.random() > 0.5 ? 'true' : 'false'),
  $randomColor: () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
  $randomIP: () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.'),
  $randomUserAgent: () => 'API-Watch/2.0 (automated)',
};

/** List of all supported dynamic variable names. */
export const DYNAMIC_VARIABLE_NAMES = Object.keys(DYNAMIC_GENERATORS);

/**
 * Resolve a dynamic variable (name starting with $).
 * Returns the generated value or undefined if not a known dynamic var.
 */
function resolveDynamic(name: string): string | undefined {
  const gen = DYNAMIC_GENERATORS[name];
  return gen ? gen() : undefined;
}

// ── Core Interpolation ──────────────────────────────────────────────────────

/**
 * Interpolate a single string: replace all {{VAR}} with values from `vars`.
 * Dynamic variables ({{$...}}) are resolved on-the-fly.
 * Unresolved variables are left unchanged.
 */
export function interpolateString(
  input: string,
  vars: Record<string, string>,
): string {
  if (!input || !input.includes('{{')) return input;
  return input.replace(VAR_PATTERN, (match, name) => {
    // Check user-defined variables first
    if (name in vars) return vars[name];
    // Then try dynamic variables
    const dynamic = resolveDynamic(name);
    if (dynamic !== undefined) return dynamic;
    // Leave unresolved
    return match;
  });
}

/**
 * Interpolate all string values in a flat Record<string, string>.
 * Both keys and values are interpolated.
 */
export function interpolateRecord(
  obj: Record<string, string>,
  vars: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[interpolateString(key, vars)] = interpolateString(value, vars);
  }
  return result;
}

/**
 * Interpolate a raw body string.
 * Handles JSON, XML, text — all treated as plain text interpolation.
 */
export function interpolateBody(
  body: any,
  vars: Record<string, string>,
): any {
  if (body === null || body === undefined) return body;

  // String body (JSON text, XML, plain text)
  if (typeof body === 'string') {
    return interpolateString(body, vars);
  }

  // Object body (form-data already collapsed to Record<string,string>)
  if (typeof body === 'object' && !Array.isArray(body)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      const iKey = interpolateString(key, vars);
      if (typeof value === 'string') {
        result[iKey] = interpolateString(value, vars);
      } else {
        result[iKey] = value;
      }
    }
    return result;
  }

  return body;
}

/**
 * Extract all {{VAR}} names from a string.
 */
export function extractVariables(input: string): string[] {
  if (!input || !input.includes('{{')) return [];
  const names: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(VAR_PATTERN.source, 'g');
  while ((match = re.exec(input)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }
  return names;
}

/**
 * Check which variables in a string are unresolved
 * (not in vars dict AND not a known dynamic variable).
 */
export function getUnresolvedVariables(
  input: string,
  vars: Record<string, string>,
): string[] {
  return extractVariables(input).filter(
    (name) => !(name in vars) && !(name in DYNAMIC_GENERATORS)
  );
}

/**
 * Returns true if the string contains any {{VAR}} pattern.
 */
export function hasVariables(input: string): boolean {
  // Reset lastIndex since VAR_PATTERN has global flag
  const re = new RegExp(VAR_PATTERN.source);
  return re.test(input);
}

/**
 * Preview what a string will look like after interpolation,
 * without actually generating dynamic values.
 * Dynamic vars show as their name, user vars show resolved values.
 */
export function previewInterpolation(
  input: string,
  vars: Record<string, string>,
): string {
  if (!input || !input.includes('{{')) return input;
  return input.replace(VAR_PATTERN, (match, name) => {
    if (name in vars) return vars[name];
    if (name in DYNAMIC_GENERATORS) return `<${name}>`;
    return match;
  });
}
