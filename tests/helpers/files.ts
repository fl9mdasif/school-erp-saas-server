import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const glob = (dir: string, ext: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? glob(p, ext) : p.endsWith(ext) ? [p] : [];
  });
