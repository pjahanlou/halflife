import { RawSignals, ScoredPackage } from './types';

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

function recencyScore(days: number): { points: number; signal: string } {
  if (days <= 30)  return { points: 50, signal: `Last commit ${days} days ago — healthy` };
  if (days <= 60)  return { points: 40, signal: `No commits in ${days} days` };
  if (days <= 90)  return { points: 30, signal: `No commits in ${days} days` };
  if (days <= 180) return { points: 15, signal: `No commits in ${days} days` };
  if (days <= 365) return { points: 5,  signal: `No commits in ${days} days` };
  return { points: 0, signal: `No commits in ${days} days` };
}

function issuePressureScore(ratio: number): { points: number; signal: string | null } {
  if (ratio < 0.05)  return { points: 30, signal: null };
  if (ratio < 0.15)  return { points: 20, signal: `High issue-to-star ratio (${ratio.toFixed(2)})` };
  if (ratio < 0.30)  return { points: 10, signal: `High issue-to-star ratio (${ratio.toFixed(2)})` };
  return { points: 0, signal: `High issue-to-star ratio (${ratio.toFixed(2)})` };
}

function baseHealthScore(openIssues: number): { points: number; signal: string | null } {
  if (openIssues > 500) return { points: 10, signal: `${openIssues} open issues` };
  return { points: 20, signal: null };
}

export function statusBand(score: number): ScoredPackage['status'] {
  if (score >= 80) return 'HEALTHY';
  if (score >= 60) return 'WATCH';
  if (score >= 40) return 'CONCERN';
  return 'AT RISK';
}

export function scorePackage(raw: RawSignals): ScoredPackage {
  if (raw.archived) {
    return {
      name: raw.name,
      repo: raw.repo,
      score: 0,
      status: 'ARCHIVED',
      days_since_push: daysSince(raw.pushed_at),
      open_issues: raw.open_issues_count,
      signals: ['Repository is archived'],
    };
  }

  const days = daysSince(raw.pushed_at);
  const ratio = raw.open_issues_count / Math.max(raw.stargazers_count, 1);
  const recency = recencyScore(days);
  const pressure = issuePressureScore(ratio);
  const base = baseHealthScore(raw.open_issues_count);

  const score = recency.points + pressure.points + base.points;

  const signalEntries: Array<{ text: string; deduction: number }> = [
    { text: recency.signal, deduction: 50 - recency.points },
  ];
  if (pressure.signal) signalEntries.push({ text: pressure.signal, deduction: 30 - pressure.points });
  if (base.signal)     signalEntries.push({ text: base.signal,     deduction: 20 - base.points });
  signalEntries.sort((a, b) => b.deduction - a.deduction);

  return {
    name: raw.name,
    repo: raw.repo,
    score,
    status: statusBand(score),
    days_since_push: days,
    open_issues: raw.open_issues_count,
    signals: signalEntries.slice(0, 3).map(e => e.text),
  };
}
