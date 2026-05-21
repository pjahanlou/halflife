import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRepoSignals, fetchAllRepoSignals, RateLimitError } from '../src/github';

vi.mock('@actions/core', () => ({
  warning: vi.fn(),
}));

function mockFetchResponse(status: number, data: unknown, headers: Record<string, string> = {}) {
  const headerMap = new Map(Object.entries(headers));
  global.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    headers: {
      get: (key: string) => headerMap.get(key) ?? null,
    },
  })) as unknown as typeof fetch;
}

describe('fetchRepoSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('200 response returns signals with correct mapping', async () => {
    mockFetchResponse(200, {
      archived: false,
      pushed_at: '2026-05-01T00:00:00Z',
      open_issues_count: 10,
      stargazers_count: 1000,
    }, { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '1716000000' });

    const result = await fetchRepoSignals('pkg', 'org/pkg', 'token');
    expect('signals' in result).toBe(true);
    if ('signals' in result) {
      expect(result.signals.name).toBe('pkg');
      expect(result.signals.repo).toBe('org/pkg');
      expect(result.signals.archived).toBe(false);
      expect(result.signals.pushed_at).toBe('2026-05-01T00:00:00Z');
      expect(result.signals.open_issues_count).toBe(10);
      expect(result.signals.stargazers_count).toBe(1000);
    }
  });

  it('200 with pushed_at null returns null in signals', async () => {
    mockFetchResponse(200, {
      archived: false,
      pushed_at: null,
      open_issues_count: 0,
      stargazers_count: 0,
    }, { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '1716000000' });

    const result = await fetchRepoSignals('pkg', 'org/pkg', 'token');
    expect('signals' in result).toBe(true);
    if ('signals' in result) {
      expect(result.signals.pushed_at).toBeNull();
    }
  });

  it('404 returns skipped with reason not_found', async () => {
    mockFetchResponse(404, {}, { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '1716000000' });

    const result = await fetchRepoSignals('pkg', 'org/pkg', 'token');
    expect('skipped' in result).toBe(true);
    if ('skipped' in result) {
      expect(result.skipped.reason).toBe('not_found');
    }
  });

  it('403 throws RateLimitError', async () => {
    mockFetchResponse(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1716000000' });

    await expect(fetchRepoSignals('pkg', 'org/pkg', 'token')).rejects.toThrow(RateLimitError);
  });

  it('429 throws RateLimitError', async () => {
    mockFetchResponse(429, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1716000000' });

    await expect(fetchRepoSignals('pkg', 'org/pkg', 'token')).rejects.toThrow(RateLimitError);
  });

  it('rate limit warning when remaining < 100', async () => {
    const core = await import('@actions/core');
    mockFetchResponse(200, {
      archived: false,
      pushed_at: '2026-05-01T00:00:00Z',
      open_issues_count: 0,
      stargazers_count: 100,
    }, { 'x-ratelimit-remaining': '50', 'x-ratelimit-reset': '1716000000' });

    await fetchRepoSignals('pkg', 'org/pkg', 'token');
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Rate limit low'));
  });
});

describe('fetchAllRepoSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('RateLimitError in batch causes immediate halt', async () => {
    let callCount = 0;
    global.fetch = vi.fn(async () => {
      callCount++;
      const headers = new Map([
        ['x-ratelimit-remaining', '0'],
        ['x-ratelimit-reset', '1716000000'],
      ]);
      return {
        ok: false,
        status: 429,
        json: async () => ({}),
        headers: { get: (key: string) => headers.get(key) ?? null },
      };
    }) as unknown as typeof fetch;

    const packages = [
      { name: 'a', slug: 'org/a' },
      { name: 'b', slug: 'org/b' },
    ];

    await expect(fetchAllRepoSignals(packages, 'token')).rejects.toThrow(RateLimitError);
  });
});
