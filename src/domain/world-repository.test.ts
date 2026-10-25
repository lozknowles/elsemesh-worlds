import { describe, expect, it, vi } from 'vitest';
import { createTerrain, createWorld, type WorldProject } from './world';
import { defaultNeonSign } from './neon-sign';
import { defaultComputer } from './computer';
import { packWorldRepository, unpackWorldRepository, inspectWorldRepository, repositoryDigest, WORLD_REPOSITORY_MANIFEST, WORLD_REPOSITORY_MANIFEST_LIMIT, type RepositoryReader } from './world-repository';
import { parseGitHubWorldLocation, resolveGitHubWorldSource, loadWorldSource, checkWorldSourceUpdate, forkWorldSource, type PinnedGitHubSource } from './world-source';
const encoder = new TextEncoder();
const encode = (value: unknown) => encoder.encode(JSON.stringify(value, null, 2) + '\n');
const decode = (value: Uint8Array) => JSON.parse(new TextDecoder().decode(value));
const readFiles = (files: Map<string, Uint8Array>): RepositoryReader => async (path, limit) => { const bytes = files.get(path); if (!bytes) throw new Error(`Missing ${path}`); if (bytes.length > limit) throw new Error('Reader bound'); return bytes; };
const world = () => { const project = createWorld('Harbour'); project.terrain = createTerrain(32, 32, 9); return project; };
const commit = 'a'.repeat(40);
const pinned: PinnedGitHubSource = { kind: 'github', owner: 'example', repository: 'world', path: 'worlds/harbour', ref: 'main', commit };
const mutateManifest = (files: Map<string, Uint8Array>, change: (manifest: ReturnType<typeof decode>) => void) => { const manifest = decode(files.get(WORLD_REPOSITORY_MANIFEST)!); change(manifest); files.set(WORLD_REPOSITORY_MANIFEST, encode(manifest)); };
function fileFetch(files: Map<string, Uint8Array>, sha = commit) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify({ sha }));
    const marker = `/${sha}/worlds/harbour/`;
    const path = url.slice(url.indexOf(marker) + marker.length);
    const bytes = files.get(path);
    return bytes ? new Response(Uint8Array.from(bytes)) : new Response('missing', { status: 404 });
  }) as ReturnType<typeof vi.fn> & typeof fetch;
}

describe('immutable world repository v2 and legacy migration', () => {
  it('round trips deterministically, retaining identity, attribution and explicit scene', async () => {
    const project = world();
    const options = { attribution: { authors: ['Creator'], license: 'CC-BY-4.0' }, provenance: { sourceWorldId: 'original', sourceDigest: 'd'.repeat(64) } };
    const first = await packWorldRepository(project, options), second = await packWorldRepository(project, options);
    expect(first).toEqual(second);
    const result = await inspectWorldRepository(readFiles(first));
    expect(result.project).toEqual(project);
    expect(result.manifest.schema).toBe('elsemesh.world-repository/2');
    expect(result.manifest.world).toEqual(project.metadata);
    expect(result.manifest.regions![0]!.scene.snapshot).toBe(result.manifest.snapshot);
    expect(result.manifest.attribution).toEqual(options.attribution);
    expect(result.manifest.provenance).toEqual(options.provenance);
    expect(result.contentDigest).toBe(await repositoryDigest(first.get('world.json')!));
  });
  it('reads v1 without changing input files, and emits v2 only on explicit packing', async () => {
    const project = world(), files = await packWorldRepository(project);
    mutateManifest(files, m => { m.schema = 'elsemesh.world-repository/1'; m.version = 1; m.engine = { commit, compatibility: 'reference-only-runtime-unverified' }; delete m.world; delete m.regions; delete m.attribution; });
    const before = structuredClone(files);
    expect(await unpackWorldRepository(readFiles(files))).toEqual(project);
    expect(files).toEqual(before);
    expect(decode((await packWorldRepository(project)).get('world.json')!).version).toBe(2);
  });
  it('enforces capability compatibility independently of the engine provenance commit', async () => {
    const files = await packWorldRepository(world());
    mutateManifest(files, m => { m.engine.commit = commit; });
    await expect(unpackWorldRepository(readFiles(files))).resolves.toBeDefined();
    for (const change of [(m: ReturnType<typeof decode>) => { m.engine.requires.push('arbitrary-scripting'); }, (m: ReturnType<typeof decode>) => { m.engine.contract = 'future'; }, (m: ReturnType<typeof decode>) => { m.engine.requires = []; }]) {
      const changed = structuredClone(files); mutateManifest(changed, change);
      await expect(unpackWorldRepository(readFiles(changed))).rejects.toThrow(/capability|contract/i);
    }
  });
  it('retains supported neon and computer behavior declarations', async () => {
    const project = world();
    const base = { name: 'Prop', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, collision: 'none', color: '#ffffff' };
    project.objects = [{ ...base, id: 'sign', kind: 'neon-sign', neon: defaultNeonSign('HELLO') }, { ...base, id: 'pc', kind: 'computer', computer: defaultComputer('sign') }] as WorldProject['objects'];
    const files = await packWorldRepository(project), loaded = await inspectWorldRepository(readFiles(files));
    expect(loaded.project.objects).toEqual(project.objects);
    expect(loaded.manifest.engine.requires).toEqual(expect.arrayContaining(['neon-sign','computer']));
  });
  it('rejects traversal and hashes before reading selected paths', async () => {
    const files = await packWorldRepository(world());
    mutateManifest(files, m => { m.components.terrain.path = '../secret'; });
    const read = vi.fn(readFiles(files));
    await expect(unpackWorldRepository(read)).rejects.toThrow(/path/);
    expect(read).toHaveBeenCalledTimes(1);
    const good = await packWorldRepository(world());
    const manifest = decode(good.get('world.json')!);
    good.set(manifest.components.terrain.path, encode({ malicious: true }));
    await expect(unpackWorldRepository(readFiles(good))).rejects.toThrow(/hash or size/);
  });
  it('rejects oversize manifests, LFS pointers, unknown hooks, invalid identities and multiple scenes', async () => {
    await expect(unpackWorldRepository(async () => new Uint8Array(WORLD_REPOSITORY_MANIFEST_LIMIT + 1))).rejects.toThrow(/large/);
    await expect(unpackWorldRepository(async () => encoder.encode('version https://git-lfs.github.com/spec/v1'))).rejects.toThrow(/LFS/);
    for (const change of [(m: ReturnType<typeof decode>) => { m.hooks = { load: 'eval()' }; }, (m: ReturnType<typeof decode>) => { m.world.worldId = 'other'; }, (m: ReturnType<typeof decode>) => { m.regions.push(m.regions[0]); }]) {
      const files = await packWorldRepository(world()); mutateManifest(files, change);
      await expect(unpackWorldRepository(readFiles(files))).rejects.toThrow();
    }
    const malicious = { ...world(), scripts: ['fetch(secret)'] };
    await expect(packWorldRepository(malicious)).rejects.toThrow(/scripts/);
  });
});

describe('shared local and pinned GitHub loading', () => {
  it('separates world identity, location, full commit, digest and session without mutations', async () => {
    const project = world(), files = await packWorldRepository(project);
    const fetcher = fileFetch(files);
    const first = await loadWorldSource(pinned, { fetch: fetcher });
    const second = await loadWorldSource({ kind: 'local', read: readFiles(files), label: 'Harbour' });
    expect(first.project).toEqual(second.project);
    expect(first.identity.worldId).toBe(project.metadata.worldId);
    expect(first.identity.resolvedCommit).toBe(commit);
    expect(first.identity.contentDigest).toBe(second.identity.contentDigest);
    expect(first.identity.sessionId).not.toBe(second.identity.sessionId);
    for (const call of fetcher.mock.calls) {
      expect(String(call[0])).toContain(`/${commit}/`);
      expect(call[1]).toMatchObject({ redirect: 'error', credentials: 'omit' });
    }
    expect(project).toEqual(second.project);
  });
  it('resolves a branch or tag separately and never requests moving content refs', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ sha: commit }))) as unknown as typeof fetch;
    const source = await resolveGitHubWorldSource(parseGitHubWorldLocation('https://github.com/example/world/tree/release/worlds/harbour'), { fetch: fetcher });
    expect(source.commit).toBe(commit);
    expect(source.ref).toBe('release');
    expect(fetcher).toHaveBeenCalledWith('https://api.github.com/repos/example/world/commits/release', expect.anything());
    const noFetch = vi.fn();
    expect((await resolveGitHubWorldSource({ owner: 'example', repository: 'world', path: '', ref: commit }, { fetch: noFetch })).commit).toBe(commit);
    expect(noFetch).not.toHaveBeenCalled();
  });
  it('resolves a large GitHub commit response for an asset-rich world without unbounding it', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ sha: commit, files: 'x'.repeat(600_000) }))) as unknown as typeof fetch;
    const source = await resolveGitHubWorldSource({ owner: 'example', repository: 'large-world', path: '' }, { fetch: fetcher });
    expect(source.commit).toBe(commit);
    const tooLarge = vi.fn(async () => new Response(JSON.stringify({ sha: commit, files: 'x'.repeat(2 * 1024 * 1024) }))) as unknown as typeof fetch;
    await expect(resolveGitHubWorldSource({ owner: 'example', repository: 'large-world', path: '' }, { fetch: tooLarge })).rejects.toThrow(/byte limit/);
  });
  it.each(['http://github.com/example/world','https://user:secret@github.com/example/world','https://github.com.evil.test/example/world','https://github.com/example/world?token=x','https://github.com/example/world/tree/main/../secrets','https://github.com/example/world/tree/main/%2e%2e/secrets','https://github.com/example/world/blob/main/world.json'])('rejects unsafe source URL %s', input => {
    expect(() => parseGitHubWorldLocation(input)).toThrow();
  });
  it('rejects malformed refs and response commits before content loading', async () => {
    for (const ref of ['../main','branch?x','main@{1}','a b']) await expect(resolveGitHubWorldSource({ ...pinned, ref })).rejects.toThrow(/reference/);
    await expect(resolveGitHubWorldSource({ ...pinned }, { fetch: vi.fn(async () => new Response('{"sha":"main"}')) as unknown as typeof fetch })).rejects.toThrow(/full commit/);
    await expect(loadWorldSource({ ...pinned, commit: 'main' })).rejects.toThrow(/full Git commit/);
  });
  it('bounds chunked responses without trusting length and denies redirects and request errors', async () => {
    const oversized = vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(WORLD_REPOSITORY_MANIFEST_LIMIT + 1)); controller.close(); } }))) as unknown as typeof fetch;
    await expect(loadWorldSource(pinned, { fetch: oversized })).rejects.toThrow(/byte limit/);
    const redirect = vi.fn(async () => { const response = new Response('{}'); Object.defineProperty(response, 'redirected', { value: true }); return response; }) as unknown as typeof fetch;
    await expect(loadWorldSource(pinned, { fetch: redirect })).rejects.toThrow(/redirect/);
    await expect(loadWorldSource(pinned, { fetch: vi.fn(async () => new Response('bad', { status: 403 })) as unknown as typeof fetch })).rejects.toThrow(/403/);
  });
  it('aborts timed out network requests', async () => {
    const stalled = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    await expect(loadWorldSource(pinned, { fetch: stalled, timeoutMs: 5 })).rejects.toThrow(/aborted/);
  });
  it('validates an update candidate without changing the current source, and rejects identity replacement', async () => {
    const project = world(), firstFiles = await packWorldRepository(project);
    const current = await loadWorldSource(pinned, { fetch: fileFetch(firstFiles) });
    const before = structuredClone({ project: current.project, identity: current.identity, source: current.source });
    const nextCommit = 'b'.repeat(40);
    project.metadata.description = 'Updated';
    const candidate = await checkWorldSourceUpdate(current, { fetch: fileFetch(await packWorldRepository(project), nextCommit) });
    expect(candidate?.identity.resolvedCommit).toBe(nextCommit);
    expect(candidate?.project.metadata.description).toBe('Updated');
    expect({ project: current.project, identity: current.identity, source: current.source }).toEqual(before);
    project.metadata.worldId = 'elsemesh.world:replacement';
    await expect(checkWorldSourceUpdate(current, { fetch: fileFetch(await packWorldRepository(project), nextCommit) })).rejects.toThrow(/identity/);
    expect(await checkWorldSourceUpdate(current, { fetch: fileFetch(firstFiles) })).toBeUndefined();
  });
  it('forks to independent world and region identities retaining rights and source provenance', async () => {
    const files = await packWorldRepository(world(), { attribution: { authors: ['Alice'], license: 'CC-BY-4.0', source: 'Original creator' } });
    const loaded = await loadWorldSource(pinned, { fetch: fileFetch(files) });
    const original = structuredClone(loaded.project);
    const fork = forkWorldSource(loaded, 'My harbour');
    expect(fork.project.metadata.worldId).not.toBe(original.metadata.worldId);
    expect(fork.project.metadata.regionId).not.toBe(original.metadata.regionId);
    expect(fork.project.assets).toEqual(original.assets);
    expect(fork.project.terrain).toEqual(original.terrain);
    expect(loaded.project).toEqual(original);
    const result = await inspectWorldRepository(readFiles(await packWorldRepository(fork.project, fork.packOptions)));
    expect(result.manifest.attribution).toEqual(loaded.manifest.attribution);
    expect(result.manifest.provenance).toEqual({ sourceWorldId: original.metadata.worldId, sourceLocation: loaded.identity.location, sourceCommit: commit, sourceDigest: loaded.identity.contentDigest });
    expect(Object.keys(result.project)).not.toContain('provenance');
  });
});
