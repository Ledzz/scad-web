// WebMCP (https://webmachinelearning.github.io/webmcp/): tools a browser's AI
// agent can call on this page, to read, write and render the code, set the
// customizer's parameters, format, and look things up in the cheatsheet. They
// go through the same Model as the UI, so the editor, viewer and customizer
// show whatever the agent does, and the editor's undo takes its edits back.
// Registered only where the browser has document.modelContext (Chrome 149+
// with chrome://flags/#enable-webmcp-testing, or with an origin trial token).

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { Model } from '../state/model.ts';
import { State } from '../state/app-state.ts';
import { Parameter } from '../state/customizer-types.ts';
import { formatScad } from '../formatter/format.ts';
import { manualUrl, searchCheatsheet } from '../help/cheatsheet.ts';
import { snippetText } from '../language/active-editor.ts';
import { deployedArchiveNames, zipArchives } from '../fs/zip-archives.ts';
import { parseOff } from '../io/import_off.ts';

type ModelContextTool = {
  name: string,
  description: string,
  inputSchema: object,
  annotations?: {readOnlyHint?: boolean, untrustedContentHint?: boolean, consequentialHint?: boolean},
  execute: (input: any, options?: {signal?: AbortSignal}) => Promise<unknown>,
};
type ModelContext = {
  registerTool(tool: ModelContextTool, options?: {signal?: AbortSignal}): Promise<void>,
};

const renderTimeoutMillis = 120_000;
const syntaxCheckTimeoutMillis = 10_000;
const maxLogLines = 80;
const maxDocEntries = 40;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitWhile(busy: () => boolean | undefined, timeoutMillis: number, signal?: AbortSignal) {
  const deadline = Date.now() + timeoutMillis;
  while (busy()) {
    signal?.throwIfAborted();
    if (Date.now() > deadline) return false;
    await sleep(50);
  }
  return true;
}

// A run's result as an agent can use it: what went wrong where, the console
// (ECHO output included) and the size of what came out.
async function runReport(s: State, mode: 'preview' | 'render') {
  const markers = s.lastCheckerRun?.markers ?? [];
  const at = (severity: monaco.MarkerSeverity) => markers
    .filter(m => m.severity === severity)
    .map(m => `line ${m.startLineNumber}: ${m.message}`);
  // A preview runs the code with `$preview=true;` put in front (runner/actions.ts),
  // so the log counts the open file's lines one too high.
  const editorLine = (line: string) => mode !== 'preview' ? line : line.replace(
    /(in file "?([^",]+)"?, line )(\d+)/,
    (all, head, file, n) => file.endsWith(s.params.activePath) ? `${head}${Number(n) - 1}` : all);
  const log = (s.currentRunLogs ?? []).map(([, line]) => editorLine(line));
  return {
    ok: !s.error && !!s.output,
    mode,
    file: s.params.activePath,
    ...(s.error ? {error: s.error} : {}),
    errors: at(monaco.MarkerSeverity.Error),
    warnings: at(monaco.MarkerSeverity.Warning),
    log: log.length > maxLogLines ? [`(${log.length - maxLogLines} earlier lines left out)`, ...log.slice(-maxLogLines)] : log,
    ...(s.output && !s.error ? {
      dimensions: s.is2D ? '2D' : '3D',
      elapsed: s.output.formattedElapsedMillis,
      ...await geometry(s.output.outFile),
    } : {}),
  };
}

// Bounding box and size of the output: an OFF mesh, or for 2D OpenSCAD's SVG,
// whose paths are polygons of "x,y" points with y pointing down.
async function geometry(file: File) {
  const text = await file.text();
  let points: number[][];
  let counts = {};
  if (file.name.endsWith('.svg')) {
    const paths = [...text.matchAll(/ d="([^"]*)"/g)].map(([, d]) => d).join(' ');
    points = [...paths.matchAll(/(-?[\d.]+(?:e[-+]?\d+)?),(-?[\d.]+(?:e[-+]?\d+)?)/g)].map(([, x, y]) => [+x, -y]);
  } else if (file.name.endsWith('.off')) {
    const {vertices, faces} = parseOff(text);
    points = vertices.map(({x, y, z}) => [x, y, z]);
    counts = {vertices: vertices.length, faces: faces.length};
  } else {
    return {};
  }
  if (points.length === 0) return {empty: true};
  const min = [...points[0]], max = [...points[0]];
  for (const p of points) {
    p.forEach((v, i) => { min[i] = Math.min(min[i], v); max[i] = Math.max(max[i], v); });
  }
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  return {
    boundingBox: {min: min.map(round), max: max.map(round), size: max.map((v, i) => round(v - min[i]))},
    ...counts,
  };
}

// Model.render's promise never settles when a newer run supersedes it, and a
// 2D model is rendered again after a failed 3D attempt that it does not wait
// for, so this waits on the model's state instead.
async function run(m: Model, mode: 'preview' | 'render', signal?: AbortSignal) {
  const isPreview = mode === 'preview';
  m.render({isPreview, now: true});
  if (!await waitWhile(() => isPreview ? m.state.previewing : m.state.rendering, renderTimeoutMillis, signal)) {
    throw new Error(`No result after ${renderTimeoutMillis / 1000} s; a newer run (the user editing, say) may have replaced it. Call render_model to try again.`);
  }
  // The syntax check that started with the edit supplies the parameters (and
  // the error markers when the run failed).
  await waitWhile(() => m.state.checkingSyntax, syntaxCheckTimeoutMillis, signal);
  return runReport(m.state, mode);
}

function scadModel(getModel: () => Model) {
  const m = getModel();
  const path = m.state.params.activePath;
  if (!path.endsWith('.scad')) throw new Error(`The open file is ${path}, not OpenSCAD code.`);
  return m;
}

// Why a customizer value does not fit its parameter, if it does not.
function invalidValue(p: Parameter, value: unknown): string | undefined {
  const fit = (v: unknown) => typeof v === p.type && (typeof v !== 'number' || Number.isFinite(v));
  if (Array.isArray(p.initial)) {
    if (!Array.isArray(value) || value.length !== p.initial.length || !value.every(fit)) {
      return `${p.name} takes a list of ${p.initial.length} numbers.`;
    }
  } else if (!fit(value)) {
    return `${p.name} takes a ${p.type}.`;
  }
  if ('options' in p && p.options?.length && !p.options.some(o => o.value === value)) {
    return `${p.name} takes one of ${p.options.map(o => JSON.stringify(o.value)).join(', ')}.`;
  }
  if (p.type === 'number') {
    const {min, max} = p as {min?: number, max?: number};
    const out = (Array.isArray(value) ? value : [value]).some(v => (min != null && v < min) || (max != null && v > max));
    if (out) return `${p.name} ranges from ${min ?? '-∞'} to ${max ?? '∞'}; to go beyond, change its range comment in the code.`;
  }
}

const runResult = 'Returns the result: ok, errors and warnings with line numbers, the console log (ECHO output included) and the bounding box of the output in mm.';

function tools(getModel: () => Model): ModelContextTool[] {
  return [
    {
      name: 'read_scad_code',
      description: 'Get the OpenSCAD code open in the editor: the file path, its full text, the other files of the project, and the customizer values that override the code\'s own.',
      inputSchema: {type: 'object', properties: {}},
      annotations: {readOnlyHint: true, untrustedContentHint: true},
      execute: async () => {
        const m = getModel();
        const {activePath, sources, vars} = m.state.params;
        return {
          path: activePath,
          code: m.source,
          otherFiles: sources.filter(s => s.path !== activePath).map(s => s.path),
          parameterOverrides: vars ?? {},
        };
      },
    },
    {
      name: 'write_scad_code',
      description: `Replace all of the open file's OpenSCAD code, then preview it in the viewer. The user can undo it in the editor. ${runResult}`,
      inputSchema: {
        type: 'object',
        properties: {code: {type: 'string', description: 'The complete new OpenSCAD code.'}},
        required: ['code'],
      },
      execute: async ({code}, options) => {
        if (typeof code !== 'string') throw new Error('code must be a string.');
        const m = scadModel(getModel);
        m.source = code;
        return run(m, 'preview', options?.signal);
      },
    },
    {
      name: 'edit_scad_code',
      description: `Replace one passage of the open file's OpenSCAD code with new text, then preview it in the viewer. The passage must occur exactly once: copy it verbatim from read_scad_code, with enough surrounding lines to be unique. ${runResult}`,
      inputSchema: {
        type: 'object',
        properties: {
          old_text: {type: 'string', description: 'The exact text to replace.'},
          new_text: {type: 'string', description: 'The text to put in its place.'},
        },
        required: ['old_text', 'new_text'],
      },
      execute: async ({old_text, new_text}, options) => {
        if (typeof old_text !== 'string' || !old_text || typeof new_text !== 'string') {
          throw new Error('old_text (not empty) and new_text must be strings.');
        }
        const m = scadModel(getModel);
        const source = m.source;
        const count = source.split(old_text).length - 1;
        if (count !== 1) {
          throw new Error(count === 0
            ? `old_text does not occur in ${m.state.params.activePath}; call read_scad_code for the current code.`
            : `old_text occurs ${count} times; include more of the surrounding lines.`);
        }
        const at = source.indexOf(old_text);
        m.source = source.slice(0, at) + new_text + source.slice(at + old_text.length);
        return run(m, 'preview', options?.signal);
      },
    },
    {
      name: 'render_model',
      description: `Render the open file's current code and show it in the viewer. "preview" is what the editor runs after every change ($preview = true); "render" is the final render (F6, $preview = false) that exporting uses. ${runResult}`,
      inputSchema: {
        type: 'object',
        properties: {mode: {type: 'string', enum: ['preview', 'render'], description: 'Defaults to "preview".'}},
      },
      annotations: {readOnlyHint: true, untrustedContentHint: true},
      execute: async ({mode}, options) => {
        mode ??= 'preview';
        if (mode !== 'preview' && mode !== 'render') throw new Error('mode is "preview" or "render".');
        return run(getModel(), mode, options?.signal);
      },
    },
    {
      name: 'format_scad_code',
      description: 'Format the open file\'s OpenSCAD code, as Cmd+S does in the editor: indentation, spacing and line breaks only, checked against OpenSCAD\'s own parse so the code\'s meaning never changes. Returns whether anything changed.',
      inputSchema: {type: 'object', properties: {}},
      execute: async () => {
        const m = scadModel(getModel);
        const {activePath, sources} = m.state.params;
        const source = m.source;
        const formatted = await formatScad(activePath, sources, source);
        if (formatted === source) return {changed: false};
        if (m.source !== source) throw new Error('The code changed while it was being formatted; try again.');
        m.source = formatted;
        return {changed: true};
      },
    },
    {
      name: 'get_parameters',
      description: 'List the open model\'s customizer parameters (its top-level variables, annotated with customizer comments): name, caption, group, type, the code\'s own value, the value in effect, and the range or options allowed.',
      inputSchema: {type: 'object', properties: {}},
      annotations: {readOnlyHint: true, untrustedContentHint: true},
      execute: async (_, options) => {
        const m = getModel();
        await waitWhile(() => m.state.checkingSyntax, syntaxCheckTimeoutMillis, options?.signal);
        const vars = m.state.params.vars ?? {};
        return {
          title: m.state.parameterSet?.title,
          parameters: (m.state.parameterSet?.parameters ?? []).map(p => ({
            ...p,
            value: p.name in vars ? vars[p.name] : p.initial,
          })),
        };
      },
    },
    {
      name: 'set_parameters',
      description: `Set customizer parameters of the open model, as the Customize panel does, then preview it. Each value must fit its parameter's type, range and options from get_parameters; null returns a parameter to the code's own value. ${runResult}`,
      inputSchema: {
        type: 'object',
        properties: {
          values: {
            type: 'object',
            description: 'Parameter names and their new values, e.g. {"width": 40, "label": "Box", "rounded": true, "size": [10, 20, 5]}.',
            additionalProperties: true,
          },
        },
        required: ['values'],
      },
      execute: async ({values}, options) => {
        if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('values must be an object of parameter names and values.');
        const m = scadModel(getModel);
        await waitWhile(() => m.state.checkingSyntax, syntaxCheckTimeoutMillis, options?.signal);
        const parameters = m.state.parameterSet?.parameters ?? [];
        const problems = Object.entries(values).flatMap(([name, value]) => {
          const p = parameters.find(p => p.name === name);
          if (!p) return [`There is no parameter ${name}; the parameters are ${parameters.map(p => p.name).join(', ') || 'none'}.`];
          return value === null ? [] : [invalidValue(p, value)].filter(e => e != null);
        });
        if (problems.length) throw new Error(problems.join(' '));
        for (const [name, value] of Object.entries(values)) {
          m.setParameter(name, value === null ? parameters.find(p => p.name === name)!.initial : value);
        }
        return run(m, 'preview', options?.signal);
      },
    },
    {
      name: 'search_openscad_docs',
      description: 'Search the cheatsheet of the OpenSCAD in this app (2026.10.25 snapshot, with lazy-union): built-in modules, functions, operators, special variables and syntax, each with a short doc, an example and a link to the manual. Every word of the query has to match; an empty query lists every signature.',
      inputSchema: {
        type: 'object',
        properties: {query: {type: 'string', description: 'Words to look for, e.g. "extrude" or "string length".'}},
      },
      annotations: {readOnlyHint: true},
      execute: async ({query}) => {
        query = typeof query === 'string' ? query.trim() : '';
        const sections = searchCheatsheet(query);
        if (!query) {
          return {sections: sections.map(s => ({section: s.title, signatures: s.entries.map(e => e.sig)}))};
        }
        const entries = sections.flatMap(s => s.entries.map(e => ({
          section: s.title,
          signature: e.sig,
          doc: e.doc,
          ...(e.insert ? {example: snippetText(e.insert)} : {}),
          manual: manualUrl(e.link),
        })));
        if (entries.length === 0) return {entries, note: 'Nothing matches; try fewer or other words.'};
        return entries.length > maxDocEntries
          ? {entries: entries.slice(0, maxDocEntries), note: `${entries.length - maxDocEntries} more match; narrow the query.`}
          : {entries};
      },
    },
    {
      name: 'list_libraries',
      description: 'List the OpenSCAD libraries that come with this app, which the code can include or use as they are, e.g. include <BOSL2/std.scad>.',
      inputSchema: {type: 'object', properties: {}},
      annotations: {readOnlyHint: true},
      execute: async () => deployedArchiveNames
        .filter(name => zipArchives[name].description)
        .map(name => {
          const {description, gitOrigin, docs} = zipArchives[name];
          return {name, description, repository: gitOrigin?.repoUrl, ...(docs ? {docs} : {})};
        }),
    },
  ];
}

// Errors come back as {error}, so the agent can read what to correct.
const reportingErrors = (tool: ModelContextTool): ModelContextTool => ({
  ...tool,
  execute: async (input, options) => {
    try {
      return await tool.execute(input ?? {}, options);
    } catch (e) {
      return {error: e instanceof Error ? e.message : `${e}`};
    }
  },
});

/** Registers the tools if the browser has WebMCP; the returned function unregisters them. */
export function registerWebMCPTools(getModel: () => Model): () => void {
  const modelContext = (document as Document & {modelContext?: ModelContext}).modelContext;
  if (!modelContext) return () => {};
  const controller = new AbortController();
  const all = tools(getModel).map(reportingErrors);
  // All or none: a partial set would leave workflows half callable.
  Promise.all(all.map(async tool => modelContext.registerTool(tool, {signal: controller.signal})))
    .then(() => console.log(`WebMCP: registered ${all.length} tools`))
    .catch(e => {
      if (controller.signal.aborted) return;
      console.error('WebMCP: registering the tools failed:', e);
      controller.abort();
    });
  return () => controller.abort();
}
