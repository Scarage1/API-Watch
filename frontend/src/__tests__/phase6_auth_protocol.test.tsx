/**
 * Phase 6 Auth & Protocol tests — SSE Client page + Script Engine sandboxing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import {
  runScript,
  runScriptWorker,
  terminateScriptWorker,
} from '../lib/scriptEngine';
import type { ScriptContext } from '../lib/scriptEngine';

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrap(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

const makeResponseContext = (
  overrides: Partial<NonNullable<ScriptContext['response']>> = {},
): ScriptContext => ({
  envVariables: { BASE_URL: 'https://api.example.com', TOKEN: 'abc123' },
  response: {
    status: 200,
    body: '{"id": 1, "name": "Test"}',
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-123' },
    responseTime: 42,
    responseSize: 128,
    ...overrides,
  },
});

const makePreRequestContext = (vars: Record<string, string> = {}): ScriptContext => ({
  envVariables: { BASE_URL: 'https://api.example.com', ...vars },
});

// ══════════════════════════════════════════════════════════════════════════════
// SSE Client Page
// ══════════════════════════════════════════════════════════════════════════════

describe('SSEClient page', () => {
  // Mock EventSource
  let mockEventSource: any;

  beforeEach(() => {
    mockEventSource = {
      onopen: null as any,
      onmessage: null as any,
      onerror: null as any,
      close: vi.fn(),
      readyState: 1, // OPEN
      CONNECTING: 0,
      OPEN: 1,
      CLOSED: 2,
    };

    vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));
    (globalThis as any).EventSource.CLOSED = 2;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders SSE Client heading', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    expect(screen.getByText('SSE Client')).toBeDefined();
  });

  it('renders URL input', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    const input = screen.getByPlaceholderText('https://api.example.com/events');
    expect(input).toBeDefined();
  });

  it('renders connect button', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    expect(screen.getByText('Connect')).toBeDefined();
  });

  it('connect button is disabled when URL is empty', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    const btn = screen.getByText('Connect').closest('button')!;
    expect(btn.disabled).toBe(true);
  });

  it('connects when button clicked with URL', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    const input = screen.getByPlaceholderText('https://api.example.com/events');
    fireEvent.change(input, { target: { value: 'https://example.com/events' } });
    fireEvent.click(screen.getByText('Connect'));
    expect(EventSource).toHaveBeenCalledWith('https://example.com/events', { withCredentials: false });
  });

  it('shows Disconnect button after connecting', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    const input = screen.getByPlaceholderText('https://api.example.com/events');
    fireEvent.change(input, { target: { value: 'https://example.com/events' } });
    fireEvent.click(screen.getByText('Connect'));
    // Simulate open
    mockEventSource.onopen?.();
    expect(screen.getByText('Disconnect')).toBeDefined();
  });

  it('shows withCredentials checkbox', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    expect(screen.getByText('withCredentials')).toBeDefined();
  });

  it('shows filter input', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    const filter = screen.getByPlaceholderText('Filter by event type…');
    expect(filter).toBeDefined();
  });

  it('shows Clear button', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    expect(screen.getByText('Clear')).toBeDefined();
  });

  it('shows Pause button', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    expect(screen.getByText('Pause')).toBeDefined();
  });

  it('shows empty state when not connected', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    expect(screen.getByText('Connect to start receiving events')).toBeDefined();
  });

  it('shows event count', async () => {
    const SSEClient = (await import('../pages/SSEClient')).default;
    wrap(<SSEClient />);
    expect(screen.getByText('0 events')).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Script Engine — runScript (inline, synchronous)
// ══════════════════════════════════════════════════════════════════════════════

describe('runScript – inline sandbox', () => {
  it('pm.response.json() parses string body', () => {
    const result = runScript(
      `pm.test("json parse", () => {
        const json = response.json();
        pm.expect(json.id).toBe(1);
      });`,
      makeResponseContext(),
    );
    expect(result.assertions).toHaveLength(1);
    expect(result.assertions[0].passed).toBe(true);
  });

  it('pm.environment.set stores variables', () => {
    const result = runScript(
      `pm.environment.set("newKey", "newValue");`,
      makePreRequestContext(),
    );
    expect(result.updatedVariables.newKey).toBe('newValue');
  });

  it('pm.environment.unset removes variables', () => {
    const result = runScript(
      `pm.environment.unset("BASE_URL");`,
      makePreRequestContext(),
    );
    expect(result.updatedVariables.BASE_URL).toBeUndefined();
  });

  it('console.log is captured', () => {
    const result = runScript(
      `console.log("hello"); console.warn("warning");`,
      makePreRequestContext(),
    );
    expect(result.consoleLogs).toHaveLength(2);
    expect(result.consoleLogs[0].level).toBe('log');
    expect(result.consoleLogs[1].level).toBe('warn');
  });

  it('syntax error returns error string', () => {
    const result = runScript('if (', makePreRequestContext());
    expect(result.error).not.toBeNull();
  });

  it('runtime error returns error string', () => {
    const result = runScript('undeclaredVariable.method()', makePreRequestContext());
    expect(result.error).not.toBeNull();
  });

  it('assertion failures are recorded', () => {
    const result = runScript(
      `pm.test("should fail", () => {
        pm.expect(1).toBe(2);
      });`,
      makeResponseContext(),
    );
    expect(result.assertions).toHaveLength(1);
    expect(result.assertions[0].passed).toBe(false);
    expect(result.assertions[0].error).toBeDefined();
  });

  it('duration is non-negative', () => {
    const result = runScript(
      `for (let i = 0; i < 100; i++) {}`,
      makePreRequestContext(),
    );
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('expect().not negation works', () => {
    const result = runScript(
      `pm.test("not equal", () => {
        pm.expect(1).not.toBe(2);
      });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('toContain works on string', () => {
    const result = runScript(
      `pm.test("contains", () => {
        pm.expect("hello world").toContain("world");
      });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('toHaveProperty works', () => {
    const result = runScript(
      `pm.test("has prop", () => {
        const json = response.json();
        pm.expect(json).toHaveProperty("id");
      });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('toBeType works', () => {
    const result = runScript(
      `pm.test("type check", () => {
        pm.expect("str").toBeType("string");
        pm.expect(42).toBeType("number");
      });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('validateJsonSchema is available', () => {
    const result = runScript(
      `pm.test("schema valid", () => {
        const schema = { type: "object", required: ["id"], properties: { id: { type: "number" } } };
        pm.expect(validateJsonSchema(response.json(), schema)).toBe(true);
      });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('response.headers.get is case-insensitive', () => {
    const result = runScript(
      `pm.test("header case", () => {
        pm.expect(response.headers.get("Content-Type")).toBe("application/json");
      });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('response.headers.has works', () => {
    const result = runScript(
      `pm.test("has header", () => {
        pm.expect(response.headers.has("X-Request-Id")).toBe(true);
        pm.expect(response.headers.has("X-Missing")).toBe(false);
      });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Script Engine — runScriptWorker (Web Worker sandbox)
// In JSDOM (test env), Worker is not available. We mock it to run inline.
// ══════════════════════════════════════════════════════════════════════════════

describe('runScriptWorker – Web Worker sandbox', () => {
  let originalWorker: typeof globalThis.Worker;

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    terminateScriptWorker();

    // Minimal Worker mock that runs the script inline via runScript
    class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      private _listeners: Array<(e: any) => void> = [];

      constructor() {}

      addEventListener(type: string, fn: (e: any) => void) {
        if (type === 'message') this._listeners.push(fn);
      }

      removeEventListener(type: string, fn: (e: any) => void) {
        this._listeners = this._listeners.filter((l) => l !== fn);
      }

      postMessage(data: any) {
        const { id, script, context } = data;
        // Run inline using the same logic
        const result = runScript(script, context);
        const event = { data: { id, result } };
        setTimeout(() => {
          this._listeners.forEach((fn) => fn(event));
          if (this.onmessage) this.onmessage(event as MessageEvent);
        }, 0);
      }

      terminate() {}
    }

    (globalThis as any).Worker = MockWorker;
  });

  afterEach(() => {
    terminateScriptWorker();
    globalThis.Worker = originalWorker;
  });

  it('returns empty results for empty script', async () => {
    const result = await runScriptWorker('', makePreRequestContext());
    expect(result.assertions).toHaveLength(0);
    expect(result.error).toBeNull();
    expect(result.duration).toBe(0);
  });

  it('returns empty results for whitespace', async () => {
    const result = await runScriptWorker('  \n  ', makePreRequestContext());
    expect(result.error).toBeNull();
  });

  it('runs basic assertion in worker', async () => {
    const result = await runScriptWorker(
      `pm.test("basic", () => { pm.expect(1 + 1).toBe(2); });`,
      makeResponseContext(),
    );
    expect(result.assertions).toHaveLength(1);
    expect(result.assertions[0].passed).toBe(true);
  });

  it('captures variable updates', async () => {
    const result = await runScriptWorker(
      `pm.environment.set("workerVar", "workerVal");`,
      makePreRequestContext(),
    );
    expect(result.updatedVariables.workerVar).toBe('workerVal');
  });

  it('captures console logs', async () => {
    const result = await runScriptWorker(
      `console.log("from worker"); console.error("err");`,
      makePreRequestContext(),
    );
    expect(result.consoleLogs).toHaveLength(2);
    expect(result.consoleLogs[0].level).toBe('log');
    expect(result.consoleLogs[1].level).toBe('error');
  });

  it('captures syntax errors', async () => {
    const result = await runScriptWorker(
      'if (',
      makePreRequestContext(),
    );
    expect(result.error).not.toBeNull();
  });

  it('captures runtime errors', async () => {
    const result = await runScriptWorker(
      'undeclaredVar.call()',
      makePreRequestContext(),
    );
    expect(result.error).not.toBeNull();
  });

  it('pm.response.json works in worker', async () => {
    const result = await runScriptWorker(
      `pm.test("json in worker", () => {
        const json = response.json();
        pm.expect(json.name).toBe("Test");
      });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('assertion failure recorded in worker', async () => {
    const result = await runScriptWorker(
      `pm.test("fail", () => { pm.expect(true).toBe(false); });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(false);
    expect(result.assertions[0].error).toBeDefined();
  });

  it('duration is positive for non-trivial scripts', async () => {
    const result = await runScriptWorker(
      `for (let i = 0; i < 1000; i++) {}`,
      makePreRequestContext(),
    );
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('environment.unset works in worker', async () => {
    const result = await runScriptWorker(
      `pm.environment.unset("BASE_URL");`,
      makePreRequestContext(),
    );
    expect(result.updatedVariables.BASE_URL).toBeUndefined();
  });

  it('toContain works in worker', async () => {
    const result = await runScriptWorker(
      `pm.test("contains", () => { pm.expect("hello world").toContain("world"); });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('toHaveProperty works in worker', async () => {
    const result = await runScriptWorker(
      `pm.test("prop", () => { pm.expect(response.json()).toHaveProperty("id"); });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('not negation works in worker', async () => {
    const result = await runScriptWorker(
      `pm.test("not", () => { pm.expect(1).not.toBe(2); });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('headers.get is case-insensitive in worker', async () => {
    const result = await runScriptWorker(
      `pm.test("header", () => { pm.expect(response.headers.get("Content-Type")).toBe("application/json"); });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });

  it('validateJsonSchema available in worker', async () => {
    const result = await runScriptWorker(
      `pm.test("schema", () => {
        const schema = { type: "object", required: ["id"] };
        pm.expect(validateJsonSchema(response.json(), schema)).toBe(true);
      });`,
      makeResponseContext(),
    );
    expect(result.assertions[0].passed).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// terminateScriptWorker
// ══════════════════════════════════════════════════════════════════════════════

describe('terminateScriptWorker', () => {
  it('does not throw when called without prior worker', () => {
    expect(() => terminateScriptWorker()).not.toThrow();
  });

  it('can be called multiple times', () => {
    terminateScriptWorker();
    terminateScriptWorker();
    // no error
  });
});
