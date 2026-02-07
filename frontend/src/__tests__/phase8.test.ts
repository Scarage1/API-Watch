/**
 * Phase 8 tests — schema validator, doc generator, stores.
 */
import { describe, it, expect } from 'vitest';
import { validate, generateSchema, validateSchema } from '../lib/schemaValidator';
import type { JSONSchema } from '../lib/schemaValidator';
import { generateMarkdown, generateDocumentation, markdownToHtml } from '../lib/docGenerator';
import type { DocSection } from '../lib/docGenerator';

// ── Schema Validator ─────────────────────────────────────────────────────────

describe('schemaValidator', () => {
  describe('validate — type checking', () => {
    it('validates string type', () => {
      const result = validate('hello', { type: 'string' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects wrong type', () => {
      const result = validate(42, { type: 'string' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Expected type string');
    });

    it('validates integer type', () => {
      expect(validate(42, { type: 'integer' }).valid).toBe(true);
      expect(validate(3.14, { type: 'integer' }).valid).toBe(false);
    });

    it('validates number type', () => {
      expect(validate(3.14, { type: 'number' }).valid).toBe(true);
    });

    it('validates boolean type', () => {
      expect(validate(true, { type: 'boolean' }).valid).toBe(true);
      expect(validate('true', { type: 'boolean' }).valid).toBe(false);
    });

    it('validates null type', () => {
      expect(validate(null, { type: 'null' }).valid).toBe(true);
    });

    it('supports union types', () => {
      const schema: JSONSchema = { type: ['string', 'null'] };
      expect(validate('hello', schema).valid).toBe(true);
      expect(validate(null, schema).valid).toBe(true);
      expect(validate(42, schema).valid).toBe(false);
    });

    it('supports nullable', () => {
      expect(validate(null, { type: 'string', nullable: true }).valid).toBe(true);
    });
  });

  describe('validate — string constraints', () => {
    it('checks minLength', () => {
      expect(validate('ab', { type: 'string', minLength: 3 }).valid).toBe(false);
      expect(validate('abc', { type: 'string', minLength: 3 }).valid).toBe(true);
    });

    it('checks maxLength', () => {
      expect(validate('abcd', { type: 'string', maxLength: 3 }).valid).toBe(false);
      expect(validate('abc', { type: 'string', maxLength: 3 }).valid).toBe(true);
    });

    it('checks pattern', () => {
      expect(validate('abc123', { type: 'string', pattern: '^[a-z]+\\d+$' }).valid).toBe(true);
      expect(validate('ABC', { type: 'string', pattern: '^[a-z]+$' }).valid).toBe(false);
    });

    it('checks email format', () => {
      expect(validate('user@test.com', { type: 'string', format: 'email' }).valid).toBe(true);
      expect(validate('not-an-email', { type: 'string', format: 'email' }).valid).toBe(false);
    });

    it('checks uuid format', () => {
      expect(validate('550e8400-e29b-41d4-a716-446655440000', { type: 'string', format: 'uuid' }).valid).toBe(true);
      expect(validate('not-a-uuid', { type: 'string', format: 'uuid' }).valid).toBe(false);
    });
  });

  describe('validate — number constraints', () => {
    it('checks minimum', () => {
      expect(validate(5, { type: 'number', minimum: 10 }).valid).toBe(false);
      expect(validate(10, { type: 'number', minimum: 10 }).valid).toBe(true);
    });

    it('checks maximum', () => {
      expect(validate(15, { type: 'number', maximum: 10 }).valid).toBe(false);
      expect(validate(10, { type: 'number', maximum: 10 }).valid).toBe(true);
    });
  });

  describe('validate — enum', () => {
    it('validates enum values', () => {
      const schema: JSONSchema = { enum: ['active', 'inactive'] };
      expect(validate('active', schema).valid).toBe(true);
      expect(validate('pending', schema).valid).toBe(false);
    });
  });

  describe('validate — objects', () => {
    it('validates required properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
        },
      };
      expect(validate({ id: 1, name: 'Test' }, schema).valid).toBe(true);
      expect(validate({ id: 1 }, schema).valid).toBe(false);
    });

    it('validates nested properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              age: { type: 'integer', minimum: 0 },
            },
          },
        },
      };
      expect(validate({ user: { age: 25 } }, schema).valid).toBe(true);
      expect(validate({ user: { age: -1 } }, schema).valid).toBe(false);
    });

    it('reports errors with JSON paths', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
      };
      const result = validate({ name: 123, age: 'old' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === '$.name')).toBe(true);
      expect(result.errors.some((e) => e.path === '$.age')).toBe(true);
    });
  });

  describe('validate — arrays', () => {
    it('validates array items', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
      };
      expect(validate(['a', 'b'], schema).valid).toBe(true);
      expect(validate(['a', 42], schema).valid).toBe(false);
    });

    it('checks minItems', () => {
      expect(validate([], { type: 'array', minItems: 1 }).valid).toBe(false);
      expect(validate([1], { type: 'array', minItems: 1 }).valid).toBe(true);
    });

    it('checks maxItems', () => {
      expect(validate([1, 2, 3], { type: 'array', maxItems: 2 }).valid).toBe(false);
    });
  });

  describe('generateSchema', () => {
    it('generates schema for a simple object', () => {
      const schema = generateSchema({ id: 1, name: 'Test', active: true });
      expect(schema.type).toBe('object');
      expect(schema.properties?.id?.type).toBe('integer');
      expect(schema.properties?.name?.type).toBe('string');
      expect(schema.properties?.active?.type).toBe('boolean');
      expect(schema.required).toContain('id');
    });

    it('generates schema for array', () => {
      const schema = generateSchema([{ id: 1 }]);
      expect(schema.type).toBe('array');
      expect(schema.items?.type).toBe('object');
    });

    it('detects email format', () => {
      const schema = generateSchema({ email: 'user@test.com' });
      expect(schema.properties?.email?.format).toBe('email');
    });

    it('generates schema for null', () => {
      const schema = generateSchema(null);
      expect(schema.type).toBe('null');
    });

    it('generates schema for number', () => {
      const schema = generateSchema(3.14);
      expect(schema.type).toBe('number');
    });
  });
});

// ── Document Generator ───────────────────────────────────────────────────────

describe('docGenerator', () => {
  const sections: DocSection[] = [
    {
      name: 'Users',
      description: 'User management endpoints',
      endpoints: [
        { method: 'GET', url: '/api/users', name: 'List Users', description: 'Get all users' },
        { method: 'POST', url: '/api/users', name: 'Create User', body: '{"name":"John"}', bodyType: 'json', headers: { 'Content-Type': 'application/json' } },
      ],
    },
    {
      name: 'Products',
      endpoints: [
        { method: 'GET', url: '/api/products', name: 'List Products', params: { page: '1', limit: '10' } },
      ],
    },
  ];

  describe('generateMarkdown', () => {
    it('generates markdown with title and sections', () => {
      const md = generateMarkdown('My API', 'API docs', 'https://api.example.com', sections);
      expect(md).toContain('# My API');
      expect(md).toContain('## Users');
      expect(md).toContain('## Products');
      expect(md).toContain('**Base URL:** `https://api.example.com`');
    });

    it('includes table of contents', () => {
      const md = generateMarkdown('API', '', '', sections);
      expect(md).toContain('## Table of Contents');
      expect(md).toContain('List Users');
      expect(md).toContain('Create User');
    });

    it('includes headers table', () => {
      const md = generateMarkdown('API', '', '', sections);
      expect(md).toContain('| Header | Value |');
      expect(md).toContain('Content-Type');
    });

    it('includes query params table', () => {
      const md = generateMarkdown('API', '', '', sections);
      expect(md).toContain('| Parameter | Value |');
      expect(md).toContain('`page`');
    });

    it('includes request body', () => {
      const md = generateMarkdown('API', '', '', sections);
      expect(md).toContain('**Request Body**');
      expect(md).toContain('"name"');
    });

    it('includes footer', () => {
      const md = generateMarkdown('API', '', '', sections);
      expect(md).toContain('Generated by API-Watch');
    });
  });

  describe('markdownToHtml', () => {
    it('converts headings to HTML', () => {
      const html = markdownToHtml('# Title\n## Section\n### Subsection');
      expect(html).toContain('<h1>Title</h1>');
      expect(html).toContain('<h2>Section</h2>');
      expect(html).toContain('<h3>Subsection</h3>');
    });

    it('wraps in full HTML document', () => {
      const html = markdownToHtml('# Test');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
    });

    it('converts bold text', () => {
      const html = markdownToHtml('**bold text**');
      expect(html).toContain('<strong>bold text</strong>');
    });

    it('converts inline code', () => {
      const html = markdownToHtml('Use `code` here');
      expect(html).toContain('<code>code</code>');
    });
  });

  describe('generateDocumentation', () => {
    it('returns complete doc with counts', () => {
      const doc = generateDocumentation('API', 'Description', 'https://api.com', sections);
      expect(doc.sectionCount).toBe(2);
      expect(doc.endpointCount).toBe(3);
      expect(doc.markdown).toContain('# API');
      expect(doc.html).toContain('<!DOCTYPE html>');
    });

    it('handles empty sections', () => {
      const doc = generateDocumentation('API', '', '', []);
      expect(doc.sectionCount).toBe(0);
      expect(doc.endpointCount).toBe(0);
    });
  });
});
