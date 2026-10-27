// Formatting for the editor, with the same guarantee as the scad-fmt CLI:
// Topiary formats the source, and the result is used only if OpenSCAD parses
// it to the SAME AST as the original — so only whitespace, line breaks and
// comment layout can change, never the code.

import { spawnOpenSCAD, warmUpOpenSCAD } from '../runner/openscad-runner.ts';
import { Source } from '../state/app-state.ts';
import type { FormatRequest, FormatResponse } from './formatter-worker.ts';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, {resolve: (s: string) => void, reject: (e: Error) => void}>();

function topiary(source: string): Promise<string> {
  if (!worker) {
    worker = new Worker('./formatter-worker.js');
    worker.onmessage = (e: MessageEvent<FormatResponse>) => {
      const job = pending.get(e.data.id);
      pending.delete(e.data.id);
      if ('error' in e.data) job?.reject(new Error(e.data.error));
      else job?.resolve(e.data.formatted);
    };
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, {resolve, reject});
    worker!.postMessage({id, source} satisfies FormatRequest);
  });
}

// Start loading the formatter before the first save needs it.
export function preloadFormatter() {
  topiary('').catch(() => {});
  warmUpOpenSCAD('format');
}

// OpenSCAD's .ast export: the parsed program, printed without comments or
// layout. Libraries are not mounted, so a library include is missing in BOTH
// runs alike; the user's other files are passed so relative includes resolve.
async function ast(path: string, sources: Source[], content: string): Promise<string | null> {
  const out = '/scad-fmt.ast';
  const result = await spawnOpenSCAD({
    mountArchives: false,
    inputs: sources.map(s => s.path === path ? {path, content} : s),
    args: [path, '-o', out],
    outputPaths: [out],
  }, () => {}, 'format');
  const [output] = result.outputs ?? [];
  if (result.exitCode !== 0 || !output) return null;
  return new TextDecoder().decode(output[1] as unknown as Uint8Array);
}

export class FormatSkipped extends Error {}

/** The formatted source (=== source if already formatted); throws FormatSkipped with the reason otherwise. */
export async function formatScad(path: string, sources: Source[], source: string): Promise<string> {
  let formatted: string;
  try {
    formatted = await topiary(source);
  } catch (e) {
    throw new FormatSkipped("Topiary can't parse it", {cause: e});
  }
  if (formatted === source) return source;

  const before = await ast(path, sources, source);
  const after = await ast(path, sources, formatted);
  if (!before) throw new FormatSkipped("OpenSCAD can't parse it");
  if (before !== after) throw new FormatSkipped('formatting would change the code');
  return formatted;
}
