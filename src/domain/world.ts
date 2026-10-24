import {validateSplatScene,assertSplatSceneStandaloneExport} from './splat-scene';
import type {SplatScene} from './splat-scene';
import {validateMediaScreen} from './media-screen';
import type {MediaScreenConfig} from './media-screen';
import { validateNativeIsland, assertNativeIslandStandaloneExport } from './native-island';
import type { NativeIsland } from './native-island';
import { validateObjectAccess } from './object-access';
import type { ObjectAccessPolicy } from './object-access';
import {validateRoadTraffic} from './road-traffic';
import type {RoadTraffic} from './road-traffic';
import {validateLandscape,admitLandscapeProject} from './landscape';
import {LANDSCAPE_PROJECT_SCHEMA} from './landscape-types';
import type {Landscape,LandscapeOrigin} from './landscape-types';
export {LANDSCAPE_PROJECT_SCHEMA} from './landscape-types';
import { validateWorldConnections } from './portal';
import type { WorldPortal, WorldWater, RetroTerminal } from './portal';
export type { WorldPortal, WorldWater, RetroTerminal } from './portal';
import { validateComputer, MAX_COMPUTERS } from './computer';
import type { ComputerConfig } from './computer';
import { neonTriangleCount, MAX_WORLD_NEON_TRIANGLES } from './neon-geometry';
import { validateNeonSign } from './neon-sign';
import type { NeonSignConfig } from './neon-sign';
import { validateHierarchy, validateWorldBounds } from './object-hierarchy';
import { inspectGlbJson, MAX_ASSET_BYTES } from './asset-glb';
import type { AssetBounds } from './asset-glb';
import { validateGeography, validateTerrainImagery } from './geography';
import type { GeoReference, TerrainImagery } from './geography';
export { inspectGlbJson } from './asset-glb';
export const LEGACY_PROJECT_SCHEMA = 'elsemesh.worlds.project/1';
export const PROJECT_SCHEMA = 'elsemesh.worlds.project/2';
export const LANDSCAPE_PLAYER_WORLD_SCHEMA = 'elsemesh.player-world/3';
export const PLAYER_WORLD_SCHEMA = 'elsemesh.player-world/2';
export const MAX_TERRAIN_RESOLUTION = 257;
export const MAX_PROJECT_BYTES = 25 * 1024 * 1024;

export type PlayerWorldPackage = {
  schema: typeof PLAYER_WORLD_SCHEMA | typeof LANDSCAPE_PLAYER_WORLD_SCHEMA;
  capabilities?: string[];
  units: 'metres';
  axes: 'right-handed-y-up-minus-z-forward';
  project: WorldProject;
};

export type Vec3 = [number, number, number];
export type FeatureKind = 'river' | 'lake' | 'path' | 'bridge' | 'shape' | 'waterfall';
export type DrawnFeature = {
  id: string;
  name: string;
  kind: FeatureKind;
  points: Vec3[];
  width: number;
  /** Bridge deck height in world metres. */
  elevation?: number;
  /** Waterfall height measured downwards from its placement point. */
  drop?: number;
  startLakeId?: string;
  endLakeId?: string;
};
export type PrimitiveKind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'tree' | 'building';
export type MaterialOverride = { materialIndex: number; color?: string; roughness?: number; metalness?: number };
export type AssetMaterialSlot = { index: number; name: string; color: string; roughness: number; metalness: number };
export type WorldAsset = {
  id: string; name: string; mediaType: string; dataUrl: string; bytes: number;
  source?: string; license?: string; prepared?: boolean;
  bounds?: AssetBounds; materialCount?: number; materialSlots?: AssetMaterialSlot[];
};
export type EditorObject = {
  id: string;
  name: string;
  kind: PrimitiveKind | 'glb' | 'group' | 'neon-sign' | 'computer' | 'media-screen';
  computer?: ComputerConfig;
  mediaScreen?: MediaScreenConfig;
  neon?: NeonSignConfig;
  parentId?: string;
  locked?: boolean;
  description?: string;
  tags?: string[];
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
  collision: 'solid' | 'walkable' | 'none';
  /** Authored box volume with no rendered mesh. */
  collisionOnly?: boolean;
  assetId?: string;
  materialOverrides?: MaterialOverride[];
  treeSpecies?: 'broadleaf' | 'palm' | 'pine';
  treeSeed?: number;
  landscapeOrigin?: LandscapeOrigin;
};
export type Terrain = {
  width: number;
  depth: number;
  resolution: number;
  seed: number;
  heights: number[];
  materials: number[];
};
export type WorldProject = {
  schema: typeof PROJECT_SCHEMA | typeof LANDSCAPE_PROJECT_SCHEMA;
  metadata: { name: string; description: string; worldId: string; regionId: string };
  terrain: Terrain;
  landscape?: Landscape;
  nativeIsland?: NativeIsland;
  splatScene?: SplatScene;
  geography?: GeoReference;
  terrainImagery?: TerrainImagery;
  objects: EditorObject[];
  features?: DrawnFeature[];
  traffic?: RoadTraffic;
  portals?: WorldPortal[];
  water?: WorldWater;
  terminals?: RetroTerminal[];
  objectAccess?: ObjectAccessPolicy;
  welcome?: { schema: 'elsemesh.world-welcome/1'; text: string; audio: boolean };
  spawn: { position: Vec3; yaw: number };
  environment: { sunAzimuth: number; sunElevation: number; fog: number; skyColor: string; timeOfDay?: number; cloudCoverage?: number; mistDensity?: number; mistSpeed?: number; mistHeight?: number; weather?: 'clear' | 'rain' | 'storm'; rainIntensity?: number; windSpeed?: number; weatherSeed?: number };
  assets: WorldAsset[];
};

export function createTerrain(width = 128, depth = 128, resolution = 65, seed = 2049): Terrain {
  if (
    !Number.isInteger(resolution) ||
    resolution < 9 ||
    resolution > MAX_TERRAIN_RESOLUTION ||
    (resolution - 1) % 2 !== 0
  ) {
    throw new RangeError(`Terrain resolution must be an odd integer from 9 to ${MAX_TERRAIN_RESOLUTION}.`);
  }
  if (![width, depth].every(Number.isFinite) || width < 16 || depth < 16 || width > 2048 || depth > 2048) {
    throw new RangeError('Terrain width and depth must be between 16 and 2048 metres.');
  }
  const lattice = (x: number, z: number, salt: number) => {
    let value = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + (seed >>> 0) + salt) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
    return (((value ^ (value >>> 16)) >>> 0) / 4294967295) * 2 - 1;
  };
  const noise = (x: number, z: number, scale: number, salt: number) => {
    const fx = x / scale,
      fz = z / scale,
      x0 = Math.floor(fx),
      z0 = Math.floor(fz);
    const tx0 = fx - x0,
      tz0 = fz - z0;
    const tx = tx0 * tx0 * (3 - 2 * tx0),
      tz = tz0 * tz0 * (3 - 2 * tz0);
    const a = lattice(x0, z0, salt) * (1 - tx) + lattice(x0 + 1, z0, salt) * tx;
    const b = lattice(x0, z0 + 1, salt) * (1 - tx) + lattice(x0 + 1, z0 + 1, salt) * tx;
    return a * (1 - tz) + b * tz;
  };
  const heights = Array.from({ length: resolution * resolution }, (_, index) => {
    const x = index % resolution;
    const z = Math.floor(index / resolution);
    const u = (x / (resolution - 1) - 0.5) * 2;
    const v = (z / (resolution - 1) - 0.5) * 2;
    const ridge = Math.max(0, 1 - Math.hypot(u * 0.8, v * 0.9));
    const wx = (u * width) / 2,
      wz = (v * depth) / 2;
    return Math.max(
      -0.4,
      ridge * 12 +
        noise(wx, wz, Math.max(width, depth) * 0.36, 0) * 5 +
        noise(wx, wz, Math.max(width, depth) * 0.16, 17) * 2 +
        noise(wx, wz, Math.max(width, depth) * 0.065, 31) * 0.7 -
        Math.hypot(u, v) * 1.2,
    );
  });
  return {
    width,
    depth,
    resolution,
    seed: seed >>> 0,
    heights,
    materials: Array(resolution * resolution).fill(0),
  };
}

export function createWorld(name = 'Untitled world'): WorldProject {
  const id = crypto.randomUUID();
  return {
    schema: PROJECT_SCHEMA,
    metadata: {
      name,
      description: '',
      worldId: `elsemesh.world:${id}`,
      regionId: `elsemesh.region:${crypto.randomUUID()}`,
    },
    terrain: createTerrain(),
    objects: [],
    features: [],
    spawn: { position: [0, 0, 18], yaw: 0 },
    environment: { sunAzimuth: 2.2, sunElevation: 0.8, fog: 0.003, skyColor: '#9bb9bb' },
    assets: [],
  };
}

const finiteVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export function isSimpleOutline(points: Vec3[]): boolean {
  const cross = (a: Vec3, b: Vec3, c: Vec3) => (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    area += a[0] * b[2] - b[0] * a[2];
    if (Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.05) return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j]!, d = points[(j + 1) % points.length]!;
      if (cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0 && Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <= Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) && Math.max(Math.min(a[2], b[2]), Math.min(c[2], d[2])) <= Math.min(Math.max(a[2], b[2]), Math.max(c[2], d[2]))) return false;
    }
  }
  return Math.abs(area) > 0.05;
}

export function migrateWorldProject(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const p = value as Record<string, unknown>;
  if (p.schema !== LEGACY_PROJECT_SCHEMA) return value;
  if (Array.isArray(p.objects) && p.objects.some(o => o && typeof o === 'object' && ('parentId' in o || o.kind === 'group'))) throw new Error('Legacy projects cannot contain hierarchy fields.');
  return { ...p, schema: PROJECT_SCHEMA };
}

export function validateWorld(value: unknown): { valid: boolean; errors: string[]; project?: WorldProject } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { valid: false, errors: ['Project must be an object.'] };
  try { value = migrateWorldProject(value); } catch (error) { return { valid: false, errors: [(error as Error).message] }; }
  const p = value as Partial<WorldProject>;
  if (p.schema !== PROJECT_SCHEMA && p.schema !== LANDSCAPE_PROJECT_SCHEMA) errors.push(`Unsupported project schema. Expected ${PROJECT_SCHEMA}.`);
  if (
    !p.metadata ||
    typeof p.metadata.name !== 'string' ||
    !p.metadata.name.trim() ||
    p.metadata.name.length > 120
  )
    errors.push('World name must contain 1–120 characters.');
  if (
    !p.metadata ||
    typeof p.metadata.description !== 'string' ||
    typeof p.metadata.worldId !== 'string' ||
    typeof p.metadata.regionId !== 'string'
  )
    errors.push('World metadata is incomplete.');
  if((p.schema===LANDSCAPE_PROJECT_SCHEMA)!==(p.landscape!==undefined))errors.push('Landscape content requires project/3; project/3 requires landscape/1 content.');
  const t = p.terrain;
  if (
    !t ||
    !Number.isInteger(t.width) ||
    !Number.isInteger(t.depth) ||
    !Number.isInteger(t.resolution) ||
    !Number.isInteger(t.seed) ||
    t.seed < 0 ||
    t.seed > 0xffffffff ||
    t.width < 16 ||
    t.width > 2048 ||
    t.depth < 16 ||
    t.depth > 2048 ||
    t.resolution < 9 ||
    t.resolution > MAX_TERRAIN_RESOLUTION ||
    (t.resolution - 1) % 2 !== 0
  ) {
    errors.push('Terrain dimensions or resolution are outside supported bounds.');
  } else if (
    !Array.isArray(t.heights) ||
    t.heights.length !== t.resolution * t.resolution ||
    !t.heights.every((h) => Number.isFinite(h) && Math.abs(h) <= 2000)
  ) {
    errors.push('Terrain height samples do not match the grid or contain invalid heights.');
  } else if (
    !Array.isArray(t.materials) ||
    t.materials.length !== t.resolution * t.resolution ||
    !t.materials.every((material) => Number.isInteger(material) && material >= 0 && material <= 3)
  ) {
    errors.push('Terrain material samples do not match the grid or contain an unsupported material.');
  }
  if (!Array.isArray(p.objects) || p.objects.length > 2000)
    errors.push('Projects may contain at most 2,000 scene objects.');
  if (p.geography !== undefined) errors.push(...validateGeography(p.geography, p.terrain));
  if (p.terrainImagery !== undefined) errors.push(...validateTerrainImagery(p.terrainImagery, p.geography));
  errors.push(...validateWorldConnections(p));
  if(Object.prototype.hasOwnProperty.call(p,'nativeIsland')&&p.nativeIsland===undefined)errors.push('Invalid native island field.');
  errors.push(...validateNativeIsland(p.nativeIsland));
  if(Object.hasOwn(p,'splatScene')&&p.splatScene===undefined)errors.push('Invalid splat scene field.');
  errors.push(...validateSplatScene(p.splatScene));
  errors.push(...validateObjectAccess(p));
  if(Object.prototype.hasOwnProperty.call(p,'welcome')){
    const greeting=p.welcome as unknown;
    if(!greeting||typeof greeting!=='object'||Array.isArray(greeting)||Object.keys(greeting).some(k=>!['schema','text','audio'].includes(k)))errors.push('Invalid welcome greeting.');
    else {const g=greeting as Record<string,unknown>;if(g.schema!=='elsemesh.world-welcome/1'||typeof g.text!=='string'||!g.text.trim()||g.text.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(g.text)||typeof g.audio!=='boolean')errors.push('Welcome greeting must contain 1–2000 plain text characters and a read aloud choice.');}
  }
  errors.push(...validateRoadTraffic(p.traffic,Array.isArray(p.assets)?p.assets:[]));
  errors.push(...validateLandscape(p as WorldProject));
  if (!p.landscape && Array.isArray(p.objects) && p.objects.some((o:EditorObject)=>o.landscapeOrigin)) errors.push('Landscape origins require landscape/1.');
  const pending:unknown[]=[p],inspected=new WeakSet<object>();while(pending.length){const value=pending.pop();if(value&&typeof value==='object'){if(inspected.has(value))continue;inspected.add(value);}if(Array.isArray(value)){for(const child of value)pending.push(child);}else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(['script','scripts','hook','hooks','code','modules','extensions','onload','onupdate','__proto__','prototype','constructor'].includes(key.toLowerCase()))errors.push('Executable fields are unsupported project content.');if(child&&typeof child==='object')pending.push(child);}}
  const assetIds = new Set(Array.isArray(p.assets) ? p.assets.map((asset) => asset?.id) : []);
  const ids = new Set<string>();
  for (const [index, object] of (Array.isArray(p.objects) ? p.objects : []).entries()) {
    if (
      !object ||
      typeof object !== 'object' ||
      typeof object.id !== 'string' ||
      !object.id ||
      ids.has(object.id)
    )
      errors.push(`Object ${index + 1} has a missing or duplicate ID.`);
    if (object && typeof object === 'object') ids.add(object.id);
    if (
      !object ||
      typeof object.name !== 'string' ||
      !object.name.trim() ||
      !finiteVec3(object.position) ||
      !finiteVec3(object.rotation) ||
      !finiteVec3(object.scale) ||
      object.scale.some((n) => n <= 0 || n > 1000)
    )
      errors.push(`Object ${index + 1} has invalid properties or transforms.`);
    if (!object || typeof object.visible !== 'boolean')
      errors.push(`Object ${index + 1} must declare boolean visibility.`);
    if (!object || !['box', 'sphere', 'cylinder', 'cone', 'tree', 'building', 'glb', 'group', 'neon-sign', 'computer', 'media-screen'].includes(object.kind))
      errors.push(`Object ${index + 1} uses an unsupported type.`);
    if (object?.kind === 'glb' && (typeof object.assetId !== 'string' || !assetIds.has(object.assetId)))
      errors.push(`Object ${index + 1} references an asset that is missing from the project.`);
    if (object && !['solid', 'walkable', 'none'].includes(object.collision))
      errors.push(`Object ${index + 1} has an unsupported collision setting.`);
    if (object?.collisionOnly !== undefined && (typeof object.collisionOnly !== 'boolean' || (object.collisionOnly && (object.kind !== 'box' || object.collision === 'none')))) errors.push(`Object ${index + 1} has invalid collision-only volume settings.`);
    if (object?.treeSpecies !== undefined && !['broadleaf', 'palm', 'pine'].includes(object.treeSpecies)) errors.push(`Object ${index + 1} has an unsupported tree species.`);
    if (object?.treeSeed !== undefined && (!Number.isInteger(object.treeSeed) || object.treeSeed < 0 || object.treeSeed > 0xffffffff)) errors.push(`Object ${index + 1} has an invalid tree seed.`);
    if (object?.materialOverrides !== undefined) {
      const seen = new Set<number>();
      if (!Array.isArray(object.materialOverrides) || object.materialOverrides.length > 256 || object.materialOverrides.some((entry) => {
        if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.materialIndex) || entry.materialIndex < 0 || seen.has(entry.materialIndex)) return true;
        seen.add(entry.materialIndex);
        return (entry.color !== undefined && (typeof entry.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.color))) || [entry.roughness, entry.metalness].some((n) => n !== undefined && (!Number.isFinite(n) || n < 0 || n > 1));
      })) errors.push(`Object ${index + 1} has invalid or duplicate material overrides.`);
      if (object.kind !== 'glb') errors.push(`Object ${index + 1} material overrides require an imported GLB.`);
    }
  }
  if (Array.isArray(p.objects)) {
    errors.push(...validateHierarchy(p.objects));
    if(p.objects.filter(o=>o?.kind==='media-screen').length>16)errors.push('Worlds may contain at most 16 media screens.');
    for(const o of p.objects){if(o?.kind==='media-screen'){errors.push(...validateMediaScreen(o.mediaScreen));if(o.assetId!==undefined)errors.push('Media screens cannot reference arbitrary assets.');}else if(o?.mediaScreen!==undefined)errors.push('Media screen configuration requires a media-screen object.');}
    if(p.objects.filter(o=>o?.kind==='computer').length>MAX_COMPUTERS)errors.push('Worlds may contain at most 32 computers.');
    for(const o of p.objects){if(o?.kind==='computer'){errors.push(...validateComputer(o.computer));if(o.assetId!==undefined)errors.push('Computers cannot reference assets.');}else if(o?.computer!==undefined)errors.push('Computer configuration requires a computer object.');}
    if(p.objects.filter(o=>o?.kind==='neon-sign').length>50)errors.push('Worlds may contain at most 50 neon signs.');
    for(const o of p.objects){if(o?.kind==='neon-sign')errors.push(...validateNeonSign(o.neon));else if(o?.neon!==undefined)errors.push('Neon configuration requires a neon-sign object.');}
  }
  if (!p.spawn || !finiteVec3(p.spawn.position) || !Number.isFinite(p.spawn.yaw))
    errors.push('Spawn position is invalid.');
  if (
    !p.environment ||
    ![p.environment.sunAzimuth, p.environment.sunElevation, p.environment.fog].every(Number.isFinite)
  )
    errors.push('Environment settings are invalid.');
  if (p.environment) {
    const limits = { timeOfDay: [0, 24], cloudCoverage: [0, 1], mistDensity: [0, 0.04], mistSpeed: [0, 15], mistHeight: [1, 50], rainIntensity: [0, 1], windSpeed: [0, 30], weatherSeed: [0, 0xffffffff] } as const;
    for (const [key, [min, max]] of Object.entries(limits)) {
      const value = p.environment[key as keyof typeof limits];
      if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) errors.push(`Environment ${key} is outside supported bounds.`);
    }
    if (p.environment.weather !== undefined && !['clear', 'rain', 'storm'].includes(p.environment.weather)) errors.push('Weather preset is invalid.');
    if (p.environment.weatherSeed !== undefined && !Number.isInteger(p.environment.weatherSeed)) errors.push('Weather seed must be an integer.');
  }
  if (p.features !== undefined && (!Array.isArray(p.features) || p.features.length > 128)) errors.push('Projects may contain at most 128 drawn features.');
  const featureIds = new Set<string>();
  for (const [index, feature] of (Array.isArray(p.features) ? p.features : []).entries()) {
    const label = `Feature ${index + 1}`;
    if (!feature || typeof feature !== 'object') { errors.push(`${label} is invalid.`); continue; }
    if (typeof feature.id !== 'string' || !feature.id || featureIds.has(feature.id) || ids.has(feature.id)) errors.push(`${label} has a missing or duplicate ID.`);
    featureIds.add(feature.id);
    if (typeof feature.name !== 'string' || !feature.name.trim() || feature.name.length > 120 || !['river', 'lake', 'path', 'bridge', 'shape', 'waterfall'].includes(feature.kind)) errors.push(`${label} has an invalid name or type.`);
    const minimum = feature.kind === 'waterfall' ? 1 : ['shape', 'lake'].includes(feature.kind) ? 3 : 2;
    if (!Array.isArray(feature.points) || feature.points.length < minimum || feature.points.length > 128 || (feature.kind === 'waterfall' && feature.points.length !== 1) || !feature.points.every((point) => finiteVec3(point) && point.every((n) => Math.abs(n) <= 2000))) errors.push(`${label} has invalid vertices (maximum 128).`);
    else if (feature.points.some((point, i) => i > 0 && Math.hypot(point[0] - feature.points[i - 1]![0], point[2] - feature.points[i - 1]![2]) < 0.05)) errors.push(`${label} has overlapping consecutive vertices.`);
    else if (['lake', 'shape'].includes(feature.kind) && !isSimpleOutline(feature.points)) errors.push(`${label} outline must have area and cannot cross itself.`);
    if (!Number.isFinite(feature.width) || feature.width < 0.2 || feature.width > 40) errors.push(`${label} width must be between 0.2 and 40 metres.`);
    if (['bridge', 'lake'].includes(feature.kind) && (!Number.isFinite(feature.elevation) || Math.abs(feature.elevation!) > 2000)) errors.push(`${label} requires a valid elevation.`);
    if (feature.kind === 'waterfall' && (!Number.isFinite(feature.drop) || feature.drop! < 0.5 || feature.drop! > 100)) errors.push(`${label} waterfall drop must be between 0.5 and 100 metres.`);
    if (feature.elevation !== undefined && (!Number.isFinite(feature.elevation) || Math.abs(feature.elevation) > 2000)) errors.push(`${label} elevation is invalid.`);
    if (feature.drop !== undefined && (!Number.isFinite(feature.drop) || feature.drop < 0.5 || feature.drop > 100)) errors.push(`${label} drop is invalid.`);
    for (const connection of [feature.startLakeId, feature.endLakeId]) if (connection !== undefined && (typeof connection !== 'string' || !p.features?.some((lake) => lake?.kind === 'lake' && lake.id === connection))) errors.push(`${label} references a missing lake.`);
  }
  if (!Array.isArray(p.assets) || p.assets.length > 128)
    errors.push('Projects may contain at most 128 imported assets.');
  else {
    const seenAssetIds = new Set<string>();
    const materialCounts = new Map<string, number>();
    let totalBytes = 0;
    for (const asset of p.assets) {
      if (
        !asset ||
        typeof asset.id !== 'string' || !asset.id ||
        seenAssetIds.has(asset.id) ||
        typeof asset.dataUrl !== 'string' ||
        !asset.dataUrl.startsWith('data:application/octet-stream;base64,')
      )
        errors.push('An imported asset reference is invalid.');
      if (asset) {
        seenAssetIds.add(asset.id);
        const encoded = typeof asset.dataUrl === 'string' ? asset.dataUrl.slice('data:application/octet-stream;base64,'.length) : '';
        const actualBytes = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
        totalBytes += Math.max(0, actualBytes);
        if (!Number.isInteger(asset.bytes) || asset.bytes !== actualBytes || actualBytes <= 0 || actualBytes > MAX_ASSET_BYTES) errors.push('Imported asset byte count or size is invalid.');
        if (typeof asset.name !== 'string' || !asset.name.trim() || asset.mediaType !== 'model/gltf-binary') errors.push('Imported asset name or media type is invalid.');
        if ([asset.source, asset.license].some((value) => value !== undefined && (typeof value !== 'string' || value.length > 2000)) || (asset.prepared !== undefined && typeof asset.prepared !== 'boolean')) errors.push('Imported asset provenance metadata is invalid.');
        try {
          if (actualBytes <= 0 || actualBytes > MAX_ASSET_BYTES || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid base64.');
          const binary = atob(encoded);
          const result = inspectGlbJson(Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer);
          materialCounts.set(asset.id, result.materialCount);
          if (asset.materialCount !== undefined && asset.materialCount !== result.materialCount) errors.push('Imported asset material count does not match its GLB.');
          if (asset.bounds !== undefined && (!asset.bounds || !finiteVec3(asset.bounds.min) || !finiteVec3(asset.bounds.max) || asset.bounds.min.some((n, i) => n > asset.bounds!.max[i]!) || [...asset.bounds.min, ...asset.bounds.max].some((n) => Math.abs(n) > 100_000))) errors.push('Imported asset bounds are invalid.');
          else if (asset.bounds !== undefined && [...asset.bounds.min, ...asset.bounds.max].some((n, i) => Math.abs(n - [...result.bounds.min, ...result.bounds.max][i]!) > 0.001)) errors.push('Imported asset bounds do not match its GLB geometry.');
          if (asset.materialSlots !== undefined) {
            const slots = new Set<number>();
            if (!Array.isArray(asset.materialSlots) || asset.materialSlots.length > result.materialCount || asset.materialSlots.some((slot) => {
              if (!slot || !Number.isInteger(slot.index) || slot.index < 0 || slot.index >= result.materialCount || slots.has(slot.index)) return true;
              slots.add(slot.index);
              return typeof slot.name !== 'string' || typeof slot.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(slot.color) || [slot.roughness, slot.metalness].some((n) => !Number.isFinite(n) || n < 0 || n > 1);
            })) errors.push('Imported asset material slot metadata is invalid.');
          }
        } catch { errors.push('An imported asset is not a supported self-contained static GLB 2.0 file.'); }
      }
    }
    if (totalBytes > 15 * 1024 * 1024) errors.push('Imported assets may total at most 15 MiB.');
    for (const object of Array.isArray(p.objects) ? p.objects : []) if (object?.kind === 'glb' && Array.isArray(object.materialOverrides)) {
      const count = materialCounts.get(object.assetId!);
      if (count === undefined || object.materialOverrides.some((entry) => !entry || entry.materialIndex >= count)) errors.push('A material override references a missing GLB material slot.');
    }
  }
  if (p.terrainImagery !== undefined || p.landscape !== undefined) {
    try { if (new TextEncoder().encode(JSON.stringify(p)).byteLength > MAX_PROJECT_BYTES) errors.push('Projects with embedded imagery must fit the 25 MiB project limit.'); }
    catch { errors.push('Project imagery could not be serialized.'); }
  }
  if (!errors.length) {
    try { if (p.objects!.reduce((n,o)=>n+(o.kind==='neon-sign'?neonTriangleCount(o.neon!):0),0)>MAX_WORLD_NEON_TRIANGLES)errors.push('Neon signs exceed the world budget of 1,000,000 triangles.'); } catch(error){ errors.push((error as Error).message); }
    if(!errors.length)errors.push(...validateWorldBounds(p as WorldProject));
  }
  return errors.length ? { valid: false, errors } : { valid: true, errors, project: { ...p, features: p.features ?? [] } as WorldProject };
}

/** Minimal explicit requirements for standalone package admission. */
function playerWorldCapabilities(project:WorldProject):string[]{
 return ['object-access/1',...(project.nativeIsland?.sea.surfaceExclusions!==undefined?['water-exclusion/1']:[]),...(project.objects.some(o=>o.kind==='media-screen')?['media-screen/1']:[]),...(project.nativeIsland?['native-island/1']:[]),...(project.welcome?['welcome/1']:[]),...(project.landscape?['project/3','landscape/1']:[]),
  ...(project.traffic?['port-traffic/1']:[]),
  ...(project.objects.some(o=>o.collisionOnly)?['collision-volumes/1']:[])];
}

/** Strict standalone package admission; never downgrades landscape to an older package schema. */
export function validatePlayerWorldPackage(value:unknown):ReturnType<typeof validateWorld>{
 const invalid=(message:string):ReturnType<typeof validateWorld>=>({valid:false,errors:[message]});
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid('Player world package must be an object.');
 const p=value as Record<string,unknown>;
 if(Object.keys(p).some(k=>!['schema','capabilities','units','axes','project'].includes(k))||p.units!=='metres'||p.axes!=='right-handed-y-up-minus-z-forward')return invalid('Unsupported player world package fields, units or axes.');
 if(p.schema!==PLAYER_WORLD_SCHEMA&&p.schema!==LANDSCAPE_PLAYER_WORLD_SCHEMA)return invalid('Unsupported player world package schema.');
 const result=validateWorld(p.project);if(!result.valid||!result.project)return result;
 if(result.project.splatScene)return invalid('Splat scene resources require an authorized repository source.');
 if((p.schema===LANDSCAPE_PLAYER_WORLD_SCHEMA)!==!!result.project.landscape)return invalid('Landscape requires player-world/3 capabilities.');
 const required=playerWorldCapabilities(result.project).filter(c=>c!=='object-access/1'||result.project!.objectAccess!==undefined||(Array.isArray(p.capabilities)&&p.capabilities.includes(c)));
 if(required.length){if(!Array.isArray(p.capabilities)||p.capabilities.length!==required.length||new Set(p.capabilities).size!==required.length||!required.every(c=>(p.capabilities as unknown[]).includes(c)))return invalid('Unsupported or missing player world capabilities.');}
 else if(p.capabilities!==undefined)return invalid('Unexpected player world capabilities.');
 try{if(new TextEncoder().encode(JSON.stringify(value)).byteLength>MAX_PROJECT_BYTES)return invalid('Player world package exceeds the 25 MiB limit.');}catch{return invalid('Player world package is not serializable.');}
 return result;
}

export function createPlayerWorldPackage(value: unknown): PlayerWorldPackage {
  const result = admitLandscapeProject(value);
  if (!result.valid || !result.project) throw new Error(result.errors[0] ?? 'Project is invalid.');
  assertNativeIslandStandaloneExport(result.project);
  assertSplatSceneStandaloneExport(result.project);
  const packageFile: PlayerWorldPackage = {
    schema: result.project.landscape ? LANDSCAPE_PLAYER_WORLD_SCHEMA : PLAYER_WORLD_SCHEMA,
    ...(playerWorldCapabilities(result.project).length?{capabilities:playerWorldCapabilities(result.project)}:{}),
    units: 'metres',
    axes: 'right-handed-y-up-minus-z-forward',
    project: result.project,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(packageFile)).byteLength;
  if (bytes > MAX_PROJECT_BYTES) throw new RangeError(`Player world packages are limited to ${MAX_PROJECT_BYTES / (1024 * 1024)} MiB.`);
  return packageFile;
}

export function sampleTerrain(terrain: Terrain, x: number, z: number): number {
  const { width, depth, resolution, heights } = terrain;
  const fx = Math.max(0, Math.min(resolution - 1, ((x + width / 2) / width) * (resolution - 1)));
  const fz = Math.max(0, Math.min(resolution - 1, ((z + depth / 2) / depth) * (resolution - 1)));
  const x0 = Math.floor(fx),
    z0 = Math.floor(fz);
  const x1 = Math.min(resolution - 1, x0 + 1),
    z1 = Math.min(resolution - 1, z0 + 1);
  const tx = fx - x0,
    tz = fz - z0;
  const at = (ix: number, iz: number) => heights[iz * resolution + ix] ?? 0;
  const a = at(x0, z0),
    b = at(x1, z0),
    c = at(x0, z1),
    d = at(x1, z1);
  // Keep collision queries on the exact two-triangle surface emitted by TerrainMesh.
  return tx + tz <= 1 ? a * (1 - tx - tz) + b * tx + c * tz : b * (1 - tz) + c * (1 - tx) + d * (tx + tz - 1);
}

export function sculptTerrain(
  terrain: Terrain,
  x: number,
  z: number,
  radius: number,
  strength: number,
  mode: 'raise' | 'lower' | 'flatten' | 'smooth',
): Terrain {
  if (
    ![x, z, radius, strength].every(Number.isFinite) ||
    radius < 1 ||
    radius > Math.max(terrain.width, terrain.depth) ||
    strength <= 0 ||
    strength > 10
  )
    throw new RangeError('Brush values are outside supported bounds.');
  const { resolution, width, depth } = terrain;
  const output = [...terrain.heights];
  const stepX = width / (resolution - 1),
    stepZ = depth / (resolution - 1);
  const target = sampleTerrain(terrain, x, z);
  for (let j = 0; j < resolution; j++)
    for (let i = 0; i < resolution; i++) {
      const wx = i * stepX - width / 2,
        wz = j * stepZ - depth / 2;
      const distance = Math.hypot(wx - x, wz - z);
      if (distance > radius) continue;
      const falloff = (1 - distance / radius) ** 2;
      const index = j * resolution + i;
      const current = terrain.heights[index] ?? 0;
      if (mode === 'raise' || mode === 'lower')
        output[index] = current + strength * falloff * (mode === 'raise' ? 1 : -1);
      else if (mode === 'flatten')
        output[index] = current + (target - current) * Math.min(1, strength * falloff);
      else {
        let sum = 0,
          count = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = i + dx,
              zz = j + dz;
            if (xx >= 0 && xx < resolution && zz >= 0 && zz < resolution) {
              sum += terrain.heights[zz * resolution + xx] ?? current;
              count++;
            }
          }
        output[index] = current + (sum / count - current) * Math.min(1, strength * falloff);
      }
    }
  return { ...terrain, heights: output };
}

export function paintTerrain(
  terrain: Terrain,
  x: number,
  z: number,
  radius: number,
  material: number,
): Terrain {
  if (
    ![x, z, radius, material].every(Number.isFinite) ||
    radius < 1 ||
    radius > Math.max(terrain.width, terrain.depth) ||
    !Number.isInteger(material) ||
    material < 0 ||
    material > 3
  )
    throw new RangeError('Terrain paint values are outside supported bounds.');
  const materials = [...terrain.materials],
    { resolution, width, depth } = terrain;
  for (let j = 0; j < resolution; j++)
    for (let i = 0; i < resolution; i++) {
      const wx = (i * width) / (resolution - 1) - width / 2,
        wz = (j * depth) / (resolution - 1) - depth / 2;
      if (Math.hypot(wx - x, wz - z) <= radius) materials[j * resolution + i] = material;
    }
  return { ...terrain, materials };
}
