import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scorePackage, statusBand } from '../src/score';
import { RawSignals } from '../src/types';

const FIXED_NOW = new Date('2026-05-19T12:00:00.000Z').getTime();

function daysAgo(n: number): string {
  return new Date(FIXED_NOW - n * 24 * 60 * 60 * 1000).toISOString();
}

function makeSignals(overrides: Partial<RawSignals>): RawSignals {
  return {
    name: 'pkg',
    repo: 'org/pkg',
    archived: false,
    pushed_at: daysAgo(0),
    open_issues_count: 1,
    stargazers_count: 100000,
    ...overrides,
  };
}

describe('scorePackage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('commit recency bands', () => {
    // Baseline: open_issues_count=1, stargazers_count=100000 → ratio≈0 → pressure=30, base=20
    // Total = recency + 50

    it('today (0 days) → 50 pts recency, total 100', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(0) }));
      expect(result.score).toBe(100);
    });

    it('31 days ago → 40 pts recency, total 90', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(31) }));
      expect(result.score).toBe(90);
    });

    it('61 days ago → 30 pts recency, total 80', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(61) }));
      expect(result.score).toBe(80);
    });

    it('91 days ago → 15 pts recency, total 65', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(91) }));
      expect(result.score).toBe(65);
    });

    it('181 days ago → 5 pts recency, total 55', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(181) }));
      expect(result.score).toBe(55);
    });

    it('366 days ago → 0 pts recency, total 50', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(366) }));
      expect(result.score).toBe(50);
    });
  });

  describe('issue pressure bands', () => {
    // Baseline: pushed_at=today → recency=50, open_issues<500 → base=20
    // Total = 70 + pressure

    it('ratio 0.01 (10/1000) → 30 pts pressure, total 100', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 10,
        stargazers_count: 1000,
      }));
      expect(result.score).toBe(100);
    });

    it('ratio 0.10 (100/1000) → 20 pts pressure, total 90', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 100,
        stargazers_count: 1000,
      }));
      expect(result.score).toBe(90);
    });

    it('ratio 0.20 (200/1000) → 10 pts pressure, total 80', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 200,
        stargazers_count: 1000,
      }));
      expect(result.score).toBe(80);
    });

    it('ratio 0.40 (400/1000) → 0 pts pressure, total 70', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 400,
        stargazers_count: 1000,
      }));
      expect(result.score).toBe(70);
    });
  });

  describe('base health deduction', () => {
    // Baseline: pushed_at=today (recency=50), stars=100000 keeps ratio < 0.05 (pressure=30)
    // Vary open_issues around the 500 threshold

    it('open_issues 499 → 20 pts base health, total 100', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 499,
        stargazers_count: 100000,
      }));
      expect(result.score).toBe(100);
    });

    it('open_issues 501 → 10 pts base health, total 90', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 501,
        stargazers_count: 100000,
      }));
      expect(result.score).toBe(90);
    });
  });

  describe('archived override', () => {
    it('archived=true → score 0, status ARCHIVED, signals ["Repository is archived"]', () => {
      const result = scorePackage(makeSignals({
        archived: true,
        pushed_at: daysAgo(0),
        open_issues_count: 1,
        stargazers_count: 100000,
      }));
      expect(result.score).toBe(0);
      expect(result.status).toBe('ARCHIVED');
      expect(result.signals).toEqual(['Repository is archived']);
    });
  });
});

describe('statusBand', () => {
  it('score 80 → HEALTHY', () => expect(statusBand(80)).toBe('HEALTHY'));
  it('score 60 → WATCH',   () => expect(statusBand(60)).toBe('WATCH'));
  it('score 40 → CONCERN', () => expect(statusBand(40)).toBe('CONCERN'));
  it('score 39 → AT RISK', () => expect(statusBand(39)).toBe('AT RISK'));
});
