import { MAX_PROJECT_BYTES, PROJECT_SCHEMA, LEGACY_PROJECT_SCHEMA, validateWorld } from './world';
import type { WorldProject } from './world';

export const WORLD_REPOSITORY_SCHEMA = 'elsemesh.world-repository/1';
export const WORLD_REPOSITORY_MANIFEST = 'world.json';
export const WORLD_REPOSITORY_MANIFEST_LIMIT = 64 * 1024;
export const ENGINE_REFERENCE = '95719848d5ffa4428b57c75c272483e1c2113a72';
const roles = ['metadata', 'terrain', 'objects', 'features', 'environment', 'spawn', 'geography', 'assets'] as const;
type Role = typeof roles[number];
type FileReference = { path: string; sha256: string; bytes: number };
type Manifest = {
  schema: typeof WORLD_REPOSITORY_SCHEMA;
  version: 1;
  projectSchema: typeof PROJECT_SCHEMA;
  engine: { commit: typeof ENGINE_REFERENCE; compatibility: 'reference-only-runtime-unverified' };
  snapshot: string;
  components: Record<Role, FileReference>;
};
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
  if (expectedPath !== undefined ? value.path !== expectedPath : !new RegExp(`^(assets/[a-f0-9]{64}\\.glb|imagery/[a-f0-9]{64}\\.(png|jpg))$`).test(value.path)) throw new Error('Repository file path is not allowed.');
  if (expectedPath === undefined && !value.path.includes(value.sha256)) throw new Error('Binary filename does not match its content hash.');
  return { path: value.path, sha256: value.sha256, bytes: value.bytes as number };
}

async function snapshotDigest(components: Record<Role, FileReference>): Promise<string> {
  return repositoryDigest(json(Object.fromEntries(roles.map(role => [role, { sha256: components[role].sha256, bytes: components[role].bytes }]))));
}

function validateProject(value: unknown): WorldProject {
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
export async function packWorldRepository(project: WorldProject): Promise<Map<string, Uint8Array>> {
  project = structuredClone(project);
  validateProject(project);
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
  const values: Record<Role, unknown> = { metadata: project.metadata, terrain: project.terrain, objects: project.objects, features: project.features ?? [], environment: project.environment, spawn: project.spawn, geography, assets };
  const components = {} as Record<Role, FileReference>;
  const contents = new Map<Role, Uint8Array>();
  for (const role of roles) {
    const bytes = json(values[role]); contents.set(role, bytes);
    components[role] = { path: '', sha256: await repositoryDigest(bytes), bytes: bytes.byteLength };
  }
  const snapshot = await snapshotDigest(components);
  for (const role of roles) { components[role].path = `snapshots/${snapshot}/${role}.json`; files.set(components[role].path, contents.get(role)!); }
  const manifest: Manifest = { schema: WORLD_REPOSITORY_SCHEMA, version: 1, projectSchema: PROJECT_SCHEMA, engine: { commit: ENGINE_REFERENCE, compatibility: 'reference-only-runtime-unverified' }, snapshot, components };
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
  if (!object(raw) || raw.schema !== WORLD_REPOSITORY_SCHEMA || raw.version !== 1 || ![PROJECT_SCHEMA, LEGACY_PROJECT_SCHEMA].includes(raw.projectSchema as typeof PROJECT_SCHEMA) || !object(raw.engine) || raw.engine.commit !== ENGINE_REFERENCE || raw.engine.compatibility !== 'reference-only-runtime-unverified' || typeof raw.snapshot !== 'string' || !hashPattern.test(raw.snapshot) || !object(raw.components) || Object.keys(raw.components).length !== roles.length) throw new Error('Unsupported or invalid world repository manifest.');
  const components = {} as Record<Role, FileReference>;
  for (const role of roles) components[role] = reference(raw.components[role], `snapshots/${raw.snapshot}/${role}.json`);
  if (await snapshotDigest(components) !== raw.snapshot) throw new Error('Snapshot identifier does not match its components.');
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
  for (const role of roles) values[role] = parse(await verified(components[role]));
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
  const candidate = {
    schema: raw.projectSchema, metadata: values.metadata, terrain: values.terrain,
    objects: values.objects, features: values.features, environment: values.environment,
    spawn: values.spawn, assets: assetPlans.map(({ metadata }) => ({ ...metadata, dataUrl: '' })),
    ...(geo.geography !== null ? { geography: geo.geography } : {}),
    ...(imageryPlan ? { terrainImagery: { ...imageryPlan.metadata, dataUrl: '' } } : {}),
  };
  const dataUrlBytes = (ref: FileReference, mediaType: string) => 4 * Math.ceil(ref.bytes / 3) + `data:${mediaType};base64,`.length;
  const hydratedBytes = encoder.encode(JSON.stringify(candidate)).byteLength
    + assetPlans.reduce((sum, { ref }) => sum + dataUrlBytes(ref, 'application/octet-stream'), 0)
    + (imageryPlan ? dataUrlBytes(imageryPlan.ref, imageryPlan.mediaType) : 0);
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
  return validateProject(candidate);
}
