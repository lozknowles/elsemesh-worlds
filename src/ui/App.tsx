import PortalPanel from './PortalPanel';
import PortalShapes from './newPortalShape';
import { createEditorPortal } from './portal-editing';
import type { WorldPortal } from '../domain/portal';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ComponentRef, ReactNode } from 'react';
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
import { createWorkspace, loadWorkspace, saveWorkspace, listWorkspaces } from '../domain/persistence';
import type { Workspace, WorkspaceBase } from '../domain/persistence';
import { runtimePresentation, adoptRuntimeSettings } from '../domain/authored-runtime';
import NativePreview from './NativePreview';
import CataloguePanel from './CataloguePanel';
import SceneExplorer from './SceneExplorer';
import NeonSign, { NeonInteraction } from './NeonSign';
import { NeonRuntimeContext } from './NeonRuntime';
import type { NeonRuntimeState,NeonInteractionTarget } from './NeonRuntime';
import NeonDesigner from './NeonDesigner';
import ComputerShape from './ComputerShape';
import ComputerPanel from './ComputerPanel';
import { defaultComputer } from '../domain/computer';
import { resolvePlayerMotion } from '../domain/player-contact';
import { PrivateNeonSession } from './PrivateNeonSession';
import type { PrivateNeonControl } from './PrivateNeonSession';
import type { PrivateNeonSnapshot } from '../domain/private-neon-client';
import { privateNeonMatchesWorld } from '../domain/private-neon-client';
import { getNeonBounds } from '../domain/neon-geometry';
import { defaultNeonSign } from '../domain/neon-sign';
import type { NeonSignConfig } from '../domain/neon-sign';
import { effectiveObjectState, pruneSelection, groupObjects, ungroupObjects, reparentObjects, getGroupBounds, resizeGroup, cloneSubtrees, subtreeIds, collisionWorldBounds, resolveWorldMatrices, objectLocalBounds } from '../domain/object-hierarchy';
import CataloguePlacement from './CataloguePlacement';
import type { PlacementHit } from './CataloguePlacement';
import { fetchCatalogueModel, surfacePlacement, commitCataloguePlacement } from '../domain/object-catalogue';
import type { CatalogueAsset } from '../domain/object-catalogue';
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
type FrameRequest = { kind: 'world' | 'selected' | 'portal'; portalId?: string; revision: number };
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
    <mesh geometry={geometry} userData={{ placementSurface: 'terrain' }} receiveShadow onPointerDown={brushAt} onClick={(event) => { if (onTerrainPoint && event.button === 0 && event.delta < 5) { event.stopPropagation(); onTerrainPoint([event.point.x, event.point.y, event.point.z]); } }}>
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
  if (object.kind === 'computer' && object.computer) return <ComputerShape id={object.id} screenColor={object.computer.screenColor}/>;
  if (object.kind === 'neon-sign' && object.neon) return <NeonSign id={object.id} config={object.neon}/>;
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
  locked,
  children,
}: {
  object: EditorObject;
  asset?: WorldProject['assets'][number];
  selected: boolean;
  tool: Tool;
  select: (additive?: boolean) => void;
  locked: boolean;
  children?: ReactNode;
  moved: (object: EditorObject) => boolean;
  snapEnabled: boolean;
  snapStep: number;
}) {
  const sceneRoot = useThree(state => state.scene);
  const [target, setTarget] = useState<THREE.Group | null>(null);
  const attach = useCallback((node: THREE.Group | null) => setTarget(node), []);
  return (
    <>
      <group
        ref={attach}
        userData={{ placementSurface: 'object' }}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        visible={object.visible}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (!locked) select(event.shiftKey);
        }}
      >
        {object.kind !== 'group' && <Shape object={object} asset={asset} />}
        {children}
        {selected && (
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.2, 1.24, 48]} />
            <meshBasicMaterial color="#e5bd6c" side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
      {selected && !locked && tool !== 'select' && target && createPortal(
        <TransformControls
          object={target}
          mode={tool}
          translationSnap={snapEnabled ? snapStep : null}
          rotationSnap={snapEnabled ? THREE.MathUtils.degToRad(15) : null}
          scaleSnap={snapEnabled ? 0.1 : null}
          onMouseUp={() => {
            const accepted = moved({
              ...object,
              position: target.position.toArray() as [number, number, number],
              rotation: target.rotation.toArray().slice(0, 3) as [number, number, number],
              scale: target.scale.toArray() as [number, number, number],
            });
            if (!accepted) {
              target.position.fromArray(object.position); target.rotation.set(...object.rotation); target.scale.fromArray(object.scale);
              target.updateMatrixWorld(true);
            }
          }}
        />, sceneRoot
      )}
    </>
  );
}

function PreviewCamera({
  project,
  active,
  paused,
  onExit,
}: {
  project: WorldProject;
  active: boolean;
  paused: boolean;
  onExit: () => void;
}) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const velocityY = useRef(0),grounded = useRef(false),pausedRef = useRef(paused);
  useEffect(()=>{pausedRef.current=paused;if(paused){keys.current.clear();document.exitPointerLock?.();}},[paused]);
  const colliders = useMemo(() => collisionWorldBounds(project), [project]);
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
      if(pausedRef.current)return;
      keys.current.add(event.code);
      if (event.code === 'Escape') onExit();
    };
    const up = (event: globalThis.KeyboardEvent) => keys.current.delete(event.code);
    const lock = () => setLocked(document.pointerLockElement === gl.domElement);
    const move = (event: MouseEvent) => {
      if (pausedRef.current || document.pointerLockElement !== gl.domElement) return;
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
    if (!active || pausedRef.current) return;
    const dt = Math.min(delta, 0.04),
      key = keys.current;
    const speed = key.has('ShiftLeft') ? 8 : 4.5;
    const forward = Number(key.has('KeyW')) - Number(key.has('KeyS'));
    const side = Number(key.has('KeyD')) - Number(key.has('KeyA'));
    const dir = new THREE.Vector3(side, 0, -forward)
      .normalize()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
    const previous=camera.position.toArray() as Vec3;
    if(key.has('Space')&&grounded.current)velocityY.current=5.2;
    velocityY.current-=12*dt;
    const proposed:Vec3=[previous[0]+dir.x*speed*dt,previous[1]+velocityY.current*dt,previous[2]+dir.z*speed*dt];
    const contact=resolvePlayerMotion({previous,position:proposed,velocityY:velocityY.current,colliders,terrainHeight:sampleTerrain(project.terrain,proposed[0],proposed[2]),terrainHeightAt:(x,z)=>sampleTerrain(project.terrain,x,z)});
    camera.position.fromArray(contact.position);velocityY.current=contact.velocityY;grounded.current=contact.grounded;
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
  selectedIds,
  selectObject,
  tool,
  setProject,
  brush,
  radius,
  strength,
  material,
  preview,
  computerPaused,
  terrainEditing,
  onExitPreview,
  objects,
  viewPreset,
  draftFeature,
  selectedFeatureId,
  selectedPortalId,
  onSelectPortal,
  onSelectFeature,
  onTerrainPoint,
  snapEnabled,
  snapStep,
  placementActive,
  onMoveObject,
  frameRequest,
}: {
  frameRequest: FrameRequest | null;
  project: WorldProject;
  selectedId: string | null;
  selectedIds: string[];
  selectObject: (id: string, additive?: boolean) => void;
  tool: Tool;
  setProject: (fn: (p: WorldProject) => WorldProject) => void;
  brush: Brush;
  radius: number;
  strength: number;
  material: number;
  preview: boolean;
  computerPaused: boolean;
  terrainEditing: boolean;
  onExitPreview: () => void;
  placementActive: boolean;
  onMoveObject: (object: EditorObject) => boolean;
  objects: EditorObject[];
  viewPreset: 'perspective' | 'top';
  draftFeature: DrawnFeature | null;
  selectedFeatureId: string | null;
  selectedPortalId: string | null;
  onSelectPortal: (id: string) => void;
  onSelectFeature: (id: string) => void;
  onTerrainPoint?: (point: Vec3) => void;
  snapEnabled: boolean;
  snapStep: number;
}) {
  const camera = useThree((state) => state.camera);
  const [terrainDragging, setTerrainDragging] = useState(false);
  const orbitRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const orbitTarget = useMemo<Vec3>(() => [0, project.geography ? sampleTerrain(project.terrain,0,0) : 3,0], [project.geography,project.terrain]);
  const lastFrameRequest = useRef<FrameRequest | null>(null);
  useEffect(() => {
    if (!frameRequest || lastFrameRequest.current === frameRequest || preview || !orbitRef.current || !(camera instanceof THREE.PerspectiveCamera)) return;
    lastFrameRequest.current = frameRequest;
    const included = frameRequest.kind === 'selected' ? subtreeIds(project.objects,selectedIds) : null;
    const matrices = resolveWorldMatrices(project.objects);
    const bounds = new THREE.Box3();
    const framedPortal=frameRequest.kind==='portal'?project.portals?.find(p=>p.id===frameRequest.portalId):undefined;
    if(framedPortal)bounds.set(new THREE.Vector3(-framedPortal.width/2,-framedPortal.height/2,-.15),new THREE.Vector3(framedPortal.width/2,framedPortal.height/2,.15)).applyMatrix4(new THREE.Matrix4().makeRotationY(framedPortal.yaw).setPosition(...framedPortal.position));
    for (const object of framedPortal ? [] : project.objects) {
      if (object.kind === 'group' || (included && !included.has(object.id)) || !effectiveObjectState(project.objects,object.id).visible) continue;
      bounds.union(objectLocalBounds(project,object).applyMatrix4(matrices.get(object.id)!));
    }
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-project.terrain.width/2,Math.min(...project.terrain.heights),-project.terrain.depth/2),new THREE.Vector3(project.terrain.width/2,Math.max(...project.terrain.heights),project.terrain.depth/2));
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2*Math.atan(Math.tan(vertical/2)*camera.aspect);
    const distance = Math.max(4,sphere.radius/Math.sin(Math.min(vertical,horizontal)/2)*1.15);
    const direction = framedPortal ? new THREE.Vector3(Math.sin(framedPortal.yaw),.15,Math.cos(framedPortal.yaw)).normalize() : camera.position.clone().sub(orbitRef.current.target).normalize();
    if (!direction.lengthSq()) direction.set(1,1,1).normalize();
    camera.position.copy(sphere.center).addScaledVector(direction,distance);
    orbitRef.current.target.copy(sphere.center);
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
    orbitRef.current.update();
  }, [frameRequest,preview,camera,project,selectedIds]);

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
  const childMap = new Map<string | undefined, EditorObject[]>();
  for (const object of objects) { const list = childMap.get(object.parentId) ?? []; list.push(object); childMap.set(object.parentId, list); }
  const blocked = new Set<string>(), byId = new Map(objects.map(object => [object.id,object]));
  for (const object of objects) if (object.locked) { let current: EditorObject | undefined = object; while (current && !blocked.has(current.id)) { blocked.add(current.id); current = current.parentId ? byId.get(current.parentId) : undefined; } }
  const renderObjects = (parentId?: string, ancestorLocked = false): ReactNode => (childMap.get(parentId) ?? []).map(object => {
    const locked = ancestorLocked || !!object.locked;
    return <WorldEntity key={object.id} object={object} asset={project.assets.find(asset => asset.id === object.assetId)}
      selected={selectedIds.includes(object.id)} tool={object.id === selectedId ? tool : 'select'} locked={locked || blocked.has(object.id)}
      snapEnabled={snapEnabled} snapStep={snapStep} select={additive => selectObject(object.id, additive)}
      moved={next => {
        if (locked || blocked.has(object.id)) return false;
        return onMoveObject(next);
      }}>{renderObjects(object.id, locked)}</WorldEntity>;
  });
  const onSculpt = useCallback((next: WorldProject) => setProject(authored => ({...authored,terrain:next.terrain})), [setProject]);
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
        {!preview && <PortalShapes project={project} selectedId={selectedPortalId} onSelect={onSelectPortal}/>}
        {renderObjects()}
      </Suspense>
      <OrbitControls
        ref={orbitRef}
        makeDefault
        enabled={!preview && !terrainDragging && !placementActive}
        target={orbitTarget}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={4}
        maxDistance={Math.max(220, project.terrain.width * 4)}
      />
      <PreviewCamera project={project} active={preview} paused={computerPaused} onExit={onExitPreview} />
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
  const setProjectRaw = useCallback((candidate: WorldProject) => {
    const next=candidate;
    if(openComputerIdRef.current&&!next.objects.some(object=>object.id===openComputerIdRef.current&&object.kind==='computer')){openComputerIdRef.current=null;setOpenComputerId(null);}
    projectRef.current = next;
    setProjectState(next);
    setSelection(previous => pruneSelection(next.objects,previous));
  }, []);
  const objects = project.objects;
  const [selection, setSelection] = useState<string[]>([]);
  const selectedIds = useMemo(() => pruneSelection(project.objects, selection), [project.objects, selection]);
  const selectedId = selectedIds.at(-1) ?? null;
  const selectionEpoch = useRef(0);
  const setSelectedId = useCallback((id: string | null) => { selectionEpoch.current++;setSelection(id ? [id] : []); }, []);
  const selectObject = useCallback((id: string, additive = false) => { selectionEpoch.current++;setSelection(previous => additive ? previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id] : [id]); }, []);
  const clipboard = useRef<{ project: WorldProject; ids: string[] } | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [brush, setBrush] = useState<Brush>('raise');
  const [brushRadius, setBrushRadius] = useState(8);
  const [strength, setStrength] = useState(1.2);
  const [terrainMaterial, setTerrainMaterial] = useState(0);
  const [draftFeature, setDraftFeature] = useState<DrawnFeature | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedPortalId,setSelectedPortalId] = useState<string|null>(null);
  const [portalNotice,setPortalNotice] = useState('');
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
  const [frameRequest,setFrameRequest] = useState<FrameRequest | null>(null);
  const [viewPreset, setViewPreset] = useState<'perspective' | 'top'>('perspective');
  const [preview, setPreview] = useState(false);
  const [nativePreview, setNativePreview] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [neonRuntime,setNeonRuntime] = useState<Record<string,NeonRuntimeState>>({});
  const [neonTarget,setNeonTarget] = useState<NeonInteractionTarget|null>(null);
  const [openComputerId,setOpenComputerId] = useState<string|null>(null);
  const openComputerIdRef = useRef<string|null>(null);
  const computerOpened = useRef({clock:0,at:0});
  const openComputerPanel = useCallback((id:string,time:number)=>{computerOpened.current={clock:time,at:performance.now()};openComputerIdRef.current=id;setOpenComputerId(id);setNeonTarget(null);document.exitPointerLock?.();},[]);
  const closeComputerPanel = useCallback(()=>{openComputerIdRef.current=null;setOpenComputerId(null);const canvas=document.querySelector('main canvas') as HTMLCanvasElement|null;if(canvas){canvas.tabIndex=0;canvas.focus();}},[]);
  const [privateSnapshot,setPrivateSnapshot] = useState<PrivateNeonSnapshot|null>(null);
  const [privateClockOffset,setPrivateClockOffset] = useState(0);
  const [privateLoadedWorldId,setPrivateLoadedWorldId] = useState<string|null>(null);
  const privateSnapshotRef = useRef<PrivateNeonSnapshot|null>(null),privateControlRef = useRef<PrivateNeonControl|null>(null),privateWorldId = useRef<string|null>(null);
  const privateSignIds = project.objects.filter(object => object.kind === 'neon-sign').map(object => object.id);
  const privateSessionActive = privateNeonMatchesWorld(privateSnapshot,project.metadata.worldId,privateSignIds);
  const privateRenderProject=useMemo(() => runtimePresentation(project, privateSnapshot), [project,privateSnapshot]);
  const effectiveNeonRuntime: Record<string,NeonRuntimeState> = privateSessionActive ? Object.fromEntries(privateSnapshot!.signs.map(sign => [sign.id,{powered:sign.powered,effectStart:0,effectStartMs:privateSnapshot!.effectStart,config:sign.config}])) : neonRuntime;
  const receivePrivateRuntime = useCallback((snapshot: PrivateNeonSnapshot|null,offsetMs: number) => {
    privateSnapshotRef.current=snapshot;setPrivateSnapshot(snapshot);setPrivateClockOffset(offsetMs);
    if (!privateNeonMatchesWorld(snapshot,projectRef.current.metadata.worldId,projectRef.current.objects.filter(object => object.kind === 'neon-sign').map(object => object.id)) || !snapshot) return;
    privateWorldId.current=snapshot.worldId;setPrivateLoadedWorldId(snapshot.worldId);
  }, []);
  const receivePrivateControl = useCallback((control: PrivateNeonControl|null) => {privateControlRef.current=control;}, []);
  const toggleRuntimeNeon = useCallback((id: string,time: number) => {
    const object = projectRef.current.objects.find(object => object.id === id);
    if (!object?.neon) return;
    if (privateWorldId.current === projectRef.current.metadata.worldId || privateSnapshotRef.current?.worldId === projectRef.current.metadata.worldId) {
      const snapshot=privateSnapshotRef.current,sign=snapshot?.signs.find(sign => sign.id === id);
      if (!privateNeonMatchesWorld(snapshot,projectRef.current.metadata.worldId,projectRef.current.objects.filter(object => object.kind === 'neon-sign').map(object => object.id)) || !privateControlRef.current || !sign) { setToast('Connect to the private server before changing shared signs.'); return; }
      privateControlRef.current.setPower(id,!sign.powered);return;
    }
    setNeonRuntime(previous => ({ ...previous,[id]:{ powered: !(previous[id]?.powered ?? object.neon!.powered),effectStart: time } }));
  }, []);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState('Saved locally');
  const [toast, setToast] = useState('');
  const [warehouseBusy, setWarehouseBusy] = useState(false);
  const [panel, setPanel] = useState<'scene' | 'assets' | 'objects' | 'terrain' | 'pen' | 'geo' | 'world'>('scene');
  const [pendingPlacement, setPendingPlacement] = useState<{ entry: CatalogueAsset; asset: WorldAsset; generation: number; yaw: number } | null>(null);
  const [placementHit, setPlacementHit] = useState<PlacementHit | null>(null);
  const catalogueAbort = useRef<AbortController | null>(null);
  const cataloguePlacementFailed = useCallback((reason: string) => {
    setPendingPlacement(null); setPlacementHit(null); setToast(reason);
    window.setTimeout(() => setToast(''), 4500);
  }, []);
  const undoStack = useRef<WorldProject[]>([]);
  const redoStack = useRef<WorldProject[]>([]);
  const saveRevision = useRef(0);
  const workspaceRef = useRef<Workspace | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const workspaceVersions = useRef(new Map<string,Workspace>());
  const [workspaceEntries,setWorkspaceEntries] = useState<Workspace[]>([]);
  const selected = objects.find((object) => object.id === selectedId) ?? null;
  const selectedLocked = selected ? [...subtreeIds(objects,[selected.id])].some(id => effectiveObjectState(objects,id).locked) : false;
  const selectedParentLocked = selected?.parentId ? effectiveObjectState(objects,selected.parentId).locked : false;
  const current = project;
  const exitPreview = useCallback(() => { setPreview(false); openComputerIdRef.current=null;setOpenComputerId(null);setNeonRuntime({}); setNeonTarget(null); }, []);

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
    const startupGeneration=worldGeneration.current,startupProject=projectRef.current;
    void loadWorkspace()
      .then((loaded) => {
        if (!alive) return;
        if (loaded && startupGeneration===worldGeneration.current && startupProject===projectRef.current) {
          workspaceRef.current=loaded;
          const result = validateWorld(loaded.project);
          if (result.valid && result.project) {
            setProjectRaw(result.project);
          }
        }
        void listWorkspaces().then(setWorkspaceEntries).catch(() => {});
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
      const workspace=workspaceRef.current ?? createWorkspace(current);
      workspaceRef.current=workspace;
      void queueWorkspaceSave(workspace,current).then(result=>{
        if(saveRevision.current===revision)setSaved(result.conflict?'Conflicting edit retained as a separate recovery workspace':'Saved locally '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
      }).catch(()=>{if(saveRevision.current===revision)setSaved('Local save failed - export a project file');});
    }, 350);
    return () => window.clearTimeout(id);
  }, [current, hydrated]);
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if(openComputerId){if(event.key==='Escape'){event.preventDefault();closeComputerPanel();}return;}
      if ((pendingPlacement || catalogueAbort.current) && !isTyping(event.target)) {
        if (event.key === 'Escape') { event.preventDefault(); cancelAssetOperations(); message('Object placement cancelled'); return; }
        if (event.key.toLowerCase() === 'r' && pendingPlacement) { event.preventDefault(); setPendingPlacement(p => p ? { ...p, yaw: p.yaw + Math.PI / 12 } : p); return; }
        if (event.key === 'Enter' && pendingPlacement && placementHit) { event.preventDefault(); confirmCataloguePlacement(placementHit); return; }
        return;
      }
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
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && !isTyping(event.target)) {
        event.preventDefault(); copySelection();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && !isTyping(event.target)) {
        event.preventDefault(); pasteSelection();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedId && !isTyping(event.target)) {
        event.preventDefault();
        duplicateSelected();
      } else if (event.code === 'Delete' && selectedId && !preview && !isTyping(event.target)) deleteSelected();
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
  async function newProject() {
    // User intent invalidates imports immediately, while the outgoing draft is
    // still being saved. A later world-switch intent supersedes this one.
    cancelAssetOperations();
    const previous=projectRef.current,generation=worldGeneration.current;
    try{await preserveCurrentWorkspace();}catch{message("Local recovery failed; export the current project before creating a world.");return;}
    if(previous!==projectRef.current||generation!==worldGeneration.current)return;
    const fresh = createWorld('Untitled world');
    workspaceRef.current=createWorkspace(fresh);
    setProjectRaw(fresh);
    setSelectedId(null);
    setPanel('world');
    setPreview(false);
    setDraftFeature(null); setSelectedFeatureId(null); setPlacingTree(false);
    undoStack.current = [];
    redoStack.current = [];
    message('New world created');
  }
  function selectPortal(id:string) { setSelectedPortalId(id);setSelectedId(null);setPanel('objects');setPortalNotice('');setFrameRequest(previous=>({kind:'portal',portalId:id,revision:(previous?.revision??0)+1})); }
  function addPortal() {
    try {
      const latest=projectRef.current,x=latest.spawn.position[0],z=latest.spawn.position[2]-4;
      const portal=createEditorPortal(latest,[x,sampleTerrain(latest.terrain,x,z)+1.25,z]);
      commitObjectCommand({...latest,portals:[...(latest.portals??[]),portal]});selectPortal(portal.id);
    } catch(error) {setPortalNotice(error instanceof Error?error.message:'Could not create portal.');}
  }
  function updatePortal(portal:WorldPortal) {
    try {
      const latest=projectRef.current;
      if(!latest.portals?.some(p=>p.id===portal.id))throw new Error('This portal is no longer in the current world.');
      commitObjectCommand({...latest,portals:latest.portals.map(p=>p.id===portal.id?portal:p)});setPortalNotice('');
    } catch(error) {setPortalNotice(error instanceof Error?error.message:'Could not update portal.');}
  }
  function deletePortal(id:string) {
    try {
      const latest=projectRef.current,dependent=latest.portals?.find(p=>p.id!==id&&p.destination.worldId===latest.metadata.worldId&&p.destination.regionId===latest.metadata.regionId&&p.destination.portalId===id);
      if(dependent)throw new Error('Repoint '+dependent.name+' before deleting its destination portal.');
      commitObjectCommand({...latest,portals:(latest.portals??[]).filter(p=>p.id!==id)});setSelectedPortalId(null);setPortalNotice('');
    } catch(error) {setPortalNotice(error instanceof Error?error.message:'Could not delete portal.');}
  }
  function commitObjectCommand(next: WorldProject) {
    const result = validateWorld(next);
    if (!result.valid || !result.project) throw new Error(result.errors[0] ?? 'Invalid object change.');
    if (new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_PROJECT_BYTES) throw new Error('The project would exceed the 25 MiB limit.');
    setProject(() => result.project!);
  }
  async function loadPrivateWorld(snapshot: PrivateNeonSnapshot) {
    const generation=worldGeneration.current,previous=projectRef.current;
    if (!window.confirm('Load the matching private neon test world? Your current world is retained in a separate local workspace.')) return;
    try {
      const next=createWorld('Private neon test world');next.metadata.worldId=snapshot.worldId;
      next.metadata.description='Private server-authorised sign configuration and runtime power; object transforms remain local.';
      next.terrain.heights.fill(0);next.spawn.position=[0,0,2.5];next.environment.timeOfDay=snapshot.worldHour;
      let cursor=0;
      next.objects=snapshot.signs.map((sign,index) => {
        const bounds=getNeonBounds(sign.config),width=bounds.max[0]-bounds.min[0];
        const object:EditorObject={id:sign.id,name:'Shared sign '+(index+1),kind:'neon-sign',neon:structuredClone(sign.config),position:[cursor,1.65,0],rotation:[0,0,0],scale:[1,1,1],color:sign.config.color,visible:true,collision:'none'};
        cursor+=width+2;return object;
      });
      if(generation!==worldGeneration.current||previous!==projectRef.current)return;
      if(!await openRepositoryProject(next,generation,{location:"private-demo:"+snapshot.serverId}))return;
      privateWorldId.current=snapshot.worldId;setPrivateLoadedWorldId(snapshot.worldId);
      setSelectedId(next.objects[0]?.id??null);setPreview(false);setNativePreview(false);
      message('Private test world loaded. Enter preview and aim at the first sign to use E.');
    } catch(error) { message(error instanceof Error ? error.message : 'Could not load private world'); }
  }
  function addComputer() {
    try {
      const computer=defaultComputer(projectRef.current.objects.find(object=>object.kind==='neon-sign')?.id);
      const object:EditorObject={id:newId(),name:'World computer',kind:'computer',computer,position:[0,sampleTerrain(project.terrain,0,0)+1,0],rotation:[0,0,0],scale:[1,1,1],color:'#1b2028',visible:true,collision:'none'};
      commitObjectCommand({...projectRef.current,objects:[...projectRef.current.objects,object]});setSelectedId(object.id);message('Computer created. Place it on a desk, then aim at it in preview and press E.');
    } catch(error){message(error instanceof Error?error.message:'Could not create computer');}
  }
  function addNeonSign() {
    try {
      const config = defaultNeonSign('THE RED LION');
      const object: EditorObject = { id:newId(), name:'Neon sign',kind:'neon-sign',neon:config,position:[0,sampleTerrain(project.terrain,0,0)+3,0],rotation:[0,0,0],scale:[1,1,1],color:config.color,visible:true,collision:'none' };
      commitObjectCommand({ ...projectRef.current,objects:[...projectRef.current.objects,object] });setSelectedId(object.id);message('Neon sign created: THE RED LION');
    } catch (error) { message(error instanceof Error ? error.message : 'Could not create neon sign'); }
  }
  function updateNeonSign(config: NeonSignConfig) {
    if (!selected || selected.kind !== 'neon-sign') return;
    if (privateWorldId.current === projectRef.current.metadata.worldId || privateSnapshotRef.current?.worldId === projectRef.current.metadata.worldId) {
      const snapshot=privateSnapshotRef.current;
      if (!privateNeonMatchesWorld(snapshot,projectRef.current.metadata.worldId,projectRef.current.objects.filter(object => object.kind === 'neon-sign').map(object => object.id)) || !privateControlRef.current || snapshot?.role !== 'owner') { message('Only the connected enrolled owner can edit shared sign configuration.'); return; }
      privateControlRef.current.setConfig(selected.id,config);return;
    }
    if (mutateObject(selected.id,{ neon:config,color:config.color })) setNeonRuntime(previous => { const next={...previous};delete next[selected.id];return next; });
  }
  function copySelection() {
    if (!selectedIds.length) return;
    clipboard.current = { project: projectRef.current, ids: [...selectedIds] };
    message(selectedIds.length + ' selection roots copied');
  }
  function pasteSelection() {
    const source = clipboard.current;
    if (!source) { message('Copy a selection first'); return; }
    try {
      const cloned = cloneSubtrees(source.project, source.ids), latest = projectRef.current;
      const assets = [...latest.assets], assetIds = new Map<string,string>();
      for (const assetId of new Set(cloned.objects.flatMap(object => object.assetId ? [object.assetId] : []))) {
        const candidate = source.project.assets.find(asset => asset.id === assetId);
        if (!candidate) throw new Error('Copied model asset is missing.');
        const existing = assets.find(asset => asset.dataUrl === candidate.dataUrl);
        const asset = existing ?? { ...candidate, id: assets.some(asset => asset.id === candidate.id) ? newId() : candidate.id };
        if (!existing) assets.push(asset); assetIds.set(assetId,asset.id);
      }
      const roots = new Set(cloned.rootIds);
      const copies = cloned.objects.map(object => ({ ...object, ...(object.assetId ? { assetId: assetIds.get(object.assetId)! } : {}), position: roots.has(object.id) ? [object.position[0] + 1.5,object.position[1],object.position[2]] as Vec3 : object.position }));
      commitObjectCommand({ ...latest, assets, objects: [...latest.objects,...copies] });
      setSelection(cloned.rootIds); message('Object subtrees pasted');
    } catch (error) { message(error instanceof Error ? error.message : 'Paste failed'); }
  }
  function duplicateSelected() { copySelection(); pasteSelection(); }
  function groupSelection(entireWorld: boolean) {
    try {
      const ids = entireWorld ? projectRef.current.objects.filter(object => !object.parentId).map(object => object.id) : selectedIds;
      const result = groupObjects(projectRef.current, ids, entireWorld ? project.metadata.name + ' group' : 'Group');
      commitObjectCommand(result.project); setSelectedId(result.groupId); message('Objects grouped');
    } catch (error) { message(error instanceof Error ? error.message : 'Could not group objects'); }
  }
  function ungroupSelection() {
    try { commitObjectCommand(ungroupObjects(projectRef.current, selectedIds)); setSelectedId(null); message('Groups removed; child world transforms preserved'); }
    catch (error) { message(error instanceof Error ? error.message : 'Could not ungroup'); }
  }
  function deleteSelected() {
    if (!selectedIds.length) return;
    try {
      const removed = subtreeIds(projectRef.current.objects, selectedIds);
      if ([...removed].some(id => effectiveObjectState(projectRef.current.objects,id).locked)) throw new Error('Unlock the selected subtree before deleting it.');
      commitObjectCommand({ ...projectRef.current, objects: projectRef.current.objects.filter(object => !removed.has(object.id)) }); setSelectedId(null);
    } catch (error) { message(error instanceof Error ? error.message : 'Could not delete selection'); }
  }
  function mutateObject(id: string, update: Partial<EditorObject>) {
    try {
      const latest = projectRef.current;
      if ([...subtreeIds(latest.objects,[id])].some(childId => effectiveObjectState(latest.objects,childId).locked)) throw new Error('Unlock the object and its descendants before changing it.');
      commitObjectCommand({ ...latest, objects: latest.objects.map(object => object.id === id ? { ...object,...update } : object) }); return true;
    } catch (error) { message(error instanceof Error ? error.message : 'Could not change object'); return false; }
  }
  function toggleObjectLock(id: string) {
    const latest = projectRef.current, object = latest.objects.find(object => object.id === id);
    if (!object || (object.parentId && effectiveObjectState(latest.objects,object.parentId).locked)) { message('Unlock the parent group first'); return; }
    try { commitObjectCommand({ ...latest, objects: latest.objects.map(item => item.id === id ? { ...item,locked: !item.locked } : item) }); }
    catch (error) { message(error instanceof Error ? error.message : 'Could not change lock'); }
  }
  function updateSelected(update: Partial<EditorObject>) { if (selected) mutateObject(selected.id,update); }
  function reparentSelection(parentId: string) {
    try { commitObjectCommand(reparentObjects(projectRef.current,selectedIds,parentId || undefined)); message('Parent changed; world transforms preserved'); }
    catch (error) { message(error instanceof Error ? error.message : 'Could not reparent objects'); }
  }
  function groundSelectedOnTerrain() {
    if (!selected) return;
    try {
      const latest = projectRef.current, asset = latest.assets.find(asset => asset.id === selected.assetId);
      if (!asset?.bounds) throw new Error('Model bounds unavailable.');
      const matrices = resolveWorldMatrices(latest.objects), matrix = matrices.get(selected.id)!;
      const bounds = new THREE.Box3(new THREE.Vector3(...asset.bounds.min),new THREE.Vector3(...asset.bounds.max)).applyMatrix4(matrix);
      const origin = new THREE.Vector3().setFromMatrixPosition(matrix);
      origin.y += sampleTerrain(latest.terrain,origin.x,origin.z) - bounds.min.y;
      if (selected.parentId) origin.applyMatrix4(matrices.get(selected.parentId)!.clone().invert());
      mutateObject(selected.id,{ position: origin.toArray() as Vec3 });
    } catch (error) { message(error instanceof Error ? error.message : 'Could not ground model'); }
  }
  function resizeSelectedGroup(dimensions: Vec3, uniform: boolean) {
    if (!selected) return;
    try { commitObjectCommand(resizeGroup(projectRef.current,selected.id,dimensions,uniform)); message('Group and all contents resized'); }
    catch (error) { message(error instanceof Error ? error.message : 'Could not resize group'); }
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
      if(!await openRepositoryProject(result.project,generation,{location:'file:'+file.name}))return;
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
      if (!window.confirm('Load the warehouse with its portal and computer room? Your current world will be retained in its local workspace. Save project keeps a separate file.')) return;
      const next: WorldProject = {
        ...result.project,
        metadata: {
          ...result.project.metadata,
          worldId: `elsemesh.world:warehouse-portal-interior:${crypto.randomUUID()}`,
          regionId: `elsemesh.region:${crypto.randomUUID()}`,
        },
      };
      if(!await openRepositoryProject(next,generation,{location:'starter:warehouse'}))return;
      setSelectedId(null); setSelectedFeatureId(null); setDraftFeature(null); setPlacingTree(false);
      setPreview(false); setNativePreview(false); setPanel('scene');
      message(`Warehouse loaded: ${result.project.objects.length} editable components. Your previous world remains in local workspaces.`);
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
    openComputerIdRef.current=null;setOpenComputerId(null);
    setNeonRuntime({}); setNeonTarget(null);
    catalogueAbort.current?.abort(); catalogueAbort.current = null;
    setPendingPlacement(null); setPlacementHit(null);
    worldGeneration.current++;
    pendingAssetOperation.current = null;
    setAssetBusy(false);
  }
  function queueWorkspaceSave(workspace:Workspace,snapshot:WorldProject) {
    const result=saveQueue.current.catch(()=>{}).then(async()=>{
      const target=workspaceVersions.current.get(workspace.workspaceId)??workspace;
      const result=await saveWorkspace(target,snapshot);
      workspaceVersions.current.set(workspace.workspaceId,result.workspace);
      if(workspaceRef.current?.workspaceId===workspace.workspaceId)workspaceRef.current=result.workspace;
      setWorkspaceEntries(await listWorkspaces());
      return result;
    });
    saveQueue.current=result;
    return result;
  }
  async function preserveCurrentWorkspace() {
    const snapshot=projectRef.current,workspace=workspaceRef.current??createWorkspace(snapshot);
    workspaceRef.current=workspace;
    await queueWorkspaceSave(workspace,snapshot);
    return snapshot;
  }
  async function openRepositoryProject(next: WorldProject, generation: number, base?: WorkspaceBase, existing?: Workspace) {
    if (generation !== worldGeneration.current) return false;
    cancelAssetOperations();
    const previous=projectRef.current,transitionGeneration=worldGeneration.current;
    try {await preserveCurrentWorkspace();}
    catch {message('Save the current world to a file before switching: local recovery storage is unavailable.');return false;}
    if(transitionGeneration!==worldGeneration.current||previous!==projectRef.current)return false;
    workspaceRef.current=existing ?? createWorkspace(next,base);
    if(existing)workspaceVersions.current.set(existing.workspaceId,existing);
    setProjectRaw(next);
    undoStack.current = []; redoStack.current = [];
    setSelectedId(null); setSelectedFeatureId(null);
    setDraftFeature(null); setPlacingTree(false);
    setPreview(false); setNativePreview(false);
    message('World workspace opened');
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
  async function beginCataloguePlacement(entry: CatalogueAsset) {
    cancelAssetOperations();
    const controller = new AbortController(); catalogueAbort.current = controller;
    const generation = worldGeneration.current, operation = ++assetOperation.current;
    pendingAssetOperation.current = operation; setAssetBusy(true);
    setPreview(false); setNativePreview(false); setPlacingTree(false); setDraftFeature(null);
    try {
      const bytes = await fetchCatalogueModel(entry, controller.signal);
      const asset = await admitGlb(bytes, { id: newId(), name: entry.name, source: entry.sourcePack.url + ' · catalogue ' + entry.id + ' · SHA256 ' + entry.sha256, license: entry.license.id + ' · ' + entry.license.attribution, prepared: true });
      if (controller.signal.aborted || generation !== worldGeneration.current) return;
      setSelectedId(null); setPendingPlacement({ entry, asset, generation, yaw: 0 });
      message('Move over terrain or an object surface. Click to place; R rotates; Escape cancels.');
    } catch (error) {
      if (!controller.signal.aborted && generation === worldGeneration.current) message(error instanceof Error ? error.message : 'Model could not be prepared.');
    } finally {
      if (catalogueAbort.current === controller) catalogueAbort.current = null;
      if (pendingAssetOperation.current === operation) { pendingAssetOperation.current = null; setAssetBusy(false); }
    }
  }
  function confirmCataloguePlacement(hit: PlacementHit) {
    if (!pendingPlacement || pendingPlacement.generation !== worldGeneration.current) return;
    try {
      const { entry, asset, yaw } = pendingPlacement;
      const transform = surfacePlacement(asset, hit.point, yaw, entry.defaultScale);
      const object: EditorObject = { id: newId(), name: entry.name, kind: 'glb', assetId: asset.id, ...transform, color: '#ffffff', visible: true, collision: 'solid' };
      const next = commitCataloguePlacement(projectRef.current, asset, object);
      setProject(() => next); setSelectedId(object.id); setSelectedFeatureId(null);
      setPendingPlacement(null); setPlacementHit(null); message(entry.name + ' placed on ' + hit.surface);
    } catch (error) { message(error instanceof Error ? error.message : 'Object placement failed.'); }
  }
  function placeProjectAsset(asset: WorldAsset) {
    try {
      const existing = projectRef.current.objects.find((object) => object.assetId === asset.id);
      const object: EditorObject = existing
        ? { ...existing, parentId: undefined, locked: false, id: newId(), name: `${existing.name} copy`, position: [0, 0, 0], visible: true }
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
          <button title="Undo (Ctrl+Z)" onClick={undo} disabled={privateSessionActive}>
            ↶
          </button>
          <button title="Redo (Ctrl+Y)" onClick={redo} disabled={privateSessionActive}>
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
          <button className={panel === 'objects' ? 'active' : ''} title="Objects" onClick={() => setPanel('objects')}>▦</button>
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
          <div hidden={panel !== 'objects'}><PrivateNeonSession worldId={project.metadata.worldId} signIds={privateSignIds} onLoadPrivateWorld={loadPrivateWorld} onRuntime={receivePrivateRuntime} onControl={receivePrivateControl}/></div>
          {panel === 'objects' && <><section className="interactive-objects" aria-label="Interactive objects"><h3>Interactive Objects</h3><button onClick={addNeonSign}>Neon Sign</button><button onClick={addComputer}>World Computer</button><button onClick={addPortal}>Portal opening</button><p className="library-note">Editable 3D lettering with local preview effects and power toggle.</p></section><PortalPanel project={project} selectedId={selectedPortalId} onSelect={selectPortal} onAdd={addPortal} onUpdate={updatePortal} onDelete={deletePortal} notice={portalNotice}/><CataloguePanel busy={assetBusy || !!pendingPlacement} onAdd={(entry) => void beginCataloguePlacement(entry)} /></>}
          {panel === 'scene' && <SceneExplorer project={project} selectedIds={selectedIds} onSelect={selectObject} onAdd={() => addObject('box')} onTerrain={() => setPanel('terrain')}
            onVisible={id => mutateObject(id,{ visible: !project.objects.find(object => object.id === id)!.visible })}
            onLock={toggleObjectLock} onGroup={() => groupSelection(false)} onUngroup={ungroupSelection} onGroupAll={() => groupSelection(true)} onCopy={copySelection} onPaste={pasteSelection} />}
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
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">PROJECT</span>
                  <h2>World settings</h2>
                </div>
              </div>
              <div className="field-label">WORLD NAME</div>
              <input
                className="wide-input"
                aria-label="World name"
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
          <div hidden={panel !== 'world'}>
            <RepositoryPanel getProject={() => projectRef.current} getGeneration={() => worldGeneration.current} getRepositoryOptions={() => workspaceRef.current?.base.repositoryOptions} onOpen={openRepositoryProject} />
            <label>Local workspaces<select aria-label="Local workspaces" value={workspaceRef.current?.workspaceId ?? ''} onChange={event => {const id=event.target.value,generation=worldGeneration.current,before=projectRef.current;void loadWorkspace(id).then(async entry=>{if(entry&&generation===worldGeneration.current&&before===projectRef.current)await openRepositoryProject(entry.project,generation,entry.base,entry);}).catch(()=>message('Could not switch workspace; current work is retained.'));}}><option value="">Choose a saved workspace</option>{workspaceEntries.map(entry=><option key={entry.workspaceId} value={entry.workspaceId}>{entry.name} — {entry.base.location}{entry.recoveredFrom?' (recovery)':''}</option>)}</select></label>
            {privateSessionActive && privateSnapshot?.role==='owner' && <button onClick={()=>{const checked=privateSnapshotRef.current;if(!checked)return;const expected={serverId:checked.serverId,epoch:checked.epoch,revision:checked.revision};if(!window.confirm('Adopt persistent sign configuration and world hour from server revision '+checked.revision+' into the authored world? This creates an undoable author edit. Runtime power is excluded.'))return;try{setProject(p=>adoptRuntimeSettings(p,privateSnapshotRef.current,expected));message('Server settings adopted into authored world');}catch(error){message(error instanceof Error?error.message:'Settings could not be adopted');}}}>Adopt server settings as author edit…</button>}
          </div>

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
          </div>
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
              <button disabled={preview || nativePreview} onClick={() => setFrameRequest(previous => ({kind:'world',revision:(previous?.revision ?? 0)+1}))}>Frame world</button>
              <button disabled={preview || nativePreview || !selectedIds.length} onClick={() => setFrameRequest(previous => ({kind:'selected',revision:(previous?.revision ?? 0)+1}))}>Frame selected</button>
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
            {nativePreview && <NativePreview project={privateRenderProject} neonRuntime={effectiveNeonRuntime} serverOffsetMs={privateSessionActive?privateClockOffset:0} onChange={setProject} onClose={() => setNativePreview(false)} />}
            <Canvas
              frameloop={nativePreview ? 'never' : 'always'}
              shadows
              camera={{ position: [82, 65, 88], fov: 42, far: 12000 }}
              dpr={[1, 1.6]}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
              onPointerMissed={() => setSelectedId(null)}
            >
              <NeonRuntimeContext.Provider value={{states:effectiveNeonRuntime,worldHour:privateSessionActive?privateSnapshot!.worldHour:project.environment.timeOfDay ?? 14,serverOffsetMs:privateSessionActive?privateClockOffset:0}}>
              <Scene
                project={privateRenderProject}
                frameRequest={frameRequest}
                selectedId={selectedId}
                selectedIds={selectedIds}
                selectObject={selectObject}
                tool={tool}
                setProject={setProject}
                brush={brush}
                radius={brushRadius}
                strength={strength}
                material={terrainMaterial}
                preview={preview}
                computerPaused={!!openComputerId}
                placementActive={!!pendingPlacement}
                onMoveObject={object => mutateObject(object.id,object)}
                terrainEditing={panel === 'terrain' && !preview && !pendingPlacement}
                onExitPreview={exitPreview}
                objects={objects}
                viewPreset={viewPreset}
                snapEnabled={snapEnabled}
                snapStep={snapStep}
                draftFeature={panel === 'pen' && !preview ? draftFeature : null}
                selectedFeatureId={selectedFeatureId}
                selectedPortalId={selectedPortalId}
                onSelectPortal={selectPortal}
                onSelectFeature={selectFeature}
                onTerrainPoint={!preview && ((panel === 'pen' && draftFeature) || (panel === 'assets' && placingTree)) ? terrainPoint : undefined}
              />
              <NeonInteraction project={project} active={preview&&!openComputerId} onTarget={setNeonTarget} onToggle={toggleRuntimeNeon} onOpenComputer={openComputerPanel}/>
              </NeonRuntimeContext.Provider>
              {pendingPlacement && <CataloguePlacement asset={pendingPlacement.asset} yaw={pendingPlacement.yaw} scale={pendingPlacement.entry.defaultScale} onHit={setPlacementHit} onConfirm={confirmCataloguePlacement} onError={cataloguePlacementFailed} />}
            </Canvas>
            {openComputerId && project.objects.find(object=>object.id===openComputerId&&object.kind==='computer') && <ComputerPanel object={project.objects.find(object=>object.id===openComputerId)!} project={project} runtime={effectiveNeonRuntime} onToggle={id=>toggleRuntimeNeon(id,computerOpened.current.clock+(performance.now()-computerOpened.current.at)/1000)} onClose={closeComputerPanel}/>}
            {preview && neonTarget && <div className="neon-interaction" role="status">E · {neonTarget.kind==='computer'?'Open':'Turn '+(neonTarget.powered?'off':'on')} {neonTarget.name}</div>}
            {pendingPlacement && <div className="placement-banner" role="status"><b>Place {pendingPlacement.entry.name}</b><div>{placementHit ? 'Surface: ' + placementHit.surface : 'Move over terrain or an object surface'} · R rotates · Escape cancels</div><button onClick={() => setPendingPlacement(p => p ? { ...p, yaw: p.yaw + Math.PI / 12 } : p)}>Rotate 15°</button><button disabled={!placementHit} onClick={() => { if (placementHit) confirmCataloguePlacement(placementHit); }}>Confirm placement</button><button onClick={cancelAssetOperations}>Cancel placement</button></div>}
            {preview ? (
              <>
                <div className="preview-hud">
                  <span>FIRST-PERSON PREVIEW</span>
                  <span>WASD MOVE&nbsp;&nbsp; SHIFT SPRINT&nbsp;&nbsp; SPACE JUMP</span>
                  <button onClick={exitPreview}>Exit preview&nbsp; Esc</button>
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
              WORLD SCHEMA&nbsp; <b>v2</b>
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
              <div className="hierarchy-properties">
                <label>Parent group<select aria-label="Parent group" disabled={selectedLocked} value={selected.parentId ?? ''} onChange={event => reparentSelection(event.target.value)}><option value="">World root</option>{objects.filter(object => object.kind === 'group' && !subtreeIds(objects,selectedIds).has(object.id)).map(object => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label>
                <button className="subdued" disabled={selectedParentLocked} onClick={() => toggleObjectLock(selected.id)}>{selected.locked ? 'Unlock selected object' : 'Lock selected object'}</button>
                {selected.kind === 'group' && <GroupDimensions project={project} object={selected} disabled={selectedLocked} onResize={resizeSelectedGroup}/>}
              </div>
              {selectedLocked && <p className="locked-message">Object, parent or descendant is locked. Unlock it before editing this subtree.</p>}
              <fieldset className="object-properties-fieldset" disabled={selectedLocked}>
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
                <div className="object-metadata"><label className="field-label">DESCRIPTION<textarea aria-label="Object description" maxLength={2000} value={selected.description ?? ''} onChange={event => updateSelected({ description: event.target.value })}/></label><label className="field-label">TAGS<input key={selected.id + '-tags'} className="wide-input" aria-label="Object tags" defaultValue={(selected.tags ?? []).join(', ')} onBlur={event => updateSelected({ tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })}/></label></div>
                <div className="field-label">TYPE</div>
                <div className="readonly-field">{selected.kind.toUpperCase()}</div>
                {selected.kind === 'tree' && <><div className="field-label">TREE SPECIES</div><select className="wide-select" value={selected.treeSpecies ?? 'broadleaf'} onChange={(event) => updateSelected({ treeSpecies: event.target.value as typeof treeSpecies })}>{TREE_SPECIES.map((species) => <option key={species.id} value={species.id}>{species.label}</option>)}</select></>}
                {selected.kind === 'computer' && selected.computer ? <div className="neon-designer"><h3>World computer</h3><label>Linked neon sign<select aria-label="Computer linked neon" value={selected.computer.targetSignId??''} onChange={event=>updateSelected({computer:{...selected.computer!,targetSignId:event.target.value||undefined}})}><option value="">No linked sign</option>{objects.filter(object=>object.kind==='neon-sign').map(object=><option key={object.id} value={object.id}>{object.name}</option>)}</select></label><label>Screen colour<input aria-label="Computer screen colour" type="color" value={selected.computer.screenColor} onChange={event=>updateSelected({computer:{...selected.computer!,screenColor:event.target.value}})}/></label><p>Aim at the computer within 3 m in first-person preview and press E. Its terminal shows real world information and controls the linked neon sign.</p></div> : selected.kind === 'neon-sign' && selected.neon ? <fieldset className="object-properties-fieldset" disabled={(privateLoadedWorldId === project.metadata.worldId || privateSnapshot?.worldId === project.metadata.worldId) && (!privateSessionActive || privateSnapshot?.role !== 'owner')}><NeonDesigner config={selected.neon} onChange={updateNeonSign} onError={message} captureImportGuard={() => { const before=projectRef.current,generation=worldGeneration.current,epoch=selectionEpoch.current;return () => before === projectRef.current && generation === worldGeneration.current && epoch === selectionEpoch.current; }}/></fieldset> : selected.kind === 'group' ? null : selected.kind === 'glb' ? <><div className="field-label">SOURCE MATERIALS</div><AssetMaterialEditor key={selected.id} object={selected} asset={project.assets.find((asset) => asset.id === selected.assetId)} onChange={(materialOverrides) => updateSelected({ materialOverrides })} /><button className="reset-material-button" onClick={groundSelectedOnTerrain}>Ground model on terrain</button></> : <>
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
                  {selected.kind !== 'group' && <option value="solid">Solid object</option>}
                  {selected.kind !== 'group' && <option value="walkable">Walkable surface</option>}
                  <option value="none">No collision</option>
                </select>
              </div>
              <button className="delete-button" onClick={deleteSelected}>
                ⌫&nbsp; Delete selection
              </button>
              </fieldset>
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

function GroupDimensions({ project, object, disabled, onResize }: { project: WorldProject; object: EditorObject; disabled: boolean; onResize: (dimensions: Vec3, uniform: boolean) => void }) {
  const [uniform,setUniform] = useState(false);
  const result = useMemo(() => {
    try { return { dimensions: getGroupBounds(project,object.id).dimensions.map((n,i) => n * object.scale[i]!) as Vec3, error: '' }; }
    catch (error) { return { dimensions: [0,0,0] as Vec3, error: error instanceof Error ? error.message : 'Group bounds unavailable' }; }
  }, [project,object]);
  return <div><b>Bounding dimensions (approx.) · local axes</b><p className="library-note">Resizes this group and every object inside it.</p>{result.error ? <p role="alert">{result.error}</p> : <div className="group-dimensions">{['Width','Height','Depth'].map((label,axis) => <label key={label}>{label} m<input type="number" min="0.01" step="0.1" aria-label={'Group ' + label.toLowerCase() + ' m'} disabled={disabled || result.dimensions.some(n => n <= 0)} value={Number(result.dimensions[axis]!.toFixed(3))} onChange={event => { const next = [...result.dimensions] as Vec3; next[axis] = Number(event.target.value); if (next[axis]! > 0) onResize(next,uniform); }}/></label>)}</div>}<label><input aria-label="Keep group proportions" type="checkbox" checked={uniform} onChange={event => setUniform(event.target.checked)}/> Keep proportions</label></div>;
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
