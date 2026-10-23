import { inspectWorldRepository, WORLD_REPOSITORY_MANIFEST, type RepositoryReader, type WorldPackOptions, type WorldRepositoryManifest } from './world-repository';
import { validateWorld, type WorldProject } from './world';

export type GitHubWorldLocation = { owner: string; repository: string; path: string; ref?: string };
export type PinnedGitHubSource = GitHubWorldLocation & { kind: 'github'; commit: string };
export type LocalWorldSource = { kind: 'local'; read: RepositoryReader; label?: string };
export type WorldSource = LocalWorldSource | PinnedGitHubSource;
export type WorldSourceIdentity = { worldId: string; location: string; resolvedCommit?: string; contentDigest: string; sessionId: string };
export type LoadedWorldSource = { project: WorldProject; manifest: WorldRepositoryManifest; identity: WorldSourceIdentity; source: WorldSource };
export type SourceRequestOptions = { fetch?: typeof fetch; timeoutMs?: number };
const commitPattern = /^[a-f0-9]{40}$/;
const segmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function validateLocation(location: GitHubWorldLocation): GitHubWorldLocation {
  if (!segmentPattern.test(location.owner) || location.owner.length > 100 || !segmentPattern.test(location.repository) || location.repository.length > 100 || location.repository.endsWith('.git')) throw new Error('Use a public GitHub owner and repository name.');
  if (typeof location.path !== 'string' || location.path.length > 500 || (location.path !== '' && location.path.split('/').some(segment => !segmentPattern.test(segment) || segment === '.' || segment === '..'))) throw new Error('World directory must contain safe relative path segments.');
  if (location.ref !== undefined && (typeof location.ref !== 'string' || !location.ref || location.ref.length > 200 || /[\\\s~^:?*[\]@%#]/.test(location.ref) || location.ref.includes('..') || location.ref.startsWith('/') || location.ref.endsWith('/') || location.ref.includes('//'))) throw new Error('Invalid GitHub branch, tag, or commit reference.');
  return { owner: location.owner, repository: location.repository, path: location.path, ...(location.ref ? { ref: location.ref } : {}) };
}

/** Accept a GitHub repository or tree URL. Branch names containing slashes must be supplied as an explicit ref. */
export function parseGitHubWorldLocation(input: string): GitHubWorldLocation {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('Enter an HTTPS GitHub repository or tree URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || /%|\\/.test(input) || /\/\.(?:\.|\/)/.test(input)) throw new Error('Only credential-free HTTPS github.com repository URLs are supported.');
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
  if (parts.length < 2 || (parts.length > 2 && (parts[2] !== 'tree' || parts.length < 4))) throw new Error('Use a GitHub repository or tree URL.');
  return validateLocation({ owner: parts[0]!, repository: parts[1]!, path: parts.slice(4).join('/'), ...(parts[3] ? { ref: parts[3] } : {}) });
}

function requestTimeout(options: SourceRequestOptions): number {
  const timeout = options.timeoutMs ?? 15000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) throw new Error('Source timeout must be between 1 and 30000 ms.');
  return timeout;
}

/** Read incrementally: neither content-length nor an unbounded response body is trusted. */
async function boundedFetch(url: string, maxBytes: number, options: SourceRequestOptions, accept: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeout(options));
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await (options.fetch ?? fetch)(url, { signal: controller.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: accept } });
    if (!response.ok || response.redirected || (response.url && response.url !== url)) throw new Error(`World source request failed (${response.status}); redirects are not permitted.`);
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new Error('World source response exceeds its byte limit.');
    if (!response.body) throw new Error('World source response has no readable body.');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) throw new Error('World source response exceeds its byte limit.');
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    clearTimeout(timeout);
    if (reader) { try { await reader.cancel(); } catch { /* Aborted streams may already be closed. */ } reader.releaseLock(); }
  }
}

/** Resolve a moving ref once. All subsequent content requests use the returned full commit. */
export async function resolveGitHubWorldSource(input: GitHubWorldLocation, options: SourceRequestOptions = {}): Promise<PinnedGitHubSource> {
  const location = validateLocation(input);
  const ref = location.ref ?? 'HEAD';
  if (commitPattern.test(ref)) return { ...location, kind: 'github', commit: ref };
  const url = `https://api.github.com/repos/${location.owner}/${location.repository}/commits/${encodeURIComponent(ref)}`;
  const bytes = await boundedFetch(url, 256 * 1024, options, 'application/vnd.github+json');
  const response: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!response || typeof response !== 'object' || !('sha' in response) || typeof response.sha !== 'string' || !commitPattern.test(response.sha)) throw new Error('GitHub did not resolve the reference to a full commit.');
  return { ...location, kind: 'github', commit: response.sha };
}

export function githubWorldSourceLocation(source: GitHubWorldLocation): string {
  const location = validateLocation(source);
  return `https://github.com/${location.owner}/${location.repository}${location.path ? '/' + location.path : ''}`;
}

/** Shared validated loader for local folders and public commit-pinned GitHub content. */
export async function loadWorldSource(source: WorldSource, options: SourceRequestOptions = {}): Promise<LoadedWorldSource> {
  let read: RepositoryReader;
  let location: string;
  let resolvedCommit: string | undefined;
  if (source.kind === 'local') {
    read = source.read;
    location = `local:${source.label ?? 'folder'}`;
  } else {
    const validated = validateLocation(source);
    if (!commitPattern.test(source.commit)) throw new Error('World content must be pinned to a full Git commit.');
    const prefix = `https://raw.githubusercontent.com/${validated.owner}/${validated.repository}/${source.commit}/${validated.path ? validated.path + '/' : ''}`;
    read = (path, limit) => {
      if (path !== WORLD_REPOSITORY_MANIFEST && !/^(snapshots\/[a-f0-9]{64}\/(metadata|terrain|objects|features|environment|spawn|geography|assets|connections|landscape)\.json|assets\/[a-f0-9]{64}\.glb|landscape-images\/[a-f0-9]{64}\.(png|jpg)|imagery\/[a-f0-9]{64}\.(png|jpg))$/.test(path)) throw new Error('World content path is not allowed.');
      return boundedFetch(prefix + path, limit, options, 'application/octet-stream');
    };
    location = githubWorldSourceLocation(source);
    resolvedCommit = source.commit;
  }
  const loaded = await inspectWorldRepository(read);
  return { ...loaded, source, identity: { worldId: loaded.project.metadata.worldId, location, ...(resolvedCommit ? { resolvedCommit } : {}), contentDigest: loaded.contentDigest, sessionId: crypto.randomUUID() } };
}

/** An update is a separately validated candidate; this function never alters an existing source or scene. */
export async function checkWorldSourceUpdate(current: LoadedWorldSource, options: SourceRequestOptions = {}): Promise<LoadedWorldSource | undefined> {
  if (current.source.kind !== 'github') throw new Error('Only GitHub sources have remote updates.');
  const candidateSource = await resolveGitHubWorldSource(current.source, options);
  if (candidateSource.commit === current.source.commit) return undefined;
  const candidate = await loadWorldSource(candidateSource, options);
  if (candidate.identity.worldId !== current.identity.worldId) throw new Error('Updated repository changes world identity; open it as another world.');
  return candidate;
}

/** Clone authored content and retain source/asset rights without adding unknown project fields. */
export function forkWorldSource(loaded: LoadedWorldSource, name = `${loaded.project.metadata.name} (fork)`): { project: WorldProject; packOptions: WorldPackOptions } {
  const project = structuredClone(loaded.project);
  project.metadata = { ...project.metadata, name, worldId: `elsemesh.world:${crypto.randomUUID()}`, regionId: `elsemesh.region:${crypto.randomUUID()}` };
  const validation = validateWorld(project);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  const packOptions: WorldPackOptions = { attribution: structuredClone(loaded.manifest.attribution ?? { authors: [] }), provenance: { sourceWorldId: loaded.identity.worldId, sourceLocation: loaded.identity.location, ...(loaded.identity.resolvedCommit ? { sourceCommit: loaded.identity.resolvedCommit } : {}), sourceDigest: loaded.identity.contentDigest } };
  return { project, packOptions };
}
