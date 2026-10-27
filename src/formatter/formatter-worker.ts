/// <reference lib="webworker" />
// Topiary's OpenSCAD formatter (WebAssembly, built by formatter/build.sh) in a
// long-lived worker: it loads once, and formatting a large file takes a few
// hundred ms, which is too long to block the editor for.

declare const self: DedicatedWorkerGlobalScope;
declare const wasm_bindgen: any;

importScripts('formatter/topiary_scad.js');

export type FormatRequest = {id: number, source: string};
export type FormatResponse = {id: number, formatted: string} | {id: number, error: string};

const ready = (async () => {
  await wasm_bindgen({module_or_path: 'formatter/topiary_scad_bg.wasm'});
  const query = await (await fetch('formatter/openscad-formatting.scm')).text();
  wasm_bindgen.init(query);
})();

self.addEventListener('message', async (e: MessageEvent<FormatRequest>) => {
  const {id, source} = e.data;
  let response: FormatResponse;
  try {
    await ready;
    response = {id, formatted: wasm_bindgen.format(source)};
  } catch (err) {
    response = {id, error: String(err)};
  }
  self.postMessage(response);
});
