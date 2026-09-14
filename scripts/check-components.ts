import { mkdir } from 'node:fs/promises';

// Keep each simulation in a fresh process so global physics state cannot leak
// between components. Save full diagnostics without flooding the terminal.
const checks = [
  ['stacked-entrances', 'scripts/test-stacked-entrances.ts'],
  ['surface-normals', 'scripts/refresh-component-normals.ts', '--check'],
  ['preview-drops', 'scripts/test-preview-drops.ts', '--offsets'],
  ['base', 'scripts/test-base-drops.ts'],
  ['landing', 'scripts/test-landing-drops.ts'],
  ['jump', 'scripts/test-jump-drops.ts'],
  ['jump-transfer', 'scripts/test-jump-transfer.ts'],
  ['split', 'scripts/test-split-drops.ts'],
  ['finish', 'scripts/test-finish-drops.ts'],
  ['passing', 'scripts/test-passing-drops.ts'],
  ['hairpin', 'scripts/test-hairpin-drops.ts'],
  ['start', 'scripts/test-start-drops.ts'],
  ['extension', 'scripts/test-extension.ts'],
  ['coupler', 'scripts/test-coupler.ts'],
  ['starter-funnel', 'scripts/test-starter-funnel.ts'],
  ['coil', 'scripts/test-coil-drops.ts'],
  ['alignment', 'scripts/check-component-alignment.ts'],
];
await mkdir('tmp/component-checks', { recursive: true });
const failed: string[] = [];
for (const [name, ...args] of checks) {
  const log = `tmp/component-checks/${name}.log`;
  const output = Bun.file(log);
  const process = Bun.spawn([Bun.which('bun')!, ...args], {
    stdout: output, stderr: output,
  });
  const code = await process.exited;
  console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${name} (${log})`);
  if (code !== 0) failed.push(name);
}
if (failed.length) throw new Error(`Component checks failed: ${failed.join(', ')}`);
console.log(`All ${checks.length} component checks passed.`);
