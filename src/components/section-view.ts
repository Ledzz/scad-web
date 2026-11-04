// Cross-section view: clips the model shown by a <model-viewer> with a plane
// and draws the cut as a hatched face.
// model-viewer has no API for this, so it reaches into its three.js scene
// (r163) through the element's symbol-keyed internals, as
// @google/model-viewer-effects does. Its renderer has no stencil buffer, so the
// cut is not a real cap: through the cut of a closed mesh one sees its inside,
// i.e. back faces, and those are painted flat and hatched. In one colour for
// all: the back face behind the cut can be one that difference() left, which
// OpenSCAD colours apart, so the meshes' own colours would show up in patches.

export type Axis = 0 | 1 | 2;
export type Vec3 = [number, number, number];
export type Bounds = {min: Vec3, max: Vec3};

// A plane in the model's (OpenSCAD's) coordinates, with the frame the gizmo
// moves it by: unit vectors normal to it and along it, all at right angles.
export type Section = {
  // Points at the side that is cut away.
  normal: Vec3,
  u: Vec3,
  v: Vec3,
  // A point of the plane, which it turns about.
  origin: Vec3,
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const along = (p: Vec3, direction: Vec3, distance: number): Vec3 =>
  [p[0] + direction[0] * distance, p[1] + direction[1] * distance, p[2] + direction[2] * distance];
const unit = (a: Vec3) => scale(a, 1 / Math.hypot(...a));
export const boundsCenter = ({min, max}: Bounds): Vec3 => [0, 1, 2].map(i => (min[i] + max[i]) / 2) as Vec3;

// The plane across `axis` through `origin`, cutting away the side `towards`
// (+1 or -1) of it.
export function axisSection(axis: Axis, origin: Vec3, towards: number): Section {
  const e = (i: number): Vec3 => [0, 1, 2].map(j => j === i ? 1 : 0) as Vec3;
  const [u, v] = [0, 1, 2].filter(i => i !== axis);
  return {normal: scale(e(axis), towards), u: e(u), v: e(v), origin};
}

// The axis the plane is across, if it is.
export function alignedAxis({normal}: Section): Axis | undefined {
  const axis = normal.findIndex(c => Math.abs(c) > 1 - 1e-9);
  return axis < 0 ? undefined : axis as Axis;
}

export function flipSection(s: Section): Section {
  return {...s, normal: scale(s.normal, -1)};
}

export function moveSection(s: Section, distance: number): Section {
  return {...s, origin: along(s.origin, s.normal, distance)};
}

// Turns the plane about its origin, tilting the normal away from `towards`:
// the point at angle a from u (or v) towards the normal goes to a + angle.
export function turnSection(s: Section, towards: 'u' | 'v', angle: number): Section {
  const [c, sin] = [Math.cos(angle), Math.sin(angle)];
  const t = s[towards];
  const turned = {...s, [towards]: along(scale(t, c), s.normal, sin), normal: along(scale(s.normal, c), t, -sin)};
  // Kept at right angles, against rounding.
  const normal = unit(turned.normal);
  const u = unit(along(turned.u, normal, -dot(turned.u, normal)));
  const v = unit(along(along(turned.v, normal, -dot(turned.v, normal)), u, -dot(turned.v, u)));
  return {...s, normal, u, v};
}

// How far the plane can move along its normal and still cut the model.
export function moveRange(s: Section, bounds: Bounds): [number, number] {
  const center = boundsCenter(bounds);
  const reach = s.normal.reduce((sum, c, i) => sum + Math.abs(c) * (bounds.max[i] - bounds.min[i]) / 2, 0);
  const offset = dot(s.normal, center) - dot(s.normal, s.origin);
  return [offset - reach, offset + reach];
}

export function clampSection(s: Section, bounds: Bounds): Section {
  const [lo, hi] = moveRange(s, bounds);
  return moveSection(s, Math.min(Math.max(0, lo), hi));
}

// Moves the plane by less than half a step so that its distance from the
// model's origin is a whole number of steps: Z = 5.0, not 4.9813.
export function snapSection(s: Section, step: number): Section {
  const distance = dot(s.normal, s.origin);
  return moveSection(s, Math.round(distance / step) * step - distance);
}

type SceneState = {
  // The plane in model coordinates as [normal, constant]; three.js keeps the
  // points whose signed distance to it is >= 0.
  local?: [number, number, number, number],
  // The same plane in world coordinates, which is what three.js clips with.
  // Only normal and constant are read, so a plain object does.
  world: {normal: {x: number, y: number, z: number}, constant: number},
  pixelRatio: {value: number},
  // Called before every frame, once the camera and model are in place.
  onFrame?: () => void,
};

const sceneStates = new WeakMap<object, SceneState>();
const originalMaterials = new WeakMap<object, {onBeforeCompile: any, customProgramCacheKey: any}>();

function internal(element: HTMLElement, name: string): any {
  for (let o = element; o; o = Object.getPrototypeOf(o)) {
    const symbol = Object.getOwnPropertySymbols(o).find(s => s.description === name);
    if (symbol) return (element as any)[symbol];
  }
}

// The glTF scene of the loaded model. Its local frame is OpenSCAD's: the GLB
// holds OpenSCAD's coordinates as they are and model-viewer's `orientation`
// turns this object.
function loadedModel(element: HTMLElement) {
  const scene = internal(element, 'scene');
  return scene?.model ? {scene, model: scene.model} : undefined;
}

function meshes(model: any) {
  const found: any[] = [];
  model.traverse((o: any) => o.isMesh && found.push(o));
  return found;
}

function inverseElements(model: any): number[] {
  return model.matrixWorld.clone().invert().elements;
}

// A column-major 4x4 matrix times a column vector.
function transform(e: number[], [x, y, z, w]: number[]) {
  return [0, 1, 2, 3].map(i => e[i] * x + e[4 + i] * y + e[8 + i] * z + e[12 + i] * w);
}

function sceneState(scene: any): SceneState {
  let state = sceneStates.get(scene);
  if (!state) {
    const s: SceneState = state = {
      world: {normal: {x: 0, y: 0, z: 1}, constant: 0},
      pixelRatio: {value: 1},
    };
    sceneStates.set(scene, state);
    // The model moves in world space whenever the camera target does, so the
    // world plane is worked out again just before every frame.
    const onBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = function (...args: any[]) {
      onBeforeRender.apply(this, args);
      s.onFrame?.();
      if (!s.local || !scene.model) return;
      // A plane is a row vector: in world coordinates it is local * M^-1.
      const inv = inverseElements(scene.model);
      const [a, b, c, d] = [0, 1, 2, 3].map(j =>
        s.local![0] * inv[j * 4] + s.local![1] * inv[j * 4 + 1] + s.local![2] * inv[j * 4 + 2] + s.local![3] * inv[j * 4 + 3]);
      const length = Math.hypot(a, b, c);
      Object.assign(s.world.normal, {x: a / length, y: b / length, z: c / length});
      s.world.constant = d / length;
      s.pixelRatio.value = window.devicePixelRatio;
    };
  }
  return state;
}

// sRGB hex to the linear RGB the shader works in, before tone mapping.
function linear(hex: number) {
  return [16, 8, 0].map(shift => ((hex >> shift) & 255) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
}
const cutColor = linear(0xd9534f);
const hatchColor = linear(0x8f2723);

// Back faces become the cut: unlit, with diagonal lines 8 CSS pixels apart.
// They are also moved a hair towards the camera: with lazy-union, top-level
// solids are separate meshes, and where two touch, the cut shows both the
// inside of one and the face of the other at one depth. A few depth-buffer
// steps; a slope-scaled offset, like polygonOffset's, made the back faces
// show along every silhouette.
function hatchBackFaces(material: any, pixelRatio: {value: number}) {
  material.onBeforeCompile = (shader: any) => {
    shader.uniforms.sectionPixelRatio = pixelRatio;
    shader.uniforms.sectionCutColor = {value: cutColor};
    shader.uniforms.sectionHatchColor = {value: hatchColor};
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float sectionPixelRatio;\nuniform vec3 sectionCutColor;\nuniform vec3 sectionHatchColor;\nvoid main() {')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (!gl_FrontFacing) {
          float stripe = mod(gl_FragCoord.x + gl_FragCoord.y, 8.0 * sectionPixelRatio);
          gl_FragColor = vec4(stripe < 1.25 * sectionPixelRatio ? sectionHatchColor : sectionCutColor, 1.0);
        }
        gl_FragDepth = gl_FrontFacing ? gl_FragCoord.z : gl_FragCoord.z - 1e-6;`);
  };
  material.customProgramCacheKey = () => 'section-hatch';
}

function setClipping(material: any, state: SceneState | undefined) {
  if ((material.clippingPlanes?.length > 0) === !!state) return;
  if (state) {
    originalMaterials.set(material, {
      onBeforeCompile: material.onBeforeCompile,
      customProgramCacheKey: material.customProgramCacheKey,
    });
    material.clippingPlanes = [state.world];
    // A see-through mesh has no solid inside to show.
    if (!material.transparent) hatchBackFaces(material, state.pixelRatio);
  } else {
    material.clippingPlanes = null;
    Object.assign(material, originalMaterials.get(material));
  }
  material.needsUpdate = true;
}

// Shows `section` of the loaded model, or all of it. Moving the plane only
// changes numbers; materials are recompiled only when a section is turned on
// or off, or a new model comes in.
export function applySection(element: HTMLElement, section?: Section) {
  const loaded = loadedModel(element);
  if (!loaded) return;
  const {scene, model} = loaded;
  const state = sceneState(scene);
  if (section) {
    // Kept: the points p with normal . (p - origin) <= 0.
    const [x, y, z] = section.normal;
    state.local = [-x, -y, -z, dot(section.normal, section.origin)];
    internal(element, 'renderer').threeRenderer.localClippingEnabled = true;
  } else {
    state.local = undefined;
  }
  for (const mesh of meshes(model)) {
    for (const material of [mesh.material].flat()) setClipping(material, section && state);
  }
  scene.queueRender();
}

export function modelBounds(element: HTMLElement): Bounds | undefined {
  const loaded = loadedModel(element);
  if (!loaded) return;
  let bounds: Bounds | undefined;
  for (const {geometry} of meshes(loaded.model)) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const {min, max} = geometry.boundingBox;
    if (!isFinite(min.x)) continue;
    const [lo, hi]: Vec3[] = [[min.x, min.y, min.z], [max.x, max.y, max.z]];
    bounds = bounds
      ? {min: bounds.min.map((v, i) => Math.min(v, lo[i])) as Vec3, max: bounds.max.map((v, i) => Math.max(v, hi[i])) as Vec3}
      : {min: lo, max: hi};
  }
  return bounds;
}

// Where the camera is, in model coordinates.
export function cameraPosition(element: HTMLElement): Vec3 | undefined {
  const loaded = loadedModel(element);
  if (!loaded) return;
  const camera = loaded.scene.getCamera().matrixWorld.elements;
  return transform(inverseElements(loaded.model), [camera[12], camera[13], camera[14], 1]).slice(0, 3) as Vec3;
}

// Points in model coordinates to CSS pixels in the element, as last drawn;
// undefined for those behind the camera.
export function projectPoints(element: HTMLElement, points: Vec3[]): ([number, number] | undefined)[] {
  const loaded = loadedModel(element);
  if (!loaded) return points.map(() => undefined);
  const camera = loaded.scene.getCamera();
  return points.map(point => {
    const world = transform(loaded.model.matrixWorld.elements, [...point, 1]);
    const [x, y, , w] = transform(camera.projectionMatrix.elements, transform(camera.matrixWorldInverse.elements, world));
    return w > 0 ? [(x / w + 1) / 2 * element.clientWidth, (1 - y / w) / 2 * element.clientHeight] : undefined;
  });
}

// Has `callback` run before each frame the element draws (camera moves,
// resizes, a new section), or stops it.
export function onSectionFrame(element: HTMLElement, callback?: () => void) {
  const scene = internal(element, 'scene');
  if (scene) sceneState(scene).onFrame = callback;
}
