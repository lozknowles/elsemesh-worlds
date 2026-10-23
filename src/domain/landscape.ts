import {ShapeUtils,Vector2} from 'three';
import {isSimpleOutline,sampleTerrain,validateWorld} from './world';
import type {WorldProject,Vec3,EditorObject} from './world';
import {imageDimensions} from './geography';
import {objectLocalBounds,resolveWorldMatrices} from './object-hierarchy';
import {LANDSCAPE_LIMITS,LANDSCAPE_PROJECT_SCHEMA} from './landscape-types';
import type {Landscape,LandscapeLayer,LandscapeMaterial,LandscapeKind,LandscapeMask,LandscapeBrushCommand,LandscapeAreaCommand,LandscapeInstance,LandscapeWaterSample,LandscapeImage} from './landscape-types';
export * from './landscape-types';
const check:(ok:unknown,message:string)=>asserts ok=(ok,message)=>{if(!ok)throw Error(message);};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,allowed:string[])=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const number=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v:unknown,min:number,max:number)=>number(v,min,max)&&Number.isInteger(v);
const color=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}$/.test(v);
const id=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9:_-]{1,120}$/.test(v);
const text=(v:unknown,max=120)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(n=>number(n,-4000,4000));
const presets:[LandscapeMaterial['preset'],string,string,number][]=[['grass','Grass','#527b3c',.9],['soil','Soil','#71513b',.95],['rock','Rock','#777a77',.85],['gravel','Gravel','#999388',.96],['sand','Sand','#c4ad79',.94]];
export const LANDSCAPE_MATERIAL_PRESETS:readonly LandscapeMaterial[]=presets.map(([preset,name,color,roughness])=>({id:'landscape-material:'+preset,name,preset,color,roughness,tiling:4}));
export const DEFAULT_LANDSCAPE_CONSTRAINTS=Object.freeze({minElevation:-2000,maxElevation:2000,maxSlope:60,excludePaths:true,excludeBuildings:true,excludeWater:true,clearance:.5});
const hash=(seed:number,x:number,z:number,salt=0)=>{let h=(seed^Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(salt+1,1274126177))>>>0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
const primes:number[]=[];for(let n=2;primes.length<64;n++){if(!primes.some(p=>p*p<=n&&n%p===0))primes.push(n);}
const shaK=primes.map(p=>(Math.cbrt(p)%1*4294967296)>>>0),shaInitial=primes.slice(0,8).map(p=>(Math.sqrt(p)%1*4294967296)>>>0);
const rotate=(x:number,n:number)=>(x>>>n)|(x<<(32-n));
/** Synchronous content identity for standalone JSON imports; repository hydration also verifies WebCrypto SHA-256. */
export function landscapeImageDigest(bytes:Uint8Array):string{
 const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=128;const view=new DataView(padded.buffer);view.setUint32(padded.length-8,Math.floor(bytes.length/0x20000000));view.setUint32(padded.length-4,(bytes.length*8)>>>0);const state=[...shaInitial],w=new Uint32Array(64);
 for(let offset=0;offset<padded.length;offset+=64){for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);for(let i=16;i<64;i++){const a=w[i-15]!,b=w[i-2]!;w[i]=(w[i-16]!+(rotate(a,7)^rotate(a,18)^(a>>>3))+w[i-7]!+(rotate(b,17)^rotate(b,19)^(b>>>10)))>>>0;}let [a,b,c,d,e,f,g,h]=state as [number,number,number,number,number,number,number,number];for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+shaK[i]!+w[i]!)>>>0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}for(const[i,v]of [a,b,c,d,e,f,g,h].entries())state[i]=(state[i]!+v)>>>0;}
 return state.map(v=>v.toString(16).padStart(8,'0')).join('');
}
export function landscapeImageBytes(dataUrl:string):Uint8Array{const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);check(match&&match[2]!.length%4===0,'Landscape image must be embedded PNG/JPEG');const binary=atob(match[2]!);check(binary.length>0&&binary.length<=LANDSCAPE_LIMITS.imageBytes,'Landscape image byte limit exceeded');return Uint8Array.from(binary,c=>c.charCodeAt(0));}
export function validateLandscape(project:Pick<WorldProject,'terrain'|'objects'|'assets'|'features'> & {landscape?:unknown}):string[]{
 if(project.landscape===undefined)return [];
 try{
  const l=project.landscape as Landscape;check(keys(l,['version','materials','images','layers','tombstones'])&&l.version===1,'Invalid landscape version or fields');
  check(Array.isArray(l.materials)&&l.materials.length>0&&l.materials.length<=16&&Array.isArray(l.layers)&&l.layers.length<=16&&Array.isArray(l.images)&&l.images.length<=16,'Landscape material/layer/image limit exceeded');
  const imageIds=new Set<string>();let imageBytes=0;
  for(const image of l.images){check(keys(image,['id','name','mediaType','dataUrl','bytes','width','height'])&&/^sha256:[a-f0-9]{64}$/.test(image.id)&&!imageIds.has(image.id)&&text(image.name)&&['image/png','image/jpeg'].includes(image.mediaType),'Invalid landscape image metadata');check(typeof image.dataUrl==='string'&&image.dataUrl.length<LANDSCAPE_LIMITS.imageBytes*4/3+64,'Landscape image encoded limit');const bytes=landscapeImageBytes(image.dataUrl);check(bytes.length===image.bytes&&image.id==='sha256:'+landscapeImageDigest(bytes),'Landscape image hash/byte mismatch');const [w,h]=imageDimensions(bytes,image.mediaType==='image/png'?'png':'jpeg');check(w===image.width&&h===image.height&&w<=2048&&h<=2048&&w*h<=4194304,'Landscape image decode limit or dimensions mismatch');imageBytes+=bytes.length;imageIds.add(image.id);}
  check(imageBytes<=LANDSCAPE_LIMITS.totalImageBytes,'Landscape image aggregate limit exceeded');
  const materialIds=new Set<string>();for(const m of l.materials){check(keys(m,['id','name','preset','color','roughness','tiling','imageRef'])&&id(m.id)&&!materialIds.has(m.id)&&text(m.name)&&['grass','soil','rock','gravel','sand','custom'].includes(m.preset)&&color(m.color)&&number(m.roughness,0,1)&&number(m.tiling,.1,100)&&(m.imageRef===undefined||imageIds.has(m.imageRef)),'Invalid landscape material');materialIds.add(m.id);}
  const layerIds=new Set<string>();let maskBytes=0,tiles=0;
  for(const layer of l.layers){
   check(keys(layer,['id','name','kind','visible','locked','mask','materialId','scatter','water','boundary'])&&id(layer.id)&&!layerIds.has(layer.id)&&text(layer.name)&&['ground','vegetation','water'].includes(layer.kind)&&typeof layer.visible==='boolean'&&typeof layer.locked==='boolean','Invalid landscape layer');layerIds.add(layer.id);
   check(keys(layer.mask,['cellSize','tiles'])&&layer.mask.cellSize===1&&object(layer.mask.tiles),'Invalid sparse landscape mask');
   for(const [key,values]of Object.entries(layer.mask.tiles)){check(/^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(key),'Invalid landscape tile key');const [x,z]=key.split(':').map(Number);check(x!<Math.ceil(project.terrain.width/16)&&z!<Math.ceil(project.terrain.depth/16)&&Array.isArray(values)&&values.length===256&&values.every(v=>integer(v,0,255))&&values.some(v=>v!==0),'Invalid landscape mask tile');for(let i=0;i<256;i++)if(values[i]!==0)check(x!*16+i%16<project.terrain.width&&z!*16+Math.floor(i/16)<project.terrain.depth,'Landscape mask outside terrain');tiles++;maskBytes+=256;}
   if(layer.boundary!==undefined)validateBoundary(layer.boundary,project);
   if(layer.kind==='ground')check(materialIds.has(layer.materialId!)&&layer.scatter===undefined&&layer.water===undefined,'Ground layer requires a known material');
   if(layer.kind==='vegetation'){check(layer.materialId===undefined&&layer.water===undefined,'Invalid vegetation layer fields');const s=layer.scatter;check(keys(s,['kind','seed','spacing','density','scaleMin','scaleMax','variation','treeSpecies','assetRef','constraints'])&&s&&['tree','shrub','grass','flower','rock'].includes(s.kind)&&integer(s.seed,0,0xffffffff)&&number(s.spacing,.5,64)&&number(s.density,0,1)&&number(s.scaleMin,.05,20)&&number(s.scaleMax,s.scaleMin,20)&&number(s.variation,0,1)&&['broadleaf','pine','palm'].includes(s.treeSpecies)&&(s.assetRef===undefined||project.assets.some(a=>a.id===s.assetRef)),'Invalid landscape scatter rule');const c=s.constraints;check(keys(c,['minElevation','maxElevation','maxSlope','excludePaths','excludeBuildings','excludeWater','clearance'])&&number(c.minElevation,-2000,2000)&&number(c.maxElevation,c.minElevation,2000)&&number(c.maxSlope,0,90)&&number(c.clearance,0,20)&&[c.excludePaths,c.excludeBuildings,c.excludeWater].every(v=>typeof v==='boolean'),'Invalid landscape constraints');}
   if(layer.kind==='water'){check(layer.scatter===undefined&&layer.materialId===undefined,'Invalid water layer fields');const w=layer.water;check(keys(w,['level','waveAmplitude','waveSpeed','shoreFade'])&&w&&number(w.level,-2000,2000)&&number(w.waveAmplitude,0,5)&&number(w.waveSpeed,0,10)&&number(w.shoreFade,.1,20),'Invalid bounded landscape water');}
  }
  check(tiles<=256&&maskBytes<=65536,'Landscape mask allocation limit exceeded');
  check(Array.isArray(l.tombstones)&&l.tombstones.length<=20000&&new Set(l.tombstones).size===l.tombstones.length&&l.tombstones.every(v=>typeof v==='string'&&/^landscape-instance:[A-Za-z0-9:_-]+@-?[0-9]+,-?[0-9]+,0$/.test(v)&&v.length<=200),'Invalid generated instance tombstones');
  for(const o of project.objects)if(o.landscapeOrigin!==undefined){check(keys(o.landscapeOrigin,['layerId','generatedId'])&&id(o.landscapeOrigin.layerId)&&typeof o.landscapeOrigin.generatedId==='string'&&o.landscapeOrigin.generatedId.startsWith('landscape-instance:'+o.landscapeOrigin.layerId+'@')&&l.tombstones.includes(o.landscapeOrigin.generatedId)&&(o.kind==='tree'||o.kind==='glb'),'Promoted object must preserve landscape origin and tombstone');}
  assertLandscapeDerivedBudget(project as WorldProject);
  return [];
 }catch(error){return [(error as Error).message];}
}
export function validateBoundary(boundary:Vec3[],project:Pick<WorldProject,'terrain'>):void{check(Array.isArray(boundary)&&boundary.length>=3&&boundary.length<=512&&boundary.every(p=>vector(p)&&Math.abs(p[0])<=project.terrain.width/2&&Math.abs(p[2])<=project.terrain.depth/2)&&isSimpleOutline(boundary),'Landscape boundary must be simple, closed, nonzero and inside terrain');}
export function ensureLandscape(project:WorldProject):WorldProject{if(project.landscape)return project;return {...project,schema:LANDSCAPE_PROJECT_SCHEMA,landscape:{version:1,materials:LANDSCAPE_MATERIAL_PRESETS.map(m=>({...m})),images:[],layers:[],tombstones:[]}};}
export function createLandscapeLayer(project:WorldProject,options:{id?:string;kind:LandscapeKind;name?:string}):WorldProject{
 const p=ensureLandscape(project),kind=options.kind,layer:LandscapeLayer={id:options.id??'landscape-layer:'+crypto.randomUUID(),name:options.name??(kind==='ground'?'Ground':kind==='water'?'Water':'Vegetation'),kind,visible:true,locked:false,mask:{cellSize:1,tiles:{}}};
 if(kind==='ground')layer.materialId=p.landscape!.materials[0]!.id;
 if(kind==='vegetation')layer.scatter={kind:'tree',seed:7319,spacing:4,density:.6,scaleMin:.8,scaleMax:1.2,variation:.25,treeSpecies:'broadleaf',constraints:{...DEFAULT_LANDSCAPE_CONSTRAINTS}};
 if(kind==='water')layer.water={level:0,waveAmplitude:.15,waveSpeed:1,shoreFade:1};
 const result={...p,landscape:{...p.landscape!,layers:[...p.landscape!.layers,layer]}};assertLandscape(result);return result;
}
function assertLandscape(p:WorldProject){const errors=validateLandscape(p);check(!errors.length,errors[0]??'Invalid landscape');}
function layerCopy(project:WorldProject,layerId:string){check(project.landscape,'Create a landscape layer first');const index=project.landscape.layers.findIndex(l=>l.id===layerId);check(index>=0,'Unknown landscape layer');const original=project.landscape.layers[index]!;check(!original.locked,'Landscape layer is locked');const layer={...original,mask:{cellSize:1 as const,tiles:Object.fromEntries(Object.entries(original.mask.tiles).map(([k,v])=>[k,[...v]]))}};return {layer,index};}
function setMask(mask:LandscapeMask,x:number,z:number,value:number){const key=Math.floor(x/16)+':'+Math.floor(z/16),index=(z%16)*16+x%16;if(!mask.tiles[key]&&value===0)return;const tile=mask.tiles[key]??(mask.tiles[key]=Array(256).fill(0));tile[index]=Math.max(0,Math.min(255,Math.round(value)));}
export function landscapeMaskAt(project:Pick<WorldProject,'terrain'>,mask:LandscapeMask,x:number,z:number):number{const ix=Math.floor(x+project.terrain.width/2),iz=Math.floor(z+project.terrain.depth/2);if(ix<0||iz<0||ix>=project.terrain.width||iz>=project.terrain.depth)return 0;return mask.tiles[Math.floor(ix/16)+':'+Math.floor(iz/16)]?.[(iz%16)*16+ix%16]??0;}
function editMask(project:WorldProject,layerId:string,mode:LandscapeBrushCommand['mode'],weight:(x:number,z:number)=>number,bounds:[number,number,number,number],boundary?:Vec3[],workPerCell=1):WorldProject{
 check(['paint','replace','erase'].includes(mode),'Invalid landscape operation');
 const replaceWater=mode==='replace'&&project.landscape?.layers.find(l=>l.id===layerId)?.kind==='water';
 const x0=Math.max(0,Math.floor(bounds[0]+project.terrain.width/2)),x1=Math.min(project.terrain.width,Math.ceil(bounds[1]+project.terrain.width/2)),z0=Math.max(0,Math.floor(bounds[2]+project.terrain.depth/2)),z1=Math.min(project.terrain.depth,Math.ceil(bounds[3]+project.terrain.depth/2)),width=Math.max(0,x1-x0),depth=Math.max(0,z1-z0);
 check(width*depth<=LANDSCAPE_LIMITS.maskBytes,'Landscape operation covers too many cells; use a smaller area or shorter stroke (65,536 cell limit).');
 check(width*depth*workPerCell<=LANDSCAPE_LIMITS.operationWork,'Landscape operation is too complex; use fewer boundary/stroke points or a smaller area.');
 const tx0=Math.floor(x0/16),tx1=Math.floor((x1-1)/16),tz0=Math.floor(z0/16),tz1=Math.floor((z1-1)/16),tileCount=width&&depth?(tx1-tx0+1)*(tz1-tz0+1):0;
 check(tileCount<=LANDSCAPE_LIMITS.maskTiles,'Landscape operation spans too many mask tiles; use a smaller area (256 tile limit).');
 if(mode!=='erase'){
  check(project.landscape,'Create a landscape layer first');let total=0;for(const current of project.landscape.layers){if(current.id!==layerId){total+=Object.keys(current.mask.tiles).length;continue;}const keys=new Set(replaceWater?[]:Object.keys(current.mask.tiles));if(tileCount)for(let tz=tz0;tz<=tz1;tz++)for(let tx=tx0;tx<=tx1;tx++)keys.add(tx+':'+tz);total+=keys.size;}
  check(total<=LANDSCAPE_LIMITS.maskTiles,'Landscape operation exceeds the shared 256 mask tile budget; erase coverage or use a smaller area.');
 }
 const {layer,index}=layerCopy(project,layerId);if(replaceWater)layer.mask.tiles={};
 for(let z=z0;z<z1;z++)for(let x=x0;x<x1;x++){
  const wx=x+.5-project.terrain.width/2,wz=z+.5-project.terrain.depth/2,w=Math.max(0,Math.min(1,weight(wx,wz)));if(!w)continue;const old=landscapeMaskAt(project,layer.mask,wx,wz);setMask(layer.mask,x,z,mode==='erase'?old*(1-w):mode==='replace'?w*255:Math.max(old,w*255));
 }
 for(const [key,tile]of Object.entries(layer.mask.tiles))if(!tile.some(Boolean))delete layer.mask.tiles[key];
 if(boundary&&layer.kind==='water'&&mode!=='erase')layer.boundary=structuredClone(boundary);
 const layers=[...project.landscape!.layers];layers[index]=layer;const result={...project,landscape:{...project.landscape!,layers}};assertLandscape(result);generateLandscapeInstances(result);return result;
}
function pointSegmentDistance(x:number,z:number,a:Vec3,b:Vec3):number{const dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz);}
export function applyLandscapeBrush(project:WorldProject,c:LandscapeBrushCommand):WorldProject{
 check(Array.isArray(c.points)&&c.points.length>0&&c.points.length<=2048&&c.points.every(vector)&&number(c.radius,.25,100)&&number(c.strength,0,1)&&number(c.falloff,0,1),'Invalid landscape brush command');
 const xs=c.points.map(p=>p[0]),zs=c.points.map(p=>p[2]);return editMask(project,c.layerId,c.mode,(x,z)=>{let d=Infinity;if(c.points.length===1)d=Math.hypot(x-c.points[0]![0],z-c.points[0]![2]);else for(let i=1;i<c.points.length;i++)d=Math.min(d,pointSegmentDistance(x,z,c.points[i-1]!,c.points[i]!));return d>c.radius?0:c.strength*(c.falloff===0?1:Math.pow(Math.max(0,1-d/c.radius),c.falloff*3));},[Math.min(...xs)-c.radius,Math.max(...xs)+c.radius,Math.min(...zs)-c.radius,Math.max(...zs)+c.radius],undefined,c.points.length);
}
export function pointInLandscapeBoundary(x:number,z:number,points:Vec3[]):boolean{let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i]!,b=points[j]!;if(pointSegmentDistance(x,z,a,b)<1e-8)return true;if((a[2]>z)!==(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])inside=!inside;}return inside;}
export function applyLandscapeArea(project:WorldProject,c:LandscapeAreaCommand):WorldProject{validateBoundary(c.boundary,project);check(c.strength===undefined||number(c.strength,0,1),'Invalid landscape area strength');const xs=c.boundary.map(p=>p[0]),zs=c.boundary.map(p=>p[2]);return editMask(project,c.layerId,c.mode,(x,z)=>pointInLandscapeBoundary(x,z,c.boundary)?c.strength??1:0,[Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs)],c.boundary,c.boundary.length);}
export function sampleLandscapeWater(project:WorldProject,x:number,z:number,time=0):LandscapeWaterSample|null{
 if(![x,z,time].every(Number.isFinite))return null;let result:LandscapeWaterSample|null=null;
 for(const layer of project.landscape?.layers??[]){if(layer.kind!=='water'||!layer.visible||!layer.boundary||!layer.water||!pointInLandscapeBoundary(x,z,layer.boundary))continue;const coverage=landscapeMaskAt(project,layer.mask,x,z)/255,w=layer.water,depth=w.level-sampleTerrain(project.terrain,x,z);if(!coverage||depth<=0)continue;
 let edge=Infinity;for(let i=0;i<layer.boundary.length;i++)edge=Math.min(edge,pointSegmentDistance(x,z,layer.boundary[i]!,layer.boundary[(i+1)%layer.boundary.length]!));const shoreFactor=Math.min(1,edge/w.shoreFade,depth/Math.max(.001,w.waveAmplitude))*coverage,amplitude=w.waveAmplitude*shoreFactor,height=w.level+Math.sin(x*.04+z*.03+time*w.waveSpeed)*amplitude;
 result={height,level:w.level,amplitude,shoreFactor,layerId:layer.id};}
 return result;
}
export function createLandscapeSampler(project:WorldProject){
 assertLandscape(project);const layers=project.landscape?.layers??[];
 return {groundAt(x:number,z:number){let color=[0,0,0],opacity=0;const contributions:{material:LandscapeMaterial;weight:number;layerId:string}[]=[];for(const layer of layers){if(layer.kind!=='ground'||!layer.visible)continue;const w=landscapeMaskAt(project,layer.mask,x,z)/255,m=project.landscape!.materials.find(m=>m.id===layer.materialId)!;if(!w)continue;contributions.push({material:m,weight:w,layerId:layer.id});const rgb=[1,3,5].map(i=>parseInt(m.color.slice(i,i+2),16)/255);color=color.map((v,i)=>v*(1-w)+rgb[i]!*w);opacity=opacity*(1-w)+w;}return {color:color as Vec3,opacity,contributions};},waterAt:(x:number,z:number,time=0)=>sampleLandscapeWater(project,x,z,time),maskAt:(layerId:string,x:number,z:number)=>{const l=layers.find(l=>l.id===layerId);return l?landscapeMaskAt(project,l.mask,x,z)/255:0;}};
}

function exclusionIndex(project:WorldProject){
 const cells=new Map<string,((x:number,z:number,clearance:number)=>boolean)[]>(),size=16,matrices=resolveWorldMatrices(project.objects);
 let binReferences=0;
 const add=(bounds:[number,number,number,number],test:(x:number,z:number,c:number)=>boolean)=>{check(bounds.every(Number.isFinite),'Landscape exclusion bounds must be finite');const [x0,x1,z0,z1]=bounds;binReferences+=(Math.floor(x1/size)-Math.floor(x0/size)+1)*(Math.floor(z1/size)-Math.floor(z0/size)+1);check(binReferences<=LANDSCAPE_LIMITS.exclusionBins,'Landscape exclusion index work limit exceeded; reduce path/building bounds or count.');for(let z=Math.floor(z0/size);z<=Math.floor(z1/size);z++)for(let x=Math.floor(x0/size);x<=Math.floor(x1/size);x++){const key=x+':'+z,list=cells.get(key)??[];list.push(test);cells.set(key,list);}};
 for(const feature of project.features??[])if(feature.kind==='path')for(let i=1;i<feature.points.length;i++){const a=feature.points[i-1]!,b=feature.points[i]!,r=feature.width/2+20;add([Math.min(a[0],b[0])-r,Math.max(a[0],b[0])+r,Math.min(a[2],b[2])-r,Math.max(a[2],b[2])+r],(x,z,c)=>pointSegmentDistance(x,z,a,b)<=feature.width/2+c);}
 const pathCells=new Map([...cells].map(([k,v])=>[k,[...v]]));cells.clear();
 for(const object of project.objects)if(object.visible&&(object.kind==='building'||object.kind==='glb'&&object.collision!=='none')){
  const box=objectLocalBounds(project,object).applyMatrix4(matrices.get(object.id)!);add([box.min.x-20,box.max.x+20,box.min.z-20,box.max.z+20],(x,z,c)=>x>=box.min.x-c&&x<=box.max.x+c&&z>=box.min.z-c&&z<=box.max.z+c);
 }
 return {path:(x:number,z:number,c:number)=>(pathCells.get(Math.floor(x/size)+':'+Math.floor(z/size))??[]).some(test=>test(x,z,c)),building:(x:number,z:number,c:number)=>(cells.get(Math.floor(x/size)+':'+Math.floor(z/size))??[]).some(test=>test(x,z,c))};
}
function candidatePoint(seed:number,x:number,z:number,spacing:number):[number,number]{return [(x+.5+(hash(seed,x,z,1)-.5)*.3)*spacing,(z+.5+(hash(seed,x,z,2)-.5)*.3)*spacing];}
function spacingWinner(seed:number,cx:number,cz:number,spacing:number):boolean{
 const [x,z]=candidatePoint(seed,cx,cz,spacing),rank=hash(seed,cx,cz,99);
 for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){if(!dx&&!dz)continue;const nx=cx+dx,nz=cz+dz,other=hash(seed,nx,nz,99);if(other>rank||other===rank&&(nz>cz||nz===cz&&nx>cx))continue;const [xx,zz]=candidatePoint(seed,nx,nz,spacing);if(Math.hypot(x-xx,z-zz)<spacing)return false;}
 return true;
}
/** Candidate positions/spacing priorities are independent of density and mask membership.
 * A two-cell halo participates in spacing even outside paint, so density/erase never reshuffle survivors.
 */
export function generateLandscapeInstances(project:WorldProject):LandscapeInstance[]{
 assertLandscape(project);if(!project.landscape||!project.landscape.layers.some(l=>l.visible&&l.kind==='vegetation'&&Object.keys(l.mask.tiles).length))return [];const result:LandscapeInstance[]=[],removed=new Set(project.landscape.tombstones),exclusions=exclusionIndex(project);let totalCandidates=0;
 for(const layer of project.landscape.layers){if(layer.kind!=='vegetation'||!layer.visible||!layer.scatter)continue;const s=layer.scatter,c=s.constraints,cells=new Set<string>();
  for(const tileKey of Object.keys(layer.mask.tiles)){const [tx,tz]=tileKey.split(':').map(Number),x0=tx!*16-project.terrain.width/2,z0=tz!*16-project.terrain.depth/2;for(let cz=Math.floor(z0/s.spacing)-1;cz<=Math.ceil((z0+16)/s.spacing)+1;cz++)for(let cx=Math.floor(x0/s.spacing)-1;cx<=Math.ceil((x0+16)/s.spacing)+1;cx++){cells.add(cx+':'+cz);check(cells.size+totalCandidates<=LANDSCAPE_LIMITS.candidates,'Landscape candidate limit exceeded');}}
  totalCandidates+=cells.size;
  for(const key of [...cells].sort((a,b)=>{const [x,z]=a.split(':').map(Number),[xx,zz]=b.split(':').map(Number);return z!-zz!||x!-xx!;})){
   const [cx,cz]=key.split(':').map(Number),[x,z]=candidatePoint(s.seed,cx!,cz!,s.spacing);if(Math.abs(x)>=project.terrain.width/2||Math.abs(z)>=project.terrain.depth/2)continue;
   const weight=landscapeMaskAt(project,layer.mask,x,z)/255;if(hash(s.seed,cx!,cz!,3)>=s.density*weight||!spacingWinner(s.seed,cx!,cz!,s.spacing))continue;
   const instanceId='landscape-instance:'+layer.id+'@'+cx+','+cz+',0';if(removed.has(instanceId))continue;
   const y=sampleTerrain(project.terrain,x,z),dx=sampleTerrain(project.terrain,x+.5,z)-sampleTerrain(project.terrain,x-.5,z),dz=sampleTerrain(project.terrain,x,z+.5)-sampleTerrain(project.terrain,x,z-.5),slope=Math.atan(Math.hypot(dx,dz))*180/Math.PI;
   if(y<c.minElevation||y>c.maxElevation||slope>c.maxSlope||c.excludePaths&&exclusions.path(x,z,c.clearance)||c.excludeBuildings&&exclusions.building(x,z,c.clearance))continue;
   const water=sampleLandscapeWater(project,x,z,0),legacyWater=project.water&&Math.abs(x)<project.water.extent/2&&Math.abs(z)<project.water.extent/2&&y<project.water.level,lake=(project.features??[]).some(f=>f.kind==='lake'&&y<(f.elevation??0)&&pointInLandscapeBoundary(x,z,f.points));
   if(c.excludeWater&&(water||legacyWater||lake))continue;
   const scale=s.scaleMin+(s.scaleMax-s.scaleMin)*hash(s.seed,cx!,cz!,4),tint=hash(s.seed,cx!,cz!,5)*s.variation,base={tree:'#497b39',shrub:'#57813f',grass:'#6b9345',flower:'#b78dcb',rock:'#82877e'}[s.kind],rgb=[1,3,5].map(i=>Math.max(0,Math.min(255,Math.round(parseInt(base.slice(i,i+2),16)*(1-s.variation*.25+tint*.5))))),color='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
   result.push({id:instanceId,layerId:layer.id,kind:s.kind,position:[x,y,z],rotation:[0,hash(s.seed,cx!,cz!,6)*Math.PI*2,0],scale:[scale,scale,scale],color,cell:[cx!,cz!],ordinal:0,seed:Math.floor(hash(s.seed,cx!,cz!,7)*0xffffffff),treeSpecies:s.treeSpecies,...s.assetRef?{assetRef:s.assetRef}:{}});
   check(result.length<=LANDSCAPE_LIMITS.instances,'Landscape generated instance limit exceeded');
  }
 }
 return result;
}
export function eraseGeneratedInstance(project:WorldProject,generatedId:string):WorldProject{check(project.landscape,'No landscape');const result={...project,landscape:{...project.landscape,tombstones:[...new Set([...project.landscape.tombstones,generatedId])].sort()}};assertLandscape(result);return result;}
export function promoteLandscapeInstance(project:WorldProject,generatedId:string):WorldProject{
 const instance=generateLandscapeInstances(project).find(i=>i.id===generatedId);check(instance&&instance.kind==='tree','Only a current generated tree can be promoted');check(project.objects.length<2000,'Explicit scene object limit exceeded');const objectId='landscape-object:'+landscapeImageDigest(new TextEncoder().encode(generatedId)).slice(0,48);
 const object:EditorObject={id:objectId,name:'Promoted landscape tree',kind:instance.assetRef?'glb':'tree',position:[...instance.position],rotation:[...instance.rotation],scale:[...instance.scale],color:instance.color,visible:true,collision:'solid',treeSpecies:instance.treeSpecies,treeSeed:renderedLandscapeTreeSeed(instance),landscapeOrigin:{layerId:instance.layerId,generatedId},...instance.assetRef?{assetId:instance.assetRef}:{}};
 check(!project.objects.some(o=>o.id===objectId),'Generated tree was already promoted');const removed=eraseGeneratedInstance(project,generatedId);return {...removed,objects:[...removed.objects,object]};
}

/** Commands validate the entire result before returning; callers commit once per gesture. */
export function updateLandscapeLayer(project:WorldProject,layerId:string,patch:Partial<Omit<LandscapeLayer,'id'|'kind'|'mask'>>):WorldProject{
 check(project.landscape,'No landscape');const layer=project.landscape.layers.find(l=>l.id===layerId);check(layer,'Unknown landscape layer');check(keys(patch,['name','visible','locked','materialId','scatter','water','boundary']),'Unsupported layer edit');check(!layer.locked||(Object.keys(patch).length===1&&patch.locked===false),'Landscape layer is locked');
 const result={...project,landscape:{...project.landscape,layers:project.landscape.layers.map(l=>l.id===layerId?{...l,...structuredClone(patch)}:l)}};assertLandscape(result);return result;
}
export function addLandscapeMaterial(project:WorldProject,material:LandscapeMaterial):WorldProject{
 const next=ensureLandscape(project);check(!next.landscape!.materials.some(m=>m.id===material.id),'Duplicate landscape material');const result={...next,landscape:{...next.landscape!,materials:[...next.landscape!.materials,structuredClone(material)]}};assertLandscape(result);return result;
}
export function updateLandscapeMaterial(project:WorldProject,materialId:string,patch:Partial<Omit<LandscapeMaterial,'id'>>):WorldProject{
 check(project.landscape&&project.landscape.materials.some(m=>m.id===materialId),'Unknown landscape material');check(keys(patch,['name','preset','color','roughness','tiling','imageRef']),'Unsupported material edit');const result={...project,landscape:{...project.landscape,materials:project.landscape.materials.map(m=>m.id===materialId?{...m,...patch}:m)}};assertLandscape(result);return result;
}
export function reorderLandscapeLayers(project:WorldProject,ids:string[]):WorldProject{
 check(project.landscape&&ids.length===project.landscape.layers.length&&new Set(ids).size===ids.length,'Layer order must contain every layer once');const layers=ids.map(id=>project.landscape!.layers.find(l=>l.id===id));check(layers.every(Boolean),'Unknown landscape layer');return {...project,landscape:{...project.landscape,layers:layers as LandscapeLayer[]}};
}
export type LandscapeCollisionShape={id:string;kind:'cylinder'|'box';min:Vec3;max:Vec3;center:Vec3;radius?:number};
/** Shared conservative broadphase. Decorative shrubs/grass/flowers never become solid. */
export function createLandscapeCollisionIndex(project:WorldProject,instances:LandscapeInstance[]=generateLandscapeInstances(project)):{shapes:LandscapeCollisionShape[];query:(min:Vec3,max:Vec3)=>LandscapeCollisionShape[]}{
 check(instances.length<=LANDSCAPE_LIMITS.instances,'Landscape collision instance limit exceeded');
 const shapes:LandscapeCollisionShape[]=[],bins=new Map<string,LandscapeCollisionShape[]>();let binReferences=0;
 for(const instance of instances){if(instance.kind!=='tree'&&instance.kind!=='rock')continue;check(vector(instance.position)&&vector(instance.rotation)&&vector(instance.scale)&&instance.scale.every(s=>s>0&&s<=20),'Invalid generated collision transform');const [x,y,z]=instance.position,s=instance.scale[0],radius=instance.kind==='tree'?.18*s:.55*s;let min:Vec3=[x-radius,y,z-radius],max:Vec3=[x+radius,y+(instance.kind==='tree'?4.8:1.1)*s,z+radius];
  if(instance.assetRef){const asset=project.assets.find(a=>a.id===instance.assetRef);check(asset,'Unknown landscape asset');const bounds=objectLocalBounds(project,{kind:'glb',assetId:instance.assetRef} as EditorObject),yaw=instance.rotation[1],c=Math.cos(yaw),sn=Math.sin(yaw),corners:Vec3[]=[];for(const xx of [bounds.min.x,bounds.max.x])for(const yy of [bounds.min.y,bounds.max.y])for(const zz of [bounds.min.z,bounds.max.z])corners.push([x+(xx*c+zz*sn)*s,y+yy*s,z+(-xx*sn+zz*c)*s]);min=[0,1,2].map(axis=>Math.min(...corners.map(v=>v[axis]!))) as Vec3;max=[0,1,2].map(axis=>Math.max(...corners.map(v=>v[axis]!))) as Vec3;}
  check([...min,...max].every(Number.isFinite)&&min.every((v,i)=>max[i]!>=v&&max[i]!-v<=LANDSCAPE_LIMITS.colliderExtent),'Landscape collider extent limit exceeded (128 metres); reduce model bounds or scale.');binReferences+=(Math.floor(max[0]/16)-Math.floor(min[0]/16)+1)*(Math.floor(max[2]/16)-Math.floor(min[2]/16)+1);check(binReferences<=LANDSCAPE_LIMITS.collisionBins,'Landscape collision index bin limit exceeded; reduce collidable scenery density or size.');
  const shape:LandscapeCollisionShape={id:instance.id,kind:instance.kind==='tree'&&!instance.assetRef?'cylinder':'box',min,max,center:[(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2],...instance.kind==='tree'&&!instance.assetRef?{radius}:{}};shapes.push(shape);
 }
 // All bounds and total references are checked before allocating any bins.
 for(const shape of shapes){const {min,max}=shape;for(let bx=Math.floor(min[0]/16);bx<=Math.floor(max[0]/16);bx++)for(let bz=Math.floor(min[2]/16);bz<=Math.floor(max[2]/16);bz++){const key=bx+':'+bz;const bucket=bins.get(key)??[];bucket.push(shape);bins.set(key,bucket);}
 }
 return {shapes,query(min,max){check(vector(min)&&vector(max)&&min.every((v,i)=>v<=max[i]!), 'Invalid landscape collision query');check((Math.floor(max[0]/16)-Math.floor(min[0]/16)+1)*(Math.floor(max[2]/16)-Math.floor(min[2]/16)+1)<=LANDSCAPE_LIMITS.collisionBins,'Landscape collision query bin limit exceeded');const found=new Set<LandscapeCollisionShape>();for(let x=Math.floor(min[0]/16);x<=Math.floor(max[0]/16);x++)for(let z=Math.floor(min[2]/16);z<=Math.floor(max[2]/16);z++)for(const shape of bins.get(x+':'+z)??[])if(shape.min.every((v,i)=>v<=max[i]!&&shape.max[i]!>=min[i]!))found.add(shape);return [...found];}};
}

export function createLandscapeImage(dataUrl:string,name:string):LandscapeImage{
 const bytes=landscapeImageBytes(dataUrl),mediaType=dataUrl.startsWith('data:image/png;')?'image/png':'image/jpeg',[width,height]=imageDimensions(bytes,mediaType==='image/png'?'png':'jpeg');return {id:'sha256:'+landscapeImageDigest(bytes),mediaType,dataUrl,bytes:bytes.length,width,height,name};
}
export function addLandscapeImage(project:WorldProject,image:LandscapeImage):WorldProject{
 const next=ensureLandscape(project);if(next.landscape!.images.some(i=>i.id===image.id))return next;const result={...next,landscape:{...next.landscape!,images:[...next.landscape!.images,structuredClone(image)]}};assertLandscape(result);return result;
}

/** Admission boundary for editor imports/commits. Generate once before publishing; reuse instances. */
export function admitLandscapeProject(value:unknown):ReturnType<typeof validateWorld>&{instances?:LandscapeInstance[];collision?:ReturnType<typeof createLandscapeCollisionIndex>}{
 const result=validateWorld(value);if(!result.valid||!result.project)return result;
 try{const instances=generateLandscapeInstances(result.project),collision=createLandscapeCollisionIndex(result.project,instances);return {...result,instances,collision};}catch(error){return {valid:false,errors:[(error as Error).message]};}
}

export type LandscapeDerivedBudget={candidates:number;sceneryWork:number;waterWork:number;waterVertices:number};
/** Conservative cheap preflight: no terrain-cell expansion, mesh arrays or candidate sets. */
export function assertLandscapeDerivedBudget(project:WorldProject):LandscapeDerivedBudget{
 const result:LandscapeDerivedBudget={candidates:0,sceneryWork:0,waterWork:0,waterVertices:0};if(!project.landscape)return result;
 const layers=project.landscape.layers,waterLayers=layers.filter(l=>l.visible&&l.kind==='water'&&l.boundary&&l.water),waterEdges=waterLayers.reduce((n,l)=>n+l.boundary!.length,0),lakeEdges=(project.features??[]).filter(f=>f.kind==='lake').reduce((n,f)=>n+f.points.length,0),pathEdges=(project.features??[]).filter(f=>f.kind==='path').reduce((n,f)=>n+Math.max(0,f.points.length-1),0);
 for(const layer of layers){if(!layer.visible||layer.kind!=='vegetation'||!layer.scatter)continue;const spacing=layer.scatter.spacing;
  if(layer.scatter.assetRef){const bounds=objectLocalBounds(project,{kind:'glb',assetId:layer.scatter.assetRef} as EditorObject),width=bounds.max.x-bounds.min.x,depth=bounds.max.z-bounds.min.z,height=bounds.max.y-bounds.min.y,scale=layer.scatter.scaleMax;check([width,depth,height].every(v=>Number.isFinite(v)&&v>=0)&&Math.hypot(width,depth)*scale<=LANDSCAPE_LIMITS.colliderExtent&&height*scale<=LANDSCAPE_LIMITS.colliderExtent,'Landscape generated model extent limit exceeded (128 metres); reduce asset bounds or scatter scale.');}

  for(const key of Object.keys(layer.mask.tiles)){const [tx,tz]=key.split(':').map(Number),x0=tx!*16-project.terrain.width/2,z0=tz!*16-project.terrain.depth/2;result.candidates+=(Math.ceil((x0+16)/spacing)-Math.floor(x0/spacing)+3)*(Math.ceil((z0+16)/spacing)-Math.floor(z0/spacing)+3);}
  check(result.candidates<=LANDSCAPE_LIMITS.candidates,'Landscape candidate limit exceeded by conservative derived-work estimate; increase spacing or reduce painted coverage.');
 }
 result.sceneryWork=result.candidates*(41+waterEdges*3+lakeEdges+pathEdges+project.objects.length);check(result.sceneryWork<=LANDSCAPE_LIMITS.sceneryWork,'Landscape scenery derived work limit exceeded; simplify water/lake/path boundaries, reduce coverage or increase spacing.');
 const terrain=project.terrain,stepX=terrain.width/(terrain.resolution-1),stepZ=terrain.depth/(terrain.resolution-1),cellVisits=(Math.ceil(stepX)+1)*(Math.ceil(stepZ)+1);
 for(const layer of waterLayers){const boundary=layer.boundary!,triangles=ShapeUtils.triangulateShape(boundary.map(p=>new Vector2(p[0],p[2])),[]);let terrainTriangles=0;
  for(const triangle of triangles){const points=triangle.map(i=>boundary[i]!),minX=Math.max(0,Math.floor((Math.min(...points.map(p=>p[0]))/terrain.width+.5)*(terrain.resolution-1))),maxX=Math.min(terrain.resolution-2,Math.ceil((Math.max(...points.map(p=>p[0]))/terrain.width+.5)*(terrain.resolution-1))),minZ=Math.max(0,Math.floor((Math.min(...points.map(p=>p[2]))/terrain.depth+.5)*(terrain.resolution-1))),maxZ=Math.min(terrain.resolution-2,Math.ceil((Math.max(...points.map(p=>p[2]))/terrain.depth+.5)*(terrain.resolution-1)));terrainTriangles+=Math.max(0,maxX-minX+1)*Math.max(0,maxZ-minZ+1)*2;}
  // A terrain triangle clipped by three outline edges and the level has at most
  // seven vertices (five fan triangles). Cell clipping adds at most four more
  // vertices to a triangle, so each visit emits at most fifteen vertices.
  const visits=terrainTriangles*5*cellVisits,vertices=visits*15;result.waterVertices+=vertices;result.waterWork+=terrainTriangles*32+visits*(32+waterEdges*3)+vertices*waterEdges*3;
  check(result.waterVertices<=LANDSCAPE_LIMITS.waterVertices,'Landscape water vertex limit exceeded by conservative derived-work estimate; reduce water boundary/area or use a coarser terrain grid.');
  check(result.waterWork<=LANDSCAPE_LIMITS.waterWork,'Landscape water derived work limit exceeded; simplify boundaries, reduce water area or use a coarser terrain grid.');
 }
 return result;
}

/** The four actually rendered stock variants; promotion must preserve this exact tree seed. */
export function renderedLandscapeTreeSeed(instance:Pick<LandscapeInstance,'seed'>):number{return 7319+(instance.seed%4)*991;}
