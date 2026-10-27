// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import { MergedOutputs } from "./openscad-worker.ts";
import { AbortablePromise } from "../utils.ts";
import { Source } from "../state/app-state.ts";

export type OpenSCADInvocation = {
  mountArchives: boolean,
  inputs?: Source[],
  args: string[],
  outputPaths?: string[],
}

export type OpenSCADInvocationResults = {
  exitCode?: number,
  error?: string,
  outputs?: [string, string][],
  mergedOutputs: MergedOutputs,
  elapsedMillis: number,
};

export type ProcessStreams = {stderr: string} | {stdout: string}
export type OpenSCADInvocationCallback = {result: OpenSCADInvocationResults} | ProcessStreams;

// Which long-lived worker runs a job. Jobs that run side by side get separate
// lanes (every edit triggers both a syntax check and a preview render).
export type Lane = 'render' | 'check' | 'format' | 'plain';

// A job killed (superseded) after running this long takes its worker down
// with it, caches and all; a shorter one finishes unseen, keeping the caches.
const killRunningAfterMillis = 2000;

type Job = {
  invocation: OpenSCADInvocation,
  streamsCallback: (ps: ProcessStreams) => void,
  resolve: (result: OpenSCADInvocationResults) => void,
  started?: number,
  killed?: boolean,
};

// One worker that keeps its OpenSCAD instance between runs (see
// openscad-worker.ts) and runs its jobs one at a time.
class WorkerLane {
  private worker: Worker | null = null;
  private running: Job | null = null;
  private queue: Job[] = [];

  constructor(private mountArchives: boolean) {}

  warmUp() {
    if (!this.worker) {
      this.worker = new Worker('./openscad-worker.js');//, { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<OpenSCADInvocationCallback>) => this.onMessage(e.data);
      this.worker.postMessage({prepare: {mountArchives: this.mountArchives}});
    }
  }

  submit(job: Job) {
    this.queue.push(job);
    this.pump();
  }

  kill(job: Job) {
    const queued = this.queue.indexOf(job);
    if (queued >= 0) {
      this.queue.splice(queued, 1);
    } else if (this.running === job) {
      job.killed = true;
      if (performance.now() - job.started! > killRunningAfterMillis) {
        this.worker?.terminate();
        this.worker = null;
        this.running = null;
        this.warmUp();
        this.pump();
      }
    }
  }

  private pump() {
    if (this.running || this.queue.length === 0) return;
    this.warmUp();
    const job = this.running = this.queue.shift()!;
    job.started = performance.now();
    this.worker!.postMessage(job.invocation);
  }

  private onMessage(data: OpenSCADInvocationCallback) {
    const job = this.running;
    if (!job) return;
    if ('result' in data) {
      this.running = null;
      if (!job.killed) job.resolve(data.result);
      this.pump();
    } else if (!job.killed) {
      job.streamsCallback(data);
    }
  }
}

const lanes: {[lane in Lane]: WorkerLane} = {
  render: new WorkerLane(true),
  check: new WorkerLane(true),
  format: new WorkerLane(false),
  plain: new WorkerLane(false),
};

// Start the instances while the page loads, before the first edit needs them.
export function warmUpOpenSCAD(...names: Lane[]) {
  for (const name of names) lanes[name].warmUp();
}

export function spawnOpenSCAD(
  invocation: OpenSCADInvocation,
  streamsCallback: (ps: ProcessStreams) => void,
  lane: Lane = invocation.mountArchives ? 'render' : 'plain',
): AbortablePromise<OpenSCADInvocationResults> {
  return AbortablePromise<OpenSCADInvocationResults>((resolve: (result: OpenSCADInvocationResults) => void) => {
    const job: Job = {invocation, streamsCallback, resolve};
    lanes[lane].submit(job);
    return () => lanes[lane].kill(job);
  });
}
