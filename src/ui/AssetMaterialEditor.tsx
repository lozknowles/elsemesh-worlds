import { useEffect, useState } from 'react';
import type { EditorObject, WorldAsset } from '../domain/world';
import { disposeAssetScene, inspectAndLoadAsset } from './asset-admission';

export default function AssetMaterialEditor({ object, asset, onChange }: { object: EditorObject; asset?: WorldAsset; onChange: (overrides: NonNullable<EditorObject['materialOverrides']>) => void }) {
  const [discovered, setDiscovered] = useState<NonNullable<WorldAsset['materialSlots']>>([]);
  const [slotIndex, setSlotIndex] = useState(0);
  useEffect(() => {
    if (!asset || asset.materialSlots) return;
    let alive = true;
    void (async () => {
      const loaded = await inspectAndLoadAsset(await (await fetch(asset.dataUrl)).arrayBuffer());
      if (alive) setDiscovered(loaded.materialSlots);
      disposeAssetScene(loaded.scene);
    })().catch(() => { if (alive) setDiscovered([]); });
    return () => { alive = false; };
  }, [asset]);
  const slots = asset?.materialSlots ?? discovered;
  const source = slots.find((slot) => slot.index === slotIndex) ?? slots[0];
  if (!source) return <p className="library-note">This model has no editable glTF material slots.</p>;
  const overrides = object.materialOverrides ?? [];
  const override = overrides.find((entry) => entry.materialIndex === source.index);
  const update = (patch: Partial<NonNullable<EditorObject['materialOverrides']>[number]>) => onChange([...overrides.filter((entry) => entry.materialIndex !== source.index), { ...override, materialIndex: source.index, ...patch }]);
  return <div className="glb-material-controls">
    <label>Material slot<select aria-label="Material slot" value={source.index} onChange={(event) => setSlotIndex(Number(event.target.value))}>{slots.map((slot) => <option key={slot.index} value={slot.index}>glTF {slot.index} · {slot.name || 'Material'}</option>)}</select></label>
    <label>Color multiplier<div className="color-row"><input aria-label="Material color" type="color" value={override?.color ?? source.color} onChange={(event) => update({ color: event.target.value })} /><span>{(override?.color ?? source.color).toUpperCase()}</span></div></label>
    <label>Roughness <span>{(override?.roughness ?? source.roughness).toFixed(2)}</span><input aria-label="Material roughness" type="range" min={0} max={1} step={0.01} value={override?.roughness ?? source.roughness} onChange={(event) => update({ roughness: Number(event.target.value) })} /></label>
    <label>Metalness <span>{(override?.metalness ?? source.metalness).toFixed(2)}</span><input aria-label="Material metalness" type="range" min={0} max={1} step={0.01} value={override?.metalness ?? source.metalness} onChange={(event) => update({ metalness: Number(event.target.value) })} /></label>
    <button className="reset-material-button" onClick={() => onChange(overrides.filter((entry) => entry.materialIndex !== source.index))}>Reset slot to source</button>
    <button className="reset-material-button" onClick={() => onChange([])}>Reset all materials</button>
    <p className="library-note">Changes affect this object instance. Source textures and material groups stay assigned.</p>
  </div>;
}
