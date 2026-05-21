import { describe, it, expect } from 'vitest';
import { buildReport, formatTable, formatSkipped, buildJsonReport } from '../src/output';
import { ScoredPackage, SkippedPackage } from '../src/types';

function makePkg(overrides: Partial<ScoredPackage> = {}): ScoredPackage {
  return {
    name: 'pkg',
    repo: 'org/pkg',
    score: 100,
    status: 'HEALTHY',
    days_since_push: 5,
    open_issues: 10,
    signals: ['Last commit 5 days ago — healthy'],
    ...overrides,
  };
}

function makeSkipped(overrides: Partial<SkippedPackage> = {}): SkippedPackage {
  return {
    name: 'skipped-pkg',
    reason: 'untrackable',
    detail: 'No repository URL',
    ...overrides,
  };
}

describe('formatTable', () => {
  it('sorts packages by score ascending (worst first)', () => {
    const pkgs = [
      makePkg({ name: 'good', score: 90 }),
      makePkg({ name: 'bad', score: 30 }),
      makePkg({ name: 'ok', score: 60 }),
    ];
    const table = formatTable(pkgs);
    const rows = table.split('\n').slice(2);
    expect(rows[0]).toContain('bad');
    expect(rows[1]).toContain('ok');
    expect(rows[2]).toContain('good');
  });

  it('displays N/A for days_since_push < 0', () => {
    const table = formatTable([makePkg({ days_since_push: -1 })]);
    expect(table).toContain('N/A');
  });

  it('escapes pipe characters in package names', () => {
    const table = formatTable([makePkg({ name: 'a|b' })]);
    expect(table).toContain('a\\|b');
    expect(table).not.toContain('| a|b');
  });
});

describe('formatSkipped', () => {
  it('returns empty string when no skipped packages', () => {
    expect(formatSkipped([])).toBe('');
  });

  it('wraps in collapsible details element', () => {
    const result = formatSkipped([makeSkipped()]);
    expect(result).toContain('<details>');
    expect(result).toContain('</details>');
    expect(result).toContain('Skipped packages (1)');
  });

  it('escapes pipe characters in detail field', () => {
    const result = formatSkipped([makeSkipped({ detail: 'error | details' })]);
    expect(result).toContain('error \\| details');
  });
});

describe('buildReport', () => {
  it('shows "no packages tracked" message when scored is empty', () => {
    const { content } = buildReport([], [], 30, 60);
    expect(content).toContain('No packages were tracked');
  });

  it('includes failure summary for packages below fail threshold', () => {
    const pkgs = [makePkg({ name: 'bad', score: 20, status: 'AT RISK', signals: ['old'] })];
    const { content, failing } = buildReport(pkgs, [], 30, 60);
    expect(content).toContain('Failure Summary');
    expect(failing).toHaveLength(1);
    expect(failing[0].name).toBe('bad');
  });

  it('includes failure summary for ARCHIVED packages', () => {
    const pkgs = [makePkg({ name: 'archived', score: 0, status: 'ARCHIVED', signals: ['Repository is archived'] })];
    const { failing } = buildReport(pkgs, [], 30, 60);
    expect(failing).toHaveLength(1);
  });

  it('includes warning summary for packages between thresholds', () => {
    const pkgs = [makePkg({ name: 'mid', score: 45, status: 'CONCERN', signals: ['stale'] })];
    const { content, warning } = buildReport(pkgs, [], 30, 60);
    expect(content).toContain('Warning Summary');
    expect(warning).toHaveLength(1);
  });

  it('healthy packages produce no failure or warning sections', () => {
    const pkgs = [makePkg({ score: 90, status: 'HEALTHY' })];
    const { content, failing, warning } = buildReport(pkgs, [], 30, 60);
    expect(content).not.toContain('Failure Summary');
    expect(content).not.toContain('Warning Summary');
    expect(failing).toHaveLength(0);
    expect(warning).toHaveLength(0);
  });

  it('includes skipped section when skipped packages exist', () => {
    const { content } = buildReport([], [makeSkipped()], 30, 60);
    expect(content).toContain('Skipped packages');
  });
});

describe('buildJsonReport', () => {
  it('produces valid JSON with scored and skipped arrays', () => {
    const scored = [makePkg()];
    const skipped = [makeSkipped()];
    const json = buildJsonReport(scored, skipped);
    const parsed = JSON.parse(json);
    expect(parsed.scored).toHaveLength(1);
    expect(parsed.skipped).toHaveLength(1);
    expect(parsed.scored[0].name).toBe('pkg');
    expect(parsed.skipped[0].reason).toBe('untrackable');
  });
});
