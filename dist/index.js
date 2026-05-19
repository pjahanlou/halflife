/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 248:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.fetchRepoSignals = fetchRepoSignals;
exports.fetchAllRepoSignals = fetchAllRepoSignals;
function parseRateLimitHeaders(res) {
    return {
        remaining: res.headers.get('x-ratelimit-remaining') ?? 'unknown',
        reset: res.headers.get('x-ratelimit-reset') ?? 'unknown',
    };
}
function resetToIso(reset) {
    const ts = parseInt(reset, 10);
    return isNaN(ts) ? reset : new Date(ts * 1000).toISOString();
}
async function fetchRepoSignals(packageName, slug, token) {
    const res = await fetch(`https://api.github.com/repos/${slug}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'halflife-action',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });
    const { remaining, reset } = parseRateLimitHeaders(res);
    const remainingNum = parseInt(remaining, 10);
    if (!isNaN(remainingNum) && remainingNum < 100) {
        console.log(`[halflife] Rate limit warning: ${remaining} requests remaining, resets at ${resetToIso(reset)}`);
    }
    if (res.status === 404) {
        return {
            skipped: { name: packageName, reason: 'not_found', detail: `GitHub repo not found: ${slug}` },
        };
    }
    if (res.status === 403 || res.status === 429) {
        throw new Error(`GitHub API rate limit hit for ${slug}. ` +
            `x-ratelimit-remaining: ${remaining}, ` +
            `x-ratelimit-reset: ${reset} (${resetToIso(reset)})`);
    }
    if (!res.ok) {
        throw new Error(`GitHub API returned ${res.status} for ${slug}`);
    }
    const data = (await res.json());
    return {
        signals: {
            name: packageName,
            repo: slug,
            archived: data.archived,
            pushed_at: data.pushed_at,
            open_issues_count: data.open_issues_count,
            stargazers_count: data.stargazers_count,
        },
    };
}
async function fetchAllRepoSignals(packages, token) {
    const results = new Map();
    for (const { name, slug } of packages) {
        results.set(name, await fetchRepoSignals(name, slug, token));
    }
    return results;
}


/***/ }),

/***/ 202:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.writeOutput = writeOutput;
const fs = __importStar(__nccwpck_require__(896));
const STATUS_EMOJI = {
    HEALTHY: ':green_circle:',
    WATCH: ':yellow_circle:',
    CONCERN: ':orange_circle:',
    'AT RISK': ':red_circle:',
    ARCHIVED: ':black_circle:',
};
function formatTable(packages) {
    const lines = [
        '| Package | Score | Status | Days Since Push | Open Issues | Signal |',
        '|---------|------:|--------|----------------:|------------:|--------|',
    ];
    const sorted = [...packages].sort((a, b) => a.score - b.score);
    for (const pkg of sorted) {
        lines.push(`| [\`${pkg.name}\`](https://github.com/${pkg.repo}) ` +
            `| ${pkg.score} ` +
            `| ${STATUS_EMOJI[pkg.status]} ${pkg.status} ` +
            `| ${pkg.days_since_push} ` +
            `| ${pkg.open_issues} ` +
            `| ${pkg.top_signal} |`);
    }
    return lines.join('\n');
}
function formatSkipped(skipped) {
    if (skipped.length === 0)
        return '';
    const lines = [
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
function buildReport(scored, skipped, failThreshold, warnThreshold) {
    const date = new Date().toISOString().split('T')[0];
    const total = scored.length + skipped.length;
    const lines = [
        '## Halflife — Dependency Health Report',
        `_Generated on ${date}_`,
        '',
        `Scanned **${total}** packages — **${scored.length}** tracked, **${skipped.length}** skipped`,
        '',
    ];
    if (scored.length > 0) {
        lines.push(formatTable(scored), '');
    }
    else {
        lines.push('_No packages were tracked (all were skipped or filtered)._', '');
    }
    if (skipped.length > 0) {
        lines.push(formatSkipped(skipped), '');
    }
    const failing = scored.filter((p) => p.status === 'ARCHIVED' || p.score < failThreshold);
    const warning = scored.filter((p) => p.status !== 'ARCHIVED' && p.score >= failThreshold && p.score < warnThreshold);
    let exitCode = 0;
    if (failing.length > 0) {
        lines.push('### Failure Summary', `The following ${failing.length} package(s) are ARCHIVED or scored below the fail threshold (${failThreshold}):`, ...failing.map((p) => `- \`${p.name}\` — score **${p.score}** (${p.status}): ${p.top_signal}`), '');
        exitCode = 1;
    }
    if (warning.length > 0) {
        lines.push('### Warning Summary', `The following ${warning.length} package(s) scored below the warn threshold (${warnThreshold}):`, ...warning.map((p) => `- \`${p.name}\` — score **${p.score}** (${p.status}): ${p.top_signal}`), '');
    }
    return { content: lines.join('\n'), exitCode };
}
function writeOutput(scored, skipped, failThreshold, warnThreshold) {
    const { content, exitCode } = buildReport(scored, skipped, failThreshold, warnThreshold);
    console.log(content);
    const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
    if (summaryPath) {
        try {
            fs.appendFileSync(summaryPath, content + '\n');
        }
        catch (err) {
            console.error(`[halflife] Failed to write to GITHUB_STEP_SUMMARY: ${err}`);
        }
    }
    process.exit(exitCode);
}


/***/ }),

/***/ 828:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseManifest = parseManifest;
const fs = __importStar(__nccwpck_require__(896));
function parseManifest(inputs) {
    const raw = fs.readFileSync(inputs.manifestFile, 'utf-8');
    const manifest = JSON.parse(raw);
    const depSections = ['dependencies'];
    if (inputs.includeDev) {
        depSections.push('devDependencies');
    }
    const names = new Set();
    for (const section of depSections) {
        const block = manifest[section];
        if (block && typeof block === 'object') {
            for (const [name, value] of Object.entries(block)) {
                if (typeof value === 'string' && (value.startsWith('file:') || value.startsWith('git+'))) {
                    continue;
                }
                names.add(name);
            }
        }
    }
    return Array.from(names);
}


/***/ }),

/***/ 976:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolvePackages = resolvePackages;
function cleanGitUrl(raw) {
    const url = raw
        .replace(/^git\+https?:\/\//, 'https://')
        .replace(/^git:\/\//, 'https://')
        .replace(/^git\+ssh:\/\/git@/, 'https://')
        .replace(/^ssh:\/\/git@/, 'https://')
        .replace(/\.git$/, '');
    const match = url.match(/github\.com[/:]([^/]+\/[^/]+)/);
    if (!match)
        return null;
    return match[1];
}
function getLicenseString(license) {
    if (!license)
        return '';
    if (typeof license === 'string')
        return license;
    if (typeof license === 'object' && license.type)
        return license.type;
    return '';
}
function encodePackageName(name) {
    return encodeURIComponent(name).replace('%40', '@').replace('%2F', '/');
}
async function fetchRegistry(name) {
    const url = `https://registry.npmjs.org/${encodePackageName(name)}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`npm registry returned ${res.status} for ${name}`);
    }
    return res.json();
}
async function fetchDownloads(name) {
    const url = `https://api.npmjs.org/downloads/point/last-month/${encodePackageName(name)}`;
    const res = await fetch(url);
    if (!res.ok)
        return 0;
    const data = (await res.json());
    return data.downloads ?? 0;
}
async function resolvePackage(name, inputs) {
    let pkg;
    try {
        pkg = await fetchRegistry(name);
    }
    catch (err) {
        return { skipped: { name, reason: 'untrackable', detail: String(err) } };
    }
    const rawUrl = pkg.repository?.url ?? '';
    const slug = rawUrl ? cleanGitUrl(rawUrl) : null;
    if (!slug) {
        return {
            skipped: {
                name,
                reason: 'untrackable',
                detail: rawUrl ? `Non-GitHub repository: ${rawUrl}` : 'No repository URL',
            },
        };
    }
    const licenseStr = getLicenseString(pkg.license);
    if (!licenseStr ||
        licenseStr.toUpperCase() === 'UNLICENSED' ||
        licenseStr.toLowerCase().includes('proprietary')) {
        return {
            skipped: {
                name,
                reason: 'proprietary',
                detail: licenseStr || 'No license field',
            },
        };
    }
    const downloads = await fetchDownloads(name);
    if (downloads > inputs.downloadFloor) {
        return {
            skipped: {
                name,
                reason: 'established',
                detail: `${downloads.toLocaleString()} downloads/month`,
            },
        };
    }
    return { slug };
}
async function resolvePackages(names, inputs) {
    const results = new Map();
    const CONCURRENCY = 5;
    for (let i = 0; i < names.length; i += CONCURRENCY) {
        const batch = names.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(batch.map((name) => resolvePackage(name, inputs)));
        for (let j = 0; j < batch.length; j++) {
            const name = batch[j];
            const result = settled[j];
            if (result.status === 'fulfilled') {
                results.set(name, result.value);
            }
            else {
                results.set(name, {
                    skipped: { name, reason: 'untrackable', detail: String(result.reason) },
                });
            }
        }
    }
    return results;
}


/***/ }),

/***/ 9:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.scorePackage = scorePackage;
function daysSince(isoDate) {
    return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}
function recencyScore(days) {
    if (days <= 30)
        return { points: 50, signal: null };
    if (days <= 60)
        return { points: 40, signal: `Last push ${days} days ago` };
    if (days <= 90)
        return { points: 30, signal: `Last push ${days} days ago` };
    if (days <= 180)
        return { points: 15, signal: `Last push ${days} days ago` };
    if (days <= 365)
        return { points: 5, signal: `Last push ${days} days ago` };
    return { points: 0, signal: `No push in over a year (${days} days)` };
}
function issuePressureScore(openIssues, stars) {
    const ratio = openIssues / Math.max(stars, 1);
    if (ratio < 0.05)
        return { points: 30, signal: null };
    if (ratio < 0.15)
        return { points: 20, signal: `Issue ratio ${ratio.toFixed(2)} (moderate)` };
    if (ratio < 0.30)
        return { points: 10, signal: `High issue ratio ${ratio.toFixed(2)}` };
    return { points: 0, signal: `Very high issue ratio ${ratio.toFixed(2)} (${openIssues} open issues)` };
}
function baseHealthScore(openIssues) {
    if (openIssues > 500) {
        return { points: 10, signal: `${openIssues} open issues (high absolute count)` };
    }
    return { points: 20, signal: null };
}
function statusBand(score) {
    if (score >= 80)
        return 'HEALTHY';
    if (score >= 60)
        return 'WATCH';
    if (score >= 40)
        return 'CONCERN';
    return 'AT RISK';
}
function scorePackage(signals) {
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
    const negativeSignals = [];
    if (recency.signal)
        negativeSignals.push({ signal: recency.signal, deduction: 50 - recency.points });
    if (pressure.signal)
        negativeSignals.push({ signal: pressure.signal, deduction: 30 - pressure.points });
    if (base.signal)
        negativeSignals.push({ signal: base.signal, deduction: 20 - base.points });
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


/***/ }),

/***/ 896:
/***/ ((module) => {

module.exports = require("fs");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it uses a non-standard name for the exports (exports).
(() => {
var exports = __webpack_exports__;

Object.defineProperty(exports, "__esModule", ({ value: true }));
const parse_1 = __nccwpck_require__(828);
const registry_1 = __nccwpck_require__(976);
const github_1 = __nccwpck_require__(248);
const score_1 = __nccwpck_require__(9);
const output_1 = __nccwpck_require__(202);
function loadInputs() {
    const githubToken = process.env['INPUT_GITHUB-TOKEN'] ?? '';
    const manifestFile = process.env['INPUT_MANIFEST-FILE'] ?? 'package.json';
    const includeDev = (process.env['INPUT_INCLUDE-DEV'] ?? 'false').toLowerCase() === 'true';
    const failThreshold = parseInt(process.env['INPUT_FAIL-THRESHOLD'] ?? '30', 10);
    const warnThreshold = parseInt(process.env['INPUT_WARN-THRESHOLD'] ?? '60', 10);
    const downloadFloor = parseInt(process.env['INPUT_DOWNLOAD-FLOOR'] ?? '500000', 10);
    if (!githubToken) {
        throw new Error('Input "github-token" is required. Set it explicitly or ensure ${{ github.token }} is passed.');
    }
    if (isNaN(failThreshold) || isNaN(warnThreshold) || isNaN(downloadFloor)) {
        throw new Error('Numeric inputs (fail-threshold, warn-threshold, download-floor) must be valid integers.');
    }
    return { githubToken, manifestFile, includeDev, failThreshold, warnThreshold, downloadFloor };
}
async function main() {
    const inputs = loadInputs();
    console.log(`[halflife] Reading manifest: ${inputs.manifestFile}`);
    const packageNames = (0, parse_1.parseManifest)(inputs);
    console.log(`[halflife] Found ${packageNames.length} packages to evaluate`);
    console.log('[halflife] Resolving npm registry metadata...');
    const registryResults = await (0, registry_1.resolvePackages)(packageNames, inputs);
    const toFetch = [];
    const skipped = [];
    for (const [name, result] of registryResults) {
        if ('slug' in result) {
            toFetch.push({ name, slug: result.slug });
        }
        else {
            skipped.push(result.skipped);
        }
    }
    console.log(`[halflife] ${toFetch.length} packages resolved to GitHub repos, ${skipped.length} skipped`);
    console.log('[halflife] Fetching GitHub repository signals...');
    const githubResults = await (0, github_1.fetchAllRepoSignals)(toFetch, inputs.githubToken);
    const scored = [];
    for (const { name } of toFetch) {
        const result = githubResults.get(name);
        if (!result)
            continue;
        if ('skipped' in result) {
            skipped.push(result.skipped);
        }
        else {
            const pkg = (0, score_1.scorePackage)(result.signals);
            scored.push(pkg);
            console.log(`[halflife] ${pkg.name}: score=${pkg.score}, status=${pkg.status}`);
        }
    }
    (0, output_1.writeOutput)(scored, skipped, inputs.failThreshold, inputs.warnThreshold);
}
main().catch((err) => {
    console.error(`[halflife] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});

})();

module.exports = __webpack_exports__;
/******/ })()
;