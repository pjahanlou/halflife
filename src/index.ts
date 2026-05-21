import * as core from '@actions/core';
import { ActionInputs, ScoredPackage, SkippedPackage } from './types';
import { parseManifest } from './parse';
import { resolvePackages } from './registry';
import { fetchAllRepoSignals } from './github';
import { scorePackage } from './score';
import { writeOutput } from './output';
import { postOrUpdateComment } from './comment';

function parseNumericInput(name: string): number {
  const raw = core.getInput(name);
  const value = parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid input: ${name} must be a number, got "${raw}"`);
  }
  if (value < 0) {
    throw new Error(`Invalid input: ${name} must be non-negative, got ${value}`);
  }
  return value;
}

function loadInputs(): ActionInputs {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    manifestFile: core.getInput('manifest-file'),
    includeDev: core.getBooleanInput('include-dev'),
    failThreshold: parseNumericInput('fail-threshold'),
    warnThreshold: parseNumericInput('warn-threshold'),
    downloadFloor: parseNumericInput('download-floor'),
    ignorePackages: core.getInput('ignore-packages')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    commentOnPr: core.getBooleanInput('comment-on-pr'),
    outputFormat: core.getInput('output-format') as ActionInputs['outputFormat'],
    weights: {
      recency: parseNumericInput('recency-weight'),
      pressure: parseNumericInput('pressure-weight'),
      base: parseNumericInput('base-weight'),
    },
  };
}

async function main(): Promise<void> {
  const inputs = loadInputs();

  core.info(`Reading manifest: ${inputs.manifestFile}`);
  const packageNames = parseManifest(inputs);
  core.info(`Found ${packageNames.length} packages to evaluate`);

  const toFetch: Array<{ name: string; slug: string }> = [];
  const skipped: SkippedPackage[] = [];

  const ignoreSet = new Set(inputs.ignorePackages);
  const filtered: string[] = [];
  for (const name of packageNames) {
    if (ignoreSet.has(name)) {
      skipped.push({ name, reason: 'ignored', detail: 'Listed in ignore-packages' });
    } else {
      filtered.push(name);
    }
  }

  await core.group('Resolving npm registry metadata', async () => {
    const registryResults = await resolvePackages(filtered, inputs);
    for (const [name, result] of registryResults) {
      if ('slug' in result) {
        toFetch.push({ name, slug: result.slug });
      } else {
        skipped.push(result.skipped);
      }
    }
    core.info(`${toFetch.length} packages resolved, ${skipped.length} skipped`);
  });

  const scored: ScoredPackage[] = [];

  await core.group('Fetching GitHub repository signals', async () => {
    const githubResults = await fetchAllRepoSignals(toFetch, inputs.githubToken);
    for (const { name } of toFetch) {
      const result = githubResults.get(name);
      if (!result) continue;
      if ('skipped' in result) {
        skipped.push(result.skipped);
      } else {
        const pkg = scorePackage(result.signals, inputs.weights);
        scored.push(pkg);
        core.debug(`${pkg.name}: score=${pkg.score}, status=${pkg.status}`);
      }
    }
  });

  const failed = await writeOutput(scored, skipped, inputs);
  if (failed) {
    core.setFailed('One or more dependencies are archived or scored below the fail threshold');
  }

  if (inputs.commentOnPr) {
    await postOrUpdateComment(scored, skipped, inputs);
  }
}

main().catch(err => core.setFailed(err instanceof Error ? err.message : String(err)));
