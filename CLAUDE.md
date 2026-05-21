# Halflife

Halflife is a GitHub Action that scores the health of your open-source npm dependencies. It reads your `package.json`, filters out well-established or untrackable packages, queries the GitHub REST API for each remaining dependency's repository signals, scores them, and reports results as a GitHub Actions Job Summary.

## What it does

1. Parses your `package.json` to extract dependency names.
2. For each package, calls the npm registry (`/latest` endpoint) to find its GitHub repository URL and license.
3. Filters out packages that are proprietary, have no GitHub repo, are in the ignore list, or meet/exceed the download floor (they have institutional maintenance guarantees).
4. Fetches live GitHub repo signals: last push date, open issue count, star count, archived status.
5. Scores each package based on three weighted components (see Scoring Model below). Default weights total 100 points.
6. Builds a signals array (up to 3, sorted by severity) explaining the score.
7. Writes a report to the GitHub Job Summary and/or stdout. Supports Markdown, JSON, or both formats.
8. Optionally posts results as a PR comment (when `comment-on-pr` is enabled).
9. Exits with code 1 if any package is ARCHIVED or scores below `fail-threshold`.

## Input Validation

All numeric inputs (`fail-threshold`, `warn-threshold`, `download-floor`, `recency-weight`, `pressure-weight`, `base-weight`) must be valid non-negative integers. The action errors immediately if any numeric input is NaN or negative.

## Version Protocol Filtering

The following version prefixes in `package.json` are filtered out and not sent to the npm registry: `file:`, `git+`, `workspace:`, `npm:`, `link:`, `github:`, `http:`, `https:`.

## Scoring Model

Scores are composed of three weighted components. Weights are configurable via `recency-weight`, `pressure-weight`, and `base-weight` inputs. Default weights total 100 points.

### Component 1: Commit Recency (default 50 points)

| Days Since Last Push | Points |
|---------------------:|-------:|
| 0–30                 | 50     |
| 31–60                | 40     |
| 61–90                | 30     |
| 91–180               | 15     |
| 181–365              | 5      |
| 365+                 | 0      |

Points are scaled proportionally when `recency-weight` differs from 50.

### Component 2: Issue Pressure (default 30 points)

Ratio = `open_issues / max(stars, 1)`

| Ratio     | Points |
|----------:|-------:|
| < 0.05    | 30     |
| 0.05–0.15 | 20     |
| 0.15–0.30 | 10     |
| >= 0.30   | 0      |

Points are scaled proportionally when `pressure-weight` differs from 30.

### Component 3: Base Health (default 20 points)

- 20 points by default
- Deduct 10 if `open_issues_count > 500`

Points are scaled proportionally when `base-weight` differs from 20.

### Status Bands

Status is determined by the percentage of max possible score (sum of weights):

| Score % | Status   |
|--------:|----------|
| 80–100% | HEALTHY  |
| 60–79%  | WATCH    |
| 40–59%  | CONCERN  |
| 0–39%   | AT RISK  |
| —       | ARCHIVED |

## File Structure

```
action.yml                        — GitHub Action metadata and input definitions
tsconfig.json                     — TypeScript compiler config (ES2022, CommonJS, strict)
package.json                      — Dependencies and devDependencies; build and test scripts
src/
  index.ts                        — Orchestrator: loads inputs, validates, wires modules
  types.ts                        — Shared TypeScript interfaces and type aliases
  parse.ts                        — Reads and parses package.json; returns dep name list
  registry.ts                     — npm registry calls; resolves repo slug or skip reason (zod-validated)
  github.ts                       — GitHub REST API calls; returns raw signals per repo (zod-validated)
  score.ts                        — Pure scoring function: RawSignals → ScoredPackage (configurable weights)
  output.ts                       — Formats Markdown/JSON report, writes to stdout + GITHUB_STEP_SUMMARY
  comment.ts                      — Posts/updates PR comments via GitHub REST API
dist/                             — Compiled JavaScript output; committed to repo
test/
  score.test.ts                   — Unit tests for scoring logic (recency, pressure, base health, status bands, weights)
  registry.test.ts                — Unit tests for registry filtering logic (mocked fetch)
  parse.test.ts                   — Unit tests for manifest parsing (protocol filtering, deduplication)
  output.test.ts                  — Unit tests for report formatting (table, skipped, JSON output)
  github.test.ts                  — Unit tests for GitHub API client (rate limits, 404, validation)
  fixtures/
    package.json                  — Sample manifest used by the PR gate workflow
.github/
  workflows/
    pr.yml                        — Runs tests, rebuilds dist/, runs self-check against test fixtures on every PR
    release.yml                   — Updates the floating major version tag on GitHub release
```

## Building

`dist/` is managed automatically by CI — it rebuilds and commits `dist/index.js` on every PR (same-repo PRs only). For local development only:

```bash
npm install
npm run build
# Bundles src/ into a single dist/index.js via @vercel/ncc
```

## Running tests

```bash
npm test
# Runs the Vitest suite (5 test files, 79 tests)
```

## Running locally

Export the required environment variables and run the compiled entry point:

```bash
export INPUT_GITHUB-TOKEN="ghp_your_personal_access_token"
export INPUT_MANIFEST-FILE="package.json"
export INPUT_INCLUDE-DEV="false"
export INPUT_FAIL-THRESHOLD="30"
export INPUT_WARN-THRESHOLD="60"
export INPUT_DOWNLOAD-FLOOR="500000"
export INPUT_IGNORE-PACKAGES=""
export INPUT_COMMENT-ON-PR="false"
export INPUT_OUTPUT-FORMAT="markdown"
export INPUT_RECENCY-WEIGHT="50"
export INPUT_PRESSURE-WEIGHT="30"
export INPUT_BASE-WEIGHT="20"

node dist/index.js
```

To capture the Job Summary output locally:

```bash
export GITHUB_STEP_SUMMARY="/tmp/halflife-summary.md"
node dist/index.js
cat /tmp/halflife-summary.md
```

Point `INPUT_MANIFEST-FILE` at any `package.json` you want to analyze — it does not have to be this repo's own file.

## Cutting a release

1. Merge all changes to `main` — CI will rebuild `dist/` automatically if `src/` changed.
2. Go to **GitHub → Releases → Draft a new release**.
3. Set the tag to the next semver (e.g. `v1.0.0`), target branch `main`.
4. Write release notes and click **Publish release**.
5. The release workflow runs automatically and creates/updates the `v1` floating tag.

Users referencing `pjahanlou/halflife@v1` will get the new release on their next workflow run. For breaking changes, bump to `v2.0.0` — the workflow will create a `v2` floating tag automatically.
