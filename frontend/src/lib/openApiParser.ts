/**
 * OpenAPI / Swagger Import Parser
 *
 * Parses OpenAPI 3.x and Swagger 2.x JSON specifications into API-Watch
 * test suites. Extracts:
 *   - Paths → test cases
 *   - Servers → base URLs
 *   - Request bodies → body payloads
 *   - Parameters → query params / headers / path params
 *   - Security schemes → auth configuration
 */

import type { TestSuite, TestCase } from '../types';

// ── OpenAPI 3.x Types ────────────────────────────────────────────────────────

interface OpenApiSpec {
  openapi?: string;            // "3.0.x" or "3.1.x"
  swagger?: string;            // "2.0"
  info: {
    title: string;
    description?: string;
    version: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  host?: string;               // Swagger 2.0
  basePath?: string;           // Swagger 2.0
  schemes?: string[];          // Swagger 2.0
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  securityDefinitions?: Record<string, SecurityScheme>; // Swagger 2.0
}

interface PathItem {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  delete?: OperationObject;
  patch?: OperationObject;
  head?: OperationObject;
  options?: OperationObject;
  parameters?: ParameterObject[];
}

interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

interface ParameterObject {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: SchemaObject;
  example?: unknown;
}

interface RequestBodyObject {
  description?: string;
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
}

interface MediaTypeObject {
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, { value: unknown }>;
}

interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  example?: unknown;
  enum?: unknown[];
  default?: unknown;
  $ref?: string;
}

interface SecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: string;
}

// ── Result Types ─────────────────────────────────────────────────────────────

export interface OpenApiImportResult {
  suite: TestSuite;
  warnings: string[];
  endpointCount: number;
  version: string;
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse an OpenAPI 3.x or Swagger 2.x spec into an API-Watch TestSuite.
 */
export function parseOpenApiSpec(spec: unknown): OpenApiImportResult {
  const doc = spec as OpenApiSpec;
  const warnings: string[] = [];

  // Validate
  if (!doc.paths || typeof doc.paths !== 'object') {
    throw new Error('Invalid OpenAPI spec: missing "paths" object');
  }

  const isV3 = !!doc.openapi;
  const isV2 = !!doc.swagger;

  if (!isV3 && !isV2) {
    throw new Error('Unrecognized specification format. Expected "openapi" or "swagger" field.');
  }

  const version = doc.openapi || doc.swagger || 'unknown';

  // ── Resolve base URL ──────────────────────────────────
  let baseUrl = '';
  if (isV3 && doc.servers?.length) {
    baseUrl = doc.servers[0].url;
    // Remove trailing slash
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    // Handle relative URLs
    if (baseUrl.startsWith('/')) {
      baseUrl = `http://localhost${baseUrl}`;
      warnings.push('Server URL is relative — defaulted to http://localhost');
    }
  } else if (isV2) {
    const scheme = doc.schemes?.[0] || 'https';
    const host = doc.host || 'localhost';
    const basePath = doc.basePath || '';
    baseUrl = `${scheme}://${host}${basePath}`;
  }

  if (!baseUrl) {
    baseUrl = 'http://localhost:8000';
    warnings.push('No server URL found — defaulted to http://localhost:8000');
  }

  // ── Resolve components / definitions ──────────────────
  const schemas = doc.components?.schemas || {};

  // Simple $ref resolver (one level deep)
  function resolveRef(ref: string): SchemaObject | undefined {
    // "#/components/schemas/User" → "User"
    const match = ref.match(/#\/(?:components\/schemas|definitions)\/(.+)/);
    if (match) {
      return schemas[match[1]];
    }
    return undefined;
  }

  function resolveSchema(schema: SchemaObject | undefined): SchemaObject | undefined {
    if (!schema) return undefined;
    if (schema.$ref) return resolveRef(schema.$ref);
    return schema;
  }

  // ── Generate example from schema ──────────────────────
  function generateExample(schema: SchemaObject | undefined, depth = 0): unknown {
    if (!schema || depth > 5) return undefined;

    const resolved = resolveSchema(schema);
    if (!resolved) return undefined;

    if (resolved.example !== undefined) return resolved.example;
    if (resolved.default !== undefined) return resolved.default;
    if (resolved.enum && resolved.enum.length > 0) return resolved.enum[0];

    switch (resolved.type) {
      case 'string':
        if (resolved.format === 'email') return 'user@example.com';
        if (resolved.format === 'date') return '2026-01-01';
        if (resolved.format === 'date-time') return '2026-01-01T00:00:00Z';
        if (resolved.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
        if (resolved.format === 'uri' || resolved.format === 'url') return 'https://example.com';
        return 'string';

      case 'number':
      case 'integer':
        return resolved.format === 'float' || resolved.format === 'double' ? 1.0 : 1;

      case 'boolean':
        return true;

      case 'array':
        if (resolved.items) {
          const item = generateExample(resolved.items, depth + 1);
          return item !== undefined ? [item] : [];
        }
        return [];

      case 'object':
        if (resolved.properties) {
          const obj: Record<string, unknown> = {};
          for (const [key, propSchema] of Object.entries(resolved.properties)) {
            const val = generateExample(propSchema, depth + 1);
            if (val !== undefined) obj[key] = val;
          }
          return obj;
        }
        return {};

      default:
        // If it has properties, treat as object
        if (resolved.properties) {
          const obj: Record<string, unknown> = {};
          for (const [key, propSchema] of Object.entries(resolved.properties)) {
            const val = generateExample(propSchema, depth + 1);
            if (val !== undefined) obj[key] = val;
          }
          return obj;
        }
        return undefined;
    }
  }

  // ── Build test cases ──────────────────────────────────
  const tests: TestCase[] = [];
  let testIdx = 0;
  const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;

  for (const [path, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    // Path-level parameters
    const pathParams = (pathItem as PathItem).parameters || [];

    for (const httpMethod of METHODS) {
      const operation = (pathItem as PathItem)[httpMethod];
      if (!operation) continue;

      testIdx++;

      // Merge path-level + operation-level parameters
      const allParams = [...pathParams, ...(operation.parameters || [])];

      // Build headers and query params
      const headers: Record<string, string> = {};
      const queryParams: Record<string, string> = {};
      let processedPath = path;

      for (const param of allParams) {
        const example = param.example ?? generateExample(param.schema);
        const exampleStr = example !== undefined ? String(example) : `{{${param.name}}}`;

        switch (param.in) {
          case 'header':
            headers[param.name] = exampleStr;
            break;
          case 'query':
            queryParams[param.name] = exampleStr;
            break;
          case 'path':
            // Replace {param} with example or variable placeholder
            processedPath = processedPath.replace(
              `{${param.name}}`,
              exampleStr
            );
            break;
          // cookies skipped
        }
      }

      // Build body from requestBody (OpenAPI 3.x)
      let body: unknown = undefined;
      if (operation.requestBody?.content) {
        const content = operation.requestBody.content;
        // Prefer application/json
        const mediaType = content['application/json'] || content['application/x-www-form-urlencoded'] || Object.values(content)[0];
        if (mediaType) {
          if (mediaType.example !== undefined) {
            body = mediaType.example;
          } else if (mediaType.examples) {
            const firstExample = Object.values(mediaType.examples)[0];
            if (firstExample?.value !== undefined) {
              body = firstExample.value;
            }
          } else if (mediaType.schema) {
            body = generateExample(mediaType.schema);
          }

          // Set content-type
          if (content['application/json']) {
            headers['Content-Type'] = 'application/json';
          }
        }
      }

      // Build test case
      const description = operation.summary || operation.description || operation.operationId || '';
      const id = operation.operationId || `${httpMethod}-${testIdx}`;

      const testCase: TestCase = {
        id,
        method: httpMethod.toUpperCase(),
        path: processedPath,
        description: description.length > 100 ? description.slice(0, 100) + '…' : description,
      };

      if (Object.keys(headers).length > 0) testCase.headers = headers;
      if (Object.keys(queryParams).length > 0) testCase.params = queryParams;
      if (body !== undefined) {
        testCase.body = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
      }

      if (operation.deprecated) {
        warnings.push(`${httpMethod.toUpperCase()} ${path} is deprecated`);
      }

      tests.push(testCase);
    }
  }

  // ── Build auth config ─────────────────────────────────
  const securitySchemes = doc.components?.securitySchemes || doc.securityDefinitions || {};
  let auth: TestSuite['auth'] | undefined;

  for (const scheme of Object.values(securitySchemes)) {
    if (scheme.type === 'http' && scheme.scheme === 'bearer') {
      auth = { type: 'bearer', token_env: 'AUTH_TOKEN' };
      break;
    }
    if (scheme.type === 'apiKey') {
      auth = {
        type: 'api_key',
        key_env: 'API_KEY',
        header_name: scheme.name || 'X-API-Key',
      };
      break;
    }
    if (scheme.type === 'http' && scheme.scheme === 'basic') {
      auth = { type: 'basic' };
      break;
    }
  }

  const suite: TestSuite = {
    name: doc.info.title || 'Imported API',
    description: doc.info.description
      ? doc.info.description.slice(0, 200)
      : `Imported from OpenAPI ${version}`,
    base_url: baseUrl,
    tests,
  };

  if (auth) suite.auth = auth;

  return {
    suite,
    warnings,
    endpointCount: tests.length,
    version,
  };
}

/**
 * Quick check if a parsed JSON looks like an OpenAPI / Swagger spec.
 */
export function isOpenApiSpec(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return !!(obj.openapi || obj.swagger) && !!obj.paths;
}
