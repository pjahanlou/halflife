import * as core from '@actions/core';
import { z } from 'zod';
import { ActionInputs, SkippedPackage } from './types';

export type RegistryResult =
  | { slug: string }
  | { skipped: SkippedPackage };

const NpmPackageSchema = z.object({
  repository: z.object({ url: z.string().optional() }).optional(),
  license: z.union([
    z.string(),
    z.object({ type: z.string().optional() }),
    z.array(z.union([z.string(), z.object({ type: z.string().optional() })])),
  ]).optional(),
});

const NpmDownloadsSchema = z.object({
  downloads: z.number().optional(),
});

type NpmPackage = z.infer<typeof NpmPackageSchema>;

function cleanGitUrl(raw: string): string | null {
  const url = raw
    .replace(/^git\+https?:\/\//, 'https://')
    .replace(/^git:\/\//, 'https://')
    .replace(/^git\+ssh:\/\/git@/, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '');

  const match = url.match(/github\.com[/:]([^/]+\/[^/#?]+)/);
  if (!match) return null;
  return match[1];
}

function getLicenseString(license: NpmPackage['license']): string {
  if (!license) return '';

  if (typeof license === 'string') return license;

  if (Array.isArray(license)) {
    const types = license
      .map(entry => (typeof entry === 'string' ? entry : entry.type ?? ''))
      .filter(Boolean);
    return types.join(' OR ');
  }

  if (license.type) return license.type;
  return '';
}

function encodePackageName(name: string): string {
  return encodeURIComponent(name).replace('%40', '@').replace('%2F', '/');
}

async function fetchRegistry(name: string): Promise<NpmPackage> {
  const url = `https://registry.npmjs.org/${encodePackageName(name)}/latest`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status} for ${name}`);
  }
  return NpmPackageSchema.parse(await res.json());
}

async function fetchDownloads(name: string): Promise<number> {
  const url = `https://api.npmjs.org/downloads/point/last-month/${encodePackageName(name)}`;
  const res = await fetch(url);
  if (!res.ok) return 0;
  const data = NpmDownloadsSchema.parse(await res.json());
  return data.downloads ?? 0;
}

async function resolvePackage(name: string, inputs: ActionInputs): Promise<RegistryResult> {
  let pkg: NpmPackage;
  try {
    pkg = await fetchRegistry(name);
  } catch (err) {
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
  if (
    !licenseStr ||
    licenseStr.toUpperCase() === 'UNLICENSED' ||
    licenseStr.toLowerCase().includes('proprietary')
  ) {
    return {
      skipped: {
        name,
        reason: 'proprietary',
        detail: licenseStr || 'No license field',
      },
    };
  }

  const downloads = await fetchDownloads(name);
  if (downloads >= inputs.downloadFloor) {
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

export async function resolvePackages(
  names: string[],
  inputs: ActionInputs
): Promise<Map<string, RegistryResult>> {
  const results = new Map<string, RegistryResult>();
  const CONCURRENCY = 5;

  for (let i = 0; i < names.length; i += CONCURRENCY) {
    const batch = names.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((name) => resolvePackage(name, inputs))
    );
    for (let j = 0; j < batch.length; j++) {
      const name = batch[j];
      const result = settled[j];
      if (result.status === 'fulfilled') {
        results.set(name, result.value);
      } else {
        core.warning(`Could not resolve ${name}: ${String(result.reason)}`);
        results.set(name, {
          skipped: { name, reason: 'untrackable', detail: String(result.reason) },
        });
      }
    }
  }

  return results;
}
