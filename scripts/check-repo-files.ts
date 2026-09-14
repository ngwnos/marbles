import {lstatSync} from 'node:fs';

// Check Git's stored bytes, not compressed pack sizes or LFS pointer estimates.
const limit = 24 * 1024 * 1024;
const history = process.argv.includes('--history');
function git(args: string[], input?: string) {
  const result = Bun.spawnSync(['git', ...args], {
    stdin: input === undefined ? undefined : Buffer.from(input),
    stdout: 'pipe', stderr: 'pipe',
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

const root = git(['rev-parse', '--show-toplevel']).trim();
process.chdir(root);
const objects = new Map<string, string>();
const files = new Set<string>();
for (const entry of git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean)) {
  const tab = entry.indexOf('\t');
  const [mode, oid, stage] = entry.slice(0, tab).split(' ');
  const path = entry.slice(tab + 1);
  if (stage !== '0') throw new Error(`Resolve the merge conflict in ${path} before checking files`);
  if (mode === '160000') continue; // A submodule entry is a commit, not a file.
  objects.set(oid, path);
  files.add(path);
}
if (history) {
  for (const line of git(['rev-list', '--objects', '--all']).split('\n').filter(Boolean)) {
    const space = line.indexOf(' ');
    objects.set(space < 0 ? line : line.slice(0, space), space < 0 ? line : line.slice(space + 1));
  }
}

const failures: string[] = [];
let largest = {bytes: 0, path: ''};
let blobs = 0;
const inspect = (bytes: number, path: string, source: string) => {
  if (bytes > largest.bytes) largest = {bytes, path};
  if (bytes >= limit) failures.push(`${path} (${source}): ${bytes} bytes; must be below ${limit}`);
};
if (objects.size) {
  const output = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], [...objects.keys()].join('\n') + '\n');
  for (const line of output.trim().split('\n')) {
    const [oid, type, size] = line.split(' ');
    if (type === 'missing') throw new Error(`Missing Git object: ${oid}`);
    if (type !== 'blob') continue;
    blobs++;
    inspect(Number(size), objects.get(oid)!, 'Git blob');
  }
}
// Also catch an oversized working-tree edit before it has been staged.
for (const path of files) {
  try {
    const stat = lstatSync(path);
    if (stat.isFile()) inspect(stat.size, path, 'working tree');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${files.size} tracked files and ${blobs} ${history ? 'historical/indexed' : 'indexed'} blobs are below 24 MiB.`);
  if (largest.path) console.log(`Largest: ${largest.path} (${(largest.bytes / 1024 ** 2).toFixed(2)} MiB).`);
}
