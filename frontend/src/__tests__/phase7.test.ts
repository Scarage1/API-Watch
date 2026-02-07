/**
 * Phase 7 Tests — Pro Features
 *
 * Tests for: cURL parser, OpenAPI parser, data-driven testing,
 * code generation (new languages), and curlParser edge cases.
 */
import { describe, it, expect } from 'vitest';
import { parseCurl, isCurlCommand, formatBody } from '../lib/curlParser';
import { parseOpenApiSpec, isOpenApiSpec } from '../lib/openApiParser';
import { parseCSV, parseJSONData, parseDataFile, previewDataRows } from '../lib/dataFile';
import { generateCode } from '../lib/codeGenerator';
import type { CodeGenRequest } from '../lib/codeGenerator';

// ═══════════════════════════════════════════════════════════════════════
// cURL Parser
// ═══════════════════════════════════════════════════════════════════════

describe('curlParser', () => {
  it('parses basic GET request', () => {
    const result = parseCurl('curl https://api.example.com/users');
    expect(result.method).toBe('GET');
    expect(result.url).toContain('api.example.com');
    expect(result.bodyType).toBe('none');
  });

  it('parses POST with JSON body', () => {
    const result = parseCurl(
      `curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{"name":"Alice"}'`
    );
    expect(result.method).toBe('POST');
    expect(result.bodyType).toBe('json');
    expect(result.body).toContain('Alice');
    expect(result.headers['Content-Type']).toBe('application/json');
  });

  it('parses headers correctly', () => {
    const result = parseCurl(
      `curl https://api.example.com -H 'Authorization: Bearer token123' -H 'Accept: application/json'`
    );
    expect(result.headers['Authorization']).toBe('Bearer token123');
    expect(result.headers['Accept']).toBe('application/json');
  });

  it('parses URL query parameters', () => {
    const result = parseCurl('curl "https://api.example.com/search?q=test&page=1"');
    expect(result.params['q']).toBe('test');
    expect(result.params['page']).toBe('1');
  });

  it('parses basic auth', () => {
    const result = parseCurl('curl -u admin:password123 https://api.example.com');
    expect(result.auth?.type).toBe('basic');
    expect(result.auth?.username).toBe('admin');
    expect(result.auth?.password).toBe('password123');
  });

  it('handles --data-raw flag', () => {
    const result = parseCurl(`curl -X POST https://api.example.com --data-raw '{"key":"value"}'`);
    expect(result.method).toBe('POST');
    expect(result.body).toContain('key');
  });

  it('infers POST method from -d flag', () => {
    const result = parseCurl(`curl https://api.example.com/data -d 'key=value'`);
    expect(result.method).toBe('POST');
  });

  it('parses form data', () => {
    const result = parseCurl(`curl -F 'name=Alice' -F 'file=@photo.jpg' https://api.example.com/upload`);
    expect(result.method).toBe('POST');
    expect(result.bodyType).toBe('form-data');
  });

  it('handles multiline curl with backslash continuations', () => {
    const result = parseCurl(`curl -X PUT \\
      https://api.example.com/users/1 \\
      -H 'Content-Type: application/json' \\
      -d '{"name":"Bob"}'`);
    expect(result.method).toBe('PUT');
    expect(result.body).toContain('Bob');
  });

  it('parses timeout flag', () => {
    const result = parseCurl('curl --max-time 30 https://api.example.com');
    expect(result.timeout).toBe(30);
  });

  it('handles HEAD method with -I flag', () => {
    const result = parseCurl('curl -I https://api.example.com');
    expect(result.method).toBe('HEAD');
  });

  it('throws on empty input', () => {
    expect(() => parseCurl('')).toThrow('Empty cURL command');
  });

  it('throws on missing URL', () => {
    expect(() => parseCurl('curl -X GET -H "Accept: */*"')).toThrow('No URL found');
  });

  it('detects cURL commands', () => {
    expect(isCurlCommand('curl https://example.com')).toBe(true);
    expect(isCurlCommand('  curl -X POST https://example.com')).toBe(true);
    expect(isCurlCommand('wget https://example.com')).toBe(false);
    expect(isCurlCommand('fetch("https://example.com")')).toBe(false);
  });

  it('formats JSON body', () => {
    expect(formatBody('{"a":1}', 'json')).toBe('{\n  "a": 1\n}');
    expect(formatBody('plain text', 'text')).toBe('plain text');
    expect(formatBody(undefined, 'json')).toBe('');
  });

  it('parses URL-encoded body', () => {
    const result = parseCurl(`curl -X POST https://api.example.com -d 'username=admin&password=secret'`);
    expect(result.bodyType).toBe('x-www-form-urlencoded');
    expect(result.body).toContain('username=admin');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// OpenAPI Parser
// ═══════════════════════════════════════════════════════════════════════

describe('openApiParser', () => {
  const minimalOpenApi3 = {
    openapi: '3.0.3',
    info: { title: 'Test API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com/v1' }],
    paths: {
      '/users': {
        get: {
          operationId: 'listUsers',
          summary: 'List all users',
          responses: { '200': { description: 'OK' } },
        },
        post: {
          operationId: 'createUser',
          summary: 'Create a user',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                  },
                  required: ['name', 'email'],
                },
              },
            },
          },
          responses: { '201': { description: 'Created' } },
        },
      },
      '/users/{id}': {
        get: {
          operationId: 'getUser',
          summary: 'Get a user by ID',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 42 },
          ],
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  };

  it('parses OpenAPI 3.x spec', () => {
    const result = parseOpenApiSpec(minimalOpenApi3);
    expect(result.suite.name).toBe('Test API');
    expect(result.suite.base_url).toBe('https://api.example.com/v1');
    expect(result.endpointCount).toBe(3);
    expect(result.version).toBe('3.0.3');
    expect(result.warnings).toHaveLength(0);
  });

  it('extracts test cases with correct methods', () => {
    const result = parseOpenApiSpec(minimalOpenApi3);
    const methods = result.suite.tests.map((t) => t.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
  });

  it('generates example body for POST requests', () => {
    const result = parseOpenApiSpec(minimalOpenApi3);
    const postTest = result.suite.tests.find((t) => t.method === 'POST');
    expect(postTest?.body).toBeDefined();
    if (postTest?.body) {
      const body = typeof postTest.body === 'string' ? JSON.parse(postTest.body) : postTest.body;
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('email');
    }
  });

  it('resolves path parameters from examples', () => {
    const result = parseOpenApiSpec(minimalOpenApi3);
    const getUser = result.suite.tests.find((t) => t.id === 'getUser');
    expect(getUser?.path).toBe('/users/42');
  });

  it('parses Swagger 2.0 spec', () => {
    const swagger2 = {
      swagger: '2.0',
      info: { title: 'Legacy API', version: '1.0' },
      host: 'api.legacy.com',
      basePath: '/v2',
      schemes: ['https'],
      paths: {
        '/items': {
          get: {
            operationId: 'listItems',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const result = parseOpenApiSpec(swagger2);
    expect(result.suite.base_url).toBe('https://api.legacy.com/v2');
    expect(result.endpointCount).toBe(1);
  });

  it('detects OpenAPI specs', () => {
    expect(isOpenApiSpec(minimalOpenApi3)).toBe(true);
    expect(isOpenApiSpec({ swagger: '2.0', paths: {} })).toBe(true);
    expect(isOpenApiSpec({ name: 'not-openapi' })).toBe(false);
    expect(isOpenApiSpec(null)).toBe(false);
  });

  it('throws on missing paths', () => {
    expect(() => parseOpenApiSpec({ openapi: '3.0.0', info: { title: 'X', version: '1' } })).toThrow('missing "paths"');
  });

  it('handles security schemes', () => {
    const spec = {
      ...minimalOpenApi3,
      components: {
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer' },
        },
      },
    };
    const result = parseOpenApiSpec(spec);
    expect(result.suite.auth?.type).toBe('bearer');
  });

  it('handles query and header parameters', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Param API', version: '1.0' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/search': {
          get: {
            operationId: 'search',
            parameters: [
              { name: 'q', in: 'query', schema: { type: 'string' }, example: 'hello' },
              { name: 'X-Custom', in: 'header', schema: { type: 'string' }, example: 'custom-val' },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const result = parseOpenApiSpec(spec);
    const test = result.suite.tests[0];
    expect(test.params?.q).toBe('hello');
    expect(test.headers?.['X-Custom']).toBe('custom-val');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Data File Parser
// ═══════════════════════════════════════════════════════════════════════

describe('dataFile', () => {
  describe('CSV parsing', () => {
    it('parses simple CSV', () => {
      const result = parseCSV('name,email\nAlice,alice@test.com\nBob,bob@test.com');
      expect(result.columns).toEqual(['name', 'email']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('Alice');
      expect(result.rows[1].email).toBe('bob@test.com');
    });

    it('handles quoted fields with commas', () => {
      const result = parseCSV('name,description\n"Smith, John","A, B, C"');
      expect(result.rows[0].name).toBe('Smith, John');
      expect(result.rows[0].description).toBe('A, B, C');
    });

    it('handles escaped quotes', () => {
      const result = parseCSV('value\n"He said ""hello"""');
      expect(result.rows[0].value).toBe('He said "hello"');
    });

    it('handles empty CSV', () => {
      const result = parseCSV('');
      expect(result.rows).toHaveLength(0);
      expect(result.errors).toContain('Empty CSV file');
    });

    it('handles header-only CSV', () => {
      const result = parseCSV('col1,col2,col3');
      expect(result.columns).toHaveLength(3);
      expect(result.rows).toHaveLength(0);
    });

    it('handles missing values', () => {
      const result = parseCSV('a,b,c\n1,,3');
      expect(result.rows[0].a).toBe('1');
      expect(result.rows[0].b).toBe('');
      expect(result.rows[0].c).toBe('3');
    });
  });

  describe('JSON parsing', () => {
    it('parses array of objects', () => {
      const result = parseJSONData('[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]');
      expect(result.columns).toContain('id');
      expect(result.columns).toContain('name');
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].id).toBe('1');
      expect(result.rows[0].name).toBe('Alice');
    });

    it('handles single object (wraps in array)', () => {
      const result = parseJSONData('{"id":1,"name":"Alice"}');
      expect(result.rows).toHaveLength(1);
    });

    it('handles nested objects (stringified)', () => {
      const result = parseJSONData('[{"data":{"nested":true}}]');
      expect(result.rows[0].data).toBe('{"nested":true}');
    });

    it('handles null and undefined values', () => {
      const result = parseJSONData('[{"a":null,"b":"value"}]');
      expect(result.rows[0].a).toBe('');
      expect(result.rows[0].b).toBe('value');
    });

    it('rejects invalid JSON', () => {
      const result = parseJSONData('not json');
      expect(result.errors).toContain('Invalid JSON format');
    });

    it('rejects empty array', () => {
      const result = parseJSONData('[]');
      expect(result.errors).toContain('JSON array is empty');
    });
  });

  describe('auto-detection', () => {
    it('detects CSV by extension', () => {
      const result = parseDataFile('a,b\n1,2', 'data.csv');
      expect(result.format).toBe('csv');
    });

    it('detects JSON by extension', () => {
      const result = parseDataFile('[{"a":1}]', 'data.json');
      expect(result.format).toBe('json');
    });

    it('detects JSON by content', () => {
      const result = parseDataFile('[{"a":1}]');
      expect(result.format).toBe('json');
    });

    it('falls back to CSV', () => {
      const result = parseDataFile('a,b\n1,2');
      expect(result.format).toBe('csv');
    });
  });

  it('generates preview text', () => {
    const result = parseCSV('name,age\nAlice,30\nBob,25\nCharlie,35');
    const preview = previewDataRows(result, 2);
    expect(preview).toContain('Columns: name, age');
    expect(preview).toContain('Rows: 3');
    expect(preview).toContain('Alice');
    expect(preview).toContain('... and 1 more');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Code Generation — New Languages
// ═══════════════════════════════════════════════════════════════════════

describe('codeGenerator — new languages', () => {
  const sampleReq: CodeGenRequest = {
    method: 'POST',
    url: 'https://api.example.com/data',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer tok123' },
    params: {},
    body: '{"key":"value"}',
    bodyType: 'json',
    timeout: 10,
  };

  it('generates Go code', () => {
    const code = generateCode(sampleReq, 'go');
    expect(code).toContain('package main');
    expect(code).toContain('net/http');
    expect(code).toContain('NewRequest');
    expect(code).toContain('"POST"');
    expect(code).toContain('api.example.com');
  });

  it('generates PHP code', () => {
    const code = generateCode(sampleReq, 'php');
    expect(code).toContain('<?php');
    expect(code).toContain('curl_init');
    expect(code).toContain('CURLOPT_URL');
    expect(code).toContain('curl_exec');
  });

  it('generates Java code', () => {
    const code = generateCode(sampleReq, 'java');
    expect(code).toContain('HttpClient');
    expect(code).toContain('HttpRequest');
    expect(code).toContain('URI.create');
    expect(code).toContain('"POST"');
  });

  it('generates C# code', () => {
    const code = generateCode(sampleReq, 'csharp');
    expect(code).toContain('HttpClient');
    expect(code).toContain('PostAsync');
    expect(code).toContain('StringContent');
    expect(code).toContain('using System');
  });

  it('generates GET request for all new languages', () => {
    const getReq: CodeGenRequest = {
      method: 'GET',
      url: 'https://api.example.com/items',
      headers: {},
      params: { page: '1' },
    };

    const go = generateCode(getReq, 'go');
    expect(go).toContain('"GET"');

    const php = generateCode(getReq, 'php');
    expect(php).toContain('curl_exec');

    const java = generateCode(getReq, 'java');
    expect(java).toContain('HttpClient');

    const csharp = generateCode(getReq, 'csharp');
    expect(csharp).toContain('GetAsync');
  });
});
