import type { Vec3, WorldAsset, EditorObject, WorldProject } from './world';
import { validateWorld, MAX_PROJECT_BYTES } from './world';
import { MAX_ASSET_BYTES } from './asset-glb';
export const CATALOGUE_SCHEMA = 'elsemesh.object-catalogue/1';
export type CatalogueAsset = {
 id: string; name: string; description: string; sourcePack: { id: string; name: string; url: string };
 categories: string[]; tags: string[]; model: string; thumbnail: string; sha256: string; thumbnailSha256: string;
 bytes: number; format: 'glb'; bounds: { min: Vec3; max: Vec3 }; dimensions: Vec3; triangleCount: number; vertexCount: number;
 license: { id: string; url: string; attribution: string }; defaultScale: Vec3; components: string[];
};
export type ObjectCatalogue = { schema: typeof CATALOGUE_SCHEMA; source: { repository: string; commit: string; license: string }; assets: CatalogueAsset[] };
const vector = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));
const label = (v: unknown, limit = 300): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= limit;
const labels = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 64 && v.every(s => label(s, 120));
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function cataloguePath(value: unknown, extension: 'glb' | 'webp', version: string): value is string {
 return typeof value === 'string' && value.startsWith('assets/catalogue/' + version + '/') &&
  /^[a-zA-Z0-9_./-]+$/.test(value) && !value.split('/').some(p => p === '..' || p === '.' || !p) && value.endsWith('.' + extension);
}
export function parseObjectCatalogue(value: unknown): ObjectCatalogue {
 if (!value || typeof value !== 'object') throw new Error('Object catalogue is missing.');
 const p = value as ObjectCatalogue;
 if (p.schema !== CATALOGUE_SCHEMA || !p.source || p.source.repository !== 'https://github.com/Hidencod/tge-assets' || !/^[a-f0-9]{40}$/.test(p.source.commit) || p.source.license !== 'CC0-1.0') throw new Error('Unsupported object catalogue version or source.');
 if (!Array.isArray(p.assets) || p.assets.length > 2500) throw new Error('Object catalogue entries exceed the supported limit.');
 const ids = new Set<string>();
 for (const entry of p.assets) {
  if (!entry || !label(entry.id, 240) || !entry.id.startsWith('kenney:') || ids.has(entry.id) || !label(entry.name, 120) || !label(entry.description, 2000)) throw new Error('Object catalogue has invalid or duplicate identities.');
  ids.add(entry.id);
  if (!entry.sourcePack || !label(entry.sourcePack.id, 120) || !label(entry.sourcePack.name, 120) || !/^https:\/\/kenney\.nl\/assets\/[a-z0-9-]+$/.test(entry.sourcePack.url) || !labels(entry.categories) || !labels(entry.tags)) throw new Error('Object catalogue pack or tags are invalid.');
  if (entry.format !== 'glb' || !cataloguePath(entry.model, 'glb', p.source.commit.slice(0, 8)) || !cataloguePath(entry.thumbnail, 'webp', p.source.commit.slice(0, 8)) || !hash(entry.sha256) || !hash(entry.thumbnailSha256)) throw new Error('Object catalogue contains an uncontrolled path or invalid content hash.');
  if (!Number.isInteger(entry.bytes) || entry.bytes < 28 || entry.bytes > MAX_ASSET_BYTES || !Number.isInteger(entry.triangleCount) || entry.triangleCount < 1 || entry.triangleCount > 500000 || !Number.isInteger(entry.vertexCount) || entry.vertexCount < 3 || entry.vertexCount > 500000) throw new Error('Object catalogue geometry or byte budget is invalid.');
  if (!entry.bounds || !vector(entry.bounds.min) || !vector(entry.bounds.max) || entry.bounds.min.some((n,i) => n > entry.bounds.max[i]!) || [...entry.bounds.min,...entry.bounds.max].some(n=>Math.abs(n)>100000) || !vector(entry.dimensions) || entry.dimensions.some((n,i)=>n<0 || Math.abs(n-(entry.bounds.max[i]!-entry.bounds.min[i]!))>.001) || !vector(entry.defaultScale) || entry.defaultScale.some(n=>n<=0||n>1000)) throw new Error('Object catalogue bounds or scale are invalid.');
  if (!entry.license || entry.license.id !== 'CC0-1.0' || entry.license.url !== 'https://creativecommons.org/publicdomain/zero/1.0/' || !label(entry.license.attribution,2000) || !labels(entry.components) || entry.components.length !== 2 || !entry.components.includes('Transform') || !entry.components.includes('Renderable')) throw new Error('Object catalogue licence or component declaration is invalid.');
 }
 return p;
}
export function filterCatalogue(entries: CatalogueAsset[], query: string, pack: string, category: string) {
 const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return entries.filter(entry => (pack === 'All' || entry.sourcePack.id === pack) && (category === 'All' || entry.categories.includes(category)) &&
  words.every(word => [entry.name,entry.description,entry.sourcePack.name,...entry.tags,...entry.categories].join(' ').toLowerCase().includes(word)));
}
/** Keep models upright and align the transformed bottom centre with the triangle hit. */
export function surfacePlacement(asset: WorldAsset, point: Vec3, yaw: number, scale: Vec3 = [1,1,1]): { position: Vec3; rotation: Vec3; scale: Vec3 } {
 if (!asset.bounds || !vector(point) || !Number.isFinite(yaw) || !vector(scale) || scale.some(n=>n<=0||n>1000)) throw new Error('Invalid placement surface or model bounds.');
 const x=(asset.bounds.min[0]+asset.bounds.max[0])/2*scale[0], z=(asset.bounds.min[2]+asset.bounds.max[2])/2*scale[2];
 return { position: [point[0]-Math.cos(yaw)*x-Math.sin(yaw)*z,point[1]-asset.bounds.min[1]*scale[1],point[2]+Math.sin(yaw)*x-Math.cos(yaw)*z],rotation:[0,yaw,0],scale };
}
export function commitCataloguePlacement(project: WorldProject, candidate: WorldAsset, object: EditorObject): WorldProject {
 const existing=project.assets.find(asset=>asset.dataUrl===candidate.dataUrl),asset=existing??candidate;
 const next={...project,assets:existing?project.assets:[...project.assets,asset],objects:[...project.objects,{...object,assetId:asset.id}]};
 if(next.assets.reduce((sum,a)=>sum+a.bytes,0)>15*1024*1024 || new TextEncoder().encode(JSON.stringify(next)).byteLength>MAX_PROJECT_BYTES) throw new Error('Placement exceeds the world asset or project byte budget.');
 const result=validateWorld(next);if(!result.valid)throw new Error(result.errors[0]??'Placement is invalid.');
 return next;
}
export async function fetchCatalogueModel(entry: CatalogueAsset, signal?: AbortSignal): Promise<ArrayBuffer> {
 const response=await fetch(new URL(entry.model,document.baseURI),{signal});
 if(!response.ok)throw new Error('Model download failed ('+response.status+').');
 const declared=response.headers.get('content-length');if(declared && Number(declared)>MAX_ASSET_BYTES)throw new Error('Model download exceeds the size limit.');
 const bytes=await response.arrayBuffer();if(bytes.byteLength!==entry.bytes)throw new Error('Model byte count does not match the catalogue.');
 const digest=await crypto.subtle.digest('SHA-256',bytes),actual=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(actual!==entry.sha256)throw new Error('Model content hash does not match the catalogue.');
 return bytes;
}
