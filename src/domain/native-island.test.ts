import {describe,it,expect} from 'vitest';
import {createWorld,createPlayerWorldPackage,validateWorld,validatePlayerWorldPackage} from './world';
import {createNativeIslandResourceReader,validateNativeIsland,NATIVE_ISLAND_SPECIES,type NativeIsland,type NativeIslandResource,type NativeVegetation} from './native-island';
import {packWorldRepository,repositoryDigest,unpackWorldRepository,requiredWorldCapabilities} from './world-repository';
import {forkWorldSource,loadWorldSource} from './world-source';
async function fixture(){
 const blobs=new Map<string,Uint8Array>(),resources:NativeIslandResource[]=[];
 async function ref(channel:NativeIslandResource['channel'],level:number,x:number,z:number,format:NativeIslandResource['format'],channels:number,width=128,height=128,payload?:Uint8Array){
  const data=payload??new Uint8Array(width*height*channels*(format==='f32le'?4:1)),sha256=await repositoryDigest(data),path='native-island/'+sha256+'.bin';
  blobs.set(path,data);resources.push({id:channel+'-'+level+'-'+x+'-'+z,channel,level,x,z,width,height,format,channels,path,sha256,bytes:data.length,min:0,max:payload?1:0});
 }
 for(const channel of ['height','normal','splat','rock','sand','path','gully','seagrass','rubble','scarp','grass','shore'] as const){
  const level=channel==='grass'?1:channel==='shore'?2:0,side=2048/2**level,channels=['normal','splat','grass','shore'].includes(channel)?4:1,format=['normal','splat','grass'].includes(channel)?'u8':'f32le';
  for(let z=0;z<side;z+=128)for(let x=0;x<side;x+=128)await ref(channel,level,x,z,format,channels);
 }
 for(const channel of ['height','normal','splat'] as const)await ref(channel,4,0,0,channel==='height'?'f32le':'u8',channel==='height'?1:4);
 const records=Object.fromEntries(NATIVE_ISLAND_SPECIES.map(s=>[s,s==='palms'?[{x:0,y:0,z:0,s:1,yaw:0,seed:.123456789012345}]:[]])) as NativeVegetation['records'];
 const vegetation:NativeVegetation={records,lod:{palmNear:120,treeNear:65,shrubNear:45,underFade:[120,140],fernFade:[42,58],broadFade:[85,105],bananaFade:[100,120],canopyFar:[2600,2800],band:.12},seeds:{terrain:7,site:1234,scatter:99},villagePalms:1};
 await ref('vegetation',0,0,0,'vegetation-json',1,1,1,new TextEncoder().encode(JSON.stringify(vegetation)));
 // Minimal bounded JPEG SOF descriptor, used to exercise header validation only.
 const jpeg=new Uint8Array([255,216,255,192,0,8,8,0,1,0,1,1]),hash=await repositoryDigest(jpeg),path='native-island/'+hash+'.bin';blobs.set(path,jpeg);
 const assets=['palm-a','palm-n','palm-o','tree-a','tree-n','tree-o'].map(id=>({id,path,sha256:hash,bytes:jpeg.length,mediaType:'image/jpeg' as const,license:'fixture',width:1,height:1}));
 const spectrum={scale:1,windSpeed:8,windDirection:20,fetch:200,spreadBlend:.9,swell:.2,peakEnhancement:3.3,shortWavesFade:.01};
 const native:NativeIsland={schema:'elsemesh.native-island/1',source:{id:'original-island',version:'fixture-1'},grid:{resolution:2048,size:2048,origin:[-1024,-1024],sampleConvention:'cell-centred',tileSize:128,halo:0},resources,assets,arrival:{level:4,cells:resources.filter(r=>r.level===4).map(r=>r.id)},species:[...NATIVE_ISLAND_SPECIES],vegetationRecipe:'elsemesh.native-vegetation/1',vegetationTextures:{palm:{albedo:'palm-a',normal:'palm-n',orm:'palm-o'},tree:{albedo:'tree-a',normal:'tree-n',orm:'tree-o'}},sea:{level:0,fft:{cascades:4,sizes:[733,157,33.3,7.1],depth:500,local:spectrum,swell:spectrum,choppiness:1,foamBias:0,foamGain:1,foamDecay:1,foamAdd:1,seed:1,timeScale:1},shore:{period:9,amplitude:.34,variation:.55,gamma:.78,breakSpan:.13,curl:1,runup:1,enabled:1,turbidity:.16},sim:{center:[10,-25],size:380,res:768,dryTime:1,foamLife:1,surfFoamLife:1,residueLife:1,foamGen:1,depositGain:1},surface:{amplitude:1,slopeScale:1,foamCoverage:1,foamSharpness:2.2,foamScale:.09,foamWeights:[.35,.45,.5,.25]},appearance:{swellDir:{x:1,y:0},reef:{center:{x:0,z:0},radius:100}}}};
 return {project:{...createWorld(),nativeIsland:native},native,blobs,vegetation};
}
describe('portable native island contract',()=>{
 it('validates original complete cells and rejects sparse, malformed, traversal and unknown recipes',async()=>{
  const {native}=await fixture();expect(validateNativeIsland(native)).toEqual([]);
  for(const next of [{...native,schema:'elsemesh.native-island/9'},{...native,script:'bad'},{...native,vegetationRecipe:'arbitrary.js'},{...native,resources:native.resources.slice(1)},{...native,grid:{...native.grid,origin:[0,0]}},{...native,resources:[{...native.resources[0]!,path:'../secret'},...native.resources.slice(1)]},{...native,resources:[{...native.resources[0]!,bytes:1},...native.resources.slice(1)]}])expect(validateNativeIsland(next).length).toBeGreaterThan(0);
  expect(validateWorld({...createWorld(),nativeIsland:undefined}).valid).toBe(false);
 });
 it('reads no full data until a selected resource is requested and checks hashes/extrema',async()=>{
  const {project,native,blobs,vegetation}=await fixture();let reads=0;
  const reader=createNativeIslandResourceReader(project,async path=>{reads++;return blobs.get(path)!;});expect(reads).toBe(0);
  const selected=native.arrival.cells[0]!,result=await reader(selected);expect(reads).toBe(1);expect(result.data).toBeInstanceOf(Float32Array);
  expect((await reader('vegetation-0-0-0')).data).toEqual(vegetation);
  await expect(createNativeIslandResourceReader(project,async path=>{const bytes=Uint8Array.from(blobs.get(path)!);bytes[0]=1;return bytes;})(selected)).rejects.toThrow(/hash/);
  const bad={...project,nativeIsland:{...native,resources:native.resources.map(r=>r.id===selected?{...r,min:1,max:1}:r)}};
  await expect(createNativeIslandResourceReader(bad,async path=>blobs.get(path)!)(selected)).rejects.toThrow(/extrema/);
 });
 it('roundtrips byte exact closure, opens lazily, forks portably and rejects standalone export',async()=>{
  const {project,blobs}=await fixture();const files=await packWorldRepository(project,{nativeIslandRead:async path=>blobs.get(path)!});
  for(const [path,bytes] of blobs)expect(files.get(path)).toEqual(bytes);
  let binaryReads=0;const read=async(path:string)=>{if(path.startsWith('native-island/'))binaryReads++;return files.get(path)!;};
  const loaded=await loadWorldSource({kind:'local',read,label:'fixture'});expect(binaryReads).toBe(0);expect(loaded.project).toEqual(project);
  expect(requiredWorldCapabilities(project)).toContain('native-island/1');
  const fork=forkWorldSource(loaded);expect(fork.project.nativeIsland).toEqual(project.nativeIsland);expect(fork.project.metadata.worldId).not.toBe(project.metadata.worldId);
  const copied=await packWorldRepository(fork.project,fork.packOptions);for(const [path,bytes] of blobs)expect(copied.get(path)).toEqual(bytes);
  expect(()=>createPlayerWorldPackage(project)).toThrow(/Save repository/);
  const packageFile={...createPlayerWorldPackage(createWorld()),project};expect(validatePlayerWorldPackage(packageFile).valid).toBe(false);
  const manifest=JSON.parse(new TextDecoder().decode(files.get('world.json')!));manifest.engine.requires=manifest.engine.requires.filter((v:string)=>v!=='native-island/1');files.set('world.json',new TextEncoder().encode(JSON.stringify(manifest)));
  await expect(unpackWorldRepository(async path=>files.get(path)!)).rejects.toThrow(/capability/);
 },30000);
});

it('water surface exclusions roundtrip with mandatory fail-closed capability',async()=>{
 const {project,blobs}=await fixture();project.nativeIsland!.sea.surfaceExclusions=[{id:'warehouse:surface:interior-01',min:[-14.5,3.1,-90.5],max:[14.5,8.5,-63.5]}];expect(validateNativeIsland(project.nativeIsland)).toEqual([]);expect(requiredWorldCapabilities(project)).toContain('water-exclusion/1');
 const files=await packWorldRepository(project,{nativeIslandRead:async path=>blobs.get(path)!}),read=async(path:string)=>files.get(path)!;
 const loaded=await loadWorldSource({kind:'local',read,label:'surface-exclusions'});expect(loaded.project.nativeIsland?.sea.surfaceExclusions).toEqual(project.nativeIsland!.sea.surfaceExclusions);
 const manifest=JSON.parse(new TextDecoder().decode(files.get('world.json')!));manifest.engine.requires=manifest.engine.requires.filter((v:string)=>v!=='water-exclusion/1');files.set('world.json',new TextEncoder().encode(JSON.stringify(manifest)));await expect(unpackWorldRepository(read)).rejects.toThrow(/capability/);
},30000);
