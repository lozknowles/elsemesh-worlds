import {admitLandscapeProject} from './landscape';
import { MAX_PROJECT_BYTES, PROJECT_SCHEMA, LEGACY_PROJECT_SCHEMA, LANDSCAPE_PROJECT_SCHEMA, validateWorld } from './world';
import type { WorldProject } from './world';

export const LEGACY_WORLD_REPOSITORY_SCHEMA = 'elsemesh.world-repository/1';
export const PREVIOUS_WORLD_REPOSITORY_SCHEMA = 'elsemesh.world-repository/2';
export const CONNECTION_WORLD_REPOSITORY_SCHEMA = 'elsemesh.world-repository/3';
export const WORLD_REPOSITORY_SCHEMA = 'elsemesh.world-repository/4';
export const WORLD_ENGINE_CONTRACT = 'elsemesh.worlds.runtime/1';
export const WORLD_CAPABILITIES = ['project/2', 'project/3', 'landscape/1', 'terrain', 'objects', 'hierarchy', 'features', 'neon-sign', 'computer', 'geography', 'terrain-imagery', 'weather', 'portal/1', 'water/1', 'retro-terminal/1'] as const;
export type WorldProvenance = { sourceWorldId?: string; sourceLocation?: string; sourceCommit?: string; sourceDigest?: string };
export type WorldPackOptions = { attribution?: { license?: string; authors: string[]; source?: string }; provenance?: WorldProvenance };
export type WorldRepositoryManifest = { schema: string; version: number; projectSchema: string; engine: { commit: string; compatibility?: string; contract?: string; requires?: string[] }; snapshot: string; components: Record<LegacyRole, FileReference> & Partial<Record<'connections'|'landscape', FileReference>>; world?: WorldProject['metadata']; regions?: { regionId: string; name: string; scene: { snapshot: string } }[]; attribution?: WorldPackOptions['attribution']; provenance?: WorldProvenance };
export const WORLD_REPOSITORY_MANIFEST = 'world.json';
export const WORLD_REPOSITORY_MANIFEST_LIMIT = 64 * 1024;
export const ENGINE_REFERENCE = '95719848d5ffa4428b57c75c272483e1c2113a72';
const legacyRoles = ['metadata', 'terrain', 'objects', 'features', 'environment', 'spawn', 'geography', 'assets'] as const;
const connectionRoles = [...legacyRoles, 'connections'] as const;
const roles = [...connectionRoles, 'landscape'] as const;
type Role = typeof roles[number];
type LegacyRole = typeof legacyRoles[number];
type FileReference = { path: string; sha256: string; bytes: number };
export type RepositoryReader = (path: string, maxBytes: number) => Promise<Uint8Array>;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const hashPattern = /^[a-f0-9]{64}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const json = (value: unknown) => encoder.encode(JSON.stringify(value, null, 2) + '\n');

export async function repositoryDigest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function parse(bytes: Uint8Array): unknown {
  const text = decoder.decode(bytes);
  if (text.startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error('Git LFS pointer found: download the actual content before opening this world.');
  return JSON.parse(text) as unknown;
}

function reference(value: unknown, expectedPath?: string): FileReference {
  if (!object(value) || typeof value.path !== 'string' || typeof value.sha256 !== 'string' || !hashPattern.test(value.sha256) || !Number.isSafeInteger(value.bytes) || (value.bytes as number) < 1 || (value.bytes as number) > MAX_PROJECT_BYTES) throw new Error('Invalid repository file reference.');
  if (expectedPath !== undefined ? value.path !== expectedPath : !new RegExp(`^(assets/[a-f0-9]{64}\\.glb|landscape-images/[a-f0-9]{64}\\.(png|jpg)|imagery/[a-f0-9]{64}\\.(png|jpg))$`).test(value.path)) throw new Error('Repository file path is not allowed.');
  if (expectedPath === undefined && !value.path.includes(value.sha256)) throw new Error('Binary filename does not match its content hash.');
  return { path: value.path, sha256: value.sha256, bytes: value.bytes as number };
}

async function snapshotDigest(components: Record<LegacyRole, FileReference> & Partial<Record<'connections'|'landscape', FileReference>>): Promise<string> {
  return repositoryDigest(json(Object.fromEntries(roles.filter(role => components[role]).map(role => [role, { sha256: components[role]!.sha256, bytes: components[role]!.bytes }]))));
}

function validateProject(value: unknown): WorldProject {
  rejectExecutableFields(value);
  if (encoder.encode(JSON.stringify(value)).byteLength > MAX_PROJECT_BYTES) throw new Error('Hydrated world exceeds the 25 MiB project limit.');
  const result = validateWorld(value);
  if (!result.valid || !result.project) throw new Error(`Invalid repository world: ${result.errors.join(' ')}`);
  return result.project;
}

function decodeDataUrl(value: string): Uint8Array {
  const comma = value.indexOf(',');
  if (comma < 0 || !value.slice(0, comma).endsWith(';base64')) throw new Error('Only embedded base64 GLB/PNG/JPEG content can be stored.');
  const binary = atob(value.slice(comma + 1));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodeDataUrl(bytes: Uint8Array, mediaType: string): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return `data:${mediaType};base64,${btoa(binary)}`;
}

/** Builds content files only; never includes engine code, credentials or Git commands. */
export async function packWorldRepository(project: WorldProject, options: WorldPackOptions = {}): Promise<Map<string, Uint8Array>> {
  project = structuredClone(project);
  validateProject(project);
  const admitted=admitLandscapeProject(project);if(!admitted.valid||!admitted.project)throw Error(admitted.errors[0]??'Invalid project.');project=admitted.project;
  const files = new Map<string, Uint8Array>();
  const binary = async (dataUrl: string, directory: string, extension: string): Promise<FileReference> => {
    const bytes = decodeDataUrl(dataUrl), sha256 = await repositoryDigest(bytes), path = `${directory}/${sha256}.${extension}`;
    files.set(path, bytes);
    return { path, sha256, bytes: bytes.byteLength };
  };
  const assets = await Promise.all(project.assets.map(async asset => {
    const { dataUrl, ...metadata } = asset;
    return { ...metadata, file: await binary(dataUrl, 'assets', 'glb') };
  }));
  const imagery = project.terrainImagery;
  const geography = {
    geography: project.geography ?? null,
    terrainImagery: imagery ? { ...imagery, dataUrl: undefined, file: await binary(imagery.dataUrl, 'imagery', imagery.dataUrl.startsWith('data:image/png;') ? 'png' : 'jpg') } : null,
  };
  const landscape=project.landscape?{...project.landscape,images:await Promise.all(project.landscape.images.map(async image=>{const {dataUrl,...metadata}=image;return {...metadata,file:await binary(dataUrl,'landscape-images',image.mediaType==='image/png'?'png':'jpg')};}))}:undefined;
  const extended = project.portals !== undefined || project.water !== undefined || project.terminals !== undefined;
  const activeRoles = landscape ? roles : extended ? connectionRoles : legacyRoles;
  const values: Record<Role, unknown> = { landscape, metadata: project.metadata, terrain: project.terrain, objects: project.objects, features: project.features ?? [], environment: project.environment, spawn: project.spawn, geography, assets, connections: { ...(project.portals !== undefined ? { portals: project.portals } : {}), ...(project.water !== undefined ? { water: project.water } : {}), ...(project.terminals !== undefined ? { terminals: project.terminals } : {}) } };
  const components = {} as Record<Role, FileReference>;
  const contents = new Map<Role, Uint8Array>();
  for (const role of activeRoles) {
    const bytes = json(values[role]); contents.set(role, bytes);
    components[role] = { path: '', sha256: await repositoryDigest(bytes), bytes: bytes.byteLength };
  }
  const snapshot = await snapshotDigest(components);
  for (const role of activeRoles) { components[role].path = `snapshots/${snapshot}/${role}.json`; files.set(components[role].path, contents.get(role)!); }
  const manifest: WorldRepositoryManifest = { schema: landscape ? WORLD_REPOSITORY_SCHEMA : extended ? CONNECTION_WORLD_REPOSITORY_SCHEMA : PREVIOUS_WORLD_REPOSITORY_SCHEMA, version: landscape ? 4 : extended ? 3 : 2, projectSchema: project.schema, engine: { commit: ENGINE_REFERENCE, contract: WORLD_ENGINE_CONTRACT, requires: requiredWorldCapabilities(project) }, snapshot, components, world: project.metadata, regions: [{ regionId: project.metadata.regionId, name: project.metadata.name, scene: { snapshot } }], attribution: options.attribution ?? { authors: [] }, ...(options.provenance ? { provenance: options.provenance } : {}) };
  validateManifestMetadata(manifest);
  files.set('README.md', encoder.encode('# Player world content repository\n\nOpen this folder in ElseMesh Worlds using Open world repository. The builder validates hashes and hydrated content before loading. world.json selects an immutable snapshot; previous snapshots are retained. To edit JSON by hand, import the edited content through tooling that recomputes the snapshot and file hashes.\n\nThe engine reference is ' + ENGINE_REFERENCE + '. This is provenance only: loading this repository in the original game runtime is unverified. No engine source is included.\n\nAsset source and licence metadata are preserved in the assets and geography JSON. This repository grants no new rights to those assets. Choose a licence appropriate to your own content before publishing.\n\nUse ordinary Git for this bounded repository. Git LFS pointer files are not supported by the folder importer; actual binary content must be present.\n'));
  files.set('.gitattributes', encoder.encode('* text=auto\n*.json text eol=lf\n*.glb binary\n*.png binary\n*.jpg binary\n'));
  files.set('.gitignore', encoder.encode('.DS_Store\nThumbs.db\n*.tmp\n'));
  files.set(WORLD_REPOSITORY_MANIFEST, json(manifest));
  if ([...files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0) > MAX_PROJECT_BYTES) throw new Error('Formatted repository exceeds the 25 MiB content budget.');
  return files;
}

/** Bounded local reader: exact allowlisted paths and SHA-256 for every content file. */
export async function unpackWorldRepository(read: RepositoryReader): Promise<WorldProject> {
  const manifestBytes = await read(WORLD_REPOSITORY_MANIFEST, WORLD_REPOSITORY_MANIFEST_LIMIT);
  if (manifestBytes.byteLength > WORLD_REPOSITORY_MANIFEST_LIMIT) throw new Error('Repository manifest is too large.');
  const raw = parse(manifestBytes);
  validateManifestMetadata(raw);
  const manifest = raw as WorldRepositoryManifest;
  const components = {} as Record<Role, FileReference>;
  const activeRoles = manifest.version === 4 ? roles : manifest.version === 3 ? connectionRoles : legacyRoles;
  for (const role of activeRoles) components[role] = reference(manifest.components[role], `snapshots/${manifest.snapshot}/${role}.json`);
  if (await snapshotDigest(components) !== manifest.snapshot) throw new Error('Snapshot identifier does not match its components.');
  let total = manifestBytes.byteLength;
  const cache = new Map<string, Uint8Array>();
  const verified = async (ref: FileReference): Promise<Uint8Array> => {
    const cached = cache.get(ref.path);
    if (cached) { if (cached.byteLength !== ref.bytes || await repositoryDigest(cached) !== ref.sha256) throw new Error('Conflicting references to the same file.'); return cached; }
    if (total + ref.bytes > MAX_PROJECT_BYTES) throw new Error('Repository content exceeds the 25 MiB read budget.');
    const bytes = await read(ref.path, ref.bytes);
    const lfsPrefix = encoder.encode('version https://git-lfs.github.com/spec/v1');
    if (lfsPrefix.every((byte, index) => bytes[index] === byte)) throw new Error('Git LFS pointer found: actual content is required.');
    if (bytes.byteLength !== ref.bytes || await repositoryDigest(bytes) !== ref.sha256) throw new Error(`Repository content hash or size mismatch: ${ref.path}`);
    total += bytes.byteLength; cache.set(ref.path, bytes); return bytes;
  };
  const values = {} as Record<Role, unknown>;
  for (const role of activeRoles) values[role] = parse(await verified(components[role]));
  if (!Array.isArray(values.assets) || values.assets.length > 128 || !object(values.geography)) throw new Error('Invalid repository asset/geography components.');
  // Count descriptors, not unique binary paths: two asset entries hydrate into
  // two data URL fields even when the underlying GLB file is shared. Reject the
  // entire candidate before reading or base64-encoding any binary content.
  const assetPlans: { metadata: Record<string, unknown>; ref: FileReference }[] = [];
  let glbBytes = 0;
  for (const asset of values.assets) {
    if (!object(asset) || 'dataUrl' in asset) throw new Error('Invalid external asset descriptor.');
    const { file, ...metadata } = asset, ref = reference(file);
    if (!ref.path.startsWith('assets/')) throw new Error('GLB asset must use an assets path.');
    if (metadata.bytes !== ref.bytes) throw new Error('Asset byte metadata does not match its binary reference.');
    glbBytes += ref.bytes;
    if (glbBytes > 15 * 1024 * 1024) throw new Error('Hydrated imported assets may total at most 15 MiB, including repeated references.');
    assetPlans.push({ metadata, ref });
  }
  const geo = values.geography;
  let imageryPlan: { metadata: Record<string, unknown>; ref: FileReference; mediaType: string } | undefined;
  if (geo.terrainImagery !== null) {
    if (!object(geo.terrainImagery) || 'dataUrl' in geo.terrainImagery) throw new Error('Invalid external terrain imagery descriptor.');
    const { file, ...metadata } = geo.terrainImagery, ref = reference(file);
    if (!ref.path.startsWith('imagery/')) throw new Error('Terrain imagery must use an imagery path.');
    imageryPlan = { metadata, ref, mediaType: ref.path.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }
  const connections = manifest.version >= 3 ? values.connections : {};
  if (!object(connections) || Object.keys(connections).some(key => !['portals','water','terminals'].includes(key))) throw new Error('Invalid repository connections component.');
  const rawLandscape=manifest.version===4?values.landscape:undefined;
  const imagePlans:{metadata:Record<string,unknown>;ref:FileReference;mediaType:string}[]=[];
  if(rawLandscape!==undefined){
    if(!object(rawLandscape)||!Array.isArray(rawLandscape.images)||rawLandscape.images.length>16)throw Error('Invalid landscape image component');
    let bytes=0;
    for(const image of rawLandscape.images){if(!object(image)||'dataUrl'in image)throw Error('Invalid external landscape image');const {file,...metadata}=image,ref=reference(file);if(!ref.path.startsWith('landscape-images/')||metadata.id!=='sha256:'+ref.sha256||metadata.bytes!==ref.bytes)throw Error('Landscape image reference/hash mismatch');const mediaType=ref.path.endsWith('.png')?'image/png':'image/jpeg';if(metadata.mediaType!==mediaType)throw Error('Landscape image media mismatch');bytes+=ref.bytes;if(ref.bytes>2*1024*1024||bytes>4*1024*1024)throw Error('Landscape image byte budget exceeded');imagePlans.push({metadata,ref,mediaType});}
  }
  const candidate = {
    ...(rawLandscape?{landscape:{...rawLandscape,images:imagePlans.map(({metadata})=>({...metadata,dataUrl:''}))}}:{}),
    ...connections,
    schema: manifest.projectSchema, metadata: values.metadata, terrain: values.terrain,
    objects: values.objects, features: values.features, environment: values.environment,
    spawn: values.spawn, assets: assetPlans.map(({ metadata }) => ({ ...metadata, dataUrl: '' })),
    ...(geo.geography !== null ? { geography: geo.geography } : {}),
    ...(imageryPlan ? { terrainImagery: { ...imageryPlan.metadata, dataUrl: '' } } : {}),
  };
  const dataUrlBytes = (ref: FileReference, mediaType: string) => 4 * Math.ceil(ref.bytes / 3) + `data:${mediaType};base64,`.length;
  const hydratedBytes = encoder.encode(JSON.stringify(candidate)).byteLength
    + assetPlans.reduce((sum, { ref }) => sum + dataUrlBytes(ref, 'application/octet-stream'), 0)
    + (imageryPlan ? dataUrlBytes(imageryPlan.ref, imageryPlan.mediaType) : 0)
    + imagePlans.reduce((sum,{ref,mediaType})=>sum+dataUrlBytes(ref,mediaType),0);
  if (hydratedBytes > MAX_PROJECT_BYTES) throw new Error('Hydrated world exceeds the 25 MiB project limit, including repeated binary references.');
  const encodedCache = new Map<string, string>();
  const hydrate = async (ref: FileReference, mediaType: string) => {
    const bytes = await verified(ref);
    let dataUrl = encodedCache.get(ref.path);
    if (dataUrl === undefined) { dataUrl = encodeDataUrl(bytes, mediaType); encodedCache.set(ref.path, dataUrl); }
    return dataUrl;
  };
  for (let index = 0; index < assetPlans.length; index++) {
    const plan = assetPlans[index]!;
    candidate.assets[index]!.dataUrl = await hydrate(plan.ref, 'application/octet-stream');
  }
  if (imageryPlan && candidate.terrainImagery) candidate.terrainImagery.dataUrl = await hydrate(imageryPlan.ref, imageryPlan.mediaType);
  if(candidate.landscape)for(let i=0;i<imagePlans.length;i++){const plan=imagePlans[i]!;candidate.landscape.images[i]!.dataUrl=await hydrate(plan.ref,plan.mediaType);}
  const project = validateProject(candidate);
  if (manifest.version >= 2) {
    if (Object.keys(project.metadata).some(key => manifest.world?.[key as keyof WorldProject['metadata']] !== project.metadata[key as keyof WorldProject['metadata']]) || manifest.regions![0]!.regionId !== project.metadata.regionId) throw new Error('Manifest identity does not match scene metadata.');
    if (requiredWorldCapabilities(project).some(capability => !manifest.engine.requires!.includes(capability))) throw new Error('Manifest omits a capability required by scene content.');
  }
  return project;
}


export function requiredWorldCapabilities(project: WorldProject): string[] {
  const capabilities = new Set<string>([project.landscape?'project/3':'project/2', 'terrain', 'objects']);
  if(project.landscape)capabilities.add('landscape/1');
  if (project.objects.some(o => o.kind === 'group' || o.parentId)) capabilities.add('hierarchy');
  for (const kind of ['neon-sign', 'computer']) if (project.objects.some(o => o.kind === kind)) capabilities.add(kind);
  if (project.portals?.length) capabilities.add('portal/1');
  if (project.water) capabilities.add('water/1');
  if (project.terminals?.length) capabilities.add('retro-terminal/1');
  if (project.features?.length) capabilities.add('features');
  if (project.geography) capabilities.add('geography');
  if (project.terrainImagery) capabilities.add('terrain-imagery');
  if (Object.keys(project.environment).some(k => ['weather','timeOfDay','cloudCoverage','mistDensity','rainIntensity','windSpeed'].includes(k))) capabilities.add('weather');
  return [...capabilities].sort();
}

function validateManifestMetadata(raw: unknown): asserts raw is WorldRepositoryManifest {
  rejectExecutableFields(raw);
  if (!object(raw) || ![WORLD_REPOSITORY_SCHEMA, CONNECTION_WORLD_REPOSITORY_SCHEMA, PREVIOUS_WORLD_REPOSITORY_SCHEMA, LEGACY_WORLD_REPOSITORY_SCHEMA].includes(raw.schema as string) || ![PROJECT_SCHEMA, LEGACY_PROJECT_SCHEMA, LANDSCAPE_PROJECT_SCHEMA].includes(raw.projectSchema as typeof PROJECT_SCHEMA) || !object(raw.engine) || typeof raw.snapshot !== 'string' || !hashPattern.test(raw.snapshot) || !object(raw.components) || Object.keys(raw.components).length !== (raw.schema === WORLD_REPOSITORY_SCHEMA ? roles.length : raw.schema===CONNECTION_WORLD_REPOSITORY_SCHEMA?connectionRoles.length:legacyRoles.length)) throw new Error('Unsupported or invalid world repository manifest.');
  if (raw.schema === LEGACY_WORLD_REPOSITORY_SCHEMA) {
    if (raw.version !== 1 || typeof raw.engine.commit !== 'string' || !/^[a-f0-9]{40}$/.test(raw.engine.commit) || raw.engine.compatibility !== 'reference-only-runtime-unverified') throw new Error('Invalid legacy engine provenance.');
    return;
  }
  if (Object.keys(raw).some(k => !['schema','version','projectSchema','engine','snapshot','components','world','regions','attribution','provenance'].includes(k)) || Object.keys(raw.engine).some(k => !['commit','contract','requires'].includes(k))) throw new Error('Unknown manifest field or engine requirement.');
  if ((raw.schema === WORLD_REPOSITORY_SCHEMA ? raw.version !== 4 : raw.schema===CONNECTION_WORLD_REPOSITORY_SCHEMA?raw.version!==3:raw.version !== 2) || raw.projectSchema !== (raw.version===4?LANDSCAPE_PROJECT_SCHEMA:PROJECT_SCHEMA) || raw.engine.contract !== WORLD_ENGINE_CONTRACT || typeof raw.engine.commit !== 'string' || !/^[a-f0-9]{40}$/.test(raw.engine.commit) || !Array.isArray(raw.engine.requires) || raw.engine.requires.length > WORLD_CAPABILITIES.length || new Set(raw.engine.requires).size !== raw.engine.requires.length || raw.engine.requires.some(c => !(WORLD_CAPABILITIES as readonly unknown[]).includes(c))) throw new Error('Unsupported engine contract or required capability.');
  if (!object(raw.world) || !['worldId','regionId','name','description'].every(k => typeof (raw.world as Record<string, unknown>)[k] === 'string') || !Array.isArray(raw.regions) || raw.regions.length !== 1 || !object(raw.regions[0]) || raw.regions[0].regionId !== raw.world.regionId || raw.regions[0].name !== raw.world.name || !object(raw.regions[0].scene) || raw.regions[0].scene.snapshot !== raw.snapshot) throw new Error('Invalid world or region identity/scene. This engine supports one region per repository.');
  if (Object.keys(raw.world).some(k => !['worldId','regionId','name','description'].includes(k)) || ['worldId','regionId'].some(k => !(raw.world as Record<string,string>)[k]?.trim() || (raw.world as Record<string,string>)[k]!.length > 200)) throw new Error('World and region identifiers must be nonempty bounded strings.');
  if (!object(raw.attribution) || !Array.isArray(raw.attribution.authors) || raw.attribution.authors.length > 64 || raw.attribution.authors.some(a => typeof a !== 'string' || a.length > 200) || [raw.attribution.license,raw.attribution.source].some(v => v !== undefined && (typeof v !== 'string' || v.length > 2000))) throw new Error('Invalid attribution metadata.');
  if (raw.provenance !== undefined) {
    if (!object(raw.provenance) || Object.keys(raw.provenance).some(k => !['sourceWorldId','sourceLocation','sourceCommit','sourceDigest'].includes(k)) || Object.values(raw.provenance).some(v => typeof v !== 'string' || v.length > 2000) || (raw.provenance.sourceCommit !== undefined && !/^[a-f0-9]{40}$/.test(raw.provenance.sourceCommit as string)) || (raw.provenance.sourceDigest !== undefined && !hashPattern.test(raw.provenance.sourceDigest as string))) throw new Error('Invalid source provenance.');
  }
}

/** Returns repository metadata alongside the fully validated scene; never executes source content. */
export async function inspectWorldRepository(read: RepositoryReader): Promise<{ project: WorldProject; manifest: WorldRepositoryManifest; contentDigest: string }> {
  let manifestBytes: Uint8Array | undefined;
  const project = await unpackWorldRepository(async (path, limit) => {
    const bytes = await read(path, limit);
    if (path === WORLD_REPOSITORY_MANIFEST) manifestBytes = bytes;
    return bytes;
  });
  return { project, manifest: parse(manifestBytes!) as WorldRepositoryManifest, contentDigest: await repositoryDigest(manifestBytes!) };
}


function rejectExecutableFields(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length) {
    const current = pending.pop();
    if (Array.isArray(current)) pending.push(...current);
    else if (object(current)) for (const [key, child] of Object.entries(current)) {
      if (['script','scripts','hook','hooks','code','modules','extensions','onload','onupdate','__proto__','prototype','constructor'].includes(key.toLowerCase())) throw new Error('Executable hooks, scripts, and extension fields are not supported world content.');
      if (typeof child === 'object' && child !== null) pending.push(child);
    }
  }
}
