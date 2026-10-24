import type { WorldProject, Vec3 } from './world';
import type { RepositoryReader } from './world-repository';
export const SPLAT_SCENE_SCHEMA='elsemesh.splat-scene/1' as const;
export const SPLAT_SCENE_CAPABILITY='splat-scene/1' as const;
export const MAX_SPLAT_SCENE_BYTES=16*1024*1024;
export const MAX_SPLAT_PHYSICS_BYTES=8*1024*1024;
export const MAX_SPLAT_COUNT=1_000_000;
export type SplatSceneReference={path:string;sha256:string;bytes:number};
export type SplatScene={schema:typeof SPLAT_SCENE_SCHEMA;asset:SplatSceneReference&{count:number};physics:SplatSceneReference;transform:{position:Vec3;rotation:Vec3;scale:number};scaleStatus:'assumed-gameplay';provenance:{videoSha256:string;plySha256:string;reviewSha256:string;qualificationSha256:string}};
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).length===allowed.length&&Object.keys(v).every(k=>allowed.includes(k))&&allowed.every(k=>Object.hasOwn(v,k));
const number=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v:unknown,min:number,max:number)=>number(v,min,max)&&Number.isSafeInteger(v);
const vec=(v:unknown,max:number)=>Array.isArray(v)&&v.length===3&&v.every(n=>number(n,-max,max));
export const isSplatSceneResourcePath=(path:unknown):path is string=>typeof path==='string'&&/^splat-scenes\/[a-f0-9]{64}\.(sog|json)$/.test(path);
function reference(v:unknown,extension:'sog'|'json',maximum:number,asset=false):boolean{return record(v)&&keys(v,asset?['path','sha256','bytes','count']:['path','sha256','bytes'])&&hash(v.sha256)&&v.path===`splat-scenes/${v.sha256}.${extension}`&&integer(v.bytes,1,maximum)&&(!asset||integer(v.count,1,MAX_SPLAT_COUNT));}
/** Strict descriptor only. The SOG decoder must additionally verify its decoded count against asset.count. */
export function validateSplatScene(value:unknown):string[]{
 if(value===undefined)return [];
 if(!record(value)||!keys(value,['schema','asset','physics','transform','scaleStatus','provenance'])||value.schema!==SPLAT_SCENE_SCHEMA)return ['Invalid splat scene schema or fields.'];
 if(!reference(value.asset,'sog',MAX_SPLAT_SCENE_BYTES,true)||!reference(value.physics,'json',MAX_SPLAT_PHYSICS_BYTES))return ['Invalid splat scene resource path, hash, byte size or count.'];
 const t=value.transform;if(!record(t)||!keys(t,['position','rotation','scale'])||!vec(t.position,2000)||!vec(t.rotation,Math.PI*2)||!number(t.scale,.000001,1000)||value.scaleStatus!=='assumed-gameplay')return ['Invalid bounded splat scene transform or scale status.'];
 const p=value.provenance;if(!record(p)||!keys(p,['videoSha256','plySha256','reviewSha256','qualificationSha256'])||!Object.values(p).every(hash))return ['Invalid splat scene provenance hashes.'];
 return [];
}
async function digest(bytes:Uint8Array){const value=await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes));return Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,'0')).join('');}
/** Capability scoped to the admitted descriptor. Never constructs a URL or falls back to public fetch. */
export function createSplatSceneResourceReader(project:Pick<WorldProject,'splatScene'>,sourceRead:RepositoryReader|undefined){
 const errors=validateSplatScene(project.splatScene);if(errors.length||!project.splatScene)throw Error(errors[0]??'World has no splat scene.');
 const scene=structuredClone(project.splatScene),refs=new Map<string,SplatSceneReference>([scene.asset,scene.physics].map(r=>[r.path,r]));
 const read:RepositoryReader=async(path,maxBytes)=>{
  const ref=refs.get(path);if(!ref||!isSplatSceneResourcePath(path))throw Error('Splat scene resource path is not admitted.');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<ref.bytes)throw Error('Splat scene resource exceeds caller byte limit.');
  if(!sourceRead)throw Error('Private splat scene source unavailable. Reopen its authorized world repository.');
  const supplied=await sourceRead(ref.path,ref.bytes);if(!(supplied instanceof Uint8Array)||supplied.byteLength!==ref.bytes)throw Error('Splat scene resource hash or size mismatch.');
  const bytes=Uint8Array.from(supplied);if(await digest(bytes)!==ref.sha256)throw Error('Splat scene resource hash or size mismatch.');
  return bytes;
 };
 return {read,readSog:()=>read(scene.asset.path,scene.asset.bytes),readPhysicsBytes:()=>read(scene.physics.path,scene.physics.bytes)};
}
export function assertSplatSceneStandaloneExport(project:Pick<WorldProject,'splatScene'>){if(project.splatScene)throw Error('Splat scene resources require Save repository snapshot or Save repository copy with its authorized resource reader.');}
