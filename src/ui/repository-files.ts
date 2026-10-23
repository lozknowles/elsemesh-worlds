import {
  packWorldRepository,
  repositoryDigest,
  WORLD_REPOSITORY_MANIFEST,
  WORLD_REPOSITORY_MANIFEST_LIMIT,
} from '../domain/world-repository';
import type { RepositoryReader } from '../domain/world-repository';
import type { WorldProject } from '../domain/world';
import { loadWorldSource } from '../domain/world-source';
import type { LoadedWorldSource } from '../domain/world-source';
import type { WorldPackOptions } from '../domain/world-repository';

interface RepositoryFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Uint8Array<ArrayBuffer>): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}
export interface RepositoryDirectoryHandle {
  kind: 'directory';
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<RepositoryFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<RepositoryDirectoryHandle>;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}
export type RepositoryBinding = { handle: RepositoryDirectoryHandle; name: string; manifestHash: string };
const generatedFiles = new Set(['README.md', '.gitattributes', '.gitignore']);
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';

async function pickDirectory(): Promise<RepositoryDirectoryHandle> {
  const picker = (window as unknown as {
    showDirectoryPicker?: (options: { mode: 'readwrite'; id: string }) => Promise<RepositoryDirectoryHandle>;
  }).showDirectoryPicker;
  if (!picker) throw new Error('World repository folders require Microsoft Edge or another browser with directory access.');
  return picker.call(window, { mode: 'readwrite', id: 'elsemesh-world-repository' });
}

function safeSegments(path: string): string[] {
  if (path.length > 240 || !/^[a-zA-Z0-9._/-]+$/.test(path) || path.startsWith('/') || path.includes('//')) throw new Error('Unsafe repository path.');
  const segments = path.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) throw new Error('Unsafe repository path segment.');
  return segments;
}

async function fileHandle(directory: RepositoryDirectoryHandle, path: string, create = false): Promise<RepositoryFileHandle> {
  const segments = safeSegments(path);
  let current = directory;
  for (const segment of segments.slice(0, -1)) current = await current.getDirectoryHandle(segment, { create });
  return current.getFileHandle(segments[segments.length - 1]!, { create });
}

function reader(directory: RepositoryDirectoryHandle): RepositoryReader {
  return async (path, maxBytes) => {
    const file = await (await fileHandle(directory, path)).getFile();
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || file.size > maxBytes) throw new Error(`Repository file exceeds its byte limit: ${path}`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error(`Repository file changed size while reading: ${path}`);
    return bytes;
  };
}

async function optionalManifest(read: RepositoryReader): Promise<Uint8Array | undefined> {
  try { return await read(WORLD_REPOSITORY_MANIFEST, WORLD_REPOSITORY_MANIFEST_LIMIT); }
  catch (error) { if (missing(error)) return undefined; throw error; }
}

async function isEmpty(directory: RepositoryDirectoryHandle): Promise<boolean> {
  for await (const entry of directory.values()) { void entry; return false; }
  return true;
}

async function write(directory: RepositoryDirectoryHandle, path: string, bytes: Uint8Array): Promise<void> {
  const stream = await (await fileHandle(directory, path, true)).createWritable();
  try { await stream.write(Uint8Array.from(bytes)); await stream.close(); }
  catch (error) { try { await stream.abort(); } catch { /* Preserve the original failure. */ } throw error; }
}

export async function openWorldRepositoryFolder(): Promise<{ project: WorldProject; binding: RepositoryBinding; loaded: LoadedWorldSource }> {
  const handle = await pickDirectory(), read = reader(handle);
  const before = await read(WORLD_REPOSITORY_MANIFEST, WORLD_REPOSITORY_MANIFEST_LIMIT);
  const manifestHash = await repositoryDigest(before);
  const loaded = await loadWorldSource({kind:'local',label:handle.name,read:async (path, maxBytes) => path === WORLD_REPOSITORY_MANIFEST ? before : read(path, maxBytes)});
  const project = loaded.project;
  const after = await read(WORLD_REPOSITORY_MANIFEST, WORLD_REPOSITORY_MANIFEST_LIMIT);
  if (await repositoryDigest(after) !== manifestHash) throw new Error('The world manifest changed while opening. Reopen the folder.');
  // The initial load used a captured manifest for consistency. Future explicit
  // update checks must read the current folder manifest rather than that capture.
  loaded.source={kind:'local',label:handle.name,read};
  return { project, loaded, binding: { handle, name: handle.name, manifestHash } };
}

/** Writes immutable content first and replaces only a recognized manifest last.
 * A failed save can leave unused content files; previous snapshots are retained.
 * Baseline checks detect intervening edits, but this is not a multi-writer lock.
 */
export async function saveWorldRepositoryFolder(project: WorldProject, binding?: RepositoryBinding, options?: WorldPackOptions): Promise<RepositoryBinding> {
  // Directory permission must be requested synchronously from the UI gesture,
  // before hashing/packing yields to browser work.
  const handle = binding?.handle ?? await pickDirectory();
  if (binding && handle.requestPermission && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Write access to this world repository was denied.');
  const snapshot = structuredClone(project);
  const read = reader(handle), before = await optionalManifest(read), empty = !before && await isEmpty(handle);
  let baseline: string | undefined;
  let packOptions = options;
  if (before) {
    baseline = await repositoryDigest(before);
    if (binding && binding.manifestHash !== baseline) throw new Error('This world repository changed on disk. Reopen it before saving.');
    // Recognition includes validating all existing referenced content. An
    // unrelated world.json is never sufficient authority to replace it.
    const existing = await loadWorldSource({kind:'local',label:handle.name,read:async (path,maxBytes)=>path===WORLD_REPOSITORY_MANIFEST?before:read(path,maxBytes)});
    packOptions ??= {attribution:existing.manifest.attribution,provenance:existing.manifest.provenance};
    if (existing.project.metadata.worldId !== snapshot.metadata.worldId) throw new Error('This folder belongs to a different world. Choose an empty folder or open that repository first.');
  } else if (binding || !empty) throw new Error('Choose an empty folder or a valid existing world repository. Unrelated folder contents will not be overwritten.');
  const files = await packWorldRepository(snapshot, packOptions);
  for (const [path, bytes] of files) {
    if (path === WORLD_REPOSITORY_MANIFEST || (!empty && generatedFiles.has(path))) continue;
    let existing: Uint8Array | undefined;
    try { existing = await read(path, bytes.byteLength); }
    catch (error) { if (!missing(error)) throw error; }
    if (existing) {
      if (existing.byteLength !== bytes.byteLength || await repositoryDigest(existing) !== await repositoryDigest(bytes)) throw new Error(`Existing repository content differs: ${path}. Nothing was overwritten.`);
    } else await write(handle, path, bytes);
  }
  const latest = await optionalManifest(read);
  if ((latest ? await repositoryDigest(latest) : undefined) !== baseline) throw new Error('The world manifest changed during save. Reopen before retrying; unused immutable content may remain.');
  const manifest = files.get(WORLD_REPOSITORY_MANIFEST)!;
  await write(handle, WORLD_REPOSITORY_MANIFEST, manifest);
  const manifestHash = await repositoryDigest(manifest);
  if (await repositoryDigest(await read(WORLD_REPOSITORY_MANIFEST, WORLD_REPOSITORY_MANIFEST_LIMIT)) !== manifestHash) throw new Error('World manifest verification failed after save. Reopen the folder.');
  return { handle, name: handle.name, manifestHash };
}
