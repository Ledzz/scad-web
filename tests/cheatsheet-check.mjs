// node tests/cheatsheet-check.mjs [path/to/openscad]
//
// Runs every cheatsheet snippet (src/help/cheatsheet.ts) through OpenSCAD
// and fails on a parse error, an ERROR, or an unknown function/module, so
// the Help panel never offers something this OpenSCAD does not have.
// Uses the same experimental features as the app (lazy-union).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cheatsheet } from '../src/help/cheatsheet.ts';

const openscad = process.argv[2] ?? 'openscad-nightly';
const dir = mkdtempSync(join(tmpdir(), 'cheatsheet-'));

// Values for the placeholder names the snippets use, so they evaluate.
const prelude = 'x = 1; y = 2; a = [1, 2, 3]; b = [4, 5, 6]; list = [1, 2, 3]; v = [3, 4, 0]; base = 2; cond = true; value = 0; size = 10;\n';

// Monaco snippet -> plain text: ${1:default} -> default, $0 / ${2} -> a child.
function expand(snippet) {
  return snippet
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}|\$\d+/g, 'cube(1);')
    .replace(/\\\$/g, '$');
}

function program(code) {
  if (/^[*!#%]$/.test(code)) return `${code} cube(1);`;          // modifier character
  if (/ $/.test(code)) return `${code}cube(1);`;                  // transformation awaiting a child
  if (/[;}>]$/.test(code.trim())) return code;                    // statement
  return `echo(${code});`;                                        // expression
}

let failures = 0, count = 0;
for (const section of cheatsheet) {
  for (const entry of section.entries) {
    if (!entry.insert) continue;
    count++;
    const file = join(dir, `t${count}.scad`);
    const echo = join(dir, 'out.echo');
    const src = prelude + program(expand(entry.insert));
    writeFileSync(file, src);
    rmSync(echo, {force: true});
    let out = '';
    try {
      out = execFileSync(openscad, ['--export-format=echo', '-o', echo, '--enable=lazy-union', file],
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    } catch (e) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}\n(exit ${e.status})`;
    }
    // With the echo export, WARNINGs (unknown names among them) go into the file, not stderr.
    if (existsSync(echo)) out += '\n' + readFileSync(echo, 'utf8');
    const bad = out.split('\n').filter(l => /ERROR|Parser error|unknown (function|module)|is not enabled|\(exit /i.test(l));
    if (bad.length) {
      failures++;
      console.log(`FAIL [${section.title}] ${entry.sig}\n  ${src.split('\n').pop()}\n  ${bad.join('\n  ')}`);
    }
  }
}
console.log(`${count - failures}/${count} snippets OK`);
process.exit(failures ? 1 : 0);
