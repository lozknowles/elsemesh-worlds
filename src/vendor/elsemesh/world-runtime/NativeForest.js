import { BufferGeometry, BufferAttribute, Group, Mesh, Color, Matrix4, Matrix3, Vector3, CylinderGeometry, SphereGeometry, ConeGeometry } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { resolveWorldMatrices, effectiveObjectState } from './vendor/world-engine-contract.js';
import { createTreeGeometry } from './vendor/world-engine-contract.js';

// Native preview policy; saved objects retain their exact seeds and transforms.
// Reuse four crown variants per species and build detailed geometry only for the
// closest sixteen trees. Other source trees remain visible as cheap silhouettes.
export const TREE_PREVIEW_POLICY=Object.freeze({maxHighDetailTrees:16,highDetailDistance:200,detailExitDistance:230,variantsPerSpecies:4,maxTrees:2000,lodCheckSeconds:.75,lodMovementMetres:12});
const templates=new Map();
let sharedMaterials;
const wind=/* wgsl */`
  let bend=pow(max(0.0,v.treeLocal.y/7.0),2.0);
  let gust=sin(frame.time*0.85+v.treePhase)*0.11+sin(frame.time*1.67+v.treePhase)*0.035;
  let flutter=sin(frame.time*2.3+v.treeLocal.x*2.1+v.treeLocal.z*1.7+v.treePhase)*0.018*bend;
  let dx=(gust*bend+flutter)*v.treeFactor;
  let dz=(cos(frame.time*0.69+v.treePhase)*0.045*bend+flutter*0.5)*v.treeFactor;
  v.position+=v.treeWindX*dx+v.treeWindZ*dz;
`;
function materials() {
  if(!sharedMaterials)sharedMaterials=['bark','foliage'].map(kind=>new Material({name:`builder-batched-tree-${kind}`,color:'#ffffff',roughness:kind==='bark'?.94:.78,side:'double',vertexColors:true,userData:{sharedBuilderTreeMaterial:true},attributes:{treeLocal:'vec3f',treePhase:'f32',treeFactor:'f32',treeWindX:'vec3f',treeWindZ:'vec3f'},vertex:wind}));
  return sharedMaterials;
}
function templateData(geometry) {
  if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
  const data={positions:Float32Array.from(geometry.getAttribute('position').array),normals:Float32Array.from(geometry.getAttribute('normal').array),indices:Array.from(geometry.index?.array??Array.from({length:geometry.getAttribute('position').count},(_,index)=>index))};geometry.dispose();return data;
}
function highPart(data){const geo=new BufferGeometry();geo.setAttribute('position',new BufferAttribute(new Float32Array(data.positions),3));geo.setIndex(data.indices);return templateData(geo);}
function template(species,seed,detailed,exact=false) {
  const variant=(seed>>>0)%TREE_PREVIEW_POLICY.variantsPerSpecies,key=`${species}:${detailed?(exact?"exact:"+seed:variant):'low'}`;
  if(templates.has(key))return templates.get(key);
  let value;
  if(detailed){const full=createTreeGeometry(species,exact?seed:7319+variant*113);value={bark:highPart(full.bark),foliage:highPart(full.foliage)};}
  else {
    const bark=new CylinderGeometry(.12,.24,species==='palm'?5.5:4,5);bark.translate(0,species==='palm'?2.75:2,0);
    let foliage;
    if(species==='pine'){foliage=new ConeGeometry(1.4,4.8,7);foliage.translate(0,3.6,0);}
    else if(species==='palm') {
      const positions=[],indices=[];
      for(let i=0;i<8;i++){const angle=i*Math.PI/4,dx=Math.cos(angle),dz=Math.sin(angle),sx=-dz*.32,sz=dx*.32,n=positions.length/3;positions.push(0,5.5,0,dx*1.6+sx,5.35,dz*1.6+sz,dx*3,4.65,dz*3,dx*1.6-sx,5.35,dz*1.6-sz);indices.push(n,n+1,n+2,n,n+2,n+3);}
      foliage=new BufferGeometry();foliage.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));foliage.setIndex(indices);
    }else {foliage=new SphereGeometry(1,7,4);foliage.scale(1.9,1.55,1.7);foliage.translate(0,4.3,0);}
    value={bark:templateData(bark),foliage:templateData(foliage)};
  }
  templates.set(key,value);return value;
}
function detailedIds(objects,camera,previous=new Set()) {
  const candidates=objects.map(object=>({id:object.id,distance:camera.distanceTo(new Vector3(...object.position))/Math.max(1,Math.max(...object.scale))})).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
  const selected=new Set(candidates.filter(record=>previous.has(record.id)&&record.distance<TREE_PREVIEW_POLICY.detailExitDistance).slice(0,TREE_PREVIEW_POLICY.maxHighDetailTrees).map(record=>record.id));
  for(const record of candidates){if(selected.size>=TREE_PREVIEW_POLICY.maxHighDetailTrees)break;if(record.distance<TREE_PREVIEW_POLICY.highDetailDistance)selected.add(record.id);}
  return selected;
}
function geometryFor(records,kind) {
  const count=records.reduce((n,record)=>n+record.template[kind].positions.length/3,0);
  const position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3),local=new Float32Array(count*3),windX=new Float32Array(count*3),windZ=new Float32Array(count*3),phase=new Float32Array(count),factor=new Float32Array(count),indices=[];
  const p=new Vector3(),n=new Vector3();let offset=0;
  for(const record of records) {
    const data=record.template[kind],vertices=data.positions.length/3,transform=record.transform.elements;
    const tint=new Color(kind==='bark'?(record.species==='palm'?'#897156':record.object.landscapeOrigin?'#66503a':'#594633'):record.object.color);
    local.set(data.positions,offset*3);phase.fill((((record.object.treeSeed??7319)>>>0)*.013)%(Math.PI*2),offset,offset+vertices);factor.fill(record.species==='palm'?1.4:record.species==='pine'?.65:1,offset,offset+vertices);
    for(let vertex=0;vertex<vertices;vertex++) {
      const source=vertex*3,target=(offset+vertex)*3;
      p.fromArray(data.positions,source).applyMatrix4(record.transform);n.fromArray(data.normals,source).applyMatrix3(record.normal).normalize();
      position[target]=p.x;position[target+1]=p.y;position[target+2]=p.z;normal[target]=n.x;normal[target+1]=n.y;normal[target+2]=n.z;
      color[target]=tint.r;color[target+1]=tint.g;color[target+2]=tint.b;
      for(let axis=0;axis<3;axis++){windX[target+axis]=transform[axis];windZ[target+axis]=transform[8+axis];}
    }
    for(const index of data.indices)indices.push(index+offset);offset+=vertices;
  }
  const geometry=new BufferGeometry();
  for(const [name,array,size] of [['position',position,3],['normal',normal,3],['color',color,3],['treeLocal',local,3],['treeWindX',windX,3],['treeWindZ',windZ,3],['treePhase',phase,1],['treeFactor',factor,1]])geometry.setAttribute(name,new BufferAttribute(array,size));
  geometry.setIndex(indices);geometry.computeBoundingSphere();if(geometry.boundingSphere)geometry.boundingSphere.radius+=1;
  return geometry;
}
export function buildNativeForest(sourceObjects,camera) {
  const worldMatrices=resolveWorldMatrices(sourceObjects);
  const objects=sourceObjects.filter(object=>object.kind==='tree'&&effectiveObjectState(sourceObjects,object.id).visible).map(object=>({...object,position:new Vector3().setFromMatrixPosition(worldMatrices.get(object.id)).toArray(),worldMatrix:worldMatrices.get(object.id).elements})).slice(0,TREE_PREVIEW_POLICY.maxTrees),group=new Group();
  const meshes=materials().map(material=>{const mesh=new Mesh(new BufferGeometry(),material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;});
  let selected=new Set(),lastCamera=camera.clone(),lastCheck=-Infinity,stats;
  function rebuild(ids) {
    const records=objects.map(object=>{const transform=new Matrix4().fromArray(object.worldMatrix);const species=object.treeSpecies??'broadleaf';return{object,species,transform,normal:new Matrix3().getNormalMatrix(transform),template:template(species,object.treeSeed??7319,ids.has(object.id),!!object.landscapeOrigin)};});
    let vertices=0,triangles=0;
    for(const [index,kind] of ['bark','foliage'].entries()){const geometry=geometryFor(records,kind);meshes[index].geometry.dispose();meshes[index].geometry=geometry;meshes[index].visible=objects.length>0;vertices+=geometry.getAttribute('position').count;triangles+=(geometry.index?.count??0)/3;}
    selected=ids;stats={sourceTrees:sourceObjects.filter(object=>object.kind==='tree'&&effectiveObjectState(sourceObjects,object.id).visible).length,renderedTrees:objects.length,highDetailTrees:ids.size,lowDetailTrees:objects.length-ids.size,vertices,triangles,batches:objects.length?2:0,cachedTemplates:templates.size,policy:TREE_PREVIEW_POLICY};
  }
  rebuild(detailedIds(objects,camera));
  group.userData.treePreviewStats=()=>stats;
  group.userData.updateTreeLOD=(time,position)=>{
    if(time-lastCheck<TREE_PREVIEW_POLICY.lodCheckSeconds||position.distanceTo(lastCamera)<TREE_PREVIEW_POLICY.lodMovementMetres)return;
    lastCheck=time;lastCamera.copy(position);const next=detailedIds(objects,position,selected);
    if(next.size!==selected.size||[...next].some(id=>!selected.has(id)))rebuild(next);
  };
  return group;
}
