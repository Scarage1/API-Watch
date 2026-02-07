/**
 * Web Worker for sandboxed script execution.
 *
 * Runs user-supplied pre-request / test scripts inside an isolated Worker
 * context. The Worker has NO access to DOM, window, document, localStorage,
 * fetch, XMLHttpRequest, or any browser API — providing true sandbox isolation.
 *
 * Communication protocol:
 *   Main → Worker:  { id, script, context }
 *   Worker → Main:  { id, result } | { id, error }
 */

// ── Types (duplicated here to be self-contained in the Worker) ───────────

interface AssertionResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error';
  args: unknown[];
  timestamp: number;
}

interface ScriptResult {
  assertions: AssertionResult[];
  consoleLogs: ConsoleEntry[];
  error: string | null;
  duration: number;
  updatedVariables: Record<string, string>;
}

interface ScriptContext {
  response?: {
    status: number | null;
    body: unknown;
    headers: Record<string, string>;
    responseTime: number;
    responseSize: number;
  };
  envVariables: Record<string, string>;
  collectionVariables?: Record<string, string>;
}

interface WorkerMessage {
  id: string;
  script: string;
  context: ScriptContext;
}

// ── Matcher (same logic as scriptEngine.ts) ──────────────────────────────

type Matcher = {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
  toBeDefined: () => void;
  toBeUndefined: () => void;
  toBeNull: () => void;
  toBeTruthy: () => void;
  toBeFalsy: () => void;
  toContain: (item: unknown) => void;
  toHaveLength: (len: number) => void;
  toBeLessThan: (n: number) => void;
  toBeGreaterThan: (n: number) => void;
  toMatch: (pattern: RegExp | string) => void;
  toHaveProperty: (key: string) => void;
  toBeType: (typeName: string) => void;
  not: Matcher;
};

function createMatcher(actual: unknown, negated = false): Matcher {
  const assert = (pass: boolean, msg: string) => {
    const result = negated ? !pass : pass;
    if (!result) throw new Error(negated ? `Expected NOT: ${msg}` : msg);
  };

  const matcher: Matcher = {
    toBe(expected) {
      assert(actual === expected, `Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
    },
    toEqual(expected) {
      assert(
        JSON.stringify(actual) === JSON.stringify(expected),
        `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`,
      );
    },
    toBeDefined() { assert(actual !== undefined, 'Expected value to be defined'); },
    toBeUndefined() { assert(actual === undefined, 'Expected value to be undefined'); },
    toBeNull() { assert(actual === null, 'Expected value to be null'); },
    toBeTruthy() { assert(!!actual, `Expected ${JSON.stringify(actual)} to be truthy`); },
    toBeFalsy() { assert(!actual, `Expected ${JSON.stringify(actual)} to be falsy`); },
    toContain(item) {
      if (typeof actual === 'string') {
        assert(actual.includes(String(item)), `Expected "${actual}" to contain "${item}"`);
      } else if (Array.isArray(actual)) {
        assert(actual.includes(item), `Expected array to contain ${JSON.stringify(item)}`);
      } else {
        throw new Error('toContain can only be used with strings or arrays');
      }
    },
    toHaveLength(len) {
      const v = actual as any;
      assert(v?.length === len, `Expected length ${v?.length} to be ${len}`);
    },
    toBeLessThan(n) { assert((actual as number) < n, `Expected ${actual} to be less than ${n}`); },
    toBeGreaterThan(n) { assert((actual as number) > n, `Expected ${actual} to be greater than ${n}`); },
    toMatch(pattern) {
      const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      assert(re.test(String(actual)), `Expected "${actual}" to match ${re}`);
    },
    toHaveProperty(key) {
      assert(
        actual != null && typeof actual === 'object' && key in (actual as Record<string, unknown>),
        `Expected object to have property "${key}"`,
      );
    },
    toBeType(typeName) {
      assert(typeof actual === typeName, `Expected typeof ${JSON.stringify(actual)} to be "${typeName}"`);
    },
    get not() { return createMatcher(actual, !negated); },
  };
  return matcher;
}

// ── JSON Schema Validator (lightweight) ──────────────────────────────────

function _validateSchema(data: unknown, schema: Record<string, unknown>): boolean {
  if (!schema || typeof schema !== 'object') return true;
  const type = schema.type as string | undefined;
  if (type) {
    if (type === 'object' && (typeof data !== 'object' || data === null || Array.isArray(data))) return false;
    if (type === 'array' && !Array.isArray(data)) return false;
    if (type === 'string' && typeof data !== 'string') return false;
    if (type === 'number' && typeof data !== 'number') return false;
    if (type === 'integer' && (typeof data !== 'number' || !Number.isInteger(data))) return false;
    if (type === 'boolean' && typeof data !== 'boolean') return false;
    if (type === 'null' && data !== null) return false;
  }
  if (type === 'object' && schema.required && Array.isArray(schema.required)) {
    const obj = data as Record<string, unknown>;
    for (const key of schema.required as string[]) {
      if (!(key in obj)) return false;
    }
  }
  if (type === 'object' && schema.properties && typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    for (const [k, ps] of Object.entries(props)) {
      if (k in obj && !_validateSchema(obj[k], ps)) return false;
    }
  }
  if (type === 'array' && schema.items && Array.isArray(data)) {
    for (const item of data) {
      if (!_validateSchema(item, schema.items as Record<string, unknown>)) return false;
    }
  }
  if (type === 'string' && typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < (schema.minLength as number)) return false;
    if (schema.maxLength !== undefined && data.length > (schema.maxLength as number)) return false;
  }
  if ((type === 'number' || type === 'integer') && typeof data === 'number') {
    if (schema.minimum !== undefined && data < (schema.minimum as number)) return false;
    if (schema.maximum !== undefined && data > (schema.maximum as number)) return false;
  }
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(data)) return false;
  }
  return true;
}

// ── Execute script ───────────────────────────────────────────────────────

function executeScript(script: string, context: ScriptContext): ScriptResult {
  const start = performance.now();
  const assertions: AssertionResult[] = [];
  const consoleLogs: ConsoleEntry[] = [];
  const updatedVariables: Record<string, string> = { ...context.envVariables };
  let error: string | null = null;

  if (!script.trim()) {
    return { assertions, consoleLogs, error: null, duration: 0, updatedVariables };
  }

  const pm = {
    response: context.response
      ? {
          code: context.response.status,
          status: context.response.status,
          responseTime: context.response.responseTime,
          responseSize: context.response.responseSize,
          headers: {
            get: (name: string) => {
              const key = Object.keys(context.response!.headers).find(
                (k) => k.toLowerCase() === name.toLowerCase(),
              );
              return key ? context.response!.headers[key] : undefined;
            },
            has: (name: string) =>
              Object.keys(context.response!.headers).some(
                (k) => k.toLowerCase() === name.toLowerCase(),
              ),
            toObject: () => ({ ...context.response!.headers }),
          },
          json: () => {
            if (typeof context.response!.body === 'string') {
              try { return JSON.parse(context.response!.body); } catch { return context.response!.body; }
            }
            return context.response!.body;
          },
          text: () => {
            if (typeof context.response!.body === 'string') return context.response!.body;
            return JSON.stringify(context.response!.body);
          },
        }
      : null,
    environment: {
      get: (key: string) => updatedVariables[key] ?? '',
      set: (key: string, value: string) => { updatedVariables[key] = String(value); },
      unset: (key: string) => { delete updatedVariables[key]; },
      toObject: () => ({ ...updatedVariables }),
    },
    variables: {
      get: (key: string) => updatedVariables[key] ?? '',
      set: (key: string, value: string) => { updatedVariables[key] = String(value); },
    },
    test: (name: string, fn: () => void) => {
      try { fn(); assertions.push({ name, passed: true }); }
      catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        assertions.push({ name, passed: false, error: message });
      }
    },
    expect: (actual: unknown) => createMatcher(actual),
  };

  const console_proxy = {
    log: (...args: unknown[]) => consoleLogs.push({ level: 'log', args, timestamp: Date.now() }),
    info: (...args: unknown[]) => consoleLogs.push({ level: 'info', args, timestamp: Date.now() }),
    warn: (...args: unknown[]) => consoleLogs.push({ level: 'warn', args, timestamp: Date.now() }),
    error: (...args: unknown[]) => consoleLogs.push({ level: 'error', args, timestamp: Date.now() }),
  };

  try {
    const fn = new Function(
      'pm', 'console', 'expect', 'test', 'response', 'validateJsonSchema',
      script,
    );
    fn(pm, console_proxy, pm.expect, pm.test, pm.response, (data: unknown, schema: Record<string, unknown>) => _validateSchema(data, schema));
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : String(err);
  }

  return { assertions, consoleLogs, error, duration: performance.now() - start, updatedVariables };
}

// ── Worker message handler ───────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { id, script, context } = e.data;
  try {
    const result = executeScript(script, context);
    self.postMessage({ id, result });
  } catch (err: unknown) {
    self.postMessage({
      id,
      result: {
        assertions: [],
        consoleLogs: [],
        error: err instanceof Error ? err.message : String(err),
        duration: 0,
        updatedVariables: { ...context.envVariables },
      } satisfies ScriptResult,
    });
  }
};
