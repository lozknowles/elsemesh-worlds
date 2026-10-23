/** Prepare an editable scene from the read-only, deterministic ElseMesh recipe.
 * No game modules are imported at runtime by the editor. Run from this checkout:
 * node scripts/prepare-warehouse-world.mjs [path-to-elsemesh-weather]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { BoxGeometry, SphereGeometry, CylinderGeometry, TorusGeometry, Color, Euler, Quaternion, Matrix4, Vector3 } from 'three';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] ?? resolve(root, '../elsemesh-weather'));
const recipePath = resolve(source, 'src/world/PortalInteriorRecipe.js');
const sourceBytes = await readFile(recipePath);
// Snapshot exact file bytes; importing a data URL avoids resolving any game imports.
const { buildRecipe } = await import(`data:text/javascript;base64,${sourceBytes.toString('base64')}`);
const recipe = buildRecipe();
const sourceSha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const recipeSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const hex = color => `#${color.toString(16).padStart(6, '0')}`;
const linear = color => new Color(color).toArray();
const output = resolve(root, 'public/worlds/warehouse');
await mkdir(output, { recursive: true });

// Small original bitmap lettering for static screen previews. Screen behavior,
// keyboard legends, canvas artwork and emulation remain game runtime features.
const font = {
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
 C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
 E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
 G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],
 I:['111','010','010','010','010','010','111'],K:['10001','10010','10100','11000','10100','10010','10001'],
 L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],
 N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],
 P:['11110','10001','10001','11110','10000','10000','10000'],R:['11110','10001','10001','11110','10100','10010','10001'],
 S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],
 U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],
 W:['10001','10001','10001','10101','10101','10101','01010'],Y:['10001','10001','01010','00100','00100','00100','00100'],
 '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['010','110','010','010','010','010','111'],
 '2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['10010','10010','10010','11111','00010','00010','00010'],'6':['01110','10000','10000','11110','10001','10001','01110'],
 '8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
 '.':['0','0','0','0','0','1','1'],'>':['100','010','001','000','001','010','100'],
};
function crc32(bytes) {
 let crc = 0xffffffff;
 for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
 return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, bytes) {
 const name=Buffer.from(type), out=Buffer.alloc(bytes.length+12);
 out.writeUInt32BE(bytes.length); name.copy(out,4); bytes.copy(out,8); out.writeUInt32BE(crc32(Buffer.concat([name,bytes])),bytes.length+8); return out;
}
function screenPng(screen) {
 const width=320,height=240,pixels=Buffer.alloc(width*height*4);
 const fill=(x,y,w,h,color)=>{for(let py=y;py<Math.min(height,y+h);py++)for(let px=x;px<Math.min(width,x+w);px++){const i=(py*width+px)*4;pixels[i]=(color>>16)&255;pixels[i+1]=(color>>8)&255;pixels[i+2]=color&255;pixels[i+3]=255;}};
 fill(0,0,width,height,screen.border); fill(14,16,292,208,screen.background);
 const text=(value,x,y,color)=>{for(const c of value.toUpperCase()){const rows=font[c];if(rows)rows.forEach((row,py)=>[...row].forEach((bit,px)=>{if(bit==='1')fill(x+px*2,y+py*2,2,2,color);})); x+=12;}};
 if(screen.windows){
  fill(28,35,264,163,0xe1e1db);fill(28,35,264,19,0x343b3d);text('SUN WORKSTATION',38,38,0xf2f2e8);
  fill(38,69,244,111,0xffffff);text('SUNOS',48,82,0x171d1e);text('READY.',48,110,0x171d1e);text('>',48,138,0x171d1e);
 } else {screen.lines.forEach((line,i)=>text(line,22,40+i*22,screen.foreground));fill(22+(screen.cursor?.column??0)*12,40+(screen.cursor?.row??3)*22,10,14,screen.cursor?.color??screen.foreground);}
 const rows=Buffer.alloc((width*4+1)*height); for(let y=0;y<height;y++)pixels.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(rows)),pngChunk('IEND',Buffer.alloc(0))]);
}

// Hand-pack standard GLB, sharing unit geometry/material assets between objects.
// Shape dimensions match PortalInterior.shapeGeometry exactly (not editor defaults).
function packGeometry(geometry, name, material, screen) {
 const chunks=[],views=[],accessors=[];let length=0;
 const append=bytes=>{const offset=length;chunks.push(bytes);length+=bytes.length;const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});return views.length-1;};
 const attrs={};
 for(const [gltf,key] of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]) {
  const attr=geometry.getAttribute(key);if(!attr)continue;
  const values=new Float32Array(attr.array);const view=append(Buffer.from(values.buffer));
  const accessor={bufferView:view,componentType:5126,count:attr.count,type:attr.itemSize===3?'VEC3':'VEC2'};
  if(key==='position'){geometry.computeBoundingBox();accessor.min=geometry.boundingBox.min.toArray();accessor.max=geometry.boundingBox.max.toArray();}
  attrs[gltf]=accessors.push(accessor)-1;
 }
 const indices=new Uint32Array(geometry.index.array);const indexView=append(Buffer.from(indices.buffer));const index=accessors.push({bufferView:indexView,componentType:5125,count:indices.length,type:'SCALAR'})-1;
 const pbr={baseColorFactor:[...linear(material.color),material.opacity??1],roughnessFactor:material.roughness,metallicFactor:material.metalness};
 const mat={name,pbrMetallicRoughness:pbr,emissiveFactor:linear(material.emissive??0)};
 if(material.transparent){mat.alphaMode='BLEND';mat.doubleSided=true;}
 const json={asset:{version:'2.0',generator:'ElseMesh Worlds recipe preparation',copyright:'Copyright (c) 2026 DRG Software Solutions LLC; MIT'},buffers:[{byteLength:0}],bufferViews:views,accessors,materials:[mat],meshes:[{name,primitives:[{attributes:attrs,indices:index,material:0}]}],nodes:[{mesh:0,name}],scenes:[{nodes:[0]}],scene:0};
 if(screen){
  const imageView=append(screenPng(screen));json.images=[{bufferView:imageView,mimeType:'image/png'}];json.samplers=[{magFilter:9728,minFilter:9728,wrapS:33071,wrapT:33071}];json.textures=[{sampler:0,source:0}];pbr.baseColorFactor=[1,1,1,1];pbr.baseColorTexture={index:0};mat.emissiveFactor=[0.25,0.25,0.25];mat.emissiveTexture={index:0};
 }
 json.buffers[0].byteLength=length;
 const raw=Buffer.from(JSON.stringify(json));const jsonBytes=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),bin=Buffer.concat(chunks);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonBytes.length+bin.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);
 const bytes=Buffer.concat([header,jsonBytes,binHeader,bin]);
 return {bytes,bounds:{min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()}};
}
const assets=[],assetByKey=new Map();
const objects=recipe.objects.map((object,index)=>{
 const screen=recipe.screens.find(screen=>screen.object===object.name);
 const key=screen?`screen-${screen.id}`:`${object.shape}-${object.material}`;
 let asset=assetByKey.get(key);
 if(!asset){
  let geometry;
  if(object.shape==='box') geometry=new BoxGeometry(1,1,1);
  else if(object.shape==='sphere') geometry=new SphereGeometry(.5,16,10);
  else if(object.shape==='cylinder') geometry=new CylinderGeometry(.5,.5,1,16);
  else if(object.shape==='torus') geometry=new TorusGeometry(object.size[0]*.5,object.size[1]*.5,12,24);
  else throw new Error(`Unsupported recipe shape: ${object.shape}`);
  const material=recipe.materials[object.material],packed=packGeometry(geometry,key,material,screen);
  asset={id:`warehouse:${key}`,name:`Warehouse ${key}`,mediaType:'model/gltf-binary',dataUrl:`data:application/octet-stream;base64,${packed.bytes.toString('base64')}`,bytes:packed.bytes.length,source:`ElseMesh PortalInteriorRecipe.js @ ${sourceSha}; recipe SHA256 ${recipeSha256}`,license:'MIT; Copyright (c) 2026 DRG Software Solutions LLC',prepared:true,bounds:packed.bounds,materialCount:1,materialSlots:[{index:0,name:screen?`${screen.id} static screen`:object.material,color:screen?'#ffffff':hex(material.color),roughness:material.roughness,metalness:material.metalness}]};
  assets.push(asset);assetByKey.set(key,asset);geometry.dispose();
 }
 return {id:`warehouse:object:${index.toString().padStart(4,'0')}`,name:object.name,kind:'glb',assetId:asset.id,position:object.position,rotation:object.rotation,scale:object.shape==='torus'?[1,1,1]:object.shape==='cylinder'?[object.size[0],object.size[1],object.size[0]]:object.size,color:hex(recipe.materials[object.material].color),visible:object.name!=='weathered roof'&&!object.name.endsWith(' keyboard legends'),collision:object.walkable?'walkable':object.collider?'solid':'none'};
});
const project={schema:'elsemesh.worlds.project/1',metadata:{name:'Warehouse · portal and computer room',description:'Editable ElseMesh warehouse recipe: shell, portal ring, mezzanine, stairs, lounge, kitchen, three period computers and furnishings. Select individual components to move, scale, rotate, hide or edit their material. Static screen previews; game computer input, portal travel, local lights and procedural surface shaders are not included. MIT / DRG Software Solutions LLC. Source '+sourceSha,worldId:'elsemesh.world:warehouse-portal-interior',regionId:'elsemesh.region:warehouse-portal-interior'},terrain:{width:64,depth:64,resolution:9,seed:2049,heights:Array(81).fill(-.32),materials:Array(81).fill(3)},objects,features:[],spawn:{position:[0,0,0],yaw:0},environment:{sunAzimuth:2.2,sunElevation:.8,fog:0,skyColor:'#abbec9',timeOfDay:12,cloudCoverage:.25,mistDensity:0,weather:'clear'},assets};
const data=JSON.stringify(project);
if(objects.length>2000||assets.length>128||assets.reduce((sum,a)=>sum+a.bytes,0)>15*1024*1024||Buffer.byteLength(data)>25*1024*1024)throw new Error('Prepared world exceeds editor admission budgets.');
await writeFile(resolve(output,'warehouse.emw'),data+'\n');
await writeFile(resolve(output,'LICENSE'),await readFile(resolve(source,'LICENSE')));
await writeFile(resolve(output,'provenance.json'),JSON.stringify({source:'ElseMesh / src/world/PortalInteriorRecipe.js',sourceSha,recipeSha256,objects:objects.length,assets:assets.length,assetBytes:assets.reduce((sum,a)=>sum+a.bytes,0),projectBytes:Buffer.byteLength(data)+1,recipeScreens:recipe.screens,recipeZones:recipe.zones,omittedRuntimeLights:recipe.lights,limitations:['Static screen artwork is an original approximation of recipe labels, not the runtime canvas output.','No C64 emulation, computer input, portal travel, game navigation logic or runtime local lights.','PBR base colors, opacity, roughness, metalness and emissive colors retained; procedural patterns and warehouse image textures omitted.','Every source component remains a separately editable scene object; repeated shapes share embedded asset definitions.']},null,2)+'\n');
console.log(`Prepared ${objects.length} editable components, ${assets.length} shared assets, ${(Buffer.byteLength(data)/1024/1024).toFixed(2)} MiB project.`);

// Reusable prefabs retain one named child node per recipe component, plus
// distinct source material slots. They intentionally exclude room furnishings.
const prefabOutput=resolve(root,'public/assets/elsemesh/warehouse');
await mkdir(prefabOutput,{recursive:true});
const firstChair=recipe.objects.findIndex(object=>object.name==='dining chair seat');
const firstPlant=recipe.objects.findIndex(object=>object.name==='tall black houseplant pot');
const computerMembers=id=>objects.filter(object=>{
 const name=object.name.toLowerCase();
 return name!==`${id} keyboard legends` && (new RegExp(`^${id} (crt |monitor |computer base|keyboard |key |space key|left shift key|return key|function key|base vent slit|coiled monitor cable|screen$)`).test(name)
  || (id==='sun'&&['sun mouse','sun purple accent'].includes(name)));
});
const prefabs=[
 {id:'dining-chair',name:'Dining chair',members:objects.slice(firstChair,firstChair+6),expected:6},
 {id:'potted-plant',name:'Potted plant',members:objects.slice(firstPlant,firstPlant+10),expected:10},
 ...[['c64-computer','C64 computer','c64',84],['bbc-computer','BBC computer','bbc',84],['sun-workstation','Sun workstation','sun',89]].map(([id,name,computer,expected])=>({id,name,members:computerMembers(computer),expected})),
];
const prefabManifest=[];
for(const prefab of prefabs){
 if(prefab.members.length!==prefab.expected)throw new Error(`${prefab.id}: expected ${prefab.expected} source components, found ${prefab.members.length}; review changed recipe membership before preparing assets.`);
 if(prefab.id==='dining-chair'&&prefab.members.map(member=>member.name).join('|')!=='dining chair seat|dining chair back|chair leg|chair leg|chair leg|chair leg')throw new Error('Dining chair source component membership changed.');
 if(prefab.id==='potted-plant'&&(prefab.members[0].name!=='tall black houseplant pot'||prefab.members.slice(1).some(member=>member.name!=='broad houseplant leaf')))throw new Error('Potted plant source component membership changed.');
}
for(const prefab of prefabs){
 const binParts=[],json={asset:{version:'2.0',generator:'ElseMesh Worlds recipe prefab preparation',copyright:'Copyright (c) 2026 DRG Software Solutions LLC; MIT'},buffers:[{byteLength:0}],bufferViews:[],accessors:[],materials:[],meshes:[],nodes:[{name:prefab.name,children:[]}],scenes:[{nodes:[0]}],scene:0};
 const meshByAsset=new Map(),materialByName=new Map();let binLength=0;
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 const vertex=new Vector3();
 const sourceNodes=[];
 for(const member of prefab.members){
  const asset=assets.find(asset=>asset.id===member.assetId);
  let meshIndex=meshByAsset.get(asset.id);
  const bytes=Buffer.from(asset.dataUrl.split(',')[1],'base64'),jsonLength=bytes.readUInt32LE(12),src=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),bin=bytes.subarray(28+jsonLength);
  if(meshIndex===undefined){
   const viewOffset=json.bufferViews.length,accessorOffset=json.accessors.length;
   json.bufferViews.push(...src.bufferViews.map(view=>({...view,byteOffset:(view.byteOffset??0)+binLength})));
   json.accessors.push(...src.accessors.map(accessor=>({...accessor,bufferView:accessor.bufferView+viewOffset})));
   const name=src.materials[0].name.replace(/^(box|sphere|cylinder|torus)-/,'');let materialIndex=materialByName.get(name);
   if(materialIndex===undefined){
    const material={...structuredClone(src.materials[0]),name};
    if(src.images){
     json.images??=[];json.textures??=[];json.samplers??=[];
     const imageOffset=json.images.length,textureOffset=json.textures.length,samplerOffset=json.samplers.length;
     json.images.push(...src.images.map(image=>({...image,bufferView:image.bufferView+viewOffset})));
     json.samplers.push(...src.samplers);json.textures.push(...src.textures.map(texture=>({...texture,source:texture.source+imageOffset,sampler:texture.sampler+samplerOffset})));
     material.pbrMetallicRoughness.baseColorTexture.index+=textureOffset;material.emissiveTexture.index+=textureOffset;
    }
    materialIndex=json.materials.push(material)-1;materialByName.set(name,materialIndex);
   }
   meshIndex=json.meshes.push({name,primitives:src.meshes[0].primitives.map(primitive=>({...primitive,attributes:Object.fromEntries(Object.entries(primitive.attributes).map(([semantic,index])=>[semantic,index+accessorOffset])),indices:primitive.indices+accessorOffset,material:materialIndex}))})-1;
   meshByAsset.set(asset.id,meshIndex);binParts.push(bin);binLength+=bin.length;
  }
  const rotation=new Quaternion().setFromEuler(new Euler(...member.rotation)),matrix=new Matrix4().compose(new Vector3(...member.position),rotation,new Vector3(...member.scale));
  const position=src.accessors[src.meshes[0].primitives[0].attributes.POSITION],view=src.bufferViews[position.bufferView];
  for(let i=0;i<position.count;i++){
   const offset=(view.byteOffset??0)+(position.byteOffset??0)+i*12;
   vertex.set(bin.readFloatLE(offset),bin.readFloatLE(offset+4),bin.readFloatLE(offset+8)).applyMatrix4(matrix);
   vertex.toArray().forEach((value,axis)=>{min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);});
  }
  sourceNodes.push({mesh:meshIndex,name:member.name,translation:[...member.position],rotation:rotation.toArray(),scale:member.scale});
 }
 const pivot=[(min[0]+max[0])/2,min[1],(min[2]+max[2])/2];
 for(const node of sourceNodes){node.translation=node.translation.map((value,axis)=>value-pivot[axis]);json.nodes[0].children.push(json.nodes.length);json.nodes.push(node);}
 json.buffers[0].byteLength=binLength;
 const raw=Buffer.from(JSON.stringify(json)),jsonBytes=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),binary=Buffer.concat(binParts),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonBytes.length+binary.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
 const packed=Buffer.concat([header,jsonBytes,binHeader,binary]);if(packed.length>15*1024*1024)throw new Error(`${prefab.id} exceeds asset byte budget.`);
 await writeFile(resolve(prefabOutput,`${prefab.id}.glb`),packed);
 prefabManifest.push({id:prefab.id,name:prefab.name,bytes:packed.length,components:prefab.members.length,materials:json.materials.length,pivot:'bottom centre of exact transformed source geometry',sourcePivot:pivot,members:prefab.members.map(member=>({id:member.id,name:member.name}))});
}
await writeFile(resolve(prefabOutput,'LICENSE'),await readFile(resolve(source,'LICENSE')));
await writeFile(resolve(prefabOutput,'provenance.json'),JSON.stringify({source:'ElseMesh / src/world/PortalInteriorRecipe.js',sourceSha,recipeSha256,license:'MIT; Copyright (c) 2026 DRG Software Solutions LLC',prefabs:prefabManifest,scope:'Computers contain case, screen, keyboard, individual keys, vents, cable, and Sun mouse/accent. Desks, desk-mounted nameplates, runtime keyboard-legend overlays, chairs, lamps and clutter excluded. Static artwork and PBR fidelity limits match warehouse world.'},null,2)+'\n');
console.log(`Prepared ${prefabManifest.map(prefab=>`${prefab.name} (${prefab.components} components, ${prefab.materials} materials)`).join(', ')}.`);
