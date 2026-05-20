import * as core from '@actions/core';
import { RawSignals, SkippedPackage } from './types';

export type GitHubResult =
  | { signals: RawSignals }
  | { skipped: SkippedPackage };

interface GitHubRepo {
  archived: boolean;
  pushed_at: string;
  open_issues_count: number;
  stargazers_count: number;
}

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
    throw new Error(
      `GitHub API rate limit hit for ${slug}. ` +
        `x-ratelimit-remaining: ${remaining}, ` +
        `x-ratelimit-reset: ${reset} (${resetToIso(reset)})`
    );
  }

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status} for ${slug}`);
  }

  const data = (await res.json()) as GitHubRepo;

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

  for (const { name, slug } of packages) {
    results.set(name, await fetchRepoSignals(name, slug, token));
  }

  return results;
}
