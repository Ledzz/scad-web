import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { alignedAxis, along, Bounds, clampSection, moveRange, moveSection, onSectionFrame, projectPoints, Section, snapSection, turnSection, Vec3 } from './section-view.ts';

const color = '#2563eb';
const axisNames = ['X', 'Y', 'Z'];
// The handles keep their size on screen whatever the zoom: CSS pixels.
const arrowLength = 80;
const arcRadius = 56;
const arcAngles = Array.from({length: 13}, (_, i) => (15 + i * 60 / 12) * Math.PI / 180);
const turnStep = 5 * Math.PI / 180;
// Dragging along an arc turns the plane a radian per this many pixels, however
// slanted the arc is on screen: following the arc itself made a short or
// foreshortened one turn the plane by tens of degrees at a flick.
const turnPixels = 115;

// The arrow moves the plane; each arc turns it, tilting the normal from u or v.
type Grip = 'move' | 'u' | 'v';
type Point = [number, number];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const length = ([x, y]: Point) => Math.hypot(x, y);

// The handles as model points, for a scale in screen pixels per model unit.
function handles(s: Section, pixelsPerUnit: number) {
  const arc = (towards: Vec3, angle: number) =>
    along(along(s.origin, towards, Math.cos(angle) * arcRadius / pixelsPerUnit), s.normal, Math.sin(angle) * arcRadius / pixelsPerUnit);
  return {
    tip: along(s.origin, s.normal, arrowLength / pixelsPerUnit),
    arc: (grip: 'u' | 'v', angle: number) => arc(s[grip], angle),
  };
}

// The plane over the model as Onshape shows it: see-through, with an arrow
// along its normal that moves it, and two arcs that turn it about its middle.
// Dragging its edge moves it too. It is drawn from model-viewer's frames, not
// by React, to keep up with the camera.
export default function SectionPlane({viewer, section, bounds, step, onChange}: {
  viewer: HTMLElement,
  section: Section,
  bounds: Bounds,
  // What a move snaps the plane's position to.
  step: number,
  onChange: (section: Section) => void,
}) {
  const svg = useRef<SVGSVGElement>(null);
  const plane = useRef<SVGPolygonElement>(null);
  const edge = useRef<SVGPolygonElement>(null);
  const grips = {move: useRef<SVGGElement>(null), u: useRef<SVGGElement>(null), v: useRef<SVGGElement>(null)};
  const dot = useRef<SVGCircleElement>(null);
  const label = useRef<SVGTextElement>(null);
  const latest = useRef({section, bounds, step});
  latest.current = {section, bounds, step};
  // While dragging: the grip, where the pointer was, the plane as it was at
  // the start, and how far it has moved (model units) or turned (radians).
  const drag = useRef<{grip: Grip, x: number, y: number, start: Section, amount: number}>();
  // Where the pointer is while dragging, in the overlay's pixels: the readout
  // goes beside it.
  const pointer = useRef<Point>([0, 0]);
  const [dragging, setDragging] = useState<Grip>();

  // Screen pixels per model unit around the plane's origin: the longest of its
  // three directions on screen, as at most one of them points at the camera.
  function pixelsPerUnit(s: Section) {
    const {bounds} = latest.current;
    const size = Math.max(...bounds.max.map((x, i) => x - bounds.min[i]), 1e-3);
    const eps = size / 100;
    const [o, ...ends] = projectPoints(viewer, [s.origin, ...[s.normal, s.u, s.v].map(d => along(s.origin, d, eps))]);
    if (!o || ends.some(e => !e)) return;
    return Math.max(...ends.map(e => length(sub(e!, o)))) / eps;
  }

  // How the pointer moves on screen to move the plane by one unit (following
  // the arrow) or turn it by one radian (along the arc); none when the arrow
  // or arc is too foreshortened to tell, such as the arrow pointing at the
  // camera.
  function screenRate(s: Section, grip: Grip): Point | undefined {
    const ppu = pixelsPerUnit(s);
    if (!ppu) return;
    const {arc} = handles(s, ppu);
    const delta = 0.01;
    const [a, b] = grip === 'move'
      ? projectPoints(viewer, [s.origin, along(s.origin, s.normal, delta * arrowLength / ppu)])
      : projectPoints(viewer, [arc(grip, Math.PI / 4), arc(grip, Math.PI / 4 + delta)]);
    if (!a || !b) return;
    const rate = sub(b, a);
    const l = length(rate);
    if (l < delta * (grip === 'move' ? arrowLength : arcRadius) * 0.2) return;
    return grip === 'move' ? [rate[0] / (delta * arrowLength / ppu), rate[1] / (delta * arrowLength / ppu)] : [rate[0] / l * turnPixels, rate[1] / l * turnPixels];
  }

  function draw() {
    const {section: s, bounds, step} = latest.current;
    const ppu = pixelsPerUnit(s);
    // The model's box seen along the normal, a little larger, on the plane.
    const corners = Array.from({length: 8}, (_, i) => [0, 1, 2].map(k => (i >> k) & 1 ? bounds.max[k] : bounds.min[k]) as Vec3);
    const offsets = (d: Vec3) => corners.map(c => c.reduce((sum, x, k) => sum + (x - s.origin[k]) * d[k], 0));
    const pad = 0.06 * Math.max(...bounds.max.map((x, i) => x - bounds.min[i]));
    const [us, vs] = [offsets(s.u), offsets(s.v)];
    const [u0, u1, v0, v1] = [Math.min(...us) - pad, Math.max(...us) + pad, Math.min(...vs) - pad, Math.max(...vs) + pad];
    const rectangle = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([a, b]) => along(along(s.origin, s.u, a), s.v, b));
    const {tip, arc} = handles(s, ppu ?? 1);
    const arcs = (['u', 'v'] as const).map(grip => arcAngles.map(angle => arc(grip, angle)));
    const projected = projectPoints(viewer, [...rectangle, s.origin, tip, ...arcs.flat()]);
    if (!svg.current || !ppu || projected.some(p => !p)) {
      svg.current?.style.setProperty('visibility', 'hidden');
      return;
    }
    svg.current.style.setProperty('visibility', 'visible');
    const points = projected as Point[];
    const polygon = points.slice(0, 4).map(p => p.join(',')).join(' ');
    plane.current!.setAttribute('points', polygon);
    edge.current!.setAttribute('points', polygon);
    const [o, t] = points.slice(4, 6);
    dot.current!.setAttribute('cx', `${o[0]}`);
    dot.current!.setAttribute('cy', `${o[1]}`);

    // A head of `size` pixels at `end`, pointing away from `from`.
    const head = (from: Point, end: Point, size: number, filled: boolean) => {
      const d = sub(end, from), l = length(d) || 1;
      const [dx, dy] = [d[0] / l, d[1] / l];
      const [bx, by] = [end[0] - dx * size, end[1] - dy * size];
      return `M${bx - dy * size * 0.6},${by + dx * size * 0.6} L${end.join(',')} L${bx + dy * size * 0.6},${by - dx * size * 0.6}${filled ? ' Z' : ''}`;
    };
    // The arrow, unless it points at the camera: then the edge moves the plane.
    const showArrow = length(sub(t, o)) > 16;
    const arrow = showArrow ? `M${o.join(',')} L${t.join(',')} ${head(o, t, 11, true)}` : '';
    grips.move.current!.querySelectorAll('path').forEach(p => p.setAttribute('d', arrow));
    arcs.forEach((_, i) => {
      const line = points.slice(6 + i * arcAngles.length, 6 + (i + 1) * arcAngles.length);
      const n = line.length;
      const d = `M${line.map(p => p.join(',')).join(' L')} ${head(line[1], line[0], 7, false)} ${head(line[n - 2], line[n - 1], 7, false)}`;
      grips[i ? 'v' : 'u'].current!.querySelectorAll('path').forEach(p => p.setAttribute('d', d));
    });

    // While dragging: where an axis-aligned plane is, or how far it turned.
    const d = drag.current;
    const axis = alignedAxis(s);
    label.current!.textContent = !d ? ''
      : d.grip !== 'move' ? `${Math.round(Math.round(d.amount / turnStep) * turnStep * 180 / Math.PI)}°`
      : axis !== undefined ? `${axisNames[axis]} = ${s.origin[axis].toFixed(Math.max(0, -Math.round(Math.log10(step))))}`
      : '';
    label.current!.setAttribute('x', `${pointer.current[0] + 16}`);
    label.current!.setAttribute('y', `${pointer.current[1] + 28}`);
  }

  // Frames call whatever draw() is current, which sees this render's refs.
  const drawLatest = useRef(draw);
  drawLatest.current = draw;
  useEffect(() => {
    onSectionFrame(viewer, () => drawLatest.current());
    return () => onSectionFrame(viewer, undefined);
  }, [viewer]);
  useEffect(draw);

  const onPointerDown = (grip: Grip) => (e: ReactPointerEvent<SVGElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {grip, x: e.clientX, y: e.clientY, start: latest.current.section, amount: 0};
    setDragging(grip);
  };
  // The pointer's move along the grip's direction on screen, in model units
  // or radians, worked out afresh at each step as the plane goes.
  function onPointerMove(e: ReactPointerEvent<SVGElement>) {
    const d = drag.current;
    if (!d) return;
    const {section, bounds, step} = latest.current;
    const rate = screenRate(section, d.grip);
    const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
    d.x = e.clientX;
    d.y = e.clientY;
    const box = svg.current!.getBoundingClientRect();
    pointer.current = [e.clientX - box.left, e.clientY - box.top];
    if (!rate) return;
    d.amount += (dx * rate[0] + dy * rate[1]) / (rate[0] * rate[0] + rate[1] * rate[1]);
    if (d.grip === 'move') {
      const [lo, hi] = moveRange(d.start, bounds);
      d.amount = Math.min(Math.max(d.amount, lo), hi);
      onChange(clampSection(snapSection(moveSection(d.start, d.amount), step), bounds));
    } else {
      onChange(clampSection(turnSection(d.start, d.grip, Math.round(d.amount / turnStep) * turnStep), bounds));
    }
  }
  function onPointerUp() {
    drag.current = undefined;
    setDragging(undefined);
  }
  const handlers = (grip: Grip) => ({onPointerDown: onPointerDown(grip), onPointerMove, onPointerUp, onPointerCancel: onPointerUp});
  const grip = (g: Grip) => (
    <g ref={grips[g]} className={`section-plane-grip${dragging === g ? ' active' : ''}`} {...handlers(g)}>
      <path className="hit" stroke="transparent" strokeWidth={18} fill="none" strokeLinecap="round" />
      <path stroke="white" strokeWidth={5} fill={g === 'move' ? 'white' : 'none'} strokeLinecap="round" strokeLinejoin="round" />
      <path className="line" stroke={color} fill={g === 'move' ? color : 'none'} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );

  return (
    <svg ref={svg}
        className="section-plane"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 5,
          pointerEvents: 'none',
          overflow: 'visible',
          cursor: dragging ? 'grabbing' : undefined,
        }}>
      {/* Filled only while a handle is hovered or dragged: drawn over the model,
          the fill would tint parts of it that are in front of the plane. */}
      <polygon ref={plane} className="section-plane-fill" fill={color} fillOpacity={0} stroke={color} strokeOpacity={0.7} strokeWidth={1.5} strokeLinejoin="round" />
      <polygon ref={edge} className="section-plane-grip" fill="none" stroke="transparent" strokeWidth={14} {...handlers('move')} />
      {grip('u')}
      {grip('v')}
      {grip('move')}
      <circle ref={dot} r={4} fill={color} stroke="white" strokeWidth={1.5} pointerEvents="none" />
      <text ref={label} fill={color} fontSize={12} fontWeight={600} stroke="white" strokeWidth={3} paintOrder="stroke" style={{userSelect: 'none'}} />
    </svg>
  );
}
