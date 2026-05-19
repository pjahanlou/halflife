import { ActionInputs, ScoredPackage, SkippedPackage } from './types';
import { parseManifest } from './parse';
import { resolvePackages } from './registry';
import { fetchAllRepoSignals } from './github';
import { scorePackage } from './score';
import { writeOutput } from './output';

function loadInputs(): ActionInputs {
  const githubToken = process.env['INPUT_GITHUB-TOKEN'] ?? '';
  const manifestFile = process.env['INPUT_MANIFEST-FILE'] ?? 'package.json';
  const includeDev = (process.env['INPUT_INCLUDE-DEV'] ?? 'false').toLowerCase() === 'true';
  const failThreshold = parseInt(process.env['INPUT_FAIL-THRESHOLD'] ?? '30', 10);
  const warnThreshold = parseInt(process.env['INPUT_WARN-THRESHOLD'] ?? '60', 10);
  const downloadFloor = parseInt(process.env['INPUT_DOWNLOAD-FLOOR'] ?? '500000', 10);

  if (!githubToken) {
    throw new Error(
      'Input "github-token" is required. Set it explicitly or ensure ${{ github.token }} is passed.'
    );
  }
  if (isNaN(failThreshold) || isNaN(warnThreshold) || isNaN(downloadFloor)) {
    throw new Error(
      'Numeric inputs (fail-threshold, warn-threshold, download-floor) must be valid integers.'
    );
  }

  return { githubToken, manifestFile, includeDev, failThreshold, warnThreshold, downloadFloor };
}

async function main(): Promise<void> {
  const inputs = loadInputs();

  console.log(`[halflife] Reading manifest: ${inputs.manifestFile}`);
  const packageNames = parseManifest(inputs);
  console.log(`[halflife] Found ${packageNames.length} packages to evaluate`);

  console.log('[halflife] Resolving npm registry metadata...');
  const registryResults = await resolvePackages(packageNames, inputs);

  const toFetch: Array<{ name: string; slug: string }> = [];
  const skipped: SkippedPackage[] = [];

  for (const [name, result] of registryResults) {
    if ('slug' in result) {
      toFetch.push({ name, slug: result.slug });
    } else {
      skipped.push(result.skipped);
    }
  }

  console.log(
    `[halflife] ${toFetch.length} packages resolved to GitHub repos, ${skipped.length} skipped`
  );

  console.log('[halflife] Fetching GitHub repository signals...');
  const githubResults = await fetchAllRepoSignals(toFetch, inputs.githubToken);

  const scored: ScoredPackage[] = [];

  for (const { name } of toFetch) {
    const result = githubResults.get(name);
    if (!result) continue;
    if ('skipped' in result) {
      skipped.push(result.skipped);
    } else {
      const pkg = scorePackage(result.signals);
      scored.push(pkg);
      console.log(`[halflife] ${pkg.name}: score=${pkg.score}, status=${pkg.status}`);
    }
  }

  writeOutput(scored, skipped, inputs.failThreshold, inputs.warnThreshold);
}

main().catch((err) => {
  console.error(`[halflife] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
