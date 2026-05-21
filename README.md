# Halflife

**Dependency decay checker for npm projects.**

Halflife scans your `package.json`, queries the npm registry and GitHub API for each open-source dependency, scores them 0–100 based on maintenance signals, and publishes a report to your GitHub Actions Job Summary. Unhealthy or archived packages fail the build.

---

## Usage

```yaml
- name: Check dependency health
  uses: pjahanlou/halflife@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Full example with all options:

```yaml
name: Dependency Health

on:
  push:
    branches: [main]

jobs:
  halflife:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pjahanlou/halflife@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          manifest-file: package.json
          include-dev: false
          fail-threshold: 30
          warn-threshold: 60
          download-floor: 500000
          ignore-packages: ''
          output-format: markdown
          recency-weight: 50
          pressure-weight: 30
          base-weight: 20
```

PR comment mode (posts results as a comment on pull requests):

```yaml
name: Dependency Health (PR)

on:
  pull_request:
    branches: [main]

permissions:
  pull-requests: write

jobs:
  halflife:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pjahanlou/halflife@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          comment-on-pr: true
```

---

## Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `github-token` | string | `${{ github.token }}` | Token for GitHub REST API calls |
| `manifest-file` | string | `package.json` | Path to the manifest to analyze |
| `include-dev` | boolean | `false` | Also check `devDependencies` |
| `fail-threshold` | number | `30` | Exit 1 if any package scores below this |
| `warn-threshold` | number | `60` | Print a warning if any package scores below this |
| `download-floor` | number | `500000` | Skip packages with this many or more monthly downloads |
| `ignore-packages` | string | `''` | Comma-separated list of package names to skip |
| `comment-on-pr` | boolean | `false` | Post results as a PR comment (requires `pull-requests: write`) |
| `output-format` | string | `markdown` | Output format: `markdown`, `json`, or `both` |
| `recency-weight` | number | `50` | Max points for commit recency component |
| `pressure-weight` | number | `30` | Max points for issue pressure component |
| `base-weight` | number | `20` | Max points for base health component |

---

## How it works

1. **Parse** — reads `dependencies` (and optionally `devDependencies`) from your manifest. Filters `file:`, `git+`, `workspace:`, `npm:`, `link:`, `github:`, `http:`, and `https:` entries. Removes any packages listed in `ignore-packages`.
2. **Filter via npm registry** — for each package, fetches its `/latest` metadata from the npm registry to find the GitHub repo URL. Skips packages with no GitHub URL, a proprietary/missing license, or monthly downloads at or above `download-floor`.
3. **Fetch GitHub signals** — for each remaining package, calls `GET /repos/{owner}/{repo}` to get: last push date, open issue count, star count, archived status. Halts immediately if a rate limit is hit.
4. **Score** — computes a weighted score from three components (see below). Weights are configurable.
5. **Report** — writes a Markdown table and/or JSON to the GitHub Job Summary and stdout. Optionally posts a PR comment. Exits 1 if any package is archived or below `fail-threshold`.

---

## Scoring model

Scores are composed of three weighted components. The default total is 100, but this changes if you customize the weights.

### Commit recency — default 50 points

| Days since last push | Points |
|---------------------:|-------:|
| 0–30 | 50 |
| 31–60 | 40 |
| 61–90 | 30 |
| 91–180 | 15 |
| 181–365 | 5 |
| 365+ | 0 |

### Issue pressure — default 30 points

Ratio = `open_issues / max(stars, 1)`

| Ratio | Points |
|------:|-------:|
| < 0.05 | 30 |
| 0.05–0.15 | 20 |
| 0.15–0.30 | 10 |
| >= 0.30 | 0 |

### Base health — default 20 points

20 points by default. Deduct 10 if `open_issues > 500`.

### Custom weights example

To prioritize issue pressure over recency:

```yaml
- uses: pjahanlou/halflife@v1
  with:
    recency-weight: 30
    pressure-weight: 50
    base-weight: 20
```

### Status bands

Status is based on the percentage of the max score (sum of all weights):

| Score % | Status |
|--------:|--------|
| 80–100% | HEALTHY |
| 60–79% | WATCH |
| 40–59% | CONCERN |
| 0–39% | AT RISK |
| — | ARCHIVED |

---

## Skip reasons

Packages that cannot be meaningfully tracked are excluded from scoring and listed in a collapsible section of the report.

| Reason | Meaning |
|--------|---------|
| `untrackable` | No GitHub repository URL in npm registry metadata |
| `proprietary` | License is absent, `UNLICENSED`, or contains "proprietary" |
| `established` | Monthly downloads meet or exceed `download-floor` — institutionally maintained |
| `not_found` | GitHub returned 404 for the repository |
| `ignored` | Package listed in the `ignore-packages` input |

---

## Output

The action writes a report to `GITHUB_STEP_SUMMARY` (visible in the Actions UI under the job summary tab) and/or stdout, depending on `output-format`.

### Markdown output (default)

- A summary line: `Scanned N packages — Y tracked, Z skipped`
- A table of scored packages sorted by score ascending (worst first), with a Signal column showing up to three contributing factors ordered by impact
- A collapsible list of skipped packages with reasons
- A failure summary if any package is archived or below `fail-threshold`
- A warning summary if any package is below `warn-threshold`

### JSON output

When `output-format` is `json` or `both`, structured JSON is written to stdout and set as the `report-json` action output. Downstream steps can consume it:

```yaml
- uses: pjahanlou/halflife@v1
  id: halflife
  with:
    output-format: both

- run: echo '${{ steps.halflife.outputs.report-json }}' | jq '.scored[] | select(.score < 50)'
```

### PR comment

When `comment-on-pr` is `true`, the Markdown report is posted as a comment on the pull request. On subsequent runs, the existing comment is updated instead of creating a new one. Requires `pull-requests: write` permission.

**Exit codes:** `0` — all packages healthy or warned. `1` — one or more packages archived or below `fail-threshold`.

---

## Local testing

```bash
export INPUT_GITHUB-TOKEN="ghp_your_token"
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
export GITHUB_STEP_SUMMARY="/tmp/halflife-summary.md"

node dist/index.js
```
