import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseManifest } from '../src/parse';
import { ActionInputs } from '../src/types';
import * as fs from 'fs';

vi.mock('fs');

const baseInputs: ActionInputs = {
  githubToken: 'token',
  manifestFile: '/tmp/package.json',
  includeDev: false,
  failThreshold: 30,
  warnThreshold: 60,
  downloadFloor: 500000,
  ignorePackages: [],
  commentOnPr: false,
  outputFormat: 'markdown',
  weights: { recency: 50, pressure: 30, base: 20 },
};

function mockManifest(content: Record<string, unknown>) {
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(content));
}

describe('parseManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns dependency names from dependencies', () => {
    mockManifest({ dependencies: { lodash: '^4.0.0', axios: '^1.0.0' } });
    const result = parseManifest(baseInputs);
    expect(result).toEqual(expect.arrayContaining(['lodash', 'axios']));
    expect(result).toHaveLength(2);
  });

  it('includes devDependencies when includeDev is true', () => {
    mockManifest({
      dependencies: { lodash: '^4.0.0' },
      devDependencies: { vitest: '^2.0.0' },
    });
    const result = parseManifest({ ...baseInputs, includeDev: true });
    expect(result).toEqual(expect.arrayContaining(['lodash', 'vitest']));
    expect(result).toHaveLength(2);
  });

  it('excludes devDependencies when includeDev is false', () => {
    mockManifest({
      dependencies: { lodash: '^4.0.0' },
      devDependencies: { vitest: '^2.0.0' },
    });
    const result = parseManifest(baseInputs);
    expect(result).toEqual(['lodash']);
  });

  it('deduplicates packages appearing in both sections', () => {
    mockManifest({
      dependencies: { lodash: '^4.0.0' },
      devDependencies: { lodash: '^4.1.0' },
    });
    const result = parseManifest({ ...baseInputs, includeDev: true });
    expect(result).toEqual(['lodash']);
  });

  it('filters file: prefixed versions', () => {
    mockManifest({ dependencies: { local: 'file:../local', lodash: '^4.0.0' } });
    const result = parseManifest(baseInputs);
    expect(result).toEqual(['lodash']);
  });

  it('filters git+ prefixed versions', () => {
    mockManifest({ dependencies: { repo: 'git+https://github.com/org/repo', lodash: '^4.0.0' } });
    const result = parseManifest(baseInputs);
    expect(result).toEqual(['lodash']);
  });

  it('filters workspace: prefixed versions', () => {
    mockManifest({ dependencies: { shared: 'workspace:*', lodash: '^4.0.0' } });
    const result = parseManifest(baseInputs);
    expect(result).toEqual(['lodash']);
  });

  it('filters npm:, link:, github:, http:, https: prefixed versions', () => {
    mockManifest({
      dependencies: {
        a: 'npm:other@^1.0.0',
        b: 'link:../b',
        c: 'github:org/repo',
        d: 'http://example.com/pkg.tgz',
        e: 'https://example.com/pkg.tgz',
        lodash: '^4.0.0',
      },
    });
    const result = parseManifest(baseInputs);
    expect(result).toEqual(['lodash']);
  });

  it('returns empty array when no dependencies key exists', () => {
    mockManifest({ name: 'test', version: '1.0.0' });
    const result = parseManifest(baseInputs);
    expect(result).toEqual([]);
  });

  it('throws on malformed JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json');
    expect(() => parseManifest(baseInputs)).toThrow();
  });

  it('throws on nonexistent file', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    expect(() => parseManifest(baseInputs)).toThrow('ENOENT');
  });
});
