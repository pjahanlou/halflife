export type SkipReason = 'untrackable' | 'proprietary' | 'established' | 'not_found';

export interface SkippedPackage {
  name: string;
  reason: SkipReason;
  detail?: string;
}

export interface RawSignals {
  name: string;
  repo: string;
  archived: boolean;
  pushed_at: string;
  open_issues_count: number;
  stargazers_count: number;
}

export interface ScoredPackage {
  name: string;
  repo: string;
  score: number;
  status: 'HEALTHY' | 'WATCH' | 'CONCERN' | 'AT RISK' | 'ARCHIVED';
  days_since_push: number;
  open_issues: number;
  signals: string[];
}

export interface ActionInputs {
  githubToken: string;
  manifestFile: string;
  includeDev: boolean;
  failThreshold: number;
  warnThreshold: number;
  downloadFloor: number;
}
