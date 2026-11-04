// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import { CSSProperties, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ModelContext } from './contexts.ts';
import { Toast } from 'primereact/toast';
import { blurHashToImage, imageToBlurhash, imageToThumbhash, thumbHashToImage } from '../io/image_hashes.ts';
import SectionControls, { sectionStep } from './SectionControls.tsx';
import SectionPlane from './SectionPlane.tsx';
import { applySection, Axis, axisSection, Bounds, boundsCenter, cameraPosition, clampSection, flipSection, modelBounds, Section } from './section-view.ts';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": any;
    }
  }
}

export const PREDEFINED_ORBITS: [string, number, number][] = [
  ["Diagonal", Math.PI / 4, Math.PI / 4],
  ["Front", 0, Math.PI / 2],
  ["Right", Math.PI / 2, Math.PI / 2],
  ["Back", Math.PI, Math.PI / 2],
  ["Left", -Math.PI / 2, Math.PI / 2],
  ["Top", 0, 0],
  ["Bottom", 0, Math.PI],
];

function spherePoint(theta: number, phi: number): [number, number, number] {
  return [
    Math.cos(theta) * Math.sin(phi),
    Math.sin(theta) * Math.sin(phi),
    Math.cos(phi),
  ];
}

function euclideanDist(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
const radDist = (a: number, b: number) => Math.min(Math.abs(a - b), Math.abs(a - b + 2 * Math.PI), Math.abs(a - b - 2 * Math.PI));

function getClosestPredefinedOrbitIndex(theta: number, phi: number): [number, number, number] {
  const point = spherePoint(theta, phi);
  const points = PREDEFINED_ORBITS.map(([_, t, p]) => spherePoint(t, p));
  const distances = points.map(p => euclideanDist(point, p));
  const radDistances = PREDEFINED_ORBITS.map(([_, ptheta, pphi]) => Math.max(radDist(theta, ptheta), radDist(phi, pphi)));
  const [index, dist] = distances.reduce((acc, d, i) => d < acc[1] ? [i, d] : acc, [0, Infinity]) as [number, number];
  return [index, dist, radDistances[index]];
}

const originalOrbit = (([name, theta, phi]) => `${theta}rad ${phi}rad auto`)(PREDEFINED_ORBITS[0]);

export default function ViewerPanel({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const state = model.state;
  const modelViewerRef = useRef<any>();
  const axesViewerRef = useRef<any>();
  const toastRef = useRef<Toast>(null);

  const [loadedUri, setLoadedUri] = useState<string | undefined>();

  const [cachedImageHash, setCachedImageHash] = useState<{hash: string, uri: string} | undefined>(undefined);

  const modelUri = state.output?.displayFileURL ?? state.output?.outFileURL ?? '';
  const loaded = loadedUri === modelUri;

  if (state?.preview) {
    let {hash, uri} = cachedImageHash ?? {};
    if (state.preview.blurhash && hash !== state.preview.blurhash) {
      hash = state.preview.blurhash;
      uri = blurHashToImage(hash, 100, 100);
      setCachedImageHash({hash, uri});
    } else if (state.preview.thumbhash && hash !== state.preview.thumbhash) {
      hash = state.preview.thumbhash;
      uri = thumbHashToImage(hash);
      setCachedImageHash({hash, uri});
    }
  } else if (cachedImageHash) {
    setCachedImageHash(undefined);
  }

  // Cross-section: the plane outlives turning it off and every new model; it
  // is in model coordinates, kept where it cuts the model.
  const [section, setSection] = useState<Section>();
  const [sectioned, setSectioned] = useState(false);
  const [bounds, setBounds] = useState<Bounds>();
  const shownSection = sectioned && section && bounds && !state.is2D ? clampSection(section, bounds) : undefined;
  const sectionStepSize = bounds ? sectionStep(Math.max(...bounds.max.map((x, i) => x - bounds.min[i]))) : 1;

  // A plane through the middle, taking away the side the camera is on.
  function sectionAcross(axis: Axis): Section {
    const origin = boundsCenter(bounds!);
    origin[axis] = Math.round(origin[axis] / sectionStepSize) * sectionStepSize;
    const camera = cameraPosition(modelViewerRef.current);
    return axisSection(axis, origin, camera && camera[axis] < origin[axis] ? -1 : 1);
  }

  // bounds is new with every model, which needs its materials clipped again.
  const sectionKey = JSON.stringify(shownSection);
  useEffect(() => {
    if (modelViewerRef.current) applySection(modelViewerRef.current, shownSection);
  }, [sectionKey, bounds]);

  const onLoad = useCallback(async (e: any) => {
    setLoadedUri(modelUri);
    console.log('onLoad', e);

    if (!modelViewerRef.current) return;
    setBounds(modelBounds(modelViewerRef.current));

    const uri = await modelViewerRef.current.toDataURL('image/png', 0.5);
    const preview = {blurhash: await imageToBlurhash(uri)};
    // const preview = {thumbhash: await imageToThumbhash(uri)};
    console.log(preview);
    
    model?.mutate(s => s.preview = preview);
  }, [model, modelUri, setLoadedUri, modelViewerRef.current]);

  useEffect(() => {
    if (!modelViewerRef.current) return;

    const element = modelViewerRef.current;
    element.addEventListener('load', onLoad);
    return () => element.removeEventListener('load', onLoad);
  }, [modelViewerRef.current, onLoad]);


  for (const ref of [modelViewerRef, axesViewerRef]) {
    const otherRef = ref === modelViewerRef ? axesViewerRef : modelViewerRef;
    useEffect(() => {
      if (!ref.current) return;

      function handleCameraChange(e: any) {
        if (!otherRef.current) return;
        if (e.detail.source === 'user-interaction') {
          const cameraOrbit = ref.current.getCameraOrbit();
          cameraOrbit.radius = otherRef.current.getCameraOrbit().radius;
        
          otherRef.current.cameraOrbit = cameraOrbit.toString();
        }
      }
      const element = ref.current;
      element.addEventListener('camera-change', handleCameraChange);
      return () => element.removeEventListener('camera-change', handleCameraChange);
    }, [ref.current, otherRef.current]);
  }

  // Cycle through predefined views when user clicks on the axes viewer
  useEffect(() => {
    let mouseDownSpherePoint: [number, number, number] | undefined;
    function getSpherePoint() {
      const orbit = axesViewerRef.current.getCameraOrbit();
      return spherePoint(orbit.theta, orbit.phi);
    }
    function onMouseDown(e: MouseEvent) {
      if (e.target === axesViewerRef.current) {
        mouseDownSpherePoint = getSpherePoint();
      }
    }
    function onMouseUp(e: MouseEvent) {
      if (e.target === axesViewerRef.current) {
        const euclEps = 0.01;
        const radEps = 0.1;

        const spherePoint = getSpherePoint();
        const clickDist = mouseDownSpherePoint ? euclideanDist(spherePoint, mouseDownSpherePoint) : Infinity;
        if (clickDist > euclEps) {
          return;
        }
        // The angles come from the axes viewer; the model viewer's orbit is only fetched for its radius.
        const axesOrbit = axesViewerRef.current.getCameraOrbit();
        const modelOrbit = modelViewerRef.current.getCameraOrbit();
        const [currentIndex, dist, radDist] = getClosestPredefinedOrbitIndex(axesOrbit.theta, axesOrbit.phi);
        const newIndex = dist < euclEps && radDist < radEps ? (currentIndex + 1) % PREDEFINED_ORBITS.length : currentIndex;
        const [name, theta, phi] = PREDEFINED_ORBITS[newIndex];
        Object.assign(modelOrbit, {theta, phi});
        const newOrbit = modelViewerRef.current.cameraOrbit = axesViewerRef.current.cameraOrbit = modelOrbit.toString();
        toastRef.current?.show({severity: 'info', detail: `${name} view`, life: 1000,});
      }
    }
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    // window.addEventListener('click', onClick);
    return () => {
      // window.removeEventListener('click', onClick);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });

  return (
    <div className={className}
          style={{
              display: 'flex',
              flexDirection: 'column', 
              position: 'relative',
              flex: 1, 
              width: '100%',
              ...(style ?? {})
          }}>
      <Toast ref={toastRef} position='top-right'  />
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 0.7; }
            100% { opacity: 0.4; }
          }
        `}
      </style>

      {!loaded && cachedImageHash && 
        <img
        src={cachedImageHash.uri}
        style={{
          animation: 'pulse 1.5s ease-in-out infinite',
          position: 'absolute',
          pointerEvents: 'none',
          width: '100%',
          height: '100%'
        }} />
      }

      <model-viewer
        orientation="0deg -90deg 0deg"
        class="main-viewer"
        src={modelUri}
        style={{
          transition: 'opacity 0.5s',
          opacity: loaded ? 1 : 0,
          position: 'absolute',
          width: '100%',
          height: '100%',
        }}
        camera-orbit={originalOrbit}
        // No hand that wiggles the model to hint at dragging.
        interaction-prompt="none"
        environment-image="./skybox-lights.jpg"
        max-camera-orbit="auto 180deg auto"
        min-camera-orbit="auto 0deg auto"
        camera-controls
        ar
        ref={modelViewerRef}
      >
        <span slot="progress-bar"></span>
      </model-viewer>
      {shownSection && (
        <SectionPlane
          viewer={modelViewerRef.current}
          section={shownSection}
          bounds={bounds!}
          step={sectionStepSize}
          onChange={setSection}
        />
      )}
      {bounds && !state.is2D && (
        <SectionControls
          section={shownSection}
          onToggle={() => {
            if (!section) setSection(sectionAcross(2));
            setSectioned(!sectioned);
          }}
          onAxis={axis => setSection(sectionAcross(axis))}
          onFlip={() => setSection(flipSection(shownSection!))}
        />
      )}
      {state.view.showAxes && (
        <model-viewer
                orientation="0deg -90deg 0deg"
                src="./axes.glb"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  zIndex: 10,
                  height: '100px',
                  width: '100px',
                }}
                loading="eager"
                camera-orbit={originalOrbit}
                // interpolation-decay="0"
                environment-image="./skybox-lights.jpg"
                max-camera-orbit="auto 180deg auto"
                min-camera-orbit="auto 0deg auto"
                orbit-sensitivity="5"
                interaction-prompt="none"
                camera-controls="false"
                disable-zoom
                disable-tap 
                disable-pan
                ref={axesViewerRef}
        >
          <span slot="progress-bar"></span>
        </model-viewer>
      )}
    </div>
  )
}
