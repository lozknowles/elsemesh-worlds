import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import * as THREE from 'three';
import {
  createTerrain,
  createPlayerWorldPackage,
  createWorld,
  paintTerrain,
  sampleTerrain,
  sculptTerrain,
  validateWorld,
  MAX_PROJECT_BYTES,
} from '../domain/world';
import type { DrawnFeature, EditorObject, FeatureKind, PrimitiveKind, Vec3, WorldAsset, WorldProject } from '../domain/world';
import { loadSavedProject, saveProject as persistProject } from '../domain/persistence';
import NativePreview from './NativePreview';
import TreeShape from './TreeShape';
import { TREE_SPECIES } from '../domain/trees';
import DrawnFeatures from './DrawnFeatures';
import FeaturePanel from './FeaturePanel';
import Weather from './Weather';
import ImportedAsset from './ImportedAsset';
import { admitGlb } from './asset-admission';
import { assetLibrary, createLibraryObject, groundObject } from '../domain/asset-library';
import type { LibraryAsset } from '../domain/asset-library';
import AssetMaterialEditor from './AssetMaterialEditor';
import GeoPanel from './GeoPanel';
import RepositoryPanel from './RepositoryPanel';
import type { createGeographicTerrain, TerrainImagery } from '../domain/geography';

type Tool = 'select' | 'translate' | 'rotate' | 'scale';
type Brush = 'raise' | 'lower' | 'flatten' | 'smooth' | 'paint' | 'vertices';
const palettes = ['#a8b87b', '#cf956c', '#9dabb9', '#d8c36e', '#779e9a', '#d7d4c8'];
const terrainColors = [
  [0.38, 0.49, 0.32],
  [0.54, 0.39, 0.27],
  [0.48, 0.5, 0.48],
  [0.7, 0.63, 0.43],
] as const;
const newId = () => crypto.randomUUID();

function TerrainMesh({
  project,
  editing,
  brush,
  radius,
  strength,
  material,
  onSculpt,
  onDragging,
  onTerrainPoint,
}: {
  project: WorldProject;
  editing: boolean;
  brush: Brush;
  radius: number;
  strength: number;
  material: number;
  onSculpt: (next: WorldProject) => void;
  onDragging: (dragging: boolean) => void;
  onTerrainPoint?: (point: Vec3) => void;
}) {
  const { camera, gl, size, controls } = useThree();
  const [draft, setDraft] = useState<WorldProject['terrain'] | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const cancelDrag = useRef<(() => void) | null>(null);
  const terrain = draft ?? project.terrain;
  const [loadedImagery, setLoadedImagery] = useState<{ url: string; texture: THREE.Texture } | null>(null);
  const imageryUrl = project.terrainImagery?.dataUrl;
  const imageryTexture = loadedImagery?.url === imageryUrl ? loadedImagery?.texture ?? null : null;
  useEffect(() => {
    let alive = true;
    let loaded: THREE.Texture | null = null;
    if (imageryUrl) new THREE.TextureLoader().load(imageryUrl, (texture) => {
      if (!alive) { texture.dispose(); return; }
      texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
      loaded = texture; setLoadedImagery({ url: imageryUrl, texture });
    });
    return () => { alive = false; loaded?.dispose(); };
  }, [imageryUrl]);
  useEffect(() => () => cancelDrag.current?.(), [project, editing, brush]);
  const geometry = useMemo(() => {
    const { width, depth, resolution, heights } = terrain;
    const vertices = new Float32Array(resolution * resolution * 3);
    const colors = new Float32Array(resolution * resolution * 3);
    const uvs = new Float32Array(resolution * resolution * 2);
    const indices: number[] = [];
    for (let z = 0; z < resolution; z++)
      for (let x = 0; x < resolution; x++) {
        const i = z * resolution + x;
        const h = heights[i] ?? 0;
        vertices.set(
          [(x * width) / (resolution - 1) - width / 2, h, (z * depth) / (resolution - 1) - depth / 2],
          i * 3,
        );
        const imageryBounds = project.terrainImagery?.bounds, center = project.geography?.center;
        uvs.set(imageryBounds && center
          ? [(x * width / (resolution - 1) - width / 2 + center.easting - imageryBounds.west) / (imageryBounds.east - imageryBounds.west), (z * depth / (resolution - 1) - depth / 2 + imageryBounds.north - center.northing) / (imageryBounds.north - imageryBounds.south)]
          : [x / (resolution - 1), z / (resolution - 1)], i * 2);
        const tint = Math.max(0.68, Math.min(1.22, 0.88 + h / 55));
        const color = terrainColors[terrain.materials[i] ?? 0] ?? terrainColors[0];
        colors.set([color[0] * tint, color[1] * tint, color[2] * tint], i * 3);
        if (x < resolution - 1 && z < resolution - 1) {
          const a = i,
            b = i + 1,
            c = i + resolution,
            d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    result.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    result.setIndex(indices);
    result.computeVertexNormals();
    return result;
  }, [terrain, project.terrainImagery?.bounds, project.geography?.center]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const brushAt = (event: ThreeEvent<PointerEvent>) => {
    if (!editing) return;
    event.stopPropagation();
    if (onTerrainPoint) return;
    if (brush === 'vertices') {
      if (event.button !== 0 || cancelDrag.current) return;
      const base = project.terrain;
      const { resolution, width, depth } = base;
      const x = Math.max(0, Math.min(resolution - 1, Math.round((event.point.x / width + 0.5) * (resolution - 1))));
      const z = Math.max(0, Math.min(resolution - 1, Math.round((event.point.z / depth + 0.5) * (resolution - 1))));
      const index = z * resolution + x;
      const origin = new THREE.Vector3(x * width / (resolution - 1) - width / 2, base.heights[index] ?? 0, z * depth / (resolution - 1) - depth / 2);
      const worldPerPixel = camera instanceof THREE.PerspectiveCamera
        ? 2 * camera.position.distanceTo(origin) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / size.height
        : 0.1;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      let latest = base;
      let changed = false;
      const orbit = controls as { enabled: boolean } | null;
      const orbitWasEnabled = orbit?.enabled ?? true;
      if (orbit) orbit.enabled = false;
      onDragging(true);
      setSelectedVertex(index);
      gl.domElement.setPointerCapture(pointerId);
      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const delta = (startY - moveEvent.clientY) * worldPerPixel;
        const heights = [...base.heights];
        const xRadius = Math.ceil(radius * (resolution - 1) / width);
        const zRadius = Math.ceil(radius * (resolution - 1) / depth);
        for (let zz = Math.max(0, z - zRadius); zz <= Math.min(resolution - 1, z + zRadius); zz++) {
          for (let xx = Math.max(0, x - xRadius); xx <= Math.min(resolution - 1, x + xRadius); xx++) {
            const i = zz * resolution + xx;
            const distance = Math.hypot((xx - x) * width / (resolution - 1), (zz - z) * depth / (resolution - 1));
            const influence = Math.max(0, 1 - distance / radius);
            heights[i] = Math.max(-2000, Math.min(2000, (base.heights[i] ?? 0) + delta * influence * influence * (3 - 2 * influence)));
          }
        }
        latest = { ...base, heights };
        changed = Math.abs(delta) > 0.001;
        setDraft(latest);
      };
      const finish = (commit: boolean) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('blur', cancel);
        window.removeEventListener('keydown', keydown);
        if (gl.domElement.hasPointerCapture(pointerId)) gl.domElement.releasePointerCapture(pointerId);
        if (orbit) orbit.enabled = orbitWasEnabled;
        cancelDrag.current = null;
        onDragging(false);
        setDraft(null);
        if (commit && changed) onSculpt({ ...project, terrain: latest });
      };
      const up = (upEvent: PointerEvent) => { if (upEvent.pointerId === pointerId) finish(true); };
      const cancel = () => finish(false);
      const keydown = (keyEvent: KeyboardEvent) => { if (keyEvent.key === 'Escape') cancel(); };
      cancelDrag.current = cancel;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('blur', cancel);
      window.addEventListener('keydown', keydown);
      return;
    }
    const terrain =
      brush === 'paint'
        ? paintTerrain(
            material === 2
              ? sculptTerrain(project.terrain, event.point.x, event.point.z, radius, strength, 'raise')
              : project.terrain,
            event.point.x, event.point.z, radius, material,
          )
        : sculptTerrain(project.terrain, event.point.x, event.point.z, radius, strength, brush);
    onSculpt({ ...project, terrain });
  };
  return (
    <>
    <mesh geometry={geometry} receiveShadow onPointerDown={brushAt} onClick={(event) => { if (onTerrainPoint && event.button === 0 && event.delta < 5) { event.stopPropagation(); onTerrainPoint([event.point.x, event.point.y, event.point.z]); } }}>
      <meshStandardMaterial key={imageryTexture?.uuid ?? 'terrain-palette'} vertexColors map={imageryTexture} roughness={0.92} side={THREE.DoubleSide} customProgramCacheKey={() => 'geographic-imagery-v1'} onBeforeCompile={(shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '').replace('#include <color_fragment>', `#include <color_fragment>
          #ifdef USE_MAP
          float geographicCoverage=step(0.0,vMapUv.x)*step(vMapUv.x,1.0)*step(0.0,vMapUv.y)*step(vMapUv.y,1.0);
          diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(map,vMapUv).rgb,geographicCoverage);
          #endif`);
      }} />
    </mesh>
    {editing && brush === 'vertices' && !onTerrainPoint && (
      <>
        <points geometry={geometry} position={[0, 0.04, 0]} raycast={() => {}} renderOrder={2}>
          <pointsMaterial color="#f5e8ac" size={Math.max(1, Math.min(3, 195 / terrain.resolution))} sizeAttenuation={false} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </points>
        {selectedVertex !== null && selectedVertex < terrain.heights.length && (
          <mesh position={[(selectedVertex % terrain.resolution) * terrain.width / (terrain.resolution - 1) - terrain.width / 2, (terrain.heights[selectedVertex] ?? 0) + 0.12, Math.floor(selectedVertex / terrain.resolution) * terrain.depth / (terrain.resolution - 1) - terrain.depth / 2]} raycast={() => {}}>
            <sphereGeometry args={[Math.max(0.18, terrain.width / terrain.resolution * 0.16), 12, 8]} />
            <meshBasicMaterial color="#fff2a2" depthTest={false} />
          </mesh>
        )}
      </>
    )}
    </>
  );
}

function Shape({ object, asset }: { object: EditorObject; asset?: WorldProject['assets'][number] }) {
  const common = { castShadow: true, receiveShadow: true };
  if (object.kind === 'glb') return <ImportedAsset asset={asset} overrides={object.materialOverrides} />;
  if (object.kind === 'sphere')
    return (
      <mesh {...common}>
        <sphereGeometry args={[0.8, 32, 24]} />
        <meshStandardMaterial color={object.color} roughness={0.72} />
      </mesh>
    );
  if (object.kind === 'cylinder')
    return (
      <mesh {...common}>
        <cylinderGeometry args={[0.65, 0.65, 1.6, 32]} />
        <meshStandardMaterial color={object.color} roughness={0.76} />
      </mesh>
    );
  if (object.kind === 'cone')
    return (
      <mesh {...common}>
        <coneGeometry args={[0.8, 1.6, 32]} />
        <meshStandardMaterial color={object.color} roughness={0.8} />
      </mesh>
    );
  if (object.kind === 'tree')
    return <TreeShape species={object.treeSpecies} seed={object.treeSeed} color={object.color} />;
  if (object.kind === 'building')
    return (
      <group>
        <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.6, 2.2, 3]} />
          <meshStandardMaterial color={object.color} />
        </mesh>
        <mesh position={[0, 2.55, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[2.7, 1.1, 4]} />
          <meshStandardMaterial color="#574e42" />
        </mesh>
      </group>
    );
  return (
    <mesh {...common}>
      <boxGeometry args={[1.6, 1.6, 1.6]} />
      <meshStandardMaterial color={object.color} roughness={0.72} />
    </mesh>
  );
}

function WorldEntity({
  object,
  asset,
  selected,
  tool,
  select,
  moved,
  snapEnabled,
  snapStep,
}: {
  object: EditorObject;
  asset?: WorldProject['assets'][number];
  selected: boolean;
  tool: Tool;
  select: () => void;
  moved: (object: EditorObject) => void;
  snapEnabled: boolean;
  snapStep: number;
}) {
  const [target, setTarget] = useState<THREE.Group | null>(null);
  const attach = useCallback((node: THREE.Group | null) => setTarget(node), []);
  return (
    <>
      <group
        ref={attach}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        visible={object.visible}
        onPointerDown={(event) => {
          event.stopPropagation();
          select();
        }}
      >
        <Shape object={object} asset={asset} />
        {selected && (
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.2, 1.24, 48]} />
            <meshBasicMaterial color="#e5bd6c" side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
      {selected && tool !== 'select' && target && (
        <TransformControls
          object={target}
          mode={tool}
          translationSnap={snapEnabled ? snapStep : null}
          rotationSnap={snapEnabled ? THREE.MathUtils.degToRad(15) : null}
          scaleSnap={snapEnabled ? 0.1 : null}
          onMouseUp={() => {
            moved({
              ...object,
              position: target.position.toArray() as [number, number, number],
              rotation: target.rotation.toArray().slice(0, 3) as [number, number, number],
              scale: target.scale.toArray() as [number, number, number],
            });
          }}
        />
      )}
    </>
  );
}

function PreviewCamera({
  project,
  active,
  onExit,
}: {
  project: WorldProject;
  active: boolean;
  onExit: () => void;
}) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const velocityY = useRef(0);
  const yaw = useRef(project.spawn.yaw);
  const pitch = useRef(0);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!active) {
      document.exitPointerLock?.();
      return;
    }
    camera.position.set(
      project.spawn.position[0],
      project.spawn.position[1] + 1.65,
      project.spawn.position[2],
    );
    camera.rotation.set(0, yaw.current, 0);
    const down = (event: globalThis.KeyboardEvent) => {
      keys.current.add(event.code);
      if (event.code === 'Escape') onExit();
    };
    const up = (event: globalThis.KeyboardEvent) => keys.current.delete(event.code);
    const lock = () => setLocked(document.pointerLockElement === gl.domElement);
    const move = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      yaw.current -= event.movementX * 0.002;
      pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - event.movementY * 0.002));
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    document.addEventListener('pointerlockchange', lock);
    document.addEventListener('mousemove', move);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      document.removeEventListener('pointerlockchange', lock);
      document.removeEventListener('mousemove', move);
    };
  }, [active, camera, gl, onExit, project.spawn]);
  useFrame((_, delta) => {
    if (!active) return;
    const dt = Math.min(delta, 0.04),
      key = keys.current;
    const speed = key.has('ShiftLeft') ? 8 : 4.5;
    const forward = Number(key.has('KeyW')) - Number(key.has('KeyS'));
    const side = Number(key.has('KeyD')) - Number(key.has('KeyA'));
    const dir = new THREE.Vector3(side, 0, -forward)
      .normalize()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
    const oldX = camera.position.x,
      oldZ = camera.position.z;
    camera.position.x += dir.x * speed * dt;
    camera.position.z += dir.z * speed * dt;
    const feet = camera.position.y - 1.65;
    let groundY = sampleTerrain(project.terrain, camera.position.x, camera.position.z);
    for (const object of project.objects) {
      if (!object.visible || object.collision === 'none') continue;
      const sx = object.scale[0],
        sy = object.scale[1],
        sz = object.scale[2];
      const halfX = (object.kind === 'building' ? 1.8 : object.kind === 'tree' ? 0.45 : 0.8) * sx;
      const halfZ = (object.kind === 'building' ? 1.5 : object.kind === 'tree' ? 0.45 : 0.8) * sz;
      const bottom = object.position[1] - (object.kind === 'tree' ? 0 : 0.8) * sy;
      const top = object.position[1] + (object.kind === 'tree' ? 4.25 : 0.8) * sy;
      const overlaps =
        Math.abs(camera.position.x - object.position[0]) < halfX + 0.28 &&
        Math.abs(camera.position.z - object.position[2]) < halfZ + 0.28;
      if (!overlaps) continue;
      if (object.collision === 'walkable' && feet <= top + 0.45) groundY = Math.max(groundY, top);
      else if (feet < top && feet + 1.75 > bottom) {
        camera.position.x = oldX;
        camera.position.z = oldZ;
      }
    }
    const ground = groundY + 1.65;
    if (key.has('Space') && camera.position.y <= ground + 0.03) velocityY.current = 5.2;
    velocityY.current -= 12 * dt;
    camera.position.y = Math.max(ground, camera.position.y + velocityY.current * dt);
    if (camera.position.y <= ground) velocityY.current = 0;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch.current, yaw.current, 0);
  });
  return active && !locked ? (
    <mesh position={[0, -10000, 0]} visible={false}>
      <boxGeometry />
      <meshBasicMaterial />
    </mesh>
  ) : null;
}

function Scene({
  project,
  selectedId,
  setSelectedId,
  tool,
  setProject,
  brush,
  radius,
  strength,
  material,
  preview,
  terrainEditing,
  onExitPreview,
  objects,
  viewPreset,
  draftFeature,
  selectedFeatureId,
  onSelectFeature,
  onTerrainPoint,
  snapEnabled,
  snapStep,
}: {
  project: WorldProject;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  tool: Tool;
  setProject: (fn: (p: WorldProject) => WorldProject) => void;
  brush: Brush;
  radius: number;
  strength: number;
  material: number;
  preview: boolean;
  terrainEditing: boolean;
  onExitPreview: () => void;
  objects: EditorObject[];
  viewPreset: 'perspective' | 'top';
  draftFeature: DrawnFeature | null;
  selectedFeatureId: string | null;
  onSelectFeature: (id: string) => void;
  onTerrainPoint?: (point: Vec3) => void;
  snapEnabled: boolean;
  snapStep: number;
}) {
  const camera = useThree((state) => state.camera);
  const [terrainDragging, setTerrainDragging] = useState(false);
  const cameraConfiguration = useRef<{ view: string; geography: WorldProject['geography']; worldId: string } | null>(null);
  useEffect(() => {
    if (cameraConfiguration.current?.view === viewPreset && cameraConfiguration.current?.geography === project.geography && cameraConfiguration.current?.worldId === project.metadata.worldId) return;
    cameraConfiguration.current = { view: viewPreset, geography: project.geography, worldId: project.metadata.worldId };
    camera.up.set(0, 1, 0);
    const warehouse = project.metadata.worldId.startsWith('elsemesh.world:warehouse-portal-interior');
    const extent = project.geography ? Math.max(project.terrain.width, project.terrain.depth) : warehouse ? 40 : 0;
    const height = project.geography ? Math.max(...project.terrain.heights) : 0;
    if (viewPreset === 'top') {
      camera.position.set(0, extent ? height + extent * 1.4 : 95, 0.01);
      camera.up.set(0, 0, -1);
    } else if (warehouse) camera.position.set(30, 30, -30);
    else if (extent) camera.position.set(extent * 0.8, height + extent * 0.65, extent * 0.85);
    else camera.position.set(82, 65, 88);
    camera.lookAt(0, project.geography ? sampleTerrain(project.terrain, 0, 0) : 2, 0);
    camera.updateProjectionMatrix();
  }, [camera, viewPreset, project.geography, project.terrain, project.metadata.worldId]);
  const selected = objects.find((object) => object.id === selectedId);
  const onSculpt = useCallback((next: WorldProject) => setProject(() => next), [setProject]);
  return (
    <>
      <color attach="background" args={[project.environment.skyColor]} />
      <fog
        attach="fog"
        args={[
          project.environment.skyColor,
          65,
          project.environment.fog > 0 ? Math.max(project.geography ? project.terrain.width * 3 : 0, Math.min(10000, 1 / project.environment.fog)) : 10000,
        ]}
      />
      <ambientLight intensity={0.7} />
      <Weather environment={project.environment} />
      <directionalLight
        position={[
          Math.cos(project.environment.sunAzimuth) * 48,
          Math.max(0.2, Math.sin(project.environment.sunElevation)) * 64,
          Math.sin(project.environment.sunAzimuth) * 48,
        ]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {!preview && (
        <Grid
          position={[0, -0.04, 0]}
          args={[160, 160]}
          cellSize={2}
          cellThickness={0.4}
          cellColor="#60746d"
          sectionSize={10}
          sectionThickness={0.8}
          sectionColor="#425b51"
          fadeDistance={100}
          infiniteGrid
        />
      )}
      <Suspense fallback={null}>
        <TerrainMesh
          project={project}
          editing={terrainEditing || !!onTerrainPoint}
          brush={brush}
          radius={radius}
          strength={strength}
          material={material}
          onSculpt={onSculpt}
          onDragging={setTerrainDragging}
          onTerrainPoint={onTerrainPoint}
        />
        <DrawnFeatures project={project} draft={draftFeature} selectedId={selectedFeatureId} onSelect={onSelectFeature} editing={!preview} />
        {objects
          .filter((object) => object.id !== selectedId)
          .map((object) => (
            <WorldEntity
              key={object.id}
              object={object}
              asset={project.assets.find((item) => item.id === object.assetId)}
              selected={false}
              tool={tool}
              snapEnabled={snapEnabled}
              snapStep={snapStep}
              select={() => setSelectedId(object.id)}
              moved={(next) =>
                setProject((p) => ({
                  ...p,
                  objects: p.objects.map((item) => (item.id === next.id ? next : item)),
                }))
              }
            />
          ))}
        {selected && (
          <WorldEntity
            key={`${selected.id}-${tool}`}
            object={selected}
            asset={project.assets.find((item) => item.id === selected.assetId)}
            selected
            tool={tool}
            snapEnabled={snapEnabled}
            snapStep={snapStep}
            select={() => setSelectedId(selected.id)}
            moved={(next) =>
              setProject((p) => ({
                ...p,
                objects: p.objects.map((item) => (item.id === next.id ? next : item)),
              }))
            }
          />
        )}
      </Suspense>
      <OrbitControls
        makeDefault
        enabled={!preview && !terrainDragging}
        target={[0, project.geography ? sampleTerrain(project.terrain, 0, 0) : 3, 0]}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={4}
        maxDistance={Math.max(220, project.terrain.width * 4)}
      />
      <PreviewCamera project={project} active={preview} onExit={onExitPreview} />
    </>
  );
}

function makeObject(kind: PrimitiveKind): EditorObject {
  const label = kind === 'box' ? 'Cube' : kind[0]?.toUpperCase() + kind.slice(1);
  return {
    id: newId(),
    name: `${label}`,
    kind,
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color:
      kind === 'tree'
        ? '#577854'
        : kind === 'building'
          ? '#d3c2a0'
          : (palettes[Math.floor(Math.random() * palettes.length)] ?? palettes[0]!),
    visible: true,
    collision: 'solid',
  };
}

export default function App() {
  const [project, setProjectState] = useState<WorldProject>(() => createWorld('Northwind test world'));
  const projectRef = useRef(project);
  const setProjectRaw = useCallback((next: WorldProject) => {
    projectRef.current = next;
    setProjectState(next);
  }, []);
  const objects = project.objects;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [brush, setBrush] = useState<Brush>('raise');
  const [brushRadius, setBrushRadius] = useState(8);
  const [strength, setStrength] = useState(1.2);
  const [terrainMaterial, setTerrainMaterial] = useState(0);
  const [draftFeature, setDraftFeature] = useState<DrawnFeature | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [featureWidth, setFeatureWidth] = useState(4);
  const [featureElevation, setFeatureElevation] = useState(5);
  const [waterfallDrop, setWaterfallDrop] = useState(8);
  const [treeSpecies, setTreeSpecies] = useState<NonNullable<EditorObject['treeSpecies']>>('broadleaf');
  const [placingTree, setPlacingTree] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetCategory, setAssetCategory] = useState('All');
  const [librarySelection, setLibrarySelection] = useState<LibraryAsset | null>(null);
  const [assetBusy, setAssetBusy] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapStep, setSnapStep] = useState(0.5);
  const worldGeneration = useRef(0);
  const assetOperation = useRef(0);
  const pendingAssetOperation = useRef<number | null>(null);
  const [viewPreset, setViewPreset] = useState<'perspective' | 'top'>('perspective');
  const [preview, setPreview] = useState(false);
  const [nativePreview, setNativePreview] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState('Saved locally');
  const [toast, setToast] = useState('');
  const [warehouseBusy, setWarehouseBusy] = useState(false);
  const [panel, setPanel] = useState<'scene' | 'assets' | 'terrain' | 'pen' | 'geo' | 'world'>('scene');
  const undoStack = useRef<WorldProject[]>([]);
  const redoStack = useRef<WorldProject[]>([]);
  const saveRevision = useRef(0);
  const selected = objects.find((object) => object.id === selectedId) ?? null;
  const current = project;
  const exitPreview = useCallback(() => setPreview(false), []);

  const setProject = useCallback((update: (value: WorldProject) => WorldProject) => {
    const before = projectRef.current;
    const next = update(before);
    if (next === before) return;
    undoStack.current = [...undoStack.current.slice(-39), before];
    redoStack.current = [];
    setProjectRaw(next);
  }, [setProjectRaw]);
  useEffect(() => {
    let alive = true;
    worldGeneration.current++;
    void loadSavedProject()
      .then((loaded) => {
        if (!alive) return;
        if (loaded) {
          const result = validateWorld(loaded);
          if (result.valid && result.project) {
            setProjectRaw(result.project);
          }
        }
        setHydrated(true);
      })
      .catch(() => {
        if (alive) {
          setSaved('Local storage unavailable');
          setHydrated(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [setProjectRaw]);
  useEffect(() => {
    if (!hydrated) return;
    const revision = Math.max(Date.now(), saveRevision.current + 1);
    saveRevision.current = revision;
    const id = window.setTimeout(() => {
      void persistProject(current, revision)
        .then(() => {
          if (saveRevision.current === revision)
            setSaved(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        })
        .catch(() => {
          if (saveRevision.current === revision) setSaved('Save failed — export a project file');
        });
    }, 350);
    return () => window.clearTimeout(id);
  }, [current, hydrated]);
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDraftFeature(null);
        setPlacingTree(false);
      } else if (event.key === 'Enter' && draftFeature && !isTyping(event.target)) {
        event.preventDefault(); finishFeature();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedId) {
        event.preventDefault();
        duplicateSelected();
      } else if (event.code === 'Delete' && selectedId && !preview) deleteSelected();
      else if (!preview && ['q', 'w', 'e', 'r'].includes(event.key.toLowerCase()) && !isTyping(event.target))
        setTool(
          ({ q: 'select', w: 'translate', e: 'rotate', r: 'scale' } as const)[
            event.key.toLowerCase() as 'q' | 'w' | 'e' | 'r'
          ],
        );
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  useEffect(() => {
    const update = () => setPointerLocked(document.pointerLockElement !== null);
    document.addEventListener('pointerlockchange', update);
    return () => document.removeEventListener('pointerlockchange', update);
  }, []);
  const message = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 2600);
  };
  function selectFeature(id: string) {
    setSelectedFeatureId(id); setSelectedId(null); setPanel('pen'); setDraftFeature(null);
  }
  function startFeature(kind: FeatureKind) {
    if ((project.features?.length ?? 0) >= 128) { message('Feature limit reached'); return; }
    setSelectedId(null); setSelectedFeatureId(null); setPlacingTree(false);
    setDraftFeature({ id: newId(), name: `${kind[0]!.toUpperCase()}${kind.slice(1)} ${(project.features?.length ?? 0) + 1}`, kind, points: [], width: featureWidth, elevation: ['bridge', 'lake'].includes(kind) ? featureElevation : undefined, drop: kind === 'waterfall' ? waterfallDrop : undefined });
  }
  function finishFeature(feature = draftFeature) {
    if (!feature) return;
    const next = { ...projectRef.current, features: [...(projectRef.current.features ?? []), feature] };
    const result = validateWorld(next);
    if (!result.valid) { message(result.errors[0] ?? 'Add more vertices before finishing'); return; }
    setProject(() => next); setDraftFeature(null); setSelectedFeatureId(feature.id); message(`${feature.kind} created`);
  }
  function updateFeature(feature: DrawnFeature) {
    const next = { ...projectRef.current, features: (projectRef.current.features ?? []).map((item) => item.id === feature.id ? feature : item) };
    const result = validateWorld(next);
    if (result.valid) setProject(() => next); else message(result.errors[0] ?? 'Invalid feature');
  }
  function terrainPoint(point: Vec3) {
    if (placingTree && panel === 'assets') {
      const object = { ...makeObject('tree'), position: point, treeSpecies, treeSeed: Math.floor(Math.random() * 0xffffffff) };
      setProject((p) => ({ ...p, objects: [...p.objects, object] })); setSelectedId(object.id); setPlacingTree(false); message(`${treeSpecies} tree placed`); return;
    }
    if (!draftFeature || panel !== 'pen') return;
    if (draftFeature.points.length >= 128) { message('Maximum 128 vertices per feature'); return; }
    const previous = draftFeature.points.at(-1);
    if (previous && Math.hypot(point[0] - previous[0], point[2] - previous[2]) < 0.05) return;
    const position: Vec3 = [point[0], point[1] + (draftFeature.kind === 'waterfall' ? draftFeature.drop ?? 8 : 0.15), point[2]];
    const next = { ...draftFeature, points: [...draftFeature.points, position] };
    if (next.kind === 'waterfall') finishFeature(next); else setDraftFeature(next);
  }
  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(current);
    setProjectRaw(previous);
    message('Change undone');
  }
  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(current);
    setProjectRaw(next);
    message('Change restored');
  }
  function addObject(kind: PrimitiveKind) {
    const object = makeObject(kind);
    object.position = [0, sampleTerrain(project.terrain, 0, 0) + (kind === 'tree' ? 0 : 0.8), 0];
    setProject((p) => ({ ...p, objects: [...p.objects, object] }));
    setSelectedId(object.id);
  }
  function newProject() {
    cancelAssetOperations();
    const fresh = createWorld('Untitled world');
    setProjectRaw(fresh);
    setSelectedId(null);
    setPanel('world');
    setPreview(false);
    setDraftFeature(null); setSelectedFeatureId(null); setPlacingTree(false);
    undoStack.current = [];
    redoStack.current = [];
    message('New world created');
  }
  function duplicateSelected() {
    if (!selected) return;
    const position: [number, number, number] = [
      selected.position[0] + 1.5,
      selected.position[1],
      selected.position[2],
    ];
    const copy: EditorObject = { ...selected, id: newId(), name: selected.name + ' copy', position };
    setProject((p) => ({ ...p, objects: [...p.objects, copy] }));
    setSelectedId(copy.id);
    message('Object duplicated');
  }
  function deleteSelected() {
    if (!selectedId) return;
    setProject((p) => ({ ...p, objects: p.objects.filter((object) => object.id !== selectedId) }));
    setSelectedId(null);
  }
  function updateSelected(update: Partial<EditorObject>) {
    if (!selected) return;
    const nextObjects = project.objects.map((object) =>
      object.id === selected.id ? { ...object, ...update } : object,
    );
    setProject((p) => ({ ...p, objects: nextObjects }));
  }
  function download(filename: string, data: string) {
    const blob = new Blob([data], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  function saveFile() {
    const result = validateWorld(current);
    if (!result.valid) {
      message(result.errors[0] ?? 'Project is invalid');
      return;
    }
    download(
      `${project.metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.emw`,
      JSON.stringify(current, null, 2),
    );
    message('Project file downloaded');
  }
  async function openFile(file?: File) {
    if (!file) return;
    cancelAssetOperations();
    const generation = worldGeneration.current;
    if (file.size > 25 * 1024 * 1024) {
      message('Project files are limited to 25 MiB');
      return;
    }
    try {
      const candidate: unknown = JSON.parse(await file.text()),
        result = validateWorld(candidate);
      if (generation !== worldGeneration.current) return;
      if (!result.valid || !result.project) {
        message(result.errors[0] ?? 'Invalid project');
        return;
      }
      undoStack.current = [];
      redoStack.current = [];
      setProjectRaw(result.project);
      setSelectedId(null);
      setDraftFeature(null); setSelectedFeatureId(null); setPlacingTree(false);
      message('Project opened');
    } catch {
      message('Could not read this project file');
    }
  }
  async function loadWarehouseWorld() {
    if (warehouseBusy) return;
    const generation = worldGeneration.current;
    const previous = projectRef.current;
    setWarehouseBusy(true);
    try {
      const response = await fetch(new URL('worlds/warehouse/warehouse.emw', document.baseURI));
      if (!response.ok) throw new Error('The warehouse starter world could not be loaded.');
      const file = new File([await response.blob()], 'warehouse.emw', { type: 'application/json' });
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Warehouse project exceeds the 25 MiB limit.');
      const result = validateWorld(JSON.parse(await file.text()));
      if (!result.valid || !result.project) throw new Error(result.errors[0] ?? 'Invalid warehouse project.');
      if (generation !== worldGeneration.current || previous !== projectRef.current) {
        message('Your world changed while loading. Click Load warehouse world again.');
        return;
      }
      if (!window.confirm('Load the warehouse with its portal and computer room? Your current world will be replaced and saved locally. Undo restores it; Save project keeps a separate file.')) return;
      const next: WorldProject = {
        ...result.project,
        metadata: {
          ...result.project.metadata,
          worldId: `elsemesh.world:warehouse-portal-interior:${crypto.randomUUID()}`,
          regionId: `elsemesh.region:${crypto.randomUUID()}`,
        },
      };
      cancelAssetOperations();
      setProject(() => next);
      setSelectedId(null); setSelectedFeatureId(null); setDraftFeature(null); setPlacingTree(false);
      setPreview(false); setNativePreview(false); setPanel('scene');
      message(`Warehouse loaded: ${result.project.objects.length} editable components. Undo restores your previous world.`);
    } catch (error) {
      message(error instanceof Error ? error.message : 'Could not load the warehouse world.');
    } finally {
      setWarehouseBusy(false);
    }
  }
  function exportPackage() {
    try {
      const worldPackage = createPlayerWorldPackage(current);
      download(
        `${project.metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.emw-world.json`,
        JSON.stringify(worldPackage, null, 2),
      );
      message('Player world package exported');
    } catch (error) {
      message(error instanceof Error ? error.message : 'Could not export this world');
    }
  }
  function cancelAssetOperations() {
    worldGeneration.current++;
    pendingAssetOperation.current = null;
    setAssetBusy(false);
  }
  function openRepositoryProject(next: WorldProject, generation: number) {
    if (generation !== worldGeneration.current) return false;
    cancelAssetOperations();
    setProjectRaw(next);
    undoStack.current = []; redoStack.current = [];
    setSelectedId(null); setSelectedFeatureId(null);
    setDraftFeature(null); setPlacingTree(false);
    setPreview(false); setNativePreview(false);
    message('World repository opened');
    return true;
  }
  function applyGeography(crop: ReturnType<typeof createGeographicTerrain> & { terrainImagery?: TerrainImagery }, generation: number) {
    if (generation !== worldGeneration.current) return false;
    const latest = projectRef.current;
    const x = Math.max(-crop.terrain.width / 2 + 1, Math.min(crop.terrain.width / 2 - 1, latest.spawn.position[0]));
    const z = Math.max(-crop.terrain.depth / 2 + 1, Math.min(crop.terrain.depth / 2 - 1, latest.spawn.position[2]));
    const next: WorldProject = { ...latest, ...crop, spawn: { ...latest.spawn, position: [x, sampleTerrain(crop.terrain, x, z), z] } };
    const result = validateWorld(next);
    if (!result.valid || new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_PROJECT_BYTES) { message(result.errors[0] ?? 'The geographic terrain would exceed the 25 MiB project limit'); return false; }
    setProject(() => next); setDraftFeature(null); setPlacingTree(false); message('Geographic terrain applied');
    return true;
  }
  function commitEmbeddedAsset(candidate: WorldAsset, object: EditorObject, generation: number) {
    if (generation !== worldGeneration.current) return false;
    const latest = projectRef.current;
    const existing = latest.assets.find((asset) => asset.dataUrl === candidate.dataUrl);
    const asset = existing ?? candidate;
    const placed = groundObject({ ...object, assetId: asset.id }, asset, latest.terrain);
    const next = { ...latest, assets: existing ? latest.assets : [...latest.assets, asset], objects: [...latest.objects, placed] };
    if (next.objects.length > 2000 || next.assets.length > 128 || next.assets.reduce((total, item) => total + item.bytes, 0) > 15 * 1024 * 1024) throw new Error('The object, asset or 15 MiB asset budget would be exceeded.');
    if (new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_PROJECT_BYTES) throw new Error('The project would exceed the 25 MiB file limit.');
    const result = validateWorld(next);
    if (!result.valid) throw new Error(result.errors[0] ?? 'Invalid asset placement');
    setProject(() => next); setSelectedId(placed.id); setSelectedFeatureId(null);
    return true;
  }
  async function addLibraryAsset(entry: LibraryAsset) {
    setLibrarySelection(entry);
    if (entry.kind === 'tree') {
      setTreeSpecies(entry.treeSpecies ?? 'broadleaf'); setPlacingTree(true); setDraftFeature(null); message('Click terrain to plant your tree'); return;
    }
    if (pendingAssetOperation.current !== null) { message('Another model is still being prepared'); return; }
    if (!entry.assetUrl) {
      if (projectRef.current.objects.length >= 2000) { message('The 2,000 object limit has been reached'); return; }
      const object = groundObject(createLibraryObject(entry, [0, 0, 0], newId()), undefined, projectRef.current.terrain);
      setProject((p) => ({ ...p, objects: [...p.objects, object] })); setSelectedId(object.id); setSelectedFeatureId(null); message(`${entry.name} added`); return;
    }
    const generation = worldGeneration.current, operation = ++assetOperation.current;
    pendingAssetOperation.current = operation; setAssetBusy(true);
    try {
      const response = await fetch(entry.assetUrl);
      if (!response.ok) throw new Error(`Model download failed (${response.status})`);
      const bytes = await response.arrayBuffer();
      if (generation !== worldGeneration.current) return;
      const asset = await admitGlb(bytes, { id: newId(), name: entry.name, source: entry.source, license: entry.license, prepared: true });
      if (commitEmbeddedAsset(asset, createLibraryObject(entry, [0, 0, 0], newId()), generation)) message(`${entry.name} added with embedded textures`);
    } catch (error) {
      if (generation === worldGeneration.current) message(`Model not added: ${error instanceof Error ? error.message : 'invalid model'}`);
    } finally {
      if (pendingAssetOperation.current === operation) { pendingAssetOperation.current = null; setAssetBusy(false); }
    }
  }
  function placeProjectAsset(asset: WorldAsset) {
    try {
      const existing = projectRef.current.objects.find((object) => object.assetId === asset.id);
      const object: EditorObject = existing
        ? { ...existing, id: newId(), name: `${existing.name} copy`, position: [0, 0, 0], visible: true }
        : { ...makeObject('box'), id: newId(), name: asset.name.replace(/\.glb$/i, ''), kind: 'glb', assetId: asset.id, position: [0, 0, 0], scale: [1, 1, 1] };
      if (commitEmbeddedAsset(asset, object, worldGeneration.current)) message(`${asset.name} placed again`);
    } catch (error) {
      message(error instanceof Error ? error.message : 'Could not place this model');
    }
  }
  async function importGlb(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.glb') || file.size > 15 * 1024 * 1024) {
      message('Choose one binary .glb file up to 15 MiB');
      return;
    }
    if (pendingAssetOperation.current !== null) { message('Another model is still being prepared'); return; }
    const generation = worldGeneration.current, operation = ++assetOperation.current;
    pendingAssetOperation.current = operation; setAssetBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      if (buffer.byteLength !== file.size) throw new Error('File size changed while reading');
      if (generation !== worldGeneration.current) return;
      const asset = await admitGlb(buffer, { id: newId(), name: file.name, prepared: false });
      const object = {
        ...makeObject('box'),
        name: file.name.replace(/\.glb$/i, ''),
        kind: 'glb' as const,
      };
      if (commitEmbeddedAsset(asset, object, generation)) message('GLB validated and added');
    } catch (error) {
      if (generation === worldGeneration.current) message(`GLB import failed: ${error instanceof Error ? error.message : 'invalid file'}`);
    } finally {
      if (pendingAssetOperation.current === operation) { pendingAssetOperation.current = null; setAssetBusy(false); }
    }
  }

  if (!hydrated)
    return (
      <div className="loading-screen">
        <span className="brand-mark">E</span>
        <b>ElseMesh Worlds</b>
        <small>Opening local project…</small>
      </div>
    );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">E</span>
          <span>
            ElseMesh <b>Worlds</b>
            <small>WORLD EDITOR</small>
          </span>
        </div>
        <div className="project-title">
          <span className="live-dot" />
          {project.metadata.name}
          <span className="save-state">{saved}</span>
        </div>
        <div className="top-actions">
          <button title="Undo (Ctrl+Z)" onClick={undo}>
            ↶
          </button>
          <button title="Redo (Ctrl+Y)" onClick={redo}>
            ↷
          </button>
          <span className="divider" />
          <button className="subdued" onClick={newProject} disabled={!hydrated}>
            New world
          </button>
          <button className="subdued" onClick={() => void loadWarehouseWorld()} disabled={!hydrated || warehouseBusy}>
            {warehouseBusy ? 'Loading warehouse…' : 'Load warehouse world'}
          </button>
          <label className="button subdued">
            Open
            <input
              type="file"
              accept=".emw,.json,application/json"
              hidden
              onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void openFile(file); }}
            />
          </label>
          <button className="subdued" onClick={saveFile}>
            Save project
          </button>
          <button className="subdued" onClick={() => setPanel('world')}>World repository</button>
          <button className="export-button" onClick={exportPackage}>
            Export world <span>↗</span>
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="rail">
          <button
            className={panel === 'scene' ? 'active' : ''}
            title="Scene"
            onClick={() => setPanel('scene')}
          >
            ▦
          </button>
          <button
            className={panel === 'assets' ? 'active' : ''}
            title="Assets"
            onClick={() => setPanel('assets')}
          >
            ◇
          </button>
          <button
            className={panel === 'terrain' ? 'active' : ''}
            title="Terrain"
            onClick={() => setPanel('terrain')}
          >
            ⌁
          </button>
          <button
            className={panel === 'world' ? 'active' : ''}
            title="World settings"
            onClick={() => setPanel('world')}
          >
            ◎
          </button>
          <button className={panel === 'pen' ? 'active' : ''} title="Pen & water" onClick={() => setPanel('pen')}>✎</button>
          <button className={panel === 'geo' ? 'active' : ''} title="Geographic terrain" onClick={() => setPanel('geo')}>▧</button>
          <div className="rail-bottom">
            <span className="avatar">LK</span>
          </div>
        </aside>
        <aside className="left-panel">
          {panel === 'scene' && (
            <>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">WORLD OUTLINE</span>
                  <h2>Scene</h2>
                </div>
                <button className="icon-btn" title="Add object" onClick={() => addObject('box')}>
                  ＋
                </button>
              </div>
              <div className="scene-meta">
                <span className="tiny-dot" />
                {objects.length + (project.features?.length ?? 0) + 1} entities <span>·</span> {project.terrain.resolution} ×{' '}
                {project.terrain.resolution} terrain
              </div>
              <div className="tree-list">
                <div className="tree-row root">
                  <span className="chevron">⌄</span>
                  <span className="scene-icon">◈</span>
                  <span>{project.metadata.name}</span>
                  <span className="row-menu">···</span>
                </div>
                <button className="tree-row terrain-row" onClick={() => setPanel('terrain')}>
                  <span className="indent" />
                  <span className="scene-icon terrain-icon">▱</span>
                  <span>Terrain</span>
                  <span className="visible-eye">◉</span>
                </button>
                <div className="tree-group-label">
                  OBJECTS <span>{objects.length}</span>
                </div>
                {objects.map((object) => (
                  <div
                    key={object.id}
                    className={`tree-row object-row ${selectedId === object.id ? 'selected' : ''}`}
                  >
                    <button onClick={() => setSelectedId(object.id)}>
                      <span className="indent" />
                      <span className="scene-icon">
                        {object.kind === 'tree' ? '♣' : object.kind === 'building' ? '⌂' : '◻'}
                      </span>
                      <span>{object.name}</span>
                    </button>
                    <button
                      className="row-eye"
                      title={object.visible ? 'Hide object' : 'Show object'}
                      onClick={() => {
                        const next = project.objects.map((o) =>
                          o.id === object.id ? { ...o, visible: !o.visible } : o,
                        );
                        setProject((p) => ({ ...p, objects: next }));
                      }}
                    >
                      {object.visible ? '◉' : '○'}
                    </button>
                  </div>
                ))}
              </div>
              <div className="panel-footer">
                <span className="footer-dot" />
                Autosave on
              </div>
            </>
          )}
          {panel === 'assets' && (
            <>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">LIBRARY</span>
                  <h2>Assets</h2>
                </div>
              </div>
              <div className="asset-search">
                ⌕ <input aria-label="Search assets" placeholder="Search objects and prefabs" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} />
              </div>
              <div className="asset-filters">{['All', ...new Set(assetLibrary.map((entry) => entry.category))].map((category) => <button key={category} className={assetCategory === category ? 'chosen' : ''} onClick={() => setAssetCategory(category)}>{category}</button>)}</div>
              <div className="tree-group-label">
                OBJECT LIBRARY <span>{assetLibrary.filter((entry) => (assetCategory === 'All' || entry.category === assetCategory) && `${entry.name} ${entry.category} ${entry.description}`.toLowerCase().includes(assetSearch.toLowerCase())).length}</span>
              </div>
              <div className="asset-grid">
                {assetLibrary.filter((entry) => (assetCategory === 'All' || entry.category === assetCategory) && `${entry.name} ${entry.category} ${entry.description}`.toLowerCase().includes(assetSearch.toLowerCase())).map(
                  (entry, i) => (
                    <button key={entry.id} className="asset-card" disabled={assetBusy} title={`${entry.description}\n${entry.source}\n${entry.readiness}`} onClick={() => void addLibraryAsset(entry)}>
                      <span
                        className={`asset-thumb thumb-${entry.kind}`}
                        style={{ '--tint': palettes[i % palettes.length] } as React.CSSProperties}
                      >
                        {entry.thumbnailUrl ? <img src={entry.thumbnailUrl} alt={`${entry.name} schematic preview`} /> : entry.preview}
                      </span>
                      <span>{entry.name}</span><small>{entry.kind === 'glb' ? `Prepared model · ${entry.license.split(' · ')[0]}` : entry.kind === 'tree' ? 'Procedural tree' : 'Editor blockout'}</small>
                    </button>
                  ),
                )}
              </div>
              {assetBusy && <p role="status" className="library-note">Preparing and checking embedded model…</p>}
              {librarySelection && <div className="asset-provenance"><b>{librarySelection.name}</b><p>{librarySelection.description}</p><small>{librarySelection.source}</small><p>{librarySelection.license}</p><small>{librarySelection.readiness}</small></div>}
              <label className="feature-note">Tree species<select aria-label="Tree species" value={treeSpecies} onChange={(event) => setTreeSpecies(event.target.value as typeof treeSpecies)}>{TREE_SPECIES.map((species) => <option key={species.id} value={species.id}>{species.label}</option>)}</select></label>
              {placingTree && <div className="terrain-help"><div><b>Place {treeSpecies} tree</b><small>Click terrain to plant. Escape cancels.</small><button onClick={() => setPlacingTree(false)}>Cancel placement</button></div></div>}
              <label className="import-card">
                <span>＋</span>
                <b>Import Blender / GLB model</b>
                <small>Binary glTF · max 15 MiB</small>
                <input
                  type="file"
                  accept=".glb,model/gltf-binary"
                  hidden
                  disabled={assetBusy}
                  onChange={(event) => void importGlb(event)}
                />
              </label>
              <p className="library-note">In Blender, export selected static objects as glTF 2.0 → GLB (binary), apply scale and embed materials/textures. Import the .glb here to move, rotate, scale and edit its material slots. Direct .blend files are not supported.</p>
              <div className="snap-controls"><label><input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} /> Snap transforms</label><select aria-label="Snap step" value={snapStep} onChange={(event) => setSnapStep(Number(event.target.value))}><option value="0.1">0.1 m</option><option value="0.5">0.5 m</option><option value="1">1 m</option><option value="5">5 m</option></select></div>
              <p className="library-note">Warehouse furniture and computers are reusable MIT recipe prefabs. Four CC0 scans include albedo and normal textures. Each card shows its own licence. Transform snap uses the chosen distance, 15° rotation and 0.1 scale.</p>
              <details open={project.assets.length <= 12}>
              <summary className="tree-group-label">REUSE PROJECT MODELS <span>{project.assets.length}</span></summary>
              {project.assets.map((asset) => (
                <div className="asset-list-row" key={asset.id}>
                  <span className="file-badge">3D</span>
                  <span>{asset.name}</span>
                  <button className="subdued" disabled={assetBusy} onClick={() => placeProjectAsset(asset)} title="Place another instance using the same embedded model">Place again</button>
                </div>
              ))}
              </details>
            </>
          )}
          {panel === 'pen' && <FeaturePanel project={project} draft={draftFeature} selectedId={selectedFeatureId} width={featureWidth} elevation={featureElevation} drop={waterfallDrop}
            onWidth={(width) => { setFeatureWidth(width); if (draftFeature) setDraftFeature({ ...draftFeature, width }); }}
            onElevation={(elevation) => { setFeatureElevation(elevation); if (draftFeature) setDraftFeature({ ...draftFeature, elevation }); }}
            onDrop={(drop) => { setWaterfallDrop(drop); if (draftFeature) setDraftFeature({ ...draftFeature, drop }); }}
            onStart={startFeature} onFinish={() => finishFeature()} onCancel={() => setDraftFeature(null)} onRemovePoint={() => { if (draftFeature) setDraftFeature({ ...draftFeature, points: draftFeature.points.slice(0, -1) }); }}
            onSelect={selectFeature} onUpdate={updateFeature} onDelete={(id) => { setProject((p) => ({ ...p, features: (p.features ?? []).filter((feature) => feature.id !== id).map((feature) => ({ ...feature, startLakeId: feature.startLakeId === id ? undefined : feature.startLakeId, endLakeId: feature.endLakeId === id ? undefined : feature.endLakeId })) })); setSelectedFeatureId(null); }} />}
          {panel === 'geo' && <GeoPanel getGeneration={() => worldGeneration.current} onApply={applyGeography} />}
          {panel === 'terrain' && (
            <>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">LANDSCAPE</span>
                  <h2>Terrain</h2>
                </div>
              </div>
              <div className="field-label">SCULPT TOOL</div>
              <div className="tool-grid">
                {(['raise', 'lower', 'flatten', 'smooth', 'paint', 'vertices'] as Brush[]).map((name) => (
                  <button
                    key={name}
                    className={brush === name ? 'chosen' : ''}
                    onClick={() => {
                      setBrush(name);
                      setTool('select');
                    }}
                  >
                    <span>
                      {({ raise: '↟', lower: '↡', flatten: '▬', smooth: '≈', paint: '◍', vertices: '⠿' } as const)[name]}
                    </span>
                    {name}
                  </button>
                ))}
              </div>
              {brush === 'paint' && (
                <div className="material-swatches">
                  {['Grass', 'Soil', 'Rock', 'Sand'].map((name, index) => (
                    <button
                      key={name}
                      className={terrainMaterial === index ? 'chosen' : ''}
                      title={name}
                      onClick={() => setTerrainMaterial(index)}
                    >
                      <i style={{ background: ['#617d52', '#8a6445', '#818782', '#b29f6e'][index] }} />
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {brush === 'paint' && terrainMaterial === 2 && (
                <p>Rock builds up with each click. Radius sets the hill width; strength sets the height added.</p>
              )}
              <div className="control-field">
                <div>
                  <label>{brush === 'vertices' ? 'Pull radius' : 'Brush radius'}</label>
                  <span>{brushRadius} m</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="24"
                  value={brushRadius}
                  onChange={(e) => setBrushRadius(Number(e.target.value))}
                />
              </div>
              {brush !== 'vertices' && <div className="control-field">
                <div>
                  <label>Strength</label>
                  <span>{strength.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="4"
                  step="0.1"
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                />
              </div>}
              <div className="terrain-help">
                <span>⌖</span>
                <div>
                  <b>{brush === 'vertices' ? 'Drag a vertex up or down' : 'Click terrain to sculpt'}</b>
                  <small>{brush === 'vertices' ? 'Drag from a dot to stretch the terrain. Radius pulls nearby vertices smoothly. One drag is one Undo step.' : 'Each click applies one brush stroke. Use Undo to step back.'}</small>
                </div>
              </div>
              <div className="section-divider" />
              <div className="panel-heading small">
                <div>
                  <span className="eyebrow">TERRAIN SIZE</span>
                </div>
              </div>
              <div className="two-fields">
                <label>
                  Width{' '}
                  <input
                    type="number"
                    min="16"
                    max="2048"
                    value={project.terrain.width}
                    disabled={!!project.geography}
                    onChange={(e) => {
                      const width = Number(e.target.value);
                      if (width >= 16 && width <= 2048)
                        setProject((p) => ({ ...p, terrain: { ...p.terrain, width } }));
                    }}
                  />
                </label>
                <label>
                  Depth{' '}
                  <input
                    type="number"
                    min="16"
                    max="2048"
                    value={project.terrain.depth}
                    disabled={!!project.geography}
                    onChange={(e) => {
                      const depth = Number(e.target.value);
                      if (depth >= 16 && depth <= 2048)
                        setProject((p) => ({ ...p, terrain: { ...p.terrain, depth } }));
                    }}
                  />
                </label>
              </div>
              <div className="field-label">GRID RESOLUTION</div>
              <select
                value={project.terrain.resolution}
                onChange={(e) => {
                  const resolution = Number(e.target.value);
                  const old = project.terrain;
                  const materials = Array.from({ length: resolution * resolution }, (_, i) => {
                    const x = Math.round(((i % resolution) / (resolution - 1)) * (old.resolution - 1));
                    const z = Math.round(
                      (Math.floor(i / resolution) / (resolution - 1)) * (old.resolution - 1),
                    );
                    return old.materials[z * old.resolution + x] ?? 0;
                  });
                  setProject((p) => ({
                    ...p,
                    geography: p.geography ? { ...p.geography, outputSpacing: old.width / (resolution - 1) } : undefined,
                    terrain: {
                      ...old,
                      resolution,
                      materials,
                      heights: Array.from({ length: resolution * resolution }, (_, i) =>
                        sampleTerrain(
                          old,
                          ((i % resolution) / (resolution - 1)) * old.width - old.width / 2,
                          (Math.floor(i / resolution) / (resolution - 1)) * old.depth - old.depth / 2,
                        ),
                      ),
                    },
                  }));
                }}
              >
                <option value={33}>33 × 33</option>
                <option value={65}>65 × 65</option>
                <option value={129}>129 × 129</option>
                <option value={257}>257 × 257</option>
              </select>
              <div className="field-label">GENERATION SEED</div>
              <div className="two-fields">
                <label>
                  Seed
                  <input
                    type="number"
                    min="0"
                    max="4294967295"
                    value={project.terrain.seed}
                    onChange={(e) => {
                      const seed = Math.max(0, Math.min(0xffffffff, Number(e.target.value) || 0));
                      setProject((p) => ({ ...p, terrain: { ...p.terrain, seed } }));
                    }}
                  />
                </label>
                <button
                  className="subdued terrain-regenerate"
                  onClick={() =>
                    setProject((p) => ({
                      ...p,
                      geography: undefined,
                      terrainImagery: undefined,
                      terrain: createTerrain(
                        p.terrain.width,
                        p.terrain.depth,
                        p.terrain.resolution,
                        p.terrain.seed,
                      ),
                    }))
                  }
                >
                  Regenerate
                </button>
              </div>
            </>
          )}
          <div hidden={panel !== 'world'}>
            <RepositoryPanel getProject={() => projectRef.current} getGeneration={() => worldGeneration.current} onOpen={openRepositoryProject} />
          </div>
          {panel === 'world' && (
            <>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">PROJECT</span>
                  <h2>World settings</h2>
                </div>
              </div>
              <div className="field-label">WORLD NAME</div>
              <input
                className="wide-input"
                value={project.metadata.name}
                onChange={(e) =>
                  setProject((p) => ({ ...p, metadata: { ...p.metadata, name: e.target.value } }))
                }
              />
              <div className="field-label">DESCRIPTION</div>
              <textarea
                className="wide-input"
                rows={4}
                value={project.metadata.description}
                onChange={(e) =>
                  setProject((p) => ({ ...p, metadata: { ...p.metadata, description: e.target.value } }))
                }
                placeholder="Describe this world"
              />
              <div className="field-label">WORLD ID</div>
              <div className="readonly-field">{project.metadata.worldId}</div>
              <div className="field-label">REGION ID</div>
              <div className="readonly-field">{project.metadata.regionId}</div>
              <div className="section-divider" />
              <div className="field-label">SPAWN LOCATION (METRES)</div>
              <div className="two-fields">
                <label>
                  X{' '}
                  <input
                    type="number"
                    value={project.spawn.position[0]}
                    onChange={(e) =>
                      setProject((p) => ({
                        ...p,
                        spawn: {
                          ...p.spawn,
                          position: [Number(e.target.value), p.spawn.position[1], p.spawn.position[2]],
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Z{' '}
                  <input
                    type="number"
                    value={project.spawn.position[2]}
                    onChange={(e) =>
                      setProject((p) => ({
                        ...p,
                        spawn: {
                          ...p.spawn,
                          position: [p.spawn.position[0], p.spawn.position[1], Number(e.target.value)],
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="section-divider" />
              <div className="eyebrow">ENVIRONMENT</div>
              <div className="control-field">
                <div>
                  <label>Sun direction</label>
                  <span>{Math.round(project.environment.sunAzimuth * 57.3)}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="6.28"
                  step="0.01"
                  value={project.environment.sunAzimuth}
                  onChange={(e) =>
                    setProject((p) => ({
                      ...p,
                      environment: { ...p.environment, sunAzimuth: Number(e.target.value) },
                    }))
                  }
                />
              </div>
              <div className="control-field">
                <div>
                  <label>Fog density</label>
                  <span>{project.environment.fog.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.02"
                  step="0.0005"
                  value={project.environment.fog}
                  onChange={(e) =>
                    setProject((p) => ({
                      ...p,
                      environment: { ...p.environment, fog: Number(e.target.value) },
                    }))
                  }
                />
              </div>
              <div className="integration-note">
                <b>Runtime integration</b>
                <p>
                  Project editing is local. The inspected ElseMesh player does not yet expose a general
                  external world-package loader. Export remains provisional until that adapter is verified.
                </p>
              </div>
            </>
          )}
        </aside>
        <main className="editor-main">
          <div className="viewport-toolbar">
            <div className="tool-cluster">
              {(['select', 'translate', 'rotate', 'scale'] as Tool[]).map((name) => (
                <button
                  key={name}
                  title={`${name} tool`}
                  className={tool === name ? 'active' : ''}
                  onClick={() => setTool(name)}
                >
                  {({ select: '⌖', translate: '✣', rotate: '⟳', scale: '⤢' } as const)[name]}
                </button>
              ))}
              <span className="thin-divider" />
              <button
                title="Perspective view"
                className={`camera-mode ${viewPreset === 'perspective' ? 'active' : ''}`}
                onClick={() => setViewPreset('perspective')}
              >
                ◉
              </button>
              <button
                title="Top view"
                className={`camera-mode ${viewPreset === 'top' ? 'active' : ''}`}
                onClick={() => setViewPreset('top')}
              >
                ⊞
              </button>
            </div>
            <div className="viewport-center">
              <span className="view-dot" /> PERSPECTIVE <span>·</span>{' '}
              {preview ? 'FIRST PERSON' : 'DESIGN VIEW'}
            </div>
            <div className="viewport-right">
              <span className="coord-label">
                X 0 <span>Y 0</span> Z 0
              </span>
              <span className="thin-divider" />
              <button title="Viewport options" onClick={() => message(nativePreview ? 'Native ElseMesh WebGPU graphics' : 'Editor viewport rendered with WebGL')}>
                ⚙
              </button>
            </div>
          </div>
          <div
            className={`viewport ${preview ? 'preview-mode' : ''}`}
            onDoubleClick={(e) => {
              if (preview)
                (e.currentTarget.querySelector('canvas') as HTMLCanvasElement | null)?.requestPointerLock();
            }}
          >
            {nativePreview && <NativePreview project={project} onChange={setProject} onClose={() => setNativePreview(false)} />}
            <Canvas
              frameloop={nativePreview ? 'never' : 'always'}
              shadows
              camera={{ position: [82, 65, 88], fov: 42, far: 12000 }}
              dpr={[1, 1.6]}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
              onPointerMissed={() => setSelectedId(null)}
            >
              <Scene
                project={current}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                tool={tool}
                setProject={setProject}
                brush={brush}
                radius={brushRadius}
                strength={strength}
                material={terrainMaterial}
                preview={preview}
                terrainEditing={panel === 'terrain' && !preview}
                onExitPreview={exitPreview}
                objects={objects}
                viewPreset={viewPreset}
                snapEnabled={snapEnabled}
                snapStep={snapStep}
                draftFeature={panel === 'pen' && !preview ? draftFeature : null}
                selectedFeatureId={selectedFeatureId}
                onSelectFeature={selectFeature}
                onTerrainPoint={!preview && ((panel === 'pen' && draftFeature) || (panel === 'assets' && placingTree)) ? terrainPoint : undefined}
              />
            </Canvas>
            {preview ? (
              <>
                <div className="preview-hud">
                  <span>FIRST-PERSON PREVIEW</span>
                  <span>WASD MOVE&nbsp;&nbsp; SHIFT SPRINT&nbsp;&nbsp; SPACE JUMP</span>
                  <button onClick={() => setPreview(false)}>Exit preview&nbsp; Esc</button>
                </div>
                {!pointerLocked && (
                  <button
                    className="lock-prompt"
                    onClick={(e) =>
                      (
                        e.currentTarget.parentElement?.querySelector('canvas') as HTMLCanvasElement | null
                      )?.requestPointerLock()
                    }
                  >
                    Click viewport for mouse look
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="viewport-title">
                  <span className="tiny-dot" /> {project.metadata.name} <span>/</span> Editor View
                </div>
                <div className="viewport-hint">
                  Drag to orbit <i>·</i> Scroll to zoom <i>·</i> Right-drag to pan
                </div>
                {panel === 'terrain' && (
                  <div className="brush-indicator">
                    {brush === 'paint'
                      ? ['GRASS', 'SOIL', 'ROCK', 'SAND'][terrainMaterial]
                      : brush.toUpperCase()}{' '}
                    <span>·</span> {brushRadius} m <span>·</span> {brush === 'vertices' ? 'drag vertices up / down' : 'click terrain'}
                  </div>
                )}
                {panel === 'pen' && draftFeature && <div className="brush-indicator">DRAW {draftFeature.kind.toUpperCase()} · {draftFeature.points.length} vertices · Enter to finish · Esc cancel</div>}
                <button className="native-preview-button" onClick={() => setNativePreview(true)}>☁ ElseMesh graphics</button>
                <button className="preview-button" onClick={() => setPreview(true)}>
                  <span>▷</span> Enter preview
                </button>
                <div className="axis-widget">
                  <span className="axis-y">Y</span>
                  <span className="axis-x">X</span>
                  <span className="axis-z">Z</span>
                  <i />
                </div>
              </>
            )}
            {toast && <div className="toast">{toast}</div>}
          </div>
          <div className="bottom-status">
            <span>
              <i className="status-light" />
              Ready
            </span>
            <span>METRES</span>
            <span className="status-spacer" />
            <span>
              WORLD SCHEMA&nbsp; <b>v1</b>
            </span>
            <span>
              {nativePreview ? 'NATIVE GRAPHICS' : 'EDITOR PREVIEW'}&nbsp; <b>{nativePreview ? 'ELSEMESH WEBGPU' : 'THREE.JS WEBGL'}</b>
            </span>
          </div>
        </main>
        <aside className="inspector">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PROPERTIES</span>
              <h2>{selected ? selected.name : 'World'}</h2>
            </div>
            <button className="icon-btn" title="More settings" onClick={() => setPanel('world')}>
              ···
            </button>
          </div>
          {selected ? (
            <>
              <div className="inspector-section">
                <div className="section-title">
                  <span>▣</span> OBJECT <span className="collapse">⌃</span>
                </div>
                <div className="field-label">NAME</div>
                <input
                  className="wide-input"
                  value={selected.name}
                  onChange={(e) => updateSelected({ name: e.target.value })}
                />
                <div className="field-label">TYPE</div>
                <div className="readonly-field">{selected.kind.toUpperCase()}</div>
                {selected.kind === 'tree' && <><div className="field-label">TREE SPECIES</div><select className="wide-select" value={selected.treeSpecies ?? 'broadleaf'} onChange={(event) => updateSelected({ treeSpecies: event.target.value as typeof treeSpecies })}>{TREE_SPECIES.map((species) => <option key={species.id} value={species.id}>{species.label}</option>)}</select></>}
                {selected.kind === 'glb' ? <><div className="field-label">SOURCE MATERIALS</div><AssetMaterialEditor key={selected.id} object={selected} asset={project.assets.find((asset) => asset.id === selected.assetId)} onChange={(materialOverrides) => updateSelected({ materialOverrides })} /><button className="reset-material-button" onClick={() => { const grounded = groundObject(selected, project.assets.find((asset) => asset.id === selected.assetId), project.terrain); updateSelected({ position: grounded.position }); }}>Ground model on terrain</button></> : <>
                <div className="field-label">MATERIAL COLOR</div>
                <div className="color-row">
                  <input
                    type="color"
                    value={selected.color}
                    onChange={(e) => updateSelected({ color: e.target.value })}
                  />
                  <span>{selected.color.toUpperCase()}</span>
                  <button title="Reset color" onClick={() => updateSelected({ color: '#a8b87b' })}>
                    ↺
                  </button>
                </div>
                </>}
              </div>
              <div className="inspector-section">
                <div className="section-title">
                  <span>⌖</span> TRANSFORM <span className="collapse">⌃</span>
                </div>
                <VectorEditor
                  title="POSITION"
                  values={selected.position}
                  onChange={(position) => updateSelected({ position: snapEnabled ? position.map((value) => Math.round(value / snapStep) * snapStep) as Vec3 : position })}
                />
                <VectorEditor
                  title="ROTATION"
                  values={selected.rotation.map((n) => n * 57.2958) as [number, number, number]}
                  onChange={(values) =>
                    updateSelected({ rotation: values.map((n) => (snapEnabled ? Math.round(n / 15) * 15 : n) / 57.2958) as [number, number, number] })
                  }
                  suffix="°"
                />
                <VectorEditor
                  title="SCALE"
                  values={selected.scale}
                  onChange={(scale) =>
                    updateSelected({ scale: scale.map((n) => Math.max(0.01, snapEnabled ? Math.round(n * 10) / 10 : n)) as [number, number, number] })
                  }
                />
              </div>
              <div className="inspector-section">
                <div className="section-title">
                  <span>◈</span> COLLISION <span className="collapse">⌃</span>
                </div>
                <select
                  className="wide-select"
                  value={selected.collision}
                  onChange={(e) => updateSelected({ collision: e.target.value as EditorObject['collision'] })}
                >
                  <option value="solid">Solid object</option>
                  <option value="walkable">Walkable surface</option>
                  <option value="none">No collision</option>
                </select>
              </div>
              <button className="delete-button" onClick={deleteSelected}>
                ⌫&nbsp; Delete object
              </button>
            </>
          ) : (
            <>
              <div className="world-preview-card">
                <div className="mini-landscape">
                  <div className="mini-sun" />
                  <div className="mini-hill hill-a" />
                  <div className="mini-hill hill-b" />
                  <div className="mini-ground" />
                </div>
                <div className="world-card-copy">
                  <span className="eyebrow">CURRENT WORLD</span>
                  <b>{project.metadata.name}</b>
                  <small>
                    {project.terrain.width} × {project.terrain.depth} m · seed {project.terrain.seed}
                  </small>
                </div>
              </div>
              <div className="inspector-section">
                <div className="section-title">
                  <span>◈</span> WORLD DETAILS <span className="collapse">⌃</span>
                </div>
                <div className="detail-line">
                  <span>Terrain</span>
                  <b>
                    {project.terrain.width} × {project.terrain.depth} m
                  </b>
                </div>
                <div className="detail-line">
                  <span>Resolution</span>
                  <b>
                    {project.terrain.resolution} × {project.terrain.resolution}
                  </b>
                </div>
                <div className="detail-line">
                  <span>Objects</span>
                  <b>{objects.length}</b>
                </div>
                <div className="detail-line">
                  <span>Imported assets</span>
                  <b>{project.assets.length}</b>
                </div>
              </div>
              <div className="inspector-section">
                <div className="section-title">
                  <span>☀</span> ENVIRONMENT <span className="collapse">⌃</span>
                </div>
                <div className="detail-line">
                  <span>Lighting</span>
                  <b>Directional sun</b>
                </div>
                <div className="detail-line">
                  <span>Fog</span>
                  <b>{project.environment.fog === 0 ? 'Off' : 'On'}</b>
                </div>
              </div>
              <div className="validation-card">
                <span>✓</span>
                <div>
                  <b>Project valid</b>
                  <small>Schema and world data pass checks</small>
                </div>
              </div>
              <button className="open-settings" onClick={() => setPanel('world')}>
                Edit world settings&nbsp; ↗
              </button>
            </>
          )}
          <div className="inspector-bottom">
            <span className="saved-icon">✓</span>
            <span>
              <b>Auto-saved</b>
              <small>{saved}</small>
            </span>
            <button title="Save project" onClick={saveFile}>
              ↥
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function VectorEditor({
  title,
  values,
  onChange,
  suffix,
}: {
  title: string;
  values: [number, number, number];
  onChange: (values: [number, number, number]) => void;
  suffix?: string;
}) {
  return (
    <div className="vector-editor">
      <div className="field-label">{title}</div>
      <div className="vector-fields">
        {values.map((value, index) => (
          <label key={index}>
            <i className={`axis-${'xyz'[index]}`}>{'XYZ'[index]}</i>
            <input
              type="number"
              step="0.1"
              value={Number(value.toFixed(2))}
              onChange={(e) => {
                const next = [...values] as [number, number, number];
                next[index] = Number(e.target.value);
                onChange(next);
              }}
            />
            <small>{suffix}</small>
          </label>
        ))}
      </div>
    </div>
  );
}
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
