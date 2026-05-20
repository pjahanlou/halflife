import * as fs from 'fs';
import { ActionInputs } from './types';

export function parseManifest(inputs: ActionInputs): string[] {
  const raw = fs.readFileSync(inputs.manifestFile, 'utf-8');
  const manifest = JSON.parse(raw) as Record<string, unknown>;

  const depSections: string[] = ['dependencies'];
  if (inputs.includeDev) {
    depSections.push('devDependencies');
  }

  const names = new Set<string>();

  for (const section of depSections) {
    const block = manifest[section];
    if (block && typeof block === 'object') {
      for (const [name, value] of Object.entries(block as Record<string, string>)) {
        if (typeof value === 'string' && (value.startsWith('file:') || value.startsWith('git+'))) {
          continue;
        }
        names.add(name);
      }
    }
  }

  return Array.from(names);
}
