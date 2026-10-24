import type { WorldProject } from './world';
import type { RepositoryReader } from './world-repository';
export const NATIVE_ISLAND_SCHEMA='elsemesh.native-island/1' as const;
export const MAX_NATIVE_ISLAND_BYTES=256*1024*1024;
export const NATIVE_ISLAND_SPECIES=['palms','trees','bananas','shrubs','youngPalms','ferns','monsteras','elephantEars','heliconias','strelitzias'] as const;
export type NativeSpecies=typeof NATIVE_ISLAND_SPECIES[number];
export type NativeVegetationRecord={x:number;y:number;z:number;s:number;sy?:number;yaw:number;la?:number;l?:number;H?:number;seed:number};
export type NativeVegetation={records:Record<NativeSpecies,NativeVegetationRecord[]>;lod:{palmNear:number;treeNear:number;shrubNear:number;underFade:[number,number];fernFade:[number,number];broadFade:[number,number];bananaFade:[number,number];canopyFar:[number,number];band:number};seeds:{terrain:number;site:number;scatter:number};villagePalms:number};
export type NativeOceanSpectrum={scale:number;windSpeed:number;windDirection:number;fetch:number;spreadBlend:number;swell:number;peakEnhancement:number;shortWavesFade:number};
export type NativeIslandSea={level:number;fft:{cascades:number;sizes:number[];depth:number;local:NativeOceanSpectrum;swell:NativeOceanSpectrum;choppiness:number;foamBias:number;foamGain:number;foamDecay:number;foamAdd:number;seed:number;timeScale:number};shore:{period:number;amplitude:number;variation:number;gamma:number;breakSpan:number;curl:number;runup:number;enabled:number;turbidity:number};sim:{center:[number,number];size:number;res:number;dryTime:number;foamLife:number;surfFoamLife:number;residueLife:number;foamGen:number;depositGain:number};surface:{amplitude:number;slopeScale:number;foamCoverage:number;foamSharpness:number;foamScale:number;foamWeights:number[]};appearance:{swellDir:{x:number;y:number};reef:{center:{x:number;z:number};radius:number}}};
export type NativeIslandChannel='height'|'normal'|'splat'|'rock'|'sand'|'path'|'gully'|'seagrass'|'rubble'|'scarp'|'grass'|'shore'|'vegetation';
export type NativeIslandResource={id:string;channel:NativeIslandChannel;level:number;x:number;z:number;width:number;height:number;format:'f32le'|'u8'|'vegetation-json';channels:number;path:string;sha256:string;bytes:number;min:number;max:number};
export type NativeIslandAsset={id:string;path:string;sha256:string;bytes:number;mediaType:'image/jpeg'|'text/plain';license:string;width:number;height:number};
export type NativeIsland={schema:typeof NATIVE_ISLAND_SCHEMA;source:{id:string;version:string};grid:{resolution:2048;size:2048;origin:[-1024,-1024];sampleConvention:'cell-centred';tileSize:128;halo:0};resources:NativeIslandResource[];assets:NativeIslandAsset[];arrival:{level:number;cells:string[]};species:NativeSpecies[];vegetationRecipe:'elsemesh.native-vegetation/1';vegetationTextures:{palm:{albedo:string;normal:string;orm:string};tree:{albedo:string;normal:string;orm:string}};sea:NativeIslandSea};
export type NativeIslandDecoded={ref:NativeIslandResource|NativeIslandAsset;data:Float32Array|Uint8Array|NativeVegetation};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k))&&allowed.every(k=>Object.hasOwn(v,k));
const number=(v:unknown,min=-1e7,max=1e7):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v:unknown,min:number,max:number)=>number(v,min,max)&&Number.isInteger(v);
const pair=(v:unknown)=>Array.isArray(v)&&v.length===2&&v.every(n=>number(n));
const safeId=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v);
const channels=['height','normal','splat','rock','sand','path','gully','seagrass','rubble','scarp','grass','shore','vegetation'];
function spectrum(v:unknown){return record(v)&&keys(v,['scale','windSpeed','windDirection','fetch','spreadBlend','swell','peakEnhancement','shortWavesFade'])&&Object.values(v).every(n=>number(n))&&number(v.scale,0)&&number(v.windSpeed,0)&&number(v.fetch,Number.EPSILON)&&number(v.spreadBlend,0,1)&&number(v.swell,0,1)&&number(v.peakEnhancement,Number.EPSILON)&&number(v.shortWavesFade,0);}
function validSea(v:unknown):boolean{
 if(!record(v)||!keys(v,['level','fft','shore','sim','surface','appearance'])||!number(v.level,-2000,2000))return false;
 const {fft,shore,sim,surface,appearance}=v;
 return record(fft)&&keys(fft,['cascades','sizes','depth','local','swell','choppiness','foamBias','foamGain','foamDecay','foamAdd','seed','timeScale'])&&integer(fft.cascades,1,4)&&Array.isArray(fft.sizes)&&fft.sizes.length===fft.cascades&&fft.sizes.every(n=>number(n,1,100000))&&number(fft.depth,Number.EPSILON,100000)&&spectrum(fft.local)&&spectrum(fft.swell)&&['choppiness','foamBias','foamGain','foamDecay','foamAdd','seed','timeScale'].every(k=>number(fft[k]))
 &&record(shore)&&keys(shore,['period','amplitude','variation','gamma','breakSpan','curl','runup','enabled','turbidity'])&&number(shore.enabled,0,1)&&Object.entries(shore).every(([k,n])=>k==='enabled'||number(n))&&number(shore.period,Number.EPSILON)&&number(shore.amplitude,0)&&number(shore.variation,0,1)&&number(shore.gamma,Number.EPSILON)&&number(shore.breakSpan,Number.EPSILON)&&['curl','runup','turbidity'].every(k=>number(shore[k],0))
 &&record(sim)&&keys(sim,['center','size','res','dryTime','foamLife','surfFoamLife','residueLife','foamGen','depositGain'])&&pair(sim.center)&&number(sim.size,1,100000)&&integer(sim.res,8,1024)&&['dryTime','foamLife','surfFoamLife','residueLife','foamGen','depositGain'].every(k=>number(sim[k],0,100000))
 &&record(surface)&&keys(surface,['amplitude','slopeScale','foamCoverage','foamSharpness','foamScale','foamWeights'])&&['amplitude','slopeScale','foamCoverage','foamSharpness','foamScale'].every(k=>number(surface[k],0,100000))&&Array.isArray(surface.foamWeights)&&surface.foamWeights.length===fft.cascades&&surface.foamWeights.every(n=>number(n,0,2))
 &&record(appearance)&&keys(appearance,['swellDir','reef'])&&record(appearance.swellDir)&&keys(appearance.swellDir,['x','y'])&&Object.values(appearance.swellDir).every(n=>number(n,-1,1))
 &&record(appearance.reef)&&keys(appearance.reef,['center','radius'])&&record(appearance.reef.center)&&keys(appearance.reef.center,['x','z'])&&Object.values(appearance.reef.center).every(n=>number(n))&&number(appearance.reef.radius,Number.EPSILON,100000);
}
export function validateNativeIsland(value:unknown):string[]{
 if(value===undefined)return [];
 if(!record(value)||!keys(value,['schema','source','grid','resources','assets','arrival','species','vegetationRecipe','vegetationTextures','sea'])||value.schema!==NATIVE_ISLAND_SCHEMA)return ['Invalid native island schema or fields.'];
 if(!record(value.source)||!keys(value.source,['id','version'])||!safeId(value.source.id)||!safeId(value.source.version))return ['Invalid native island source identity.'];
 const g=value.grid;if(!record(g)||!keys(g,['resolution','size','origin','sampleConvention','tileSize','halo'])||g.resolution!==2048||g.size!==2048||!Array.isArray(g.origin)||g.origin.length!==2||g.origin[0]!==-1024||g.origin[1]!==-1024||g.sampleConvention!=='cell-centred'||g.tileSize!==128||g.halo!==0)return ['Unsupported native island grid.'];
 if(!validSea(value.sea)||!Array.isArray(value.species)||value.species.length!==NATIVE_ISLAND_SPECIES.length||new Set(value.species).size!==value.species.length||!NATIVE_ISLAND_SPECIES.every(s=>(value.species as unknown[]).includes(s)))return ['Invalid original native ocean or species parameters.'];
 if(!Array.isArray(value.resources)||!value.resources.length||value.resources.length>8192)return ['Native island resource count exceeds bounds.'];
 let total=0;const ids=new Set<string>(),cells=new Set<string>(),paths=new Map<string,number>();
 for(const raw of value.resources){
  if(!record(raw)||!keys(raw,['id','channel','level','x','z','width','height','format','channels','path','sha256','bytes','min','max'])||!safeId(raw.id)||ids.has(raw.id as string)||!channels.includes(raw.channel as string)||!integer(raw.level,0,7)||!integer(raw.x,0,2047)||!integer(raw.z,0,2047)||!integer(raw.width,1,raw.channel==='vegetation'?200000:128)||!integer(raw.height,1,128)||!integer(raw.channels,1,4)||!number(raw.min)||!number(raw.max)||raw.min>raw.max||typeof raw.sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.sha256)||raw.path!=='native-island/'+raw.sha256+'.bin'||!integer(raw.bytes,1,16*1024*1024))return ['Invalid native island resource reference.'];
  const r=raw as unknown as NativeIslandResource;ids.add(r.id);const cell=[r.channel,r.level,r.x,r.z].join(':');if(cells.has(cell))return ['Duplicate native island channel cell.'];cells.add(cell);
  if(paths.has(r.path)&&paths.get(r.path)!==r.bytes)return ['Conflicting native island content references.'];paths.set(r.path,r.bytes);
  if(r.channel==='vegetation'){if(r.format!=='vegetation-json'||r.channels!==1||r.height!==1||r.level!==0||r.x!==0||r.z!==0)return ['Invalid native vegetation encoding.'];}
  else {
   if(!['u8','f32le'].includes(r.format)||r.channels!==(r.channel==='normal'||r.channel==='splat'||r.channel==='grass'||r.channel==='shore'?4:1)||r.bytes!==r.width*r.height*r.channels*(r.format==='f32le'?4:1)||r.x+r.width>Math.ceil(2048/2**r.level)||r.z+r.height>Math.ceil(2048/2**r.level))return ['Native island dimensions or byte length mismatch.'];
   if((r.channel==='normal'||r.channel==='splat'||r.channel==='grass')&&r.format!=='u8'||(r.channel==='height'||r.channel==='shore')&&r.format!=='f32le')return ['Unsupported native channel encoding.'];
  }
  total+=r.bytes;if(total>MAX_NATIVE_ISLAND_BYTES)return ['Native island resource closure exceeds 256 MiB.'];
 }
 if(!Array.isArray(value.assets)||value.assets.length>16)return ['Invalid native island assets.'];
 for(const asset of value.assets){
  if(!record(asset)||!keys(asset,['id','path','sha256','bytes','mediaType','license','width','height'])||!safeId(asset.id)||ids.has(asset.id as string)||typeof asset.sha256!=='string'||!/^[a-f0-9]{64}$/.test(asset.sha256)||asset.path!=='native-island/'+asset.sha256+'.bin'||!integer(asset.bytes,1,8*1024*1024)||typeof asset.license!=='string'||!asset.license.trim()||asset.license.length>2000)return ['Invalid native island asset reference.'];
  if(asset.mediaType==='image/jpeg'?!integer(asset.width,1,2048)||!integer(asset.height,1,2048):asset.mediaType!=='text/plain'||asset.width!==0||asset.height!==0||(asset.bytes as number)>65536)return ['Unsupported native island asset media or dimensions.'];
  ids.add(asset.id as string);total+=asset.bytes as number;
 }
 if(total>MAX_NATIVE_ISLAND_BYTES)return ['Native island full resource closure exceeds 256 MiB.'];
 const bindings=value.vegetationTextures;
 if(value.vegetationRecipe!=='elsemesh.native-vegetation/1'||!record(bindings)||!keys(bindings,['palm','tree']))return ['Unsupported original vegetation recipe or texture bindings.'];
 const textureIds:string[]=[];
 for(const kind of ['palm','tree']){const b=bindings[kind];if(!record(b)||!keys(b,['albedo','normal','orm']))return ['Invalid vegetation texture bindings.'];for(const id of Object.values(b)){if(typeof id!=='string'||!(value.assets as NativeIslandAsset[]).some(a=>a.id===id&&a.mediaType==='image/jpeg'))return ['Vegetation texture references an absent image.'];textureIds.push(id);}}
 if(new Set(textureIds).size!==6)return ['Vegetation textures require six distinct original images.'];

 // The capability identifies the original island source, never a sparse set of decorative tiles.
 const resources=value.resources as NativeIslandResource[];
 const complete=(channel:NativeIslandChannel,level:number)=>{
  const side=2048/2**level,tiles=resources.filter(r=>r.channel===channel&&r.level===level);
  return tiles.length===(side/128)**2&&tiles.every(r=>r.width===128&&r.height===128&&r.x%128===0&&r.z%128===0);
 };
 if(!(['height','normal','splat','rock','sand','path','gully','seagrass','rubble','scarp'] as NativeIslandChannel[]).every(c=>complete(c,0))||!complete('grass',1)||!complete('shore',2)||!(['height','normal','splat'] as NativeIslandChannel[]).every(c=>complete(c,4))||resources.filter(r=>r.channel==='vegetation').length!==1)return ['Native island source lacks complete original fields or its coarse pyramid.'];
 const a=value.arrival;
 if(!record(a)||!keys(a,['level','cells'])||!integer(a.level,0,7)||!Array.isArray(a.cells)||!a.cells.length||a.cells.length>128||new Set(a.cells).size!==a.cells.length||a.cells.some(id=>typeof id!=='string'||!ids.has(id)||!(value.resources as NativeIslandResource[]).some(r=>r.id===id&&r.level===a.level)))return ['Invalid native island arrival cell index.'];
 return [];
}
function vegetation(value:unknown,count:number):value is NativeVegetation{
 if(!record(value)||!number(value.villagePalms,0,200000)||!keys(value,['records','lod','seeds','villagePalms'])||!record(value.records)||!keys(value.records,[...NATIVE_ISLAND_SPECIES])||!record(value.lod)||!keys(value.lod,['palmNear','treeNear','shrubNear','underFade','fernFade','broadFade','bananaFade','canopyFar','band'])||!Object.values(value.lod).every(v=>Array.isArray(v)?pair(v):number(v,0,100000))||!record(value.seeds)||!keys(value.seeds,['terrain','site','scatter'])||!Object.values(value.seeds).every(n=>integer(n,0,4294967295)))return false;
 let actual=0;
 for(const records of Object.values(value.records)){
  if(!Array.isArray(records))return false;actual+=records.length;
  for(const r of records)if(!record(r)||Object.keys(r).some(k=>!['x','y','z','s','sy','yaw','la','l','H','seed'].includes(k))||!['x','y','z','s','yaw','seed'].every(k=>Object.hasOwn(r,k))||!Object.values(r).every(n=>number(n))||!number(r.x,-1024,1024)||!number(r.z,-1024,1024)||!number(r.y,-2000,2000)||!number(r.seed,0,1)||!number(r.s,0,1000))return false;
 }
 return actual===count;
}
async function digest(bytes:Uint8Array){const value=await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes));return Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,'0')).join('');}
const readers=new Map<string,RepositoryReader>();
function closureKey(project:Pick<WorldProject,'nativeIsland'>){return project.nativeIsland?[...project.nativeIsland.resources,...project.nativeIsland.assets].map(r=>r.sha256+':'+r.bytes).join('|'):'';}
export function registerNativeIslandResourceReader(project:Pick<WorldProject,'nativeIsland'>,read:RepositoryReader){if(project.nativeIsland){const errors=validateNativeIsland(project.nativeIsland);if(errors.length)throw Error(errors[0]);readers.set(closureKey(project),read);if(readers.size>16)readers.delete(readers.keys().next().value!);}}
export function nativeIslandRepositoryReader(project:Pick<WorldProject,'nativeIsland'>):RepositoryReader|undefined{return readers.get(closureKey(project));}
export function createNativeIslandResourceReader(project:Pick<WorldProject,'nativeIsland'>,read:RepositoryReader|undefined=nativeIslandRepositoryReader(project)){
 const errors=validateNativeIsland(project.nativeIsland);if(errors.length||!project.nativeIsland)throw Error(errors[0]??'World has no native island.');
 const refs=new Map<string,NativeIslandResource|NativeIslandAsset>([...project.nativeIsland.resources,...project.nativeIsland.assets].map(r=>[r.id,structuredClone(r)]));
 return async(id:string):Promise<NativeIslandDecoded>=>{
  const ref=refs.get(id);if(!ref)throw Error('Unknown native island resource.');if(!read)throw Error('Native island source unavailable. Reopen its world repository before preview or saving.');
  const bytes=await read(ref.path,ref.bytes);if(bytes.byteLength!==ref.bytes||await digest(bytes)!==ref.sha256)throw Error('Native island resource hash or size mismatch.');
  if('mediaType'in ref){
   if(ref.mediaType==='text/plain')new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   else if(!jpegDimensions(bytes,ref.width,ref.height))throw Error('Native JPEG dimensions do not match its bounded descriptor.');
   return {ref,data:Uint8Array.from(bytes)};
  }
  if(ref.format==='vegetation-json'){const data:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!vegetation(data,ref.width))throw Error('Invalid original native vegetation records.');return {ref,data};}
  const data=ref.format==='u8'?Uint8Array.from(bytes):new Float32Array(bytes.byteLength/4);
  if(data instanceof Float32Array){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<data.length;i++)data[i]=view.getFloat32(i*4,true);}
  let min=Infinity,max=-Infinity;for(const n of data){if(!Number.isFinite(n))throw Error('Non-finite native island sample.');min=Math.min(min,n);max=Math.max(max,n);}
  if(Math.abs(min-ref.min)>1e-5||Math.abs(max-ref.max)>1e-5)throw Error('Native island sample extrema differ from authored min/max.');
  return {ref,data};
 };
}
export function assertNativeIslandStandaloneExport(project:Pick<WorldProject,'nativeIsland'>){if(project.nativeIsland)throw Error('This world contains native island resources. Use Save repository snapshot or Save repository copy to preserve its complete resource closure.');}

function jpegDimensions(bytes:Uint8Array,width:number,height:number){
 if(bytes[0]!==255||bytes[1]!==216)return false;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=2;
 while(offset+4<=bytes.length){
  if(bytes[offset++]!==255)return false;
  while(bytes[offset]===255)offset++;
  const marker=bytes[offset++];if(marker===217||marker===218)return false;
  const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)return false;
  if(marker!==undefined&&[192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return length>=8&&view.getUint16(offset+3)===height&&view.getUint16(offset+5)===width;
  offset+=length;
 }return false;
}
