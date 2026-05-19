import * as fs from 'fs';
import { ScoredPackage, SkippedPackage } from './types';

const STATUS_EMOJI: Record<ScoredPackage['status'], string> = {
  HEALTHY:   ':green_circle:',
  WATCH:     ':yellow_circle:',
  CONCERN:   ':orange_circle:',
  'AT RISK': ':red_circle:',
  ARCHIVED:  ':black_circle:',
};

function formatTable(packages: ScoredPackage[]): string {
  const lines: string[] = [
    '| Package | Score | Status | Days Since Push | Open Issues | Signal |',
    '|---------|------:|--------|----------------:|------------:|--------|',
  ];
  const sorted = [...packages].sort((a, b) => a.score - b.score);
  for (const pkg of sorted) {
    lines.push(
      `| [\`${pkg.name}\`](https://github.com/${pkg.repo}) ` +
      `| ${pkg.score} ` +
      `| ${STATUS_EMOJI[pkg.status]} ${pkg.status} ` +
      `| ${pkg.days_since_push} ` +
      `| ${pkg.open_issues} ` +
      `| ${pkg.top_signal} |`
    );
  }
  return lines.join('\n');
}

function formatSkipped(skipped: SkippedPackage[]): string {
  if (skipped.length === 0) return '';
  const lines: string[] = [
    `<details><summary>Skipped packages (${skipped.length})</summary>`,
    '',
    '| Package | Reason | Detail |',
    '|---------|--------|--------|',
  ];
  for (const pkg of skipped) {
    lines.push(`| \`${pkg.name}\` | ${pkg.reason} | ${pkg.detail ?? ''} |`);
  }
  lines.push('', '</details>');
  return lines.join('\n');
}

function buildReport(
  scored: ScoredPackage[],
  skipped: SkippedPackage[],
  failThreshold: number,
  warnThreshold: number
): { content: string; exitCode: number } {
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

  let exitCode = 0;

  if (failing.length > 0) {
    lines.push(
      '### Failure Summary',
      `The following ${failing.length} package(s) are ARCHIVED or scored below the fail threshold (${failThreshold}):`,
      ...failing.map((p) => `- \`${p.name}\` — score **${p.score}** (${p.status}): ${p.top_signal}`),
      ''
    );
    exitCode = 1;
  }

  if (warning.length > 0) {
    lines.push(
      '### Warning Summary',
      `The following ${warning.length} package(s) scored below the warn threshold (${warnThreshold}):`,
      ...warning.map((p) => `- \`${p.name}\` — score **${p.score}** (${p.status}): ${p.top_signal}`),
      ''
    );
  }

  return { content: lines.join('\n'), exitCode };
}

export function writeOutput(
  scored: ScoredPackage[],
  skipped: SkippedPackage[],
  failThreshold: number,
  warnThreshold: number
): void {
  const { content, exitCode } = buildReport(scored, skipped, failThreshold, warnThreshold);

  console.log(content);

  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryPath) {
    try {
      fs.appendFileSync(summaryPath, content + '\n');
    } catch (err) {
      console.error(`[halflife] Failed to write to GITHUB_STEP_SUMMARY: ${err}`);
    }
  }

  process.exit(exitCode);
}
