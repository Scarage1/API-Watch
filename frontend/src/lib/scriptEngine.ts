// ── Script Execution Engine ─────────────────────────────────────────────────
// Sandboxed JavaScript runner with Postman-like expect() API, console capture,
// and environment variable access for pre-request and post-request test scripts.

// ── Types ────────────────────────────────────────────────────────────────────

export interface AssertionResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error';
  args: unknown[];
  timestamp: number;
}

export interface ScriptResult {
  assertions: AssertionResult[];
  consoleLogs: ConsoleEntry[];
  error: string | null;          // script-level error (syntax, runtime)
  duration: number;              // ms
  updatedVariables: Record<string, string>;  // vars set during script
}

export interface ScriptContext {
  response?: {
    status: number | null;
    body: unknown;
    headers: Record<string, string>;
    responseTime: number;  // ms
    responseSize: number;  // bytes
  };
  envVariables: Record<string, string>;
  collectionVariables?: Record<string, string>;
}

// ── Assertion Chain Builder ──────────────────────────────────────────────────

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
        `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`
      );
    },
    toBeDefined() {
      assert(actual !== undefined, `Expected value to be defined`);
    },
    toBeUndefined() {
      assert(actual === undefined, `Expected value to be undefined`);
    },
    toBeNull() {
      assert(actual === null, `Expected value to be null`);
    },
    toBeTruthy() {
      assert(!!actual, `Expected ${JSON.stringify(actual)} to be truthy`);
    },
    toBeFalsy() {
      assert(!actual, `Expected ${JSON.stringify(actual)} to be falsy`);
    },
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
      const val = actual as any;
      assert(val?.length === len, `Expected length ${val?.length} to be ${len}`);
    },
    toBeLessThan(n) {
      assert((actual as number) < n, `Expected ${actual} to be less than ${n}`);
    },
    toBeGreaterThan(n) {
      assert((actual as number) > n, `Expected ${actual} to be greater than ${n}`);
    },
    toMatch(pattern) {
      const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      assert(re.test(String(actual)), `Expected "${actual}" to match ${re}`);
    },
    toHaveProperty(key) {
      assert(
        actual != null && typeof actual === 'object' && key in (actual as Record<string, unknown>),
        `Expected object to have property "${key}"`
      );
    },
    toBeType(typeName) {
      assert(typeof actual === typeName, `Expected typeof ${JSON.stringify(actual)} to be "${typeName}"`);
    },
    get not() {
      return createMatcher(actual, !negated);
    },
  };

  return matcher;
}

// ── Script Runner ────────────────────────────────────────────────────────────

export function runScript(script: string, context: ScriptContext): ScriptResult {
  const start = performance.now();
  const assertions: AssertionResult[] = [];
  const consoleLogs: ConsoleEntry[] = [];
  const updatedVariables: Record<string, string> = { ...context.envVariables };
  let error: string | null = null;

  if (!script.trim()) {
    return { assertions, consoleLogs, error: null, duration: 0, updatedVariables };
  }

  // Build a Postman-like `pm` object
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
                (k) => k.toLowerCase() === name.toLowerCase()
              );
              return key ? context.response!.headers[key] : undefined;
            },
            has: (name: string) =>
              Object.keys(context.response!.headers).some(
                (k) => k.toLowerCase() === name.toLowerCase()
              ),
            toObject: () => ({ ...context.response!.headers }),
          },
          json: () => {
            if (typeof context.response!.body === 'string') {
              try {
                return JSON.parse(context.response!.body);
              } catch {
                return context.response!.body;
              }
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
      set: (key: string, value: string) => {
        updatedVariables[key] = String(value);
      },
      unset: (key: string) => {
        delete updatedVariables[key];
      },
      toObject: () => ({ ...updatedVariables }),
    },

    variables: {
      get: (key: string) => updatedVariables[key] ?? '',
      set: (key: string, value: string) => {
        updatedVariables[key] = String(value);
      },
    },

    test: (name: string, fn: () => void) => {
      try {
        fn();
        assertions.push({ name, passed: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        assertions.push({ name, passed: false, error: message });
      }
    },

    expect: (actual: unknown) => createMatcher(actual),
  };

  // Build sandboxed console
  const console_proxy = {
    log: (...args: unknown[]) =>
      consoleLogs.push({ level: 'log', args, timestamp: Date.now() }),
    info: (...args: unknown[]) =>
      consoleLogs.push({ level: 'info', args, timestamp: Date.now() }),
    warn: (...args: unknown[]) =>
      consoleLogs.push({ level: 'warn', args, timestamp: Date.now() }),
    error: (...args: unknown[]) =>
      consoleLogs.push({ level: 'error', args, timestamp: Date.now() }),
  };

  // Helper: top-level `expect` (like Postman's global expect)
  const expect_fn = (actual: unknown) => createMatcher(actual);

  // Helper: top-level `test` (alias for pm.test)
  const test_fn = pm.test;

  // JSON Schema validation helper
  const validateJsonSchema = (data: unknown, schema: Record<string, unknown>): boolean => {
    // Lightweight schema validation for common JSON Schema patterns
    return _validateSchema(data, schema);
  };

  try {
    // Use new Function to create a sandboxed scope
    // We inject pm, console, expect, test, and validation helpers
    const fn = new Function(
      'pm',
      'console',
      'expect',
      'test',
      'response',
      'validateJsonSchema',
      script
    );

    fn(
      pm,
      console_proxy,
      expect_fn,
      test_fn,
      pm.response,
      validateJsonSchema
    );
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : String(err);
  }

  const duration = performance.now() - start;

  return { assertions, consoleLogs, error, duration, updatedVariables };
}

// ── Lightweight JSON Schema Validator ────────────────────────────────────────

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

  // Required properties
  if (type === 'object' && schema.required && Array.isArray(schema.required)) {
    const obj = data as Record<string, unknown>;
    for (const key of schema.required as string[]) {
      if (!(key in obj)) return false;
    }
  }

  // Nested properties
  if (type === 'object' && schema.properties && typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    for (const [key, propSchema] of Object.entries(props)) {
      if (key in obj) {
        if (!_validateSchema(obj[key], propSchema)) return false;
      }
    }
  }

  // Array items
  if (type === 'array' && schema.items && Array.isArray(data)) {
    const itemSchema = schema.items as Record<string, unknown>;
    for (const item of data) {
      if (!_validateSchema(item, itemSchema)) return false;
    }
  }

  // Min/max length for strings
  if (type === 'string' && typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < (schema.minLength as number)) return false;
    if (schema.maxLength !== undefined && data.length > (schema.maxLength as number)) return false;
  }

  // Min/max for numbers
  if ((type === 'number' || type === 'integer') && typeof data === 'number') {
    if (schema.minimum !== undefined && data < (schema.minimum as number)) return false;
    if (schema.maximum !== undefined && data > (schema.maximum as number)) return false;
  }

  // Enum
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(data)) return false;
  }

  return true;
}

// ── Pre-built test snippets ──────────────────────────────────────────────────

export const PRE_REQUEST_SNIPPETS = [
  {
    name: 'Set a variable',
    code: `pm.environment.set("myVar", "myValue");`,
  },
  {
    name: 'Generate timestamp',
    code: `pm.environment.set("timestamp", Date.now().toString());`,
  },
  {
    name: 'Generate random ID',
    code: `pm.environment.set("randomId", Math.random().toString(36).substr(2, 9));`,
  },
  {
    name: 'Set auth header',
    code: `const token = pm.environment.get("authToken");
console.log("Using token:", token ? "***" + token.slice(-4) : "none");`,
  },
];

export const TEST_SNIPPETS = [
  {
    name: 'Status code is 200',
    code: `pm.test("Status code is 200", () => {
    pm.expect(response.code).toBe(200);
});`,
  },
  {
    name: 'Response time < 500ms',
    code: `pm.test("Response time is acceptable", () => {
    pm.expect(response.responseTime).toBeLessThan(500);
});`,
  },
  {
    name: 'Body contains property',
    code: `pm.test("Body has expected field", () => {
    const json = response.json();
    pm.expect(json).toHaveProperty("id");
});`,
  },
  {
    name: 'JSON value check',
    code: `pm.test("Value matches expected", () => {
    const json = response.json();
    pm.expect(json.status).toBe("success");
});`,
  },
  {
    name: 'Response is JSON',
    code: `pm.test("Content-Type is JSON", () => {
    const ct = response.headers.get("content-type");
    pm.expect(ct).toContain("application/json");
});`,
  },
  {
    name: 'Array has items',
    code: `pm.test("Response array is not empty", () => {
    const json = response.json();
    pm.expect(Array.isArray(json)).toBe(true);
    pm.expect(json.length).toBeGreaterThan(0);
});`,
  },
  {
    name: 'JSON Schema validation',
    code: `pm.test("Response matches schema", () => {
    const schema = {
        type: "object",
        required: ["id", "name"],
        properties: {
            id: { type: "number" },
            name: { type: "string" }
        }
    };
    const json = response.json();
    pm.expect(validateJsonSchema(json, schema)).toBe(true);
});`,
  },
  {
    name: 'Set variable from response',
    code: `pm.test("Extract and store ID", () => {
    const json = response.json();
    pm.expect(json.id).toBeDefined();
    pm.environment.set("extractedId", String(json.id));
});`,
  },
];
