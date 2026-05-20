import { RawSignals, ScoredPackage } from './types';

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

function recencyScore(days: number): { points: number; signal: string | null } {
  if (days <= 30)  return { points: 50, signal: null };
  if (days <= 60)  return { points: 40, signal: `Last push ${days} days ago` };
  if (days <= 90)  return { points: 30, signal: `Last push ${days} days ago` };
  if (days <= 180) return { points: 15, signal: `Last push ${days} days ago` };
  if (days <= 365) return { points: 5,  signal: `Last push ${days} days ago` };
  return { points: 0, signal: `No push in over a year (${days} days)` };
}

function issuePressureScore(
  openIssues: number,
  stars: number
): { points: number; signal: string | null } {
  const ratio = openIssues / Math.max(stars, 1);
  if (ratio < 0.05)  return { points: 30, signal: null };
  if (ratio < 0.15)  return { points: 20, signal: `Issue ratio ${ratio.toFixed(2)} (moderate)` };
  if (ratio < 0.30)  return { points: 10, signal: `High issue ratio ${ratio.toFixed(2)}` };
  return { points: 0, signal: `Very high issue ratio ${ratio.toFixed(2)} (${openIssues} open issues)` };
}

function baseHealthScore(openIssues: number): { points: number; signal: string | null } {
  if (openIssues > 500) {
    return { points: 10, signal: `${openIssues} open issues (high absolute count)` };
  }
  return { points: 20, signal: null };
}

function statusBand(score: number): ScoredPackage['status'] {
  if (score >= 80) return 'HEALTHY';
  if (score >= 60) return 'WATCH';
  if (score >= 40) return 'CONCERN';
  return 'AT RISK';
}

export function scorePackage(signals: RawSignals): ScoredPackage {
  if (signals.archived) {
    return {
      name: signals.name,
      repo: signals.repo,
      score: 0,
      status: 'ARCHIVED',
      days_since_push: daysSince(signals.pushed_at),
      open_issues: signals.open_issues_count,
      top_signal: 'Repository is archived',
    };
  }

  const days = daysSince(signals.pushed_at);
  const recency = recencyScore(days);
  const pressure = issuePressureScore(signals.open_issues_count, signals.stargazers_count);
  const base = baseHealthScore(signals.open_issues_count);

  const score = recency.points + pressure.points + base.points;

  const negativeSignals: Array<{ signal: string; deduction: number }> = [];
  if (recency.signal)  negativeSignals.push({ signal: recency.signal,  deduction: 50 - recency.points });
  if (pressure.signal) negativeSignals.push({ signal: pressure.signal, deduction: 30 - pressure.points });
  if (base.signal)     negativeSignals.push({ signal: base.signal,     deduction: 20 - base.points });
  negativeSignals.sort((a, b) => b.deduction - a.deduction);

  return {
    name: signals.name,
    repo: signals.repo,
    score,
    status: statusBand(score),
    days_since_push: days,
    open_issues: signals.open_issues_count,
    top_signal: negativeSignals.length > 0 ? negativeSignals[0].signal : 'No major issues detected',
  };
}
