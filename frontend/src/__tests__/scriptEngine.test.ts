import { describe, it, expect } from 'vitest';
import {
  runScript,
  PRE_REQUEST_SNIPPETS,
  TEST_SNIPPETS,
} from '../lib/scriptEngine';
import type { ScriptContext, ScriptResult } from '../lib/scriptEngine';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeResponseContext = (overrides: Partial<ScriptContext['response']> = {}): ScriptContext => ({
  envVariables: { BASE_URL: 'https://api.example.com', TOKEN: 'abc123' },
  response: {
    status: 200,
    body: '{"id": 1, "name": "Test", "items": [1, 2, 3]}',
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-123' },
    responseTime: 150,
    responseSize: 1024,
    ...overrides,
  },
});

const makePreRequestContext = (vars: Record<string, string> = {}): ScriptContext => ({
  envVariables: { BASE_URL: 'https://api.example.com', ...vars },
});

// ── Script Engine: Basic Execution ───────────────────────────────────────────

describe('runScript – basic execution', () => {
  it('returns empty results for empty script', () => {
    const result = runScript('', makePreRequestContext());
    expect(result.assertions).toHaveLength(0);
    expect(result.consoleLogs).toHaveLength(0);
    expect(result.error).toBeNull();
    expect(result.duration).toBe(0);
  });

  it('returns empty results for whitespace-only script', () => {
    const result = runScript('   \n\t  ', makePreRequestContext());
    expect(result.error).toBeNull();
  });

  it('captures script-level syntax errors', () => {
    const result = runScript('const x = {;', makePreRequestContext());
    expect(result.error).not.toBeNull();
  });

  it('captures script-level runtime errors', () => {
    const result = runScript('throw new Error("boom");', makePreRequestContext());
    expect(result.error).toBe('boom');
  });

  it('reports execution duration', () => {
    const result = runScript('let x = 1 + 1;', makePreRequestContext());
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ── pm.test & Assertions ─────────────────────────────────────────────────────

describe('runScript – pm.test assertions', () => {
  it('records a passing test', () => {
    const result = runScript(
      `pm.test("should pass", () => { pm.expect(1).toBe(1); });`,
      makeResponseContext()
    );
    expect(result.assertions).toHaveLength(1);
    expect(result.assertions[0].name).toBe('should pass');
    expect(result.assertions[0].passed).toBe(true);
    expect(result.assertions[0].error).toBeUndefined();
  });

  it('records a failing test', () => {
    const result = runScript(
      `pm.test("should fail", () => { pm.expect(1).toBe(2); });`,
      makeResponseContext()
    );
    expect(result.assertions).toHaveLength(1);
    expect(result.assertions[0].passed).toBe(false);
    expect(result.assertions[0].error).toBeTruthy();
  });

  it('handles multiple tests', () => {
    const result = runScript(
      `
      pm.test("test 1", () => { pm.expect(true).toBe(true); });
      pm.test("test 2", () => { pm.expect(false).toBe(true); });
      pm.test("test 3", () => { pm.expect("hello").toContain("hell"); });
      `,
      makeResponseContext()
    );
    expect(result.assertions).toHaveLength(3);
    expect(result.assertions[0].passed).toBe(true);
    expect(result.assertions[1].passed).toBe(false);
    expect(result.assertions[2].passed).toBe(true);
  });

  it('continues after a failing test', () => {
    const result = runScript(
      `
      pm.test("fail", () => { throw new Error("oops"); });
      pm.test("pass", () => { pm.expect(1).toBe(1); });
      `,
      makeResponseContext()
    );
    expect(result.assertions).toHaveLength(2);
    expect(result.assertions[1].passed).toBe(true);
  });
});

// ── Matcher API ──────────────────────────────────────────────────────────────

describe('runScript – expect matchers', () => {
  const run = (assertionCode: string): ScriptResult =>
    runScript(`pm.test("t", () => { ${assertionCode} });`, makeResponseContext());

  it('toBe – strict equality', () => {
    expect(run('pm.expect(42).toBe(42);').assertions[0].passed).toBe(true);
    expect(run('pm.expect(42).toBe("42");').assertions[0].passed).toBe(false);
  });

  it('toEqual – deep equality', () => {
    expect(run('pm.expect({a:1}).toEqual({a:1});').assertions[0].passed).toBe(true);
    expect(run('pm.expect({a:1}).toEqual({a:2});').assertions[0].passed).toBe(false);
  });

  it('toBeDefined / toBeUndefined', () => {
    expect(run('pm.expect("x").toBeDefined();').assertions[0].passed).toBe(true);
    expect(run('pm.expect(undefined).toBeUndefined();').assertions[0].passed).toBe(true);
  });

  it('toBeNull', () => {
    expect(run('pm.expect(null).toBeNull();').assertions[0].passed).toBe(true);
    expect(run('pm.expect("x").toBeNull();').assertions[0].passed).toBe(false);
  });

  it('toBeTruthy / toBeFalsy', () => {
    expect(run('pm.expect(1).toBeTruthy();').assertions[0].passed).toBe(true);
    expect(run('pm.expect(0).toBeFalsy();').assertions[0].passed).toBe(true);
  });

  it('toContain – string', () => {
    expect(run('pm.expect("hello world").toContain("world");').assertions[0].passed).toBe(true);
  });

  it('toContain – array', () => {
    expect(run('pm.expect([1,2,3]).toContain(2);').assertions[0].passed).toBe(true);
    expect(run('pm.expect([1,2,3]).toContain(5);').assertions[0].passed).toBe(false);
  });

  it('toHaveLength', () => {
    expect(run('pm.expect([1,2,3]).toHaveLength(3);').assertions[0].passed).toBe(true);
    expect(run('pm.expect("abc").toHaveLength(3);').assertions[0].passed).toBe(true);
  });

  it('toBeLessThan / toBeGreaterThan', () => {
    expect(run('pm.expect(5).toBeLessThan(10);').assertions[0].passed).toBe(true);
    expect(run('pm.expect(10).toBeGreaterThan(5);').assertions[0].passed).toBe(true);
  });

  it('toMatch – regex', () => {
    expect(run('pm.expect("abc123").toMatch(/[a-z]+\\d+/);').assertions[0].passed).toBe(true);
  });

  it('toMatch – string pattern', () => {
    expect(run('pm.expect("abc123").toMatch("abc");').assertions[0].passed).toBe(true);
  });

  it('toHaveProperty', () => {
    expect(run('pm.expect({a:1}).toHaveProperty("a");').assertions[0].passed).toBe(true);
    expect(run('pm.expect({a:1}).toHaveProperty("b");').assertions[0].passed).toBe(false);
  });

  it('toBeType', () => {
    expect(run('pm.expect("s").toBeType("string");').assertions[0].passed).toBe(true);
    expect(run('pm.expect(42).toBeType("number");').assertions[0].passed).toBe(true);
  });

  it('not – negation', () => {
    expect(run('pm.expect(1).not.toBe(2);').assertions[0].passed).toBe(true);
    expect(run('pm.expect(1).not.toBe(1);').assertions[0].passed).toBe(false);
  });

  it('not.toContain', () => {
    expect(run('pm.expect("hello").not.toContain("xyz");').assertions[0].passed).toBe(true);
  });
});

// ── pm.response ──────────────────────────────────────────────────────────────

describe('runScript – pm.response', () => {
  it('response.code returns status code', () => {
    const result = runScript(
      `pm.test("status", () => { pm.expect(response.code).toBe(200); });`,
      makeResponseContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('response.json() parses body', () => {
    const result = runScript(
      `pm.test("json", () => {
        const json = response.json();
        pm.expect(json.id).toBe(1);
        pm.expect(json.name).toBe("Test");
      });`,
      makeResponseContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('response.text() returns string body', () => {
    const result = runScript(
      `pm.test("text", () => {
        pm.expect(response.text()).toContain("Test");
      });`,
      makeResponseContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('response.headers.get() is case-insensitive', () => {
    const result = runScript(
      `pm.test("header", () => {
        pm.expect(response.headers.get("Content-Type")).toBe("application/json");
        pm.expect(response.headers.get("content-type")).toBe("application/json");
      });`,
      makeResponseContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('response.headers.has() checks existence', () => {
    const result = runScript(
      `pm.test("has header", () => {
        pm.expect(response.headers.has("x-request-id")).toBe(true);
        pm.expect(response.headers.has("x-missing")).toBe(false);
      });`,
      makeResponseContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('response.responseTime returns ms', () => {
    const result = runScript(
      `pm.test("time", () => {
        pm.expect(response.responseTime).toBe(150);
        pm.expect(response.responseTime).toBeLessThan(500);
      });`,
      makeResponseContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('handles non-JSON body gracefully', () => {
    const ctx = makeResponseContext({ body: 'plain text response' });
    const result = runScript(
      `pm.test("text body", () => {
        pm.expect(response.text()).toBe("plain text response");
      });`,
      ctx
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('response.json() returns string when body is not JSON', () => {
    const ctx = makeResponseContext({ body: 'not json' });
    const result = runScript(
      `pm.test("non-json", () => {
        pm.expect(response.json()).toBe("not json");
      });`,
      ctx
    );
    expect(result.assertions[0].passed).toBe(true);
  });
});

// ── Console capture ──────────────────────────────────────────────────────────

describe('runScript – console capture', () => {
  it('captures console.log', () => {
    const result = runScript(`console.log("hello", 42);`, makePreRequestContext());
    expect(result.consoleLogs).toHaveLength(1);
    expect(result.consoleLogs[0].level).toBe('log');
    expect(result.consoleLogs[0].args).toEqual(['hello', 42]);
  });

  it('captures console.warn', () => {
    const result = runScript(`console.warn("warning!");`, makePreRequestContext());
    expect(result.consoleLogs[0].level).toBe('warn');
  });

  it('captures console.error', () => {
    const result = runScript(`console.error("error!");`, makePreRequestContext());
    expect(result.consoleLogs[0].level).toBe('error');
  });

  it('captures console.info', () => {
    const result = runScript(`console.info("info");`, makePreRequestContext());
    expect(result.consoleLogs[0].level).toBe('info');
  });

  it('captures multiple console calls in order', () => {
    const result = runScript(
      `console.log("a"); console.warn("b"); console.error("c");`,
      makePreRequestContext()
    );
    expect(result.consoleLogs).toHaveLength(3);
    expect(result.consoleLogs[0].level).toBe('log');
    expect(result.consoleLogs[1].level).toBe('warn');
    expect(result.consoleLogs[2].level).toBe('error');
  });

  it('captures objects in console.log', () => {
    const result = runScript(`console.log({ key: "value" });`, makePreRequestContext());
    expect(result.consoleLogs[0].args).toEqual([{ key: 'value' }]);
  });
});

// ── Environment variables ────────────────────────────────────────────────────

describe('runScript – environment variables', () => {
  it('pm.environment.get reads variables', () => {
    const result = runScript(
      `pm.test("get var", () => {
        pm.expect(pm.environment.get("BASE_URL")).toBe("https://api.example.com");
      });`,
      makePreRequestContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('pm.environment.set updates variables', () => {
    const result = runScript(
      `pm.environment.set("NEW_VAR", "new_value");`,
      makePreRequestContext()
    );
    expect(result.updatedVariables.NEW_VAR).toBe('new_value');
  });

  it('pm.environment.unset removes variables', () => {
    const result = runScript(
      `pm.environment.unset("BASE_URL");`,
      makePreRequestContext()
    );
    expect(result.updatedVariables.BASE_URL).toBeUndefined();
  });

  it('pm.environment.toObject returns all variables', () => {
    const result = runScript(
      `pm.test("toObject", () => {
        const vars = pm.environment.toObject();
        pm.expect(vars.BASE_URL).toBe("https://api.example.com");
      });`,
      makePreRequestContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('pm.variables.get/set works as alias', () => {
    const result = runScript(
      `pm.variables.set("myKey", "myVal");
       pm.test("alias", () => {
         pm.expect(pm.variables.get("myKey")).toBe("myVal");
       });`,
      makePreRequestContext()
    );
    expect(result.assertions[0].passed).toBe(true);
    expect(result.updatedVariables.myKey).toBe('myVal');
  });

  it('coerces non-string values to strings', () => {
    const result = runScript(
      `pm.environment.set("num", 42);`,
      makePreRequestContext()
    );
    expect(result.updatedVariables.num).toBe('42');
  });
});

// ── JSON Schema Validation ───────────────────────────────────────────────────

describe('runScript – JSON Schema validation', () => {
  it('validates a matching schema', () => {
    const result = runScript(
      `pm.test("schema", () => {
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
      makeResponseContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('fails when required property is missing', () => {
    const ctx = makeResponseContext({ body: '{"id": 1}' });
    const result = runScript(
      `pm.test("schema fail", () => {
        const schema = {
          type: "object",
          required: ["id", "name", "email"]
        };
        const json = response.json();
        pm.expect(validateJsonSchema(json, schema)).toBe(true);
      });`,
      ctx
    );
    expect(result.assertions[0].passed).toBe(false);
  });

  it('validates array schema', () => {
    const ctx = makeResponseContext({ body: '[1, 2, 3]' });
    const result = runScript(
      `pm.test("array schema", () => {
        const schema = { type: "array", items: { type: "number" } };
        pm.expect(validateJsonSchema(response.json(), schema)).toBe(true);
      });`,
      ctx
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('validates enum constraint', () => {
    const ctx = makeResponseContext({ body: '"active"' });
    const result = runScript(
      `pm.test("enum", () => {
        const schema = { type: "string", enum: ["active", "inactive"] };
        pm.expect(validateJsonSchema(response.json(), schema)).toBe(true);
      });`,
      ctx
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('fails enum when value not in list', () => {
    const ctx = makeResponseContext({ body: '"pending"' });
    const result = runScript(
      `pm.test("enum fail", () => {
        const schema = { type: "string", enum: ["active", "inactive"] };
        pm.expect(validateJsonSchema(response.json(), schema)).toBe(true);
      });`,
      ctx
    );
    expect(result.assertions[0].passed).toBe(false);
  });

  it('validates string length constraints', () => {
    const ctx = makeResponseContext({ body: '"hello"' });
    const result = runScript(
      `pm.test("strlen", () => {
        pm.expect(validateJsonSchema("hello", { type: "string", minLength: 3, maxLength: 10 })).toBe(true);
        pm.expect(validateJsonSchema("hi", { type: "string", minLength: 3 })).toBe(false);
      });`,
      ctx
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('validates number range constraints', () => {
    const result = runScript(
      `pm.test("num range", () => {
        pm.expect(validateJsonSchema(5, { type: "number", minimum: 1, maximum: 10 })).toBe(true);
        pm.expect(validateJsonSchema(15, { type: "number", minimum: 1, maximum: 10 })).toBe(false);
      });`,
      makeResponseContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });
});

// ── Top-level expect & test aliases ──────────────────────────────────────────

describe('runScript – top-level aliases', () => {
  it('global test() works the same as pm.test()', () => {
    const result = runScript(
      `test("global test", () => { expect(42).toBe(42); });`,
      makeResponseContext()
    );
    expect(result.assertions).toHaveLength(1);
    expect(result.assertions[0].passed).toBe(true);
    expect(result.assertions[0].name).toBe('global test');
  });

  it('global expect() works outside pm.test()', () => {
    // This should NOT throw because we're using new Function, not pm.test
    const result = runScript(
      `const x = 42; expect(x).toBe(42);`,
      makeResponseContext()
    );
    expect(result.error).toBeNull();
  });

  it('global expect() failure outside pm.test() causes script error', () => {
    const result = runScript(
      `expect(1).toBe(2);`,
      makeResponseContext()
    );
    expect(result.error).not.toBeNull();
  });
});

// ── Realistic Scenarios ──────────────────────────────────────────────────────

describe('runScript – realistic test scenarios', () => {
  it('complete API test with multiple assertions', () => {
    const result = runScript(
      `
      pm.test("Status 200", () => {
        pm.expect(response.code).toBe(200);
      });
      pm.test("Has items array", () => {
        const json = response.json();
        pm.expect(json.items).toBeDefined();
        pm.expect(Array.isArray(json.items)).toBe(true);
        pm.expect(json.items).toHaveLength(3);
      });
      pm.test("Response time acceptable", () => {
        pm.expect(response.responseTime).toBeLessThan(500);
      });
      pm.test("Content-Type is JSON", () => {
        pm.expect(response.headers.get("content-type")).toContain("json");
      });
      console.log("All tests executed for", pm.environment.get("BASE_URL"));
      `,
      makeResponseContext()
    );
    expect(result.assertions).toHaveLength(4);
    expect(result.assertions.every(a => a.passed)).toBe(true);
    expect(result.consoleLogs).toHaveLength(1);
    expect(result.error).toBeNull();
  });

  it('pre-request script sets variables', () => {
    const result = runScript(
      `
      pm.environment.set("requestId", "req-" + Date.now());
      pm.environment.set("timestamp", String(Date.now()));
      console.log("Set request variables");
      `,
      makePreRequestContext()
    );
    expect(result.updatedVariables.requestId).toMatch(/^req-\d+$/);
    expect(result.updatedVariables.timestamp).toMatch(/^\d+$/);
    expect(result.consoleLogs).toHaveLength(1);
  });

  it('test extracts value from response and stores it', () => {
    const result = runScript(
      `
      pm.test("Extract ID", () => {
        const json = response.json();
        pm.expect(json.id).toBeDefined();
        pm.environment.set("userId", String(json.id));
      });
      `,
      makeResponseContext()
    );
    expect(result.assertions[0].passed).toBe(true);
    expect(result.updatedVariables.userId).toBe('1');
  });

  it('handles 500 error response gracefully', () => {
    const ctx = makeResponseContext({
      status: 500,
      body: '{"error": "Internal Server Error"}',
    });
    const result = runScript(
      `
      pm.test("Not 500", () => {
        pm.expect(response.code).not.toBe(500);
      });
      pm.test("Has error field", () => {
        pm.expect(response.json()).toHaveProperty("error");
      });
      `,
      ctx
    );
    expect(result.assertions[0].passed).toBe(false);
    expect(result.assertions[1].passed).toBe(true);
  });
});

// ── Pre-built Snippets ───────────────────────────────────────────────────────

describe('snippets', () => {
  it('PRE_REQUEST_SNIPPETS are non-empty', () => {
    expect(PRE_REQUEST_SNIPPETS.length).toBeGreaterThan(0);
    PRE_REQUEST_SNIPPETS.forEach((s) => {
      expect(s.name).toBeTruthy();
      expect(s.code).toBeTruthy();
    });
  });

  it('TEST_SNIPPETS are non-empty', () => {
    expect(TEST_SNIPPETS.length).toBeGreaterThan(0);
    TEST_SNIPPETS.forEach((s) => {
      expect(s.name).toBeTruthy();
      expect(s.code).toBeTruthy();
    });
  });

  it('all pre-request snippets execute without errors', () => {
    PRE_REQUEST_SNIPPETS.forEach((snippet) => {
      const result = runScript(snippet.code, makePreRequestContext());
      expect(result.error).toBeNull();
    });
  });

  it('all test snippets execute without script errors', () => {
    TEST_SNIPPETS.forEach((snippet) => {
      const result = runScript(snippet.code, makeResponseContext());
      // Snippets may have failing assertions (expected values don't match) but no script errors
      expect(result.error).toBeNull();
    });
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('runScript – edge cases', () => {
  it('handles null response context for pre-request scripts', () => {
    const result = runScript(
      `pm.environment.set("key", "val"); console.log("no response");`,
      { envVariables: {} }
    );
    expect(result.error).toBeNull();
    expect(result.updatedVariables.key).toBe('val');
  });

  it('handles very long scripts', () => {
    const lines = Array.from({ length: 100 }, (_, i) =>
      `pm.test("test ${i}", () => { pm.expect(${i}).toBe(${i}); });`
    ).join('\n');
    const result = runScript(lines, makeResponseContext());
    expect(result.assertions).toHaveLength(100);
    expect(result.assertions.every(a => a.passed)).toBe(true);
  });

  it('pm.environment.get returns empty string for missing key', () => {
    const result = runScript(
      `pm.test("missing var", () => {
        pm.expect(pm.environment.get("NONEXISTENT")).toBe("");
      });`,
      makePreRequestContext()
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('response is null when no response context', () => {
    const result = runScript(
      `pm.test("null response", () => {
        pm.expect(response).toBeNull();
      });`,
      { envVariables: {} }
    );
    expect(result.assertions[0].passed).toBe(true);
  });
});
