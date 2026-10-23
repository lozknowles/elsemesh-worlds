import { useRef, useEffect, useCallback } from 'react';
import './LandscapePanel.css';
import type { WorldProject } from '../domain/world';
import type { LandscapeKind, LandscapeLayer, LandscapeSceneryKind } from '../domain/landscape-types';
import {
  createLandscapeLayer,
  updateLandscapeLayer,
  addLandscapeMaterial,
  updateLandscapeMaterial,
  reorderLandscapeLayers,
  landscapeImageDigest,
  landscapeImageBytes,
  ensureLandscape,
} from '../domain/landscape';
import type { LandscapeTool } from './LandscapeGesture';
export default function LandscapePanel({
  project,
  getGeneration,
  tool,
  onTool,
  onChange,
  onFinish,
  onCancel,
  boundaryCount,
  error,
  onError,
}: {
  project: WorldProject;
  getGeneration: () => number;
  tool: LandscapeTool;
  onTool: (v: LandscapeTool) => void;
  onChange: (fn: (p: WorldProject) => WorldProject) => void;
  onFinish: () => void;
  onCancel: () => void;
  boundaryCount: number;
  error: string;
  onError: (s: string) => void;
}) {
  const imageRequest = useRef(0);
  const invalidateImageRequest = useCallback(() => {
    imageRequest.current++;
  }, []);
  useEffect(() => {
    invalidateImageRequest();
    return invalidateImageRequest;
  }, [project.metadata.worldId, invalidateImageRequest]);
  const landscape = project.landscape,
    layer = landscape?.layers.find((l) => l.id === tool.layerId),
    material = landscape?.materials.find((m) => m.id === layer?.materialId);
  const run = (fn: (p: WorldProject) => WorldProject) => {
    try {
      onChange(fn);
      onError('');
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const update = (patch: Partial<LandscapeLayer>) =>
    layer && run((p) => updateLandscapeLayer(p, layer.id, patch));
  const scatter = (patch: object) => layer?.scatter && update({ scatter: { ...layer.scatter, ...patch } });
  const number = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    fn: (v: number) => void,
  ) => (
    <label className="landscape-number">
      {label}
      <input
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}

        onChange={(e) => fn(Number(e.target.value))}
      />
    </label>
  );
  const texture = async (file?: File) => {
    const request = ++imageRequest.current,
      targetWorldId = project.metadata.worldId,
      targetGeneration = getGeneration(),
      targetMaterialId = material?.id;
    if (!file || !material) return;
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024)
        throw new Error('Choose a PNG/JPEG no larger than 2 MB.');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const bytes = landscapeImageBytes(dataUrl),
        bitmap = await createImageBitmap(file),
        width = bitmap.width,
        height = bitmap.height;
      bitmap.close();
      if (width > 2048 || height > 2048) throw new Error('Image dimensions must be at most 2048 × 2048.');
      if (request !== imageRequest.current) return;
      const id = 'sha256:' + landscapeImageDigest(bytes);
      run((p) => {
        if (
          request !== imageRequest.current ||
          getGeneration() !== targetGeneration ||
          p.metadata.worldId !== targetWorldId ||
          !p.landscape?.materials.some((m) => m.id === targetMaterialId)
        )
          return p;
        const next = ensureLandscape(p),
          images = next.landscape!.images.some((i) => i.id === id)
            ? next.landscape!.images
            : [
                ...next.landscape!.images,
                {
                  id,
                  mediaType: file.type as 'image/png' | 'image/jpeg',
                  dataUrl,
                  bytes: bytes.length,
                  width,
                  height,
                  name: file.name,
                },
              ];
        return updateLandscapeMaterial({ ...next, landscape: { ...next.landscape!, images } }, material.id, {
          imageRef: id,
        });
      });
    } catch (e) {
      if (request === imageRequest.current && getGeneration() === targetGeneration)
        onError((e as Error).message);
    }
  };
  return (
    <section
      className="landscape-panel"
      aria-label="Landscape painting"
      style={{ borderTop: '1px solid #587269', paddingTop: 16, marginTop: 20 }}
    >
      <h3>Landscape painting</h3>
      <p>Paint ground, scatter vegetation, or fill water. Each completed stroke is one undo step.</p>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['ground', 'vegetation', 'water'] as LandscapeKind[]).map((kind) => (
          <button
            key={kind}
            onClick={() =>
              run((p) => {
                const next = createLandscapeLayer(p, { kind });
                onTool({
                  ...tool,
                  enabled: true,
                  mode: 'paint',
                  layerId: next.landscape!.layers.at(-1)!.id,
                  shape: kind === 'water' ? 'area' : 'brush',
                });
                return next;
              })
            }
          >
            + {kind}
          </button>
        ))}
      </div>
      <ol style={{ paddingLeft: 20 }}>
        {landscape?.layers.map((l, i) => (
          <li key={l.id} style={{ margin: '7px 0' }}>
            <button
              className={layer?.id === l.id ? 'chosen' : ''}
              onClick={() => onTool({ ...tool, layerId: l.id, enabled: true })}
            >
              {l.name}
            </button>
            <button
              aria-label={'Toggle ' + l.name + ' visibility'}
              disabled={l.locked}
              onClick={() => run((p) => updateLandscapeLayer(p, l.id, { visible: !l.visible }))}
            >
              {l.visible ? '◉' : '○'}
            </button>
            <button
              aria-label={'Toggle ' + l.name + ' lock'}
              onClick={() => run((p) => updateLandscapeLayer(p, l.id, { locked: !l.locked }))}
            >
              {l.locked ? '🔒' : '🔓'}
            </button>
            <button
              disabled={i === 0}
              aria-label={'Move ' + l.name + ' earlier'}
              onClick={() =>
                run((p) => {
                  const ids = p.landscape!.layers.map((x) => x.id);
                  [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!];
                  return reorderLandscapeLayers(p, ids);
                })
              }
            >
              ↑
            </button>
          </li>
        ))}
      </ol>
      {layer && (
        <>
          <label>
            Layer name
            <input
              aria-label="Landscape layer name"
              value={layer.name}
              disabled={layer.locked}
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
          <fieldset disabled={layer.locked}>
            <legend>{layer.kind}</legend>
            {layer.kind === 'ground' && (
              <>
                <label>
                  Ground material
                  <select
                    aria-label="Ground material"
                    value={layer.materialId}
                    onChange={(e) => update({ materialId: e.target.value })}
                  >
                    {landscape!.materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => {
                    const id = 'landscape-material:' + crypto.randomUUID();
                    run((p) =>
                      updateLandscapeLayer(
                        addLandscapeMaterial(p, {
                          id,
                          name: 'Custom ground',
                          preset: 'custom',
                          color: '#718459',
                          roughness: 0.9,
                          tiling: 4,
                        }),
                        layer.id,
                        { materialId: id },
                      ),
                    );
                  }}
                >
                  New custom material
                </button>
                {material && (
                  <details>
                    <summary>Edit ground definition</summary>
                    <label>
                      Name
                      <input
                        value={material.name}
                        onChange={(e) =>
                          run((p) => updateLandscapeMaterial(p, material.id, { name: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Color
                      <input
                        type="color"
                        value={material.color}
                        onChange={(e) =>
                          run((p) => updateLandscapeMaterial(p, material.id, { color: e.target.value }))
                        }
                      />
                    </label>
                    {number('Roughness', material.roughness, 0, 1, 0.05, (v) =>
                      run((p) => updateLandscapeMaterial(p, material.id, { roughness: v })),
                    )}
                    {number('Texture repeat metres', material.tiling, 0.1, 100, 0.1, (v) =>
                      run((p) => updateLandscapeMaterial(p, material.id, { tiling: v })),
                    )}
                    <label>
                      Embedded PNG/JPEG
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(e) => void texture(e.target.files?.[0])}
                      />
                    </label>
                    {material.imageRef && <small>Embedded image: {material.imageRef.slice(0, 23)}…</small>}
                  </details>
                )}
              </>
            )}
            {layer.scatter && (
              <>
                <label>
                  Vegetation
                  <select
                    aria-label="Vegetation class"
                    value={layer.scatter.kind}
                    onChange={(e) => scatter({ kind: e.target.value as LandscapeSceneryKind })}
                  >
                    {['tree', 'shrub', 'grass', 'flower', 'rock'].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                {layer.scatter.kind === 'tree' && (
                  <label>
                    Tree species
                    <select
                      aria-label="Tree species"
                      value={layer.scatter.treeSpecies}
                      onChange={(e) => scatter({ treeSpecies: e.target.value })}
                    >
                      {['broadleaf', 'pine', 'palm'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                )}
                {number('Density', layer.scatter.density, 0, 1, 0.05, (v) => scatter({ density: v }))}
                {number('Spacing metres', layer.scatter.spacing, 0.5, 64, 0.5, (v) =>
                  scatter({ spacing: v }),
                )}
                {number('Variation', layer.scatter.variation, 0, 1, 0.05, (v) => scatter({ variation: v }))}
                {number('Seed', layer.scatter.seed, 0, 2147483647, 1, (v) => scatter({ seed: v }))}
                {number('Minimum scale', layer.scatter.scaleMin, 0.1, 20, 0.1, (v) =>
                  scatter({ scaleMin: v }),
                )}
                {number('Maximum scale', layer.scatter.scaleMax, 0.1, 20, 0.1, (v) =>
                  scatter({ scaleMax: v }),
                )}
                <details>
                  <summary>Slope, elevation and exclusions</summary>
                  {number('Minimum elevation', layer.scatter.constraints.minElevation, -2000, 2000, 1, (v) =>
                    scatter({ constraints: { ...layer.scatter!.constraints, minElevation: v } }),
                  )}
                  {number('Maximum elevation', layer.scatter.constraints.maxElevation, -2000, 2000, 1, (v) =>
                    scatter({ constraints: { ...layer.scatter!.constraints, maxElevation: v } }),
                  )}
                  {number('Maximum slope', layer.scatter.constraints.maxSlope, 0, 90, 1, (v) =>
                    scatter({ constraints: { ...layer.scatter!.constraints, maxSlope: v } }),
                  )}
                  {number('Clearance metres', layer.scatter.constraints.clearance, 0, 20, 0.1, (v) =>
                    scatter({ constraints: { ...layer.scatter!.constraints, clearance: v } }),
                  )}
                  {(['excludePaths', 'excludeBuildings', 'excludeWater'] as const).map((k) => (
                    <label key={k} style={{ display: 'block' }}>
                      <input
                        type="checkbox"
                        checked={layer.scatter!.constraints[k]}
                        onChange={(e) =>
                          scatter({ constraints: { ...layer.scatter!.constraints, [k]: e.target.checked } })
                        }
                      />
                      {k.replace('exclude', 'Avoid ')}
                    </label>
                  ))}
                </details>
              </>
            )}
            {layer.water && (
              <>
                {number('Water level', layer.water.level, -2000, 2000, 0.1, (v) =>
                  update({ water: { ...layer.water!, level: v } }),
                )}
                {number('Wave amplitude', layer.water.waveAmplitude, 0, 5, 0.05, (v) =>
                  update({ water: { ...layer.water!, waveAmplitude: v } }),
                )}
                {number('Wave speed', layer.water.waveSpeed, 0, 10, 0.1, (v) =>
                  update({ water: { ...layer.water!, waveSpeed: v } }),
                )}
                {number('Shore fade metres', layer.water.shoreFade, 0.1, 100, 0.1, (v) =>
                  update({ water: { ...layer.water!, shoreFade: v } }),
                )}
              </>
            )}
            <label>
              Gesture
              <select
                aria-label="Gesture"
                value={tool.shape}
                onChange={(e) => onTool({ ...tool, shape: e.target.value as 'brush' | 'area' })}
              >
                <option value="brush">Brush stroke</option>
                <option value="area">Closed boundary</option>
              </select>
            </label>
            <label>
              Operation
              <select
                aria-label="Operation"
                value={tool.mode}
                onChange={(e) => onTool({ ...tool, mode: e.target.value as LandscapeTool['mode'] })}
              >
                <option value="paint">Fill / paint</option>
                <option value="replace">Replace</option>
                <option value="erase">Erase / clearing</option>
              </select>
            </label>
            {number('Brush radius', tool.radius, 0.25, 100, 0.25, (v) => onTool({ ...tool, radius: v }))}
            {number('Coverage strength', tool.strength, 0, 1, 0.05, (v) => onTool({ ...tool, strength: v }))}
            {number('Edge falloff', tool.falloff, 0, 1, 0.05, (v) => onTool({ ...tool, falloff: v }))}
            <button
              className={tool.enabled ? 'chosen' : ''}
              onClick={() => onTool({ ...tool, enabled: !tool.enabled })}
            >
              {tool.enabled ? 'Stop painting' : 'Paint selected layer'}
            </button>
            {tool.shape === 'area' && (
              <>
                <p>{boundaryCount} boundary points · Enter finishes · Escape cancels</p>
                <button disabled={boundaryCount < 3} onClick={onFinish}>
                  Finish boundary
                </button>
                <button onClick={onCancel}>Cancel boundary</button>
              </>
            )}
          </fieldset>
          <p>Stop painting, then click a generated tree to make it an editable object.</p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
