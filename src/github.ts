import * as core from '@actions/core';
import { z } from 'zod';
import { RawSignals, SkippedPackage } from './types';

export type GitHubResult =
  | { signals: RawSignals }
  | { skipped: SkippedPackage };

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

const GitHubRepoSchema = z.object({
  archived: z.boolean(),
  pushed_at: z.string().nullable(),
  open_issues_count: z.number(),
  stargazers_count: z.number(),
});

function parseRateLimitHeaders(res: Response): { remaining: string; reset: string } {
  return {
    remaining: res.headers.get('x-ratelimit-remaining') ?? 'unknown',
    reset: res.headers.get('x-ratelimit-reset') ?? 'unknown',
  };
}

function resetToIso(reset: string): string {
  const ts = parseInt(reset, 10);
  return isNaN(ts) ? reset : new Date(ts * 1000).toISOString();
}

export async function fetchRepoSignals(
  packageName: string,
  slug: string,
  token: string
): Promise<GitHubResult> {
  const res = await fetch(`https://api.github.com/repos/${slug}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'halflife-action',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const { remaining, reset } = parseRateLimitHeaders(res);

  const remainingNum = parseInt(remaining, 10);
  if (!isNaN(remainingNum) && remainingNum < 100) {
    core.warning(`Rate limit low: ${remaining} requests remaining, resets at ${resetToIso(reset)}`);
  }

  if (res.status === 404) {
    return {
      skipped: { name: packageName, reason: 'not_found', detail: `GitHub repo not found: ${slug}` },
    };
  }

  if (res.status === 403 || res.status === 429) {
    throw new RateLimitError(
      `GitHub API rate limit hit for ${slug}. ` +
        `x-ratelimit-remaining: ${remaining}, ` +
        `x-ratelimit-reset: ${reset} (${resetToIso(reset)})`
    );
  }

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status} for ${slug}`);
  }

  const data = GitHubRepoSchema.parse(await res.json());

  return {
    signals: {
      name: packageName,
      repo: slug,
      archived: data.archived,
      pushed_at: data.pushed_at,
      open_issues_count: data.open_issues_count,
      stargazers_count: data.stargazers_count,
    },
  };
}

export async function fetchAllRepoSignals(
  packages: Array<{ name: string; slug: string }>,
  token: string
): Promise<Map<string, GitHubResult>> {
  const results = new Map<string, GitHubResult>();
  const CONCURRENCY = 5;

  for (let i = 0; i < packages.length; i += CONCURRENCY) {
    const batch = packages.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(({ name, slug }) => fetchRepoSignals(name, slug, token))
    );
    for (let j = 0; j < batch.length; j++) {
      const { name } = batch[j];
      const result = settled[j];
      if (result.status === 'rejected') {
        if (result.reason instanceof RateLimitError) {
          throw result.reason;
        }
        core.warning(`Could not fetch GitHub signals for ${name}: ${String(result.reason)}`);
        results.set(name, {
          skipped: { name, reason: 'untrackable', detail: String(result.reason) },
        });
      } else {
        results.set(name, result.value);
      }
    }
  }

  return results;
}
