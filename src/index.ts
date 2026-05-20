import * as core from '@actions/core';
import { ActionInputs, ScoredPackage, SkippedPackage } from './types';
import { parseManifest } from './parse';
import { resolvePackages } from './registry';
import { fetchAllRepoSignals } from './github';
import { scorePackage } from './score';
import { writeOutput } from './output';

function loadInputs(): ActionInputs {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    manifestFile: core.getInput('manifest-file'),
    includeDev: core.getBooleanInput('include-dev'),
    failThreshold: parseInt(core.getInput('fail-threshold'), 10),
    warnThreshold: parseInt(core.getInput('warn-threshold'), 10),
    downloadFloor: parseInt(core.getInput('download-floor'), 10),
  };
}

async function main(): Promise<void> {
  const inputs = loadInputs();

  core.info(`Reading manifest: ${inputs.manifestFile}`);
  const packageNames = parseManifest(inputs);
  core.info(`Found ${packageNames.length} packages to evaluate`);

  const toFetch: Array<{ name: string; slug: string }> = [];
  const skipped: SkippedPackage[] = [];

  await core.group('Resolving npm registry metadata', async () => {
    const registryResults = await resolvePackages(packageNames, inputs);
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
        const pkg = scorePackage(result.signals);
        scored.push(pkg);
        core.debug(`${pkg.name}: score=${pkg.score}, status=${pkg.status}`);
      }
    }
  });

  const failed = await writeOutput(scored, skipped, inputs.failThreshold, inputs.warnThreshold);
  if (failed) {
    core.setFailed('One or more dependencies are archived or scored below the fail threshold');
  }
}

main().catch(err => core.setFailed(err instanceof Error ? err.message : String(err)));
