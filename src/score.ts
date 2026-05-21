import { RawSignals, ScoredPackage, ScoringWeights } from './types';

function daysSince(isoDate: string): number {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (isNaN(days)) return -1;
  return days;
}

function recencyScore(days: number): { points: number; signal: string } {
  if (days <= 30)  return { points: 50, signal: `Last commit ${days} days ago — healthy` };
  if (days <= 60)  return { points: 40, signal: `Last commit ${days} days ago` };
  if (days <= 90)  return { points: 30, signal: `No commits in ${days} days` };
  if (days <= 180) return { points: 15, signal: `No commits in ${days} days — growing stale` };
  if (days <= 365) return { points: 5,  signal: `No commits in ${days} days — possibly unmaintained` };
  return { points: 0, signal: `No commits in ${days} days — likely abandoned` };
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

export function statusBand(score: number, maxScore: number): ScoredPackage['status'] {
  const pct = score / maxScore;
  if (pct >= 0.80) return 'HEALTHY';
  if (pct >= 0.60) return 'WATCH';
  if (pct >= 0.40) return 'CONCERN';
  return 'AT RISK';
}

export function scorePackage(raw: RawSignals, weights: ScoringWeights): ScoredPackage {
  const maxScore = weights.recency + weights.pressure + weights.base;

  if (raw.archived) {
    return {
      name: raw.name,
      repo: raw.repo,
      score: 0,
      status: 'ARCHIVED',
      days_since_push: raw.pushed_at ? daysSince(raw.pushed_at) : -1,
      open_issues: raw.open_issues_count,
      signals: ['Repository is archived'],
    };
  }

  if (raw.pushed_at === null) {
    return {
      name: raw.name,
      repo: raw.repo,
      score: 0,
      status: 'AT RISK',
      days_since_push: -1,
      open_issues: raw.open_issues_count,
      signals: ['Repository has no push history'],
    };
  }

  const days = daysSince(raw.pushed_at);
  if (days < 0) {
    return {
      name: raw.name,
      repo: raw.repo,
      score: 0,
      status: 'AT RISK',
      days_since_push: -1,
      open_issues: raw.open_issues_count,
      signals: ['Unable to determine last commit date'],
    };
  }

  const ratio = raw.open_issues_count / Math.max(raw.stargazers_count, 1);
  const recency = recencyScore(days);
  const pressure = issuePressureScore(ratio);
  const base = baseHealthScore(raw.open_issues_count);

  const score = Math.round(
    (recency.points / 50) * weights.recency +
    (pressure.points / 30) * weights.pressure +
    (base.points / 20) * weights.base
  );

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
    status: statusBand(score, maxScore),
    days_since_push: days,
    open_issues: raw.open_issues_count,
    signals: signalEntries.slice(0, 3).map(e => e.text),
  };
}
