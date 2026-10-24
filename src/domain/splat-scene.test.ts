import {describe,it,expect} from 'vitest';
import {createWorld,validateWorld,createPlayerWorldPackage,validatePlayerWorldPackage} from './world';
import {packWorldRepository,repositoryDigest,requiredWorldCapabilities,unpackWorldRepository} from './world-repository';
import {loadWorldSource,forkWorldSource,sameOriginWorldSource} from './world-source';
import {validateSplatScene,createSplatSceneResourceReader,MAX_SPLAT_SCENE_BYTES,MAX_SPLAT_PHYSICS_BYTES,MAX_SPLAT_COUNT,type SplatScene} from './splat-scene';
const encoder=new TextEncoder(),hash='a'.repeat(64);
async function fixture(){
 const sog=new Uint8Array([80,75,3,4,1,2,3,4]),physics=encoder.encode('{"fixture":"opaque; physics admission is external"}');
 const assetHash=await repositoryDigest(sog),physicsHash=await repositoryDigest(physics);
 const scene:SplatScene={schema:'elsemesh.splat-scene/1',asset:{path:`splat-scenes/${assetHash}.sog`,sha256:assetHash,bytes:sog.length,count:12},physics:{path:`splat-scenes/${physicsHash}.json`,sha256:physicsHash,bytes:physics.length},transform:{position:[0,0,0],rotation:[-Math.PI/2,0,0],scale:.25},scaleStatus:'assumed-gameplay',provenance:{videoSha256:hash,plySha256:hash,reviewSha256:hash,qualificationSha256:hash}};
 const project={...createWorld('Private splat test'),splatScene:scene};const blobs=new Map([[scene.asset.path,sog],[scene.physics.path,physics]]);
 const read=async(path:string,limit:number)=>{const bytes=blobs.get(path);if(!bytes||bytes.length>limit)throw Error('denied/missing/bounded');return bytes;};return {project,scene,blobs,read,sog,physics};
}
describe('private content-addressed splat scene',()=>{
 it('roundtrips the exact signed connections descriptor and lazy bounded resource closure',async()=>{
  const f=await fixture();expect(validateWorld(f.project).valid).toBe(true);expect(requiredWorldCapabilities(f.project)).toContain('splat-scene/1');const files=await packWorldRepository(f.project,{splatSceneRead:f.read});let resources=0;
  const loaded=await loadWorldSource({kind:'local',read:async(path,limit)=>{if(path.startsWith('splat-scenes/'))resources++;const bytes=files.get(path);if(!bytes||bytes.length>limit)throw Error('bounded');return bytes;}});
  expect(resources).toBe(0);expect(loaded.project.splatScene).toEqual(f.scene);expect(await loaded.splatSceneRead!(f.scene.asset.path,f.sog.length)).toEqual(f.sog);expect(resources).toBe(1);
  const manifest=JSON.parse(new TextDecoder().decode(files.get('world.json')));expect(manifest.version).toBe(3);const connections=JSON.parse(new TextDecoder().decode(files.get(manifest.components.connections.path)));expect(connections.splatScene).toEqual(f.scene);
  const fork=forkWorldSource(loaded);expect(await packWorldRepository(fork.project,fork.packOptions)).toContainEqual([f.scene.asset.path,f.sog]);
  const revised=structuredClone(f.project);revised.splatScene.provenance.reviewSha256='b'.repeat(64);const changed=await packWorldRepository(revised,{splatSceneRead:f.read});expect(changed.get('world.json')).not.toEqual(files.get('world.json'));
 });
 it('requires the mandatory capability and does not admit resource-less standalone exports',async()=>{
  const f=await fixture(),files=await packWorldRepository(f.project,{splatSceneRead:f.read}),manifest=JSON.parse(new TextDecoder().decode(files.get('world.json')));manifest.engine.requires=manifest.engine.requires.filter((c:string)=>c!=='splat-scene/1');files.set('world.json',encoder.encode(JSON.stringify(manifest)));await expect(unpackWorldRepository(async path=>files.get(path)!)).rejects.toThrow(/capability/);
  expect(()=>createPlayerWorldPackage(f.project)).toThrow(/Save repository/);expect(validatePlayerWorldPackage({...createPlayerWorldPackage(createWorld()),project:f.project}).valid).toBe(false);
 });
 it('rejects unknown fields at each descriptor level, bounded transforms and malformed provenance',async()=>{
  const {scene,project}=await fixture();expect(validateSplatScene(scene)).toEqual([]);
  const invalid=[{...scene,script:'no'},{...scene,asset:{...scene.asset,url:'https://example.invalid/a.sog'}},{...scene,physics:{...scene.physics,count:1}},{...scene,transform:{...scene.transform,extra:0}},{...scene,provenance:{...scene.provenance,extra:hash}},{...scene,scaleStatus:'metric'},{...scene,transform:{...scene.transform,scale:0}},{...scene,transform:{...scene.transform,position:[Infinity,0,0]}},{...scene,transform:{...scene.transform,rotation:[0,100,0]}},{...scene,provenance:{...scene.provenance,plySha256:'not-hash'}}];
  for(const value of invalid)expect(validateSplatScene(value).length).toBeGreaterThan(0);expect(validateWorld({...project,splatScene:undefined}).valid).toBe(false);
 });
 it('rejects resource traversal, external URLs, hash/path mismatch, byte/count overflows before reading',async()=>{
  const {scene}=await fixture();for(const path of ['../a.sog','https://example.invalid/a.sog','splat-scenes/'+hash+'.SOG','splat-scenes/'+hash+'/../x.sog','splat-scenes/'+hash+'.json'])expect(validateSplatScene({...scene,asset:{...scene.asset,path}}).length).toBeGreaterThan(0);
  for(const value of [{...scene,asset:{...scene.asset,bytes:MAX_SPLAT_SCENE_BYTES+1}},{...scene,physics:{...scene.physics,bytes:MAX_SPLAT_PHYSICS_BYTES+1}},{...scene,asset:{...scene.asset,count:MAX_SPLAT_COUNT+1}},{...scene,asset:{...scene.asset,count:1.1}},{...scene,asset:{...scene.asset,sha256:hash}}])expect(validateSplatScene(value).length).toBeGreaterThan(0);
 });
 it('copies verified bytes, pins the descriptor, and denies every non-admitted purpose/path',async()=>{
  const f=await fixture(),reader=createSplatSceneResourceReader(f.project,f.read);f.project.splatScene.asset.path='../secret';expect(await reader.readSog()).toEqual(f.sog);const bytes=await reader.readSog();bytes[0]=0;expect(f.sog[0]).toBe(80);expect(await reader.readPhysicsBytes()).toEqual(f.physics);
  await expect(reader.read('world.json',1000)).rejects.toThrow(/not admitted/);await expect(reader.read('splat-scenes/'+hash+'.sog',1000)).rejects.toThrow(/not admitted/);await expect(reader.read(f.scene.physics.path,1)).rejects.toThrow(/byte limit/);
 });
 it('fails closed on denial, missing capability, hash mismatch and reader length violations',async()=>{
  const f=await fixture();await expect(packWorldRepository(f.project)).rejects.toThrow(/source unavailable/);
  await expect(createSplatSceneResourceReader(f.project,async()=>{throw Error('VIEW denied');}).readSog()).rejects.toThrow(/VIEW denied/);await expect(createSplatSceneResourceReader(f.project,undefined).readSog()).rejects.toThrow(/source unavailable/);
  for(const bytes of [new Uint8Array(f.sog.length),new Uint8Array(f.sog.length+1)])await expect(createSplatSceneResourceReader(f.project,async()=>bytes).readSog()).rejects.toThrow(/hash or size/);
 });
 it('keeps same-origin and pinned GitHub redirects fail-closed while admitting only exact hash paths',async()=>{
  const f=await fixture(),files=await packWorldRepository(f.project,{splatSceneRead:f.read});const calls:string[]=[];const fetcher=(async(input:string|URL|Request)=>{const url=String(input);calls.push(url);const path=url.split('/content/')[1]??url.split('/'+'1'.repeat(40)+'/')[1];return new Response(files.has(path!)?Uint8Array.from(files.get(path!)!).buffer:null,{status:files.has(path!)?200:404});}) as typeof fetch;
  const local=sameOriginWorldSource('/content/',{origin:'https://private.invalid',fetch:fetcher});const a=await loadWorldSource(local);expect(await a.splatSceneRead!(f.scene.asset.path,f.sog.length)).toEqual(f.sog);
  const b=await loadWorldSource({kind:'github',owner:'fixture',repository:'private-assets',path:'',commit:'1'.repeat(40)},{fetch:fetcher});expect(await b.splatSceneRead!(f.scene.physics.path,f.physics.length)).toEqual(f.physics);expect(calls.some(url=>url.endsWith('.sog'))).toBe(true);
  const redirected=(async()=>{const response=new Response(new Uint8Array());Object.defineProperty(response,'redirected',{value:true});return response;}) as typeof fetch;await expect(loadWorldSource(sameOriginWorldSource('/content/',{origin:'https://private.invalid',fetch:redirected}))).rejects.toThrow();
  expect(()=>local.read('splat-scenes/'+hash+'.sog/../world.json',100)).toThrow(/path/);
 });
});
