import { describe, it, expect } from 'vitest';
import {
  interpolateString,
  interpolateRecord,
  interpolateBody,
  extractVariables,
  getUnresolvedVariables,
  hasVariables,
  previewInterpolation,
  DYNAMIC_VARIABLE_NAMES,
} from '../lib/interpolate';

const vars = {
  BASE_URL: 'https://api.example.com',
  TOKEN: 'abc123',
  USER_ID: '42',
};

describe('interpolateString', () => {
  it('replaces known variables', () => {
    expect(interpolateString('{{BASE_URL}}/users/{{USER_ID}}', vars))
      .toBe('https://api.example.com/users/42');
  });

  it('leaves unresolved variables unchanged', () => {
    expect(interpolateString('{{BASE_URL}}/{{UNKNOWN}}', vars))
      .toBe('https://api.example.com/{{UNKNOWN}}');
  });

  it('handles empty string', () => {
    expect(interpolateString('', vars)).toBe('');
  });

  it('returns input without variables unchanged', () => {
    expect(interpolateString('https://plain.com', vars)).toBe('https://plain.com');
  });

  it('handles multiple occurrences of same variable', () => {
    expect(interpolateString('{{TOKEN}}-{{TOKEN}}', vars)).toBe('abc123-abc123');
  });

  it('resolves dynamic $timestamp variable', () => {
    const result = interpolateString('ts={{$timestamp}}', vars);
    expect(result).toMatch(/^ts=\d+$/);
  });

  it('resolves dynamic $randomUUID variable', () => {
    const result = interpolateString('id={{$randomUUID}}', vars);
    expect(result).not.toContain('{{$randomUUID}}');
    expect(result.length).toBeGreaterThan(5);
  });

  it('resolves dynamic $randomEmail variable', () => {
    const result = interpolateString('email={{$randomEmail}}', vars);
    expect(result).toContain('@test.example.com');
  });

  it('resolves dynamic $randomInt variable', () => {
    const result = interpolateString('n={{$randomInt}}', vars);
    expect(result).toMatch(/^n=\d+$/);
  });

  it('handles mix of user vars and dynamic vars', () => {
    const result = interpolateString('{{BASE_URL}}/{{$randomUUID}}', vars);
    expect(result).toMatch(/^https:\/\/api\.example\.com\/.+$/);
    expect(result).not.toContain('{{');
  });
});

describe('interpolateRecord', () => {
  it('interpolates both keys and values', () => {
    const result = interpolateRecord(
      { Authorization: 'Bearer {{TOKEN}}', 'X-User': '{{USER_ID}}' },
      vars
    );
    expect(result).toEqual({
      Authorization: 'Bearer abc123',
      'X-User': '42',
    });
  });

  it('handles empty object', () => {
    expect(interpolateRecord({}, vars)).toEqual({});
  });
});

describe('interpolateBody', () => {
  it('interpolates string body', () => {
    expect(interpolateBody('{"token": "{{TOKEN}}"}', vars))
      .toBe('{"token": "abc123"}');
  });

  it('interpolates object body', () => {
    const result = interpolateBody({ user: '{{USER_ID}}', name: 'test' }, vars);
    expect(result).toEqual({ user: '42', name: 'test' });
  });

  it('returns null for null body', () => {
    expect(interpolateBody(null, vars)).toBeNull();
  });

  it('returns undefined for undefined body', () => {
    expect(interpolateBody(undefined, vars)).toBeUndefined();
  });
});

describe('extractVariables', () => {
  it('extracts variable names', () => {
    expect(extractVariables('{{BASE_URL}}/{{USER_ID}}')).toEqual(['BASE_URL', 'USER_ID']);
  });

  it('deduplicates names', () => {
    expect(extractVariables('{{A}}-{{A}}')).toEqual(['A']);
  });

  it('returns empty for no variables', () => {
    expect(extractVariables('plain text')).toEqual([]);
  });

  it('extracts dynamic variable names', () => {
    expect(extractVariables('{{$timestamp}}')).toEqual(['$timestamp']);
  });
});

describe('getUnresolvedVariables', () => {
  it('returns variables not in vars dict', () => {
    expect(getUnresolvedVariables('{{BASE_URL}}/{{MISSING}}', vars)).toEqual(['MISSING']);
  });

  it('does NOT flag dynamic variables as unresolved', () => {
    expect(getUnresolvedVariables('{{$timestamp}}', vars)).toEqual([]);
  });

  it('returns empty when all resolved', () => {
    expect(getUnresolvedVariables('{{BASE_URL}}', vars)).toEqual([]);
  });
});

describe('hasVariables', () => {
  it('returns true for strings with variables', () => {
    expect(hasVariables('{{BASE_URL}}')).toBe(true);
  });

  it('returns false for plain strings', () => {
    expect(hasVariables('https://example.com')).toBe(false);
  });

  it('returns true for dynamic variables', () => {
    expect(hasVariables('{{$randomUUID}}')).toBe(true);
  });
});

describe('previewInterpolation', () => {
  it('resolves user vars but shows dynamic var placeholders', () => {
    const result = previewInterpolation('{{BASE_URL}}/{{$randomUUID}}', vars);
    expect(result).toBe('https://api.example.com/<$randomUUID>');
  });

  it('leaves unresolved vars as-is', () => {
    const result = previewInterpolation('{{MISSING}}', vars);
    expect(result).toBe('{{MISSING}}');
  });
});

describe('DYNAMIC_VARIABLE_NAMES', () => {
  it('contains expected dynamic variables', () => {
    expect(DYNAMIC_VARIABLE_NAMES).toContain('$randomUUID');
    expect(DYNAMIC_VARIABLE_NAMES).toContain('$timestamp');
    expect(DYNAMIC_VARIABLE_NAMES).toContain('$isoTimestamp');
    expect(DYNAMIC_VARIABLE_NAMES).toContain('$randomEmail');
    expect(DYNAMIC_VARIABLE_NAMES).toContain('$randomInt');
    expect(DYNAMIC_VARIABLE_NAMES).toContain('$randomString');
  });
});
