// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

/// <reference lib="webworker" />
import OpenSCAD from "../wasm/openscad.js";

import { createEditorFS, symlinkLibraries } from "../fs/filesystem.ts";
import { OpenSCADInvocation, OpenSCADInvocationCallback, OpenSCADInvocationResults } from "./openscad-runner.ts";
import { deployedArchiveNames } from "../fs/zip-archives.ts";
import { fetchSource } from "../utils.ts";

importScripts("browserfs.min.js");

declare const self: DedicatedWorkerGlobalScope;

export type MergedOutputs = {stdout?: string, stderr?: string, error?: string}[];

function callback(payload: OpenSCADInvocationCallback) {
  self.postMessage(payload);
}

// Sent by the runner as soon as the worker exists: create the WASM instance
// and mount the libraries before the first invocation needs them.
export type OpenSCADPrepare = {prepare: {mountArchives: boolean}};

// The worker is long-lived and keeps ONE OpenSCAD instance across invocations,
// like the desktop app between F5s: no per-run startup, and OpenSCAD's
// geometry and module caches survive from one run to the next.
let mergedOutputs: MergedOutputs = [];
let current: {key: string, instance: Promise<any>} | null = null;
// What each input path holds in the instance's FS, to rewrite only what changed.
let written = new Map<string, Uint8Array>();
// OpenSCAD caches `use`d files by mtime in whole seconds, so a rewrite within
// the same second would go unnoticed: give every rewrite a strictly later mtime.
let mtimeClock = 0;

// --enable=<feature> flags stick in the instance's global state, so a
// different feature set gets a fresh instance.
function instanceKey(mountArchives: boolean, args: string[]) {
  return [mountArchives, ...args.filter(a => a.startsWith('--enable=')).sort()].join(' ');
}

function useInstance(key: string, mountArchives: boolean) {
  if (current?.key !== key) {
    current = {key, instance: createInstance(mountArchives)};
    current.instance.catch(() => {}); // surfaces when an invocation awaits it
    written = new Map();
  }
  return current.instance;
}

function sameBytes(a: Uint8Array | undefined, b: Uint8Array) {
  return a != null && a.length === b.length && a.every((v, i) => v === b[i]);
}

async function createInstance(mountArchives: boolean) {
  const instance: any = await OpenSCAD({
    noInitialRun: true,
    // Without this, main()'s exit marks the program as aborted and callMain
    // cannot run again; with it, exit throws ExitStatus, which callMain catches.
    noExitRuntime: true,
    'print': (text: string) => {
      console.debug('stdout: ' + text);
      callback({stdout: text})
      mergedOutputs.push({ stdout: text })
    },
    'printErr': (text: string) => {
      console.debug('stderr: ' + text);
      callback({stderr: text})
      mergedOutputs.push({ stderr: text })
    },
  });

  if (mountArchives) {
    // This will mount lots of libraries' ZIP archives under /libraries/<name> -> <name>.zip
    await createEditorFS({prefix: '', allowPersistence: false});

    instance.FS.mkdir('/libraries');

    // https://github.com/emscripten-core/emscripten/issues/10061
    const BFS = new BrowserFS.EmscriptenFS(
      instance.FS,
      instance.PATH ?? {
        join2: (a: string, b: string) => `${a}/${b}`,
        join: (...args: string[]) => args.join('/'),
      },
      instance.ERRNO_CODES ?? {}
    );
    // Newer emscripten calls node/stream ops unbound (FS.checkOpExists hands
    // back the bare function), but BrowserFS's ops are prototype methods that
    // read `this.fs`: "Cannot read properties of undefined (reading 'fs')".
    for (const ops of [BFS.node_ops, BFS.stream_ops]) {
      for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(ops))) {
        if (name !== 'constructor' && typeof ops[name] === 'function') ops[name] = ops[name].bind(ops);
      }
    }

    instance.FS.mount(BFS, {root: '/'}, '/libraries');

    await symlinkLibraries(deployedArchiveNames, instance.FS, '/libraries', "/");
  }

  // Fonts are seemingly resolved from $(cwd)/fonts
  instance.FS.chdir("/");

  instance.FS.mkdir('/locale');
  return instance;
}

self.addEventListener('message', async (e: MessageEvent<OpenSCADInvocation | OpenSCADPrepare>) => {
  if ('prepare' in e.data) {
    const {mountArchives} = e.data.prepare;
    useInstance(instanceKey(mountArchives, []), mountArchives);
    return;
  }
  const {
    mountArchives,
    inputs,
    args,
    outputPaths,
  } = e.data;

  let instance: any;
  mergedOutputs = [];
  const start = performance.now();
  try {
    instance = await useInstance(instanceKey(mountArchives, args), mountArchives);
    const ready = performance.now();

    // const walkFolder = (path: string, indent = '') => {
    //   console.log("Walking " + path);
    //   instance.FS.readdir(path)?.forEach((f: string) => {
    //     if (f.startsWith('.')) {
    //       return;
    //     }
    //     const ii = indent + '  ';
    //     const p = `${path != '/' ? path + '/' : '/'}${f}`;
    //     console.log(`${ii}${p}`);
    //     walkFolder(p, ii);
    //   });
    // };
    // walkFolder('/libraries');

    if (inputs) {
      for (const source of inputs) {
        try {
          console.log(`Writing ${source.path}`);
          if (source.content == null && source.path != null && source.url == null) {
            if (!instance.FS.isFile(source.path)) {
              console.error(`File ${source.path} does not exist!`);
            }
          } else {
            const content = await fetchSource(instance.FS, source);
            if (!sameBytes(written.get(source.path), content)) {
              instance.FS.writeFile(source.path, content);
              mtimeClock = Math.max(mtimeClock + 1000, Date.now());
              instance.FS.utime(source.path, mtimeClock, mtimeClock);
              written.set(source.path, content);
            }
          }
        } catch (e) {
          console.trace(e);
          throw new Error(`Error while trying to write ${source.path}: ${e}`);
        }
      }
    }

    // A failed run must not hand back the previous run's output file.
    for (const path of (outputPaths ?? [])) {
      try { instance.FS.unlink(path); } catch {}
    }

    console.log('Invoking OpenSCAD with: ', args)
    let exitCode;
    try {
      exitCode = instance.callMain(args);
    } catch(e){
      // Not a normal exit (those come back as the return value): the instance
      // crashed and its state is unknown, so the next run gets a fresh one.
      current = null;
      if(typeof e === "number" && instance.formatException){
        // The number was a raw C++ exception
        // See https://github.com/emscripten-core/emscripten/pull/16343
        e = instance.formatException(e);
      }
      throw new Error(`OpenSCAD invocation failed: ${e}`);
    }
    const end = performance.now();
    const elapsedMillis = end - start;
    console.debug(`[openscad-worker] instance ready after ${(ready - start).toFixed(0)} ms, ran ${(end - ready).toFixed(0)} ms`);

    const outputs: [string, string][] = [];
    for (const path of (outputPaths ?? [])) {
      try {
        const content = instance.FS.readFile(path);
        outputs.push([path, content]);
      } catch (e) {
        console.trace(e);
        throw new Error(`Failed to read output file ${path}: ${e}`);
      }
    }
    const result: OpenSCADInvocationResults = {
      outputs,
      mergedOutputs,
      exitCode,
      elapsedMillis,
    }

    console.debug(result);
    callback({result});
  } catch (e) {
    const end = performance.now();
    const elapsedMillis = end - start;
    if (!instance) current = null; // creating the instance failed: retry next run

    console.trace(e);
    const error = `${e}`;
    mergedOutputs.push({ error });
    callback({
      result: {
        exitCode: undefined,
        error,
        mergedOutputs,
        elapsedMillis,
      }
    });
  }
});
