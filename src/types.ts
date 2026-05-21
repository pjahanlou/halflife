export type SkipReason = 'untrackable' | 'proprietary' | 'established' | 'not_found' | 'ignored';

export interface SkippedPackage {
  name: string;
  reason: SkipReason;
  detail?: string;
}

export interface RawSignals {
  name: string;
  repo: string;
  archived: boolean;
  pushed_at: string | null;
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

export interface ScoringWeights {
  recency: number;
  pressure: number;
  base: number;
}

export interface ActionInputs {
  githubToken: string;
  manifestFile: string;
  includeDev: boolean;
  failThreshold: number;
  warnThreshold: number;
  downloadFloor: number;
  ignorePackages: string[];
  commentOnPr: boolean;
  outputFormat: 'markdown' | 'json' | 'both';
  weights: ScoringWeights;
}
