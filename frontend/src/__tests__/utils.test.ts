import { describe, it, expect } from 'vitest';
import { cn, formatDuration, formatBytes, getStatusColor, getMethodColor } from '../lib/utils';

describe('cn (class name merge)', () => {
  it('merges classes', () => {
    expect(cn('px-2', 'py-3')).toBe('px-2 py-3');
  });

  it('resolves tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', true && 'visible')).toBe('base visible');
  });

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null)).toBe('base');
  });
});

describe('formatDuration', () => {
  it('formats sub-second as ms', () => {
    expect(formatDuration(250)).toBe('250ms');
  });

  it('formats exactly 1000ms as seconds', () => {
    expect(formatDuration(1000)).toBe('1.00s');
  });

  it('formats seconds with 2 decimal places', () => {
    expect(formatDuration(2500)).toBe('2.50s');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });
});

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500.00 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.50 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.00 MB');
  });

  it('handles zero bytes', () => {
    expect(formatBytes(0)).toBe('0.00 B');
  });
});

describe('getStatusColor', () => {
  it('returns green for 2xx', () => {
    expect(getStatusColor(200)).toBe('green');
    expect(getStatusColor(201)).toBe('green');
  });

  it('returns blue for 3xx', () => {
    expect(getStatusColor(301)).toBe('blue');
  });

  it('returns orange for 4xx', () => {
    expect(getStatusColor(404)).toBe('orange');
  });

  it('returns red for 5xx', () => {
    expect(getStatusColor(500)).toBe('red');
  });

  it('returns gray for null', () => {
    expect(getStatusColor(null)).toBe('gray');
  });
});

describe('getMethodColor', () => {
  it('returns correct colors for HTTP methods', () => {
    expect(getMethodColor('GET')).toBe('green');
    expect(getMethodColor('POST')).toBe('blue');
    expect(getMethodColor('PUT')).toBe('orange');
    expect(getMethodColor('DELETE')).toBe('red');
    expect(getMethodColor('PATCH')).toBe('purple');
  });

  it('handles lowercase', () => {
    expect(getMethodColor('get')).toBe('green');
  });

  it('returns gray for unknown methods', () => {
    expect(getMethodColor('OPTIONS')).toBe('gray');
  });
});
