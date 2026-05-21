import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scorePackage, statusBand } from '../src/score';
import { RawSignals, ScoringWeights } from '../src/types';

const FIXED_NOW = new Date('2026-05-19T12:00:00.000Z').getTime();

const DEFAULT_WEIGHTS: ScoringWeights = { recency: 50, pressure: 30, base: 20 };

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
    it('today (0 days) → 50 pts recency, total 100', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(0) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(100);
    });

    it('30 days (boundary) → 50 pts recency, total 100', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(30) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(100);
    });

    it('31 days ago → 40 pts recency, total 90', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(31) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(90);
    });

    it('60 days (boundary) → 40 pts recency, total 90', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(60) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(90);
    });

    it('61 days ago → 30 pts recency, total 80', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(61) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(80);
    });

    it('90 days (boundary) → 30 pts recency, total 80', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(90) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(80);
    });

    it('91 days ago → 15 pts recency, total 65', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(91) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(65);
    });

    it('180 days (boundary) → 15 pts recency, total 65', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(180) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(65);
    });

    it('181 days ago → 5 pts recency, total 55', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(181) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(55);
    });

    it('365 days (boundary) → 5 pts recency, total 55', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(365) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(55);
    });

    it('366 days ago → 0 pts recency, total 50', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(366) }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(50);
    });
  });

  describe('issue pressure bands', () => {
    it('ratio 0.01 (10/1000) → 30 pts pressure, total 100', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 10,
        stargazers_count: 1000,
      }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(100);
    });

    it('ratio 0.10 (100/1000) → 20 pts pressure, total 90', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 100,
        stargazers_count: 1000,
      }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(90);
    });

    it('ratio 0.20 (200/1000) → 10 pts pressure, total 80', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 200,
        stargazers_count: 1000,
      }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(80);
    });

    it('ratio 0.40 (400/1000) → 0 pts pressure, total 70', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 400,
        stargazers_count: 1000,
      }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(70);
    });

    it('stars=0, open_issues=0 → ratio=0 → pressure=30, total 100', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 0,
        stargazers_count: 0,
      }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(100);
    });

    it('stars=0, open_issues=10 → ratio=10 → pressure=0, total 70', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 10,
        stargazers_count: 0,
      }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(70);
    });
  });

  describe('base health deduction', () => {
    it('open_issues 499 → 20 pts base health, total 100', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 499,
        stargazers_count: 100000,
      }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(100);
    });

    it('open_issues 500 (boundary) → 20 pts base health, total 100', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 500,
        stargazers_count: 100000,
      }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(100);
    });

    it('open_issues 501 → 10 pts base health, total 90', () => {
      const result = scorePackage(makeSignals({
        open_issues_count: 501,
        stargazers_count: 100000,
      }), DEFAULT_WEIGHTS);
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
      }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(0);
      expect(result.status).toBe('ARCHIVED');
      expect(result.signals).toEqual(['Repository is archived']);
    });
  });

  describe('pushed_at edge cases', () => {
    it('pushed_at null → score 0, status AT RISK, "no push history" signal', () => {
      const result = scorePackage(makeSignals({ pushed_at: null }), DEFAULT_WEIGHTS);
      expect(result.score).toBe(0);
      expect(result.status).toBe('AT RISK');
      expect(result.signals).toEqual(['Repository has no push history']);
      expect(result.days_since_push).toBe(-1);
    });

    it('archived with pushed_at null → ARCHIVED status, days_since_push -1', () => {
      const result = scorePackage(makeSignals({ archived: true, pushed_at: null }), DEFAULT_WEIGHTS);
      expect(result.status).toBe('ARCHIVED');
      expect(result.days_since_push).toBe(-1);
    });
  });

  describe('signal content and ordering', () => {
    it('healthy package has healthy recency signal', () => {
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(5) }), DEFAULT_WEIGHTS);
      expect(result.signals[0]).toContain('healthy');
    });

    it('signals sorted by deduction descending', () => {
      const result = scorePackage(makeSignals({
        pushed_at: daysAgo(200),
        open_issues_count: 600,
        stargazers_count: 100,
      }), DEFAULT_WEIGHTS);
      expect(result.signals.length).toBeGreaterThanOrEqual(2);
      expect(result.signals[0]).toContain('days');
    });
  });

  describe('configurable weights', () => {
    it('custom weights scale scores proportionally', () => {
      const customWeights: ScoringWeights = { recency: 100, pressure: 0, base: 0 };
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(0) }), customWeights);
      expect(result.score).toBe(100);
    });

    it('zero recency weight means recency has no effect', () => {
      const customWeights: ScoringWeights = { recency: 0, pressure: 30, base: 20 };
      const fresh = scorePackage(makeSignals({ pushed_at: daysAgo(0) }), customWeights);
      const stale = scorePackage(makeSignals({ pushed_at: daysAgo(400) }), customWeights);
      expect(fresh.score).toBe(stale.score);
    });

    it('status bands scale with total weight', () => {
      const customWeights: ScoringWeights = { recency: 25, pressure: 15, base: 10 };
      const result = scorePackage(makeSignals({ pushed_at: daysAgo(0) }), customWeights);
      expect(result.score).toBe(50);
      expect(result.status).toBe('HEALTHY');
    });
  });
});

describe('statusBand', () => {
  it('score 80/100 → HEALTHY', () => expect(statusBand(80, 100)).toBe('HEALTHY'));
  it('score 60/100 → WATCH',   () => expect(statusBand(60, 100)).toBe('WATCH'));
  it('score 40/100 → CONCERN', () => expect(statusBand(40, 100)).toBe('CONCERN'));
  it('score 39/100 → AT RISK', () => expect(statusBand(39, 100)).toBe('AT RISK'));
  it('score 40/50 → HEALTHY (80%)', () => expect(statusBand(40, 50)).toBe('HEALTHY'));
  it('score 30/50 → WATCH (60%)',   () => expect(statusBand(30, 50)).toBe('WATCH'));
});
