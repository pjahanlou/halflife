import * as core from '@actions/core';
import { ActionInputs, ScoredPackage, SkippedPackage } from './types';

const STATUS_EMOJI: Record<ScoredPackage['status'], string> = {
  HEALTHY:   ':green_circle:',
  WATCH:     ':yellow_circle:',
  CONCERN:   ':orange_circle:',
  'AT RISK': ':red_circle:',
  ARCHIVED:  ':black_circle:',
};

const escPipe = (s: string) => s.replace(/\|/g, '\\|');

export function formatTable(packages: ScoredPackage[]): string {
  const lines: string[] = [
    '| Package | Score | Status | Days Since Push | Open Issues | Signal |',
    '|---------|------:|--------|----------------:|------------:|--------|',
  ];
  const sorted = [...packages].sort((a, b) => a.score - b.score);
  for (const pkg of sorted) {
    const dsp = pkg.days_since_push < 0 ? 'N/A' : String(pkg.days_since_push);
    lines.push(
      `| [\`${escPipe(pkg.name)}\`](https://github.com/${escPipe(pkg.repo)}) ` +
      `| ${pkg.score} ` +
      `| ${STATUS_EMOJI[pkg.status]} ${pkg.status} ` +
      `| ${dsp} ` +
      `| ${pkg.open_issues} ` +
      `| ${escPipe(pkg.signals.join(' · '))} |`
    );
  }
  return lines.join('\n');
}

export function formatSkipped(skipped: SkippedPackage[]): string {
  if (skipped.length === 0) return '';
  const lines: string[] = [
    `<details><summary>Skipped packages (${skipped.length})</summary>`,
    '',
    '| Package | Reason | Detail |',
    '|---------|--------|--------|',
  ];
  for (const pkg of skipped) {
    lines.push(`| \`${escPipe(pkg.name)}\` | ${escPipe(pkg.reason)} | ${escPipe(pkg.detail ?? '')} |`);
  }
  lines.push('', '</details>');
  return lines.join('\n');
}

export function buildReport(
  scored: ScoredPackage[],
  skipped: SkippedPackage[],
  failThreshold: number,
  warnThreshold: number
): { content: string; failing: ScoredPackage[]; warning: ScoredPackage[] } {
  const date = new Date().toISOString().split('T')[0];
  const total = scored.length + skipped.length;
  const lines: string[] = [
    '## Halflife — Dependency Health Report',
    `_Generated on ${date}_`,
    '',
    `Scanned **${total}** packages — **${scored.length}** tracked, **${skipped.length}** skipped`,
    '',
  ];

  if (scored.length > 0) {
    lines.push(formatTable(scored), '');
  } else {
    lines.push('_No packages were tracked (all were skipped or filtered)._', '');
  }

  if (skipped.length > 0) {
    lines.push(formatSkipped(skipped), '');
  }

  const failing = scored.filter((p) => p.status === 'ARCHIVED' || p.score < failThreshold);
  const warning = scored.filter(
    (p) => p.status !== 'ARCHIVED' && p.score >= failThreshold && p.score < warnThreshold
  );

  if (failing.length > 0) {
    lines.push(
      '### Failure Summary',
      `The following ${failing.length} package(s) are ARCHIVED or scored below the fail threshold (${failThreshold}):`,
      ...failing.map((p) => `- \`${escPipe(p.name)}\` — score **${p.score}** (${p.status}): ${escPipe(p.signals.join(' · '))}`),
      ''
    );
  }

  if (warning.length > 0) {
    lines.push(
      '### Warning Summary',
      `The following ${warning.length} package(s) scored below the warn threshold (${warnThreshold}):`,
      ...warning.map((p) => `- \`${escPipe(p.name)}\` — score **${p.score}** (${p.status}): ${escPipe(p.signals.join(' · '))}`),
      ''
    );
  }

  return { content: lines.join('\n'), failing, warning };
}

export function buildJsonReport(
  scored: ScoredPackage[],
  skipped: SkippedPackage[]
): string {
  return JSON.stringify({ scored, skipped }, null, 2);
}

export async function writeOutput(
  scored: ScoredPackage[],
  skipped: SkippedPackage[],
  inputs: ActionInputs
): Promise<boolean> {
  const { content, failing, warning } = buildReport(scored, skipped, inputs.failThreshold, inputs.warnThreshold);
  const format = inputs.outputFormat;

  if (format === 'markdown' || format === 'both') {
    await core.summary.addRaw(content, true).write();
  }

  if (format === 'json' || format === 'both') {
    const json = buildJsonReport(scored, skipped);
    core.info(json);
    core.setOutput('report-json', json);
  }

  for (const pkg of warning) {
    core.warning(`${pkg.name} scored ${pkg.score} (${pkg.status}): ${pkg.signals.join(' · ')}`);
  }
  for (const pkg of failing) {
    core.error(`${pkg.name} scored ${pkg.score} (${pkg.status}): ${pkg.signals.join(' · ')}`);
  }

  return failing.length > 0;
}
