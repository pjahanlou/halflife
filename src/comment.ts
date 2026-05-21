import * as core from '@actions/core';
import { ActionInputs, ScoredPackage, SkippedPackage } from './types';
import { buildReport } from './output';

const MARKER = '<!-- halflife-report -->';

interface GitHubComment {
  id: number;
  body?: string;
}

function getPrNumber(): number | null {
  const ref = process.env.GITHUB_REF ?? '';
  const match = ref.match(/^refs\/pull\/(\d+)\//);
  return match ? parseInt(match[1], 10) : null;
}

export async function postOrUpdateComment(
  scored: ScoredPackage[],
  skipped: SkippedPackage[],
  inputs: ActionInputs
): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumber = getPrNumber();

  if (!repo || !prNumber) {
    core.warning('comment-on-pr is enabled but this does not appear to be a pull request event. Skipping comment.');
    return;
  }

  const { content } = buildReport(scored, skipped, inputs.failThreshold, inputs.warnThreshold);
  const body = `${MARKER}\n${content}`;

  const apiBase = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${inputs.githubToken}`,
    'User-Agent': 'halflife-action',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    const listRes = await fetch(apiBase, { headers });
    if (!listRes.ok) {
      core.warning(`Failed to list PR comments (${listRes.status}). Skipping comment.`);
      return;
    }

    const comments = (await listRes.json()) as GitHubComment[];
    const existing = comments.find(c => c.body?.startsWith(MARKER));

    if (existing) {
      const updateRes = await fetch(`${apiBase.replace(/\/comments$/, '')}/comments/${existing.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!updateRes.ok) {
        core.warning(`Failed to update PR comment (${updateRes.status}).`);
      }
    } else {
      const createRes = await fetch(apiBase, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!createRes.ok) {
        core.warning(`Failed to create PR comment (${createRes.status}).`);
      }
    }
  } catch (err) {
    core.warning(`PR comment failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
