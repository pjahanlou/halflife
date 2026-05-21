import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePackages } from '../src/registry';
import { ActionInputs } from '../src/types';

vi.mock('@actions/core', () => ({ warning: vi.fn() }));

const inputs: ActionInputs = {
  githubToken: 'token',
  manifestFile: 'package.json',
  includeDev: false,
  failThreshold: 30,
  warnThreshold: 60,
  downloadFloor: 500000,
  ignorePackages: [],
  commentOnPr: false,
  outputFormat: 'markdown',
  weights: { recency: 50, pressure: 30, base: 20 },
};

function mockFetch(...responses: Array<{ ok: boolean; data: unknown; status?: number }>) {
  let call = 0;
  global.fetch = vi.fn(async () => {
    const r = responses[call++] ?? { ok: false, data: {}, status: 500 };
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.data,
    } as Response;
  });
}

async function resolve(name: string) {
  const map = await resolvePackages([name], inputs);
  return map.get(name)!;
}

describe('resolvePackages filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no repository field → untrackable', async () => {
    mockFetch({ ok: true, data: { license: 'MIT' } });
    const result = await resolve('pkg');
    expect('skipped' in result && result.skipped.reason).toBe('untrackable');
  });

  it('non-GitHub repository URL (gitlab.com) → untrackable', async () => {
    mockFetch({ ok: true, data: { repository: { url: 'https://gitlab.com/org/pkg' }, license: 'MIT' } });
    const result = await resolve('pkg');
    expect('skipped' in result && result.skipped.reason).toBe('untrackable');
  });

  it('GitHub URL but license is UNLICENSED → proprietary', async () => {
    mockFetch({ ok: true, data: { repository: { url: 'https://github.com/org/pkg' }, license: 'UNLICENSED' } });
    const result = await resolve('pkg');
    expect('skipped' in result && result.skipped.reason).toBe('proprietary');
  });

  it('no license field → proprietary', async () => {
    mockFetch({ ok: true, data: { repository: { url: 'https://github.com/org/pkg' } } });
    const result = await resolve('pkg');
    expect('skipped' in result && result.skipped.reason).toBe('proprietary');
  });

  it('license "Proprietary" (case-insensitive) → proprietary', async () => {
    mockFetch({ ok: true, data: { repository: { url: 'https://github.com/org/pkg' }, license: 'Proprietary' } });
    const result = await resolve('pkg');
    expect('skipped' in result && result.skipped.reason).toBe('proprietary');
  });

  it('valid GitHub URL, MIT license, downloads below floor → returns slug', async () => {
    mockFetch(
      { ok: true, data: { repository: { url: 'https://github.com/org/pkg' }, license: 'MIT' } },
      { ok: true, data: { downloads: 100 } },
    );
    const result = await resolve('pkg');
    expect('slug' in result && result.slug).toBe('org/pkg');
  });

  it('valid GitHub URL, MIT license, downloads at floor → established', async () => {
    mockFetch(
      { ok: true, data: { repository: { url: 'https://github.com/org/pkg' }, license: 'MIT' } },
      { ok: true, data: { downloads: 500000 } },
    );
    const result = await resolve('pkg');
    expect('skipped' in result && result.skipped.reason).toBe('established');
  });

  it('valid GitHub URL, MIT license, downloads above floor → established', async () => {
    mockFetch(
      { ok: true, data: { repository: { url: 'https://github.com/org/pkg' }, license: 'MIT' } },
      { ok: true, data: { downloads: 600000 } },
    );
    const result = await resolve('pkg');
    expect('skipped' in result && result.skipped.reason).toBe('established');
  });

  it('git+https:// prefixed URL → slug correctly parsed', async () => {
    mockFetch(
      { ok: true, data: { repository: { url: 'git+https://github.com/org/pkg' }, license: 'MIT' } },
      { ok: true, data: { downloads: 100 } },
    );
    const result = await resolve('pkg');
    expect('slug' in result && result.slug).toBe('org/pkg');
  });

  it('URL ending in .git → .git stripped from slug', async () => {
    mockFetch(
      { ok: true, data: { repository: { url: 'https://github.com/org/pkg.git' }, license: 'MIT' } },
      { ok: true, data: { downloads: 100 } },
    );
    const result = await resolve('pkg');
    expect('slug' in result && result.slug).toBe('org/pkg');
  });

  it('URL with fragment → fragment excluded from slug', async () => {
    mockFetch(
      { ok: true, data: { repository: { url: 'https://github.com/org/pkg#readme' }, license: 'MIT' } },
      { ok: true, data: { downloads: 100 } },
    );
    const result = await resolve('pkg');
    expect('slug' in result && result.slug).toBe('org/pkg');
  });

  it('scoped package name resolves correctly', async () => {
    mockFetch(
      { ok: true, data: { repository: { url: 'https://github.com/org/pkg' }, license: 'MIT' } },
      { ok: true, data: { downloads: 100 } },
    );
    const map = await resolvePackages(['@scope/pkg'], inputs);
    const result = map.get('@scope/pkg')!;
    expect('slug' in result && result.slug).toBe('org/pkg');
  });

  it('fetchDownloads returning non-ok → defaults to 0, not skipped as established', async () => {
    mockFetch(
      { ok: true, data: { repository: { url: 'https://github.com/org/pkg' }, license: 'MIT' } },
      { ok: false, data: {}, status: 500 },
    );
    const result = await resolve('pkg');
    expect('slug' in result).toBe(true);
  });

  it('license as legacy array → joined with OR', async () => {
    mockFetch(
      { ok: true, data: { repository: { url: 'https://github.com/org/pkg' }, license: [{ type: 'MIT' }, { type: 'Apache-2.0' }] } },
      { ok: true, data: { downloads: 100 } },
    );
    const result = await resolve('pkg');
    expect('slug' in result).toBe(true);
  });
});
