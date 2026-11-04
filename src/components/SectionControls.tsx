import { CSSProperties } from 'react';
import { Button } from 'primereact/button';
import { SelectButton } from 'primereact/selectbutton';
import { alignedAxis, Axis, Section } from './section-view.ts';

const axisOptions: {label: string, value: Axis}[] = [
  {label: 'X', value: 0},
  {label: 'Y', value: 1},
  {label: 'Z', value: 2},
];

// A box cut in two, the far half hatched.
const sectionIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="12" height="12" rx="1" />
    <path d="M8 1v14" />
    <path d="M8 5l3-3M8 8l6-6M8 11l6-6M8 14l6-6M11 14l3-3" strokeWidth="1" />
  </svg>
);

// 1, 0.1, 0.01...: at least 100 positions across the model.
export function sectionStep(size: number) {
  return size > 0 ? 10 ** Math.floor(Math.log10(size / 100)) : 1;
}

// The cross-section toggle in the viewer's corner and, when on, planes across
// X, Y and Z (lit while the plane is one of them) and which side to keep. The
// plane itself is moved and turned in the view.
export default function SectionControls({section, onToggle, onAxis, onFlip, style}: {
  section?: Section,
  onToggle: () => void,
  onAxis: (axis: Axis) => void,
  onFlip: () => void,
  style?: CSSProperties,
}) {
  return (
    <div className="section-controls flex flex-row align-items-center gap-1"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 10,
          margin: '5px',
          padding: section ? '4px' : 0,
          borderRadius: '6px',
          ...(section ? {
            background: 'rgba(255, 255, 255, 0.9)',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.15)',
          } : {}),
          ...(style ?? {}),
        }}>
      <Button title={section ? 'Hide the cross-section' : 'Cross-section'}
          rounded
          text
          icon={sectionIcon}
          style={section ? {background: 'var(--highlight-bg)', color: 'var(--highlight-text-color)'} : {}}
          onClick={onToggle} />
      {section && <>
        <SelectButton
            value={alignedAxis(section) ?? null}
            options={axisOptions}
            onChange={e => e.value !== null && e.value !== undefined && onAxis(e.value)} />
        <Button title="Show the other side"
            rounded
            text
            icon="pi pi-sort-alt"
            onClick={onFlip} />
      </>}
    </div>
  );
}
