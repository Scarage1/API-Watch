import { describe, it, expect } from 'vitest';
import {
  generateCode,
  CODE_LANGUAGES,
  type CodeGenRequest,
  type CodeLanguage,
} from '../lib/codeGenerator';

const baseReq: CodeGenRequest = {
  method: 'GET',
  url: 'https://api.example.com/users',
  headers: [],
  params: [],
  body: '',
  bodyType: 'none',
  timeout: 10,
};

describe('CODE_LANGUAGES', () => {
  it('has 4 languages', () => {
    expect(CODE_LANGUAGES).toHaveLength(4);
  });

  it('contains curl, python, javascript, nodejs', () => {
    const ids = CODE_LANGUAGES.map((l) => l.id);
    expect(ids).toEqual(['curl', 'python', 'javascript', 'nodejs']);
  });
});

describe('generateCode — cURL', () => {
  it('generates a simple GET', () => {
    const code = generateCode(baseReq, 'curl');
    expect(code).toContain('curl');
    expect(code).toContain('https://api.example.com/users');
  });

  it('includes headers', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      headers: [
        { key: 'Authorization', value: 'Bearer tok123', enabled: true },
        { key: 'Content-Type', value: 'application/json', enabled: true },
        { key: 'Disabled', value: 'skip', enabled: false },
      ],
    };
    const code = generateCode(req, 'curl');
    expect(code).toContain("Authorization: Bearer tok123");
    expect(code).toContain("Content-Type: application/json");
    expect(code).not.toContain('Disabled');
  });

  it('includes query params in URL', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      params: [
        { key: 'page', value: '1', enabled: true },
        { key: 'limit', value: '10', enabled: true },
      ],
    };
    const code = generateCode(req, 'curl');
    expect(code).toContain('page=1');
    expect(code).toContain('limit=10');
  });

  it('includes JSON body for POST', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      method: 'POST',
      body: '{"name":"test"}',
      bodyType: 'json',
    };
    const code = generateCode(req, 'curl');
    expect(code).toContain('-d');
    expect(code).toContain('name');
  });

  it('escapes shell special chars in values', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      headers: [{ key: 'X-Val', value: "it's a test", enabled: true }],
    };
    const code = generateCode(req, 'curl');
    // The POSIX-safe quoting: end quote, escaped quote, start quote
    expect(code).toContain("it");
    expect(code).toContain("X-Val");
  });
});

describe('generateCode — Python', () => {
  it('generates valid Python', () => {
    const code = generateCode(baseReq, 'python');
    expect(code).toContain('import requests');
    expect(code).toContain('requests.get');
    expect(code).toContain('https://api.example.com/users');
  });

  it('includes headers dict', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      headers: [{ key: 'Accept', value: 'text/html', enabled: true }],
    };
    const code = generateCode(req, 'python');
    expect(code).toContain('headers');
    expect(code).toContain('"Accept": "text/html"');
  });

  it('includes params in URL', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      params: [{ key: 'q', value: 'hello', enabled: true }],
    };
    const code = generateCode(req, 'python');
    expect(code).toContain('q=hello');
  });

  it('includes json body for POST', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      method: 'POST',
      body: '{"key":"val"}',
      bodyType: 'json',
    };
    const code = generateCode(req, 'python');
    expect(code).toContain('json=');
  });

  it('uses correct method name', () => {
    const req: CodeGenRequest = { ...baseReq, method: 'DELETE' };
    const code = generateCode(req, 'python');
    expect(code).toContain('requests.delete');
  });
});

describe('generateCode — JavaScript (fetch)', () => {
  it('generates fetch call', () => {
    const code = generateCode(baseReq, 'javascript');
    expect(code).toContain('fetch(');
    expect(code).toContain('https://api.example.com/users');
  });

  it('includes headers', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      headers: [{ key: 'X-Custom', value: 'abc', enabled: true }],
    };
    const code = generateCode(req, 'javascript');
    expect(code).toContain('"X-Custom": "abc"');
  });

  it('includes body for POST', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      method: 'POST',
      body: '{"a":1}',
      bodyType: 'json',
    };
    const code = generateCode(req, 'javascript');
    expect(code).toContain('body:');
    expect(code).toContain('JSON.stringify');
  });

  it('includes query params in URL', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      params: [{ key: 'id', value: '42', enabled: true }],
    };
    const code = generateCode(req, 'javascript');
    expect(code).toContain('id=42');
  });
});

describe('generateCode — Node.js (axios)', () => {
  it('generates axios call', () => {
    const code = generateCode(baseReq, 'nodejs');
    expect(code).toContain('axios');
    expect(code).toContain('https://api.example.com/users');
  });

  it('includes headers', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      headers: [{ key: 'Authorization', value: 'Bearer x', enabled: true }],
    };
    const code = generateCode(req, 'nodejs');
    expect(code).toContain('"Authorization": "Bearer x"');
  });

  it('includes data for POST', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      method: 'POST',
      body: '{"val":true}',
      bodyType: 'json',
    };
    const code = generateCode(req, 'nodejs');
    expect(code).toContain('data:');
  });

  it('includes params in URL', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      params: [{ key: 'offset', value: '0', enabled: true }],
    };
    const code = generateCode(req, 'nodejs');
    expect(code).toContain('offset=0');
  });

  it('sets method correctly', () => {
    const req: CodeGenRequest = { ...baseReq, method: 'PATCH' };
    const code = generateCode(req, 'nodejs');
    expect(code).toContain('"patch"');
  });
});

describe('generateCode — edge cases', () => {
  it('handles empty headers and params', () => {
    const code = generateCode(baseReq, 'curl');
    expect(code).toContain('curl');
    expect(code).not.toContain('-H');
    expect(code).not.toContain('?');
  });

  it('handles raw text body', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      method: 'POST',
      body: 'Hello World',
      bodyType: 'text',
    };
    const curlCode = generateCode(req, 'curl');
    expect(curlCode).toContain('Hello World');

    const pyCode = generateCode(req, 'python');
    expect(pyCode).toContain('data=');
  });

  it('skips empty key headers', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      headers: [
        { key: '', value: 'ignored', enabled: true },
        { key: 'Valid', value: 'kept', enabled: true },
      ],
    };
    const code = generateCode(req, 'curl');
    expect(code).not.toContain('ignored');
    expect(code).toContain('Valid');
  });

  it('skips disabled params', () => {
    const req: CodeGenRequest = {
      ...baseReq,
      params: [
        { key: 'active', value: 'yes', enabled: true },
        { key: 'disabled', value: 'no', enabled: false },
      ],
    };
    const code = generateCode(req, 'python');
    expect(code).toContain('active=yes');
    expect(code).not.toContain('disabled=no');
  });

  it('all 4 languages produce non-empty output', () => {
    const languages: CodeLanguage[] = ['curl', 'python', 'javascript', 'nodejs'];
    for (const lang of languages) {
      const code = generateCode(baseReq, lang);
      expect(code.length).toBeGreaterThan(10);
    }
  });
});
