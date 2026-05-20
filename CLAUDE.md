# Halflife

Halflife is a GitHub Action that scores the health of your open-source npm dependencies. It reads your `package.json`, filters out well-established or untrackable packages, queries the GitHub REST API for each remaining dependency's repository signals, scores them, and reports results as a GitHub Actions Job Summary.

## What it does

1. Parses your `package.json` to extract dependency names.
2. For each package, calls the npm registry to find its GitHub repository URL.
3. Filters out packages that are proprietary, have no GitHub repo, or exceed the download floor (they have institutional maintenance guarantees).
4. Fetches live GitHub repo signals: last push date, open issue count, star count, archived status.
5. Scores each package 0–100 based on three components (see Scoring Model below).
6. Writes a Markdown report to the GitHub Job Summary and stdout.
7. Exits with code 1 if any package is ARCHIVED or scores below `fail-threshold`.

## Scoring Model

Scores are composed of three weighted components totalling 100 points.

### Component 1: Commit Recency (50 points)

| Days Since Last Push | Points |
|---------------------:|-------:|
| 0–30                 | 50     |
| 31–60                | 40     |
| 61–90                | 30     |
| 91–180               | 15     |
| 181–365              | 5      |
| 365+                 | 0      |

### Component 2: Issue Pressure (30 points)

Ratio = `open_issues / max(stars, 1)`

| Ratio     | Points |
|----------:|-------:|
| < 0.05    | 30     |
| 0.05–0.15 | 20     |
| 0.15–0.30 | 10     |
| > 0.30    | 0      |

### Component 3: Base Health (20 points)

- 20 points by default
- Deduct 10 if `open_issues_count > 500`

### Status Bands

| Score Range | Status   |
|------------:|----------|
| 80–100      | HEALTHY  |
| 60–79       | WATCH    |
| 40–59       | CONCERN  |
| 0–39        | AT RISK  |
| archived    | ARCHIVED |

## File Structure

```
action.yml                        — GitHub Action metadata and input definitions
tsconfig.json                     — TypeScript compiler config (ES2022, CommonJS, strict)
package.json                      — devDependencies only; build and test scripts
src/
  index.ts                        — Orchestrator: loads inputs, wires modules, no business logic
  types.ts                        — Shared TypeScript interfaces and type aliases
  parse.ts                        — Reads and parses package.json; returns dep name list
  registry.ts                     — npm registry calls; resolves repo slug or skip reason
  github.ts                       — GitHub REST API calls; returns raw signals per repo
  score.ts                        — Pure scoring function: RawSignals → ScoredPackage
  output.ts                       — Formats Markdown report, writes to stdout + GITHUB_STEP_SUMMARY
dist/                             — Compiled JavaScript output; committed to repo
test/
  score.test.ts                   — Unit tests for scoring logic (recency, pressure, base health, status bands)
  registry.test.ts                — Unit tests for registry filtering logic (mocked fetch)
  fixtures/
    package.json                  — Sample manifest used by the PR gate workflow
.github/
  workflows/
    pr.yml                        — Rebuilds dist/ and runs the self-check against test fixtures on every PR
    release.yml                   — Updates the floating major version tag on GitHub release
```

## Building

`dist/` is managed automatically by CI — it rebuilds and commits `dist/index.js` on every PR. For local development only:

```bash
npm install
npm run build
# Bundles src/ into a single dist/index.js via @vercel/ncc
```

## Running tests

```bash
npm test
# Runs the Vitest suite (test/score.test.ts and test/registry.test.ts)
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
