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

Full example:

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
| `download-floor` | number | `500000` | Skip packages with more monthly downloads than this |

---

## How it works

1. **Parse** — reads `dependencies` (and optionally `devDependencies`) from your manifest. Strips `file:` and `git+` entries.
2. **Filter via npm registry** — for each package, fetches its registry metadata to find the GitHub repo URL. Skips packages with no GitHub URL, a proprietary/missing license, or monthly downloads above `download-floor`.
3. **Fetch GitHub signals** — for each remaining package, calls `GET /repos/{owner}/{repo}` to get: last push date, open issue count, star count, archived status.
4. **Score** — computes a 0–100 score from three components (see below).
5. **Report** — writes a Markdown table to the GitHub Job Summary and stdout. Exits 1 if any package is archived or below `fail-threshold`.

---

## Scoring model

Scores are composed of three weighted components.

### Commit recency — 50 points

| Days since last push | Points |
|---------------------:|-------:|
| 0–30 | 50 |
| 31–60 | 40 |
| 61–90 | 30 |
| 91–180 | 15 |
| 181–365 | 5 |
| 365+ | 0 |

### Issue pressure — 30 points

Ratio = `open_issues / max(stars, 1)`

| Ratio | Points |
|------:|-------:|
| < 0.05 | 30 |
| 0.05–0.15 | 20 |
| 0.15–0.30 | 10 |
| > 0.30 | 0 |

### Base health — 20 points

20 points by default. Deduct 10 if `open_issues > 500`.

### Status bands

| Score | Status |
|------:|--------|
| 80–100 | HEALTHY |
| 60–79 | WATCH |
| 40–59 | CONCERN |
| 0–39 | AT RISK |
| — | ARCHIVED |

---

## Skip reasons

Packages that cannot be meaningfully tracked are excluded from scoring and listed in a collapsible section of the report.

| Reason | Meaning |
|--------|---------|
| `untrackable` | No GitHub repository URL in npm registry metadata |
| `proprietary` | License is absent, `UNLICENSED`, or contains "proprietary" |
| `established` | Monthly downloads exceed `download-floor` — institutionally maintained |
| `not_found` | GitHub returned 404 for the repository |

---

## Output

The action writes a Markdown report to `GITHUB_STEP_SUMMARY` (visible in the Actions UI under the job summary tab) and to stdout. The report includes:

- A summary line: `Scanned N packages — Y tracked, Z skipped`
- A table of scored packages sorted by score ascending (worst first), with a Signal column showing up to three contributing factors ordered by impact (e.g. `No commits in 280 days · High issue-to-star ratio (0.42)`)
- A collapsible list of skipped packages with reasons
- A failure summary if any package is archived or below `fail-threshold`
- A warning summary if any package is below `warn-threshold`

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
export GITHUB_STEP_SUMMARY="/tmp/halflife-summary.md"

node dist/index.js
```
