/**
 * Phase 8 Performance & Polish — Frontend tests.
 *
 * Tests for:
 *  - Analytics.tsx memoization (static objects extracted)
 *  - History.tsx HistoryRow memo component
 *  - Vite build config (manualChunks, build.target)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Analytics memoization ────────────────────────────────────────────────────

describe('Analytics — static object extraction', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../pages/Analytics.tsx'),
    'utf-8',
  );

  it('TOOLTIP_STYLE is declared outside the component', () => {
    // Should appear before "export default function Analytics"
    const tooltipIdx = src.indexOf('const TOOLTIP_STYLE');
    const compIdx = src.indexOf('export default function Analytics');
    expect(tooltipIdx).toBeGreaterThan(-1);
    expect(tooltipIdx).toBeLessThan(compIdx);
  });

  it('METHOD_COLORS is declared outside the component', () => {
    const colorsIdx = src.indexOf('const METHOD_COLORS');
    const compIdx = src.indexOf('export default function Analytics');
    expect(colorsIdx).toBeGreaterThan(-1);
    expect(colorsIdx).toBeLessThan(compIdx);
  });

  it('no inline tooltipStyle or methodColors remain inside the component', () => {
    const compStart = src.indexOf('export default function Analytics');
    const bodyAfterComp = src.slice(compStart);
    expect(bodyAfterComp).not.toContain('const tooltipStyle');
    expect(bodyAfterComp).not.toContain('const methodColors');
  });

  it('component references TOOLTIP_STYLE (upper-case)', () => {
    expect(src).toContain('contentStyle={TOOLTIP_STYLE}');
  });

  it('component references METHOD_COLORS (upper-case)', () => {
    expect(src).toContain('METHOD_COLORS[');
  });

  it('COLORS constant is outside the component', () => {
    const colorsIdx = src.indexOf('const COLORS');
    const compIdx = src.indexOf('export default function Analytics');
    expect(colorsIdx).toBeGreaterThan(-1);
    expect(colorsIdx).toBeLessThan(compIdx);
  });
});

// ── History — memoized row component ─────────────────────────────────────────

describe('History — HistoryRow extraction', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../pages/History.tsx'),
    'utf-8',
  );

  it('imports memo from react', () => {
    expect(src).toMatch(/import\s*\{[^}]*memo[^}]*\}\s*from\s*['"]react['"]/);
  });

  it('declares HistoryRow with React.memo', () => {
    expect(src).toContain('const HistoryRow = memo(');
  });

  it('HistoryRow is declared before the default export', () => {
    const rowIdx = src.indexOf('const HistoryRow = memo(');
    const compIdx = src.indexOf('export default function History');
    expect(rowIdx).toBeGreaterThan(-1);
    expect(rowIdx).toBeLessThan(compIdx);
  });

  it('HistoryRow accepts item and onOpenDetail props', () => {
    // Check the type annotation in the component
    expect(src).toContain('item: HistoryListItem');
    expect(src).toContain('onOpenDetail: (item: HistoryListItem) => void');
  });

  it('render loop uses <HistoryRow /> instead of inline JSX', () => {
    const compStart = src.indexOf('export default function History');
    const bodyAfterComp = src.slice(compStart);
    expect(bodyAfterComp).toContain('<HistoryRow');
    // The old inline div with grid should NOT be in the displayItems.map
    expect(bodyAfterComp).not.toMatch(/displayItems\.map\([^)]*\)\s*=>\s*\(\s*<div[\s\S]*?grid grid-cols-12/);
  });
});

// ── Vite build configuration ─────────────────────────────────────────────────

describe('Vite build optimization', () => {
  const viteConfig = fs.readFileSync(
    path.resolve(__dirname, '../../vite.config.ts'),
    'utf-8',
  );

  it('has build.target set to es2020', () => {
    expect(viteConfig).toContain("target: 'es2020'");
  });

  it('has cssCodeSplit enabled', () => {
    expect(viteConfig).toContain('cssCodeSplit: true');
  });

  it('has manualChunks for react-vendor', () => {
    expect(viteConfig).toContain("'react-vendor'");
    expect(viteConfig).toContain("'react'");
    expect(viteConfig).toContain("'react-dom'");
  });

  it('has manualChunks for charts', () => {
    expect(viteConfig).toContain("'charts'");
    expect(viteConfig).toContain("'recharts'");
  });

  it('has manualChunks for state management', () => {
    expect(viteConfig).toContain("'state'");
    expect(viteConfig).toContain("'zustand'");
  });

  it('has manualChunks for ui-icons', () => {
    expect(viteConfig).toContain("'ui-icons'");
    expect(viteConfig).toContain("'lucide-react'");
  });

  it('has sourcemap disabled for production', () => {
    expect(viteConfig).toContain('sourcemap: false');
  });

  it('has rollupOptions.output configured', () => {
    expect(viteConfig).toContain('rollupOptions');
    expect(viteConfig).toContain('output');
  });
});

// ── General code-quality checks ──────────────────────────────────────────────

describe('Phase 8 — code quality', () => {
  it('Analytics.tsx uses useMemo for analytics computation', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../pages/Analytics.tsx'),
      'utf-8',
    );
    expect(src).toContain('useMemo');
    expect(src).toContain('[testHistory]');
  });

  it('History.tsx still imports useCallback', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../pages/History.tsx'),
      'utf-8',
    );
    expect(src).toContain('useCallback');
  });

  it('App.tsx still uses React.lazy for page splitting', () => {
    const appSrc = fs.readFileSync(
      path.resolve(__dirname, '../App.tsx'),
      'utf-8',
    );
    // May use `React.lazy` or named import `lazy`
    expect(appSrc).toMatch(/\blazy\s*\(/);
    expect(appSrc).toContain('Suspense');
  });
});
