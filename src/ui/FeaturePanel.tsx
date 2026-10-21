import { useState } from 'react';
import type { DrawnFeature, FeatureKind, Vec3, WorldProject } from '../domain/world';
import { buildFeatureGeometry, featureFlowWarnings } from '../domain/features';

const featureKinds: FeatureKind[] = ['river', 'lake', 'path', 'bridge', 'shape', 'waterfall'];
const labels: Record<FeatureKind, string> = { river: 'River', lake: 'Lake', path: 'Pathway', bridge: 'Bridge', shape: 'Shape', waterfall: 'Waterfall' };

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label>{label}<input key={value} aria-label={label} type="number" min={min} max={max} step="0.1" defaultValue={Math.round(value * 100) / 100} onBlur={(event) => { const next = Number(event.currentTarget.value); if (event.currentTarget.value.trim() && Number.isFinite(next) && next >= min && next <= max && Math.abs(next - value) > 0.005) onChange(next); else event.currentTarget.value = String(Math.round(value * 100) / 100); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

export default function FeaturePanel({ project, draft, selectedId, width, elevation, drop, onWidth, onElevation, onDrop, onStart, onFinish, onCancel, onRemovePoint, onSelect, onUpdate, onDelete }: {
  project: WorldProject; draft: DrawnFeature | null; selectedId: string | null; width: number; elevation: number; drop: number;
  onWidth: (value: number) => void; onElevation: (value: number) => void; onDrop: (value: number) => void;
  onStart: (kind: FeatureKind) => void; onFinish: () => void; onCancel: () => void; onRemovePoint: () => void; onSelect: (id: string) => void; onUpdate: (feature: DrawnFeature) => void; onDelete: (id: string) => void;
}) {
  const selected = project.features?.find((feature) => feature.id === selectedId);
  const [notice, setNotice] = useState('');
  const minimum = !draft ? 2 : draft.kind === 'waterfall' ? 1 : ['shape', 'lake'].includes(draft.kind) ? 3 : 2;
  const lakes = (project.features ?? []).filter((feature) => feature.kind === 'lake');
  const connect = (end: boolean, id: string) => {
    if (!selected) return;
    const lake = lakes.find((item) => item.id === id);
    const points = selected.points.map((point) => [...point] as Vec3);
    const index = end ? points.length - 1 : 0;
    if (lake) {
      const parts = buildFeatureGeometry(lake, project);
      let nearest: Vec3 | null = null, distance = Infinity;
      for (const part of parts) {
        const positions = part.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const dx = positions.getX(i) - points[index]![0], dz = positions.getZ(i) - points[index]![2];
          if (dx * dx + dz * dz < distance) { distance = dx * dx + dz * dz; nearest = [positions.getX(i), lake.elevation ?? 0, positions.getZ(i)]; }
        }
        part.geometry.dispose();
      }
      if (!nearest) { setNotice('This lake is dry. Raise its water level before connecting a river.'); return; }
      points[index] = nearest;
    }
    setNotice('');
    onUpdate({ ...selected, points, [end ? 'endLakeId' : 'startLakeId']: id || undefined });
  };
  return <div className="feature-panel">
    <div className="panel-heading"><div><span className="eyebrow">DRAW THE WORLD</span><h2>Pen & water</h2></div></div>
    <div className="tool-grid feature-tools">{featureKinds.map((kind) => <button key={kind} className={draft?.kind === kind ? 'chosen' : ''} onClick={() => onStart(kind)}>{labels[kind]}</button>)}</div>
    <div className="two-fields"><NumberField label="Draw width" value={width} min={0.2} max={40} onChange={onWidth} /><NumberField label="Water / deck level" value={elevation} min={-2000} max={2000} onChange={onElevation} /></div>
    <NumberField label="Waterfall drop" value={drop} min={0.5} max={100} onChange={onDrop} />
    {draft ? <div className="terrain-help"><div><b>Drawing {labels[draft.kind].toLowerCase()} · {draft.points.length} vertices</b><small>{draft.kind === 'waterfall' ? 'Click terrain to place the waterfall. Its top starts one drop above the ground.' : 'Click terrain to add vertices. Enter finishes, Escape cancels. Top view helps trace an outline.'}</small><div className="feature-actions"><button disabled={draft.points.length < minimum} onClick={onFinish}>Finish</button><button disabled={!draft.points.length} onClick={onRemovePoint}>Remove last</button><button onClick={onCancel}>Cancel</button></div></div></div> : <p className="feature-note">Choose a pen, then click the terrain. Lake level fills only ground below the level inside its outline. Draw rivers from high to low; connect their ends to lakes.</p>}
    <div className="tree-group-label">DRAWN FEATURES <span>{project.features?.length ?? 0} / 128</span></div>
    {(project.features ?? []).map((feature) => <button key={feature.id} className={`feature-list-item ${selectedId === feature.id ? 'chosen' : ''}`} onClick={() => onSelect(feature.id)}><span>{feature.name}</span><small>{feature.kind} · {feature.points.length} vertices</small></button>)}
    {selected && <div className="feature-properties">
      <div className="section-divider" /><h3>{selected.name}</h3>
      <NumberField label="Feature width" value={selected.width} min={0.2} max={40} onChange={(width) => onUpdate({ ...selected, width })} />
      {['bridge', 'lake'].includes(selected.kind) && <NumberField label={selected.kind === 'lake' ? 'Lake water level' : 'Bridge deck height'} value={selected.elevation ?? 0} min={-2000} max={2000} onChange={(elevation) => onUpdate({ ...selected, elevation })} />}
      {selected.kind === 'waterfall' && <NumberField label="Fall height" value={selected.drop ?? 8} min={0.5} max={100} onChange={(drop) => onUpdate({ ...selected, drop })} />}
      {selected.kind === 'river' && <>{([false, true] as const).map((end) => <label key={String(end)}>{end ? 'Flows into lake' : 'Flows out of lake'}<select value={(end ? selected.endLakeId : selected.startLakeId) ?? ''} onChange={(event) => connect(end, event.target.value)}><option value="">Unconnected</option>{lakes.map((lake) => <option key={lake.id} value={lake.id}>{lake.name}</option>)}</select></label>)}<p className="feature-note">Connecting snaps the endpoint to the nearest wet surface point at the lake level.</p>{notice && <p className="feature-warning">{notice}</p>}{featureFlowWarnings(selected, project).map((warning) => <p className="feature-warning" key={warning}>{warning}</p>)}</>}
      <p className="feature-note">{selected.kind === 'path' ? 'Path height follows terrain. Edit X/Z to change its route.' : selected.kind === 'lake' ? 'Outline X/Z sets the shore boundary. Water level sets the surface height.' : 'Edit vertices below. River point heights set its slope.'} Bridges are visual; first-person collision follows terrain.</p>
      <div className="feature-vertices">{selected.points.map((point, i) => <div className="feature-vertex" key={i}><b>Vertex {i + 1}</b><div className="feature-coordinate-grid">{(['X', 'Y', 'Z'] as const).map((axis, component) => <NumberField key={axis} label={`V${i + 1} ${axis}`} value={point[component]!} min={-2000} max={2000} onChange={(value) => { const points = selected.points.map((p) => [...p] as Vec3); points[i]![component] = value; onUpdate({ ...selected, points }); }} />)}</div></div>)}</div>
      <button className="delete-button" onClick={() => onDelete(selected.id)}>Delete feature</button>
    </div>}
  </div>;
}

