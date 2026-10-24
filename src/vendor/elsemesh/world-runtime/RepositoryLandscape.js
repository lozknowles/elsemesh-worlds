import * as N from '../engine/index.js';
import {Material} from '../engine/render/Material.js';
import {T,generateLandscapeInstances,createLandscapeCollisionIndex,landscapeChunks,sceneryParts,landscapeWaterGeometry,updateLandscapeWater,bakeLandscapeAtlas,threeAtlas,installLandscapeShader,landscapePartTint} from './vendor/world-engine-contract.js';
export function landscapeAssets(project){return generateLandscapeInstances(project).filter(i=>i.assetRef).map(i=>({...i,kind:'glb',assetId:i.assetRef,visible:true,collision:'none',landscapeTint:landscapePartTint(i).toArray(),landscapeChunk:Math.floor(i.position[0]/64)+':'+Math.floor(i.position[2]/64)}));}
export function addLandscapeCollisions(project,colliders){
 const index=createLandscapeCollisionIndex(project);
 for(const shape of index.shapes){if(shape.kind==='cylinder')colliders.addCylinder(shape.center[0],shape.center[2],shape.radius,shape.min[1],shape.max[1],{tag:shape.id});else colliders.addBox(new N.Vector3(...shape.center),new N.Vector3(...shape.max.map((v,i)=>(v-shape.min[i])/2)),0,{solid:true,walkable:false,tag:shape.id});}
 return index;
}
export async function installRepositoryLandscapeMaterial(project,material){
 const atlas=await bakeLandscapeAtlas(project);if(!atlas)return;const textures=threeAtlas(atlas),previous=material.onBeforeCompile;
 material.onBeforeCompile=shader=>{previous?.(shader);installLandscapeShader(shader,textures,atlas,project);};
 const oldKey=material.customProgramCacheKey?.bind(material);material.customProgramCacheKey=()=>String(oldKey?.()??'')+':landscape/1';
 material.addEventListener('dispose',()=>textures.dispose());
}
/** Canonical chunks and shared geometry variants are supplied by the builder contract. */
export function buildRepositoryLandscape(project,{native=false,convertGeometry}={}){
 const E=native?N:T,root=new E.Group();let count=0,batches=0;const variants=new Map();
 for(const source of landscapeChunks(project).values()){
  const items=source.filter(i=>!i.assetRef);if(!items.length)continue;const first=items[0];count+=items.length;
  const variantKey=[first.kind,first.treeSpecies,first.seed%4].join('/');
  if(!variants.has(variantKey))variants.set(variantKey,sceneryParts(first.kind,first.treeSpecies,first.seed%4).map(part=>{const geometry=native?convertGeometry(part.geometry):part.geometry;if(native)part.geometry.dispose();const material=native?new Material({name:'landscape-'+first.kind,color:part.color,roughness:.9,side:'double'}):new T.MeshStandardMaterial({color:part.color,roughness:.9,side:T.DoubleSide});return {geometry,material,semantic:part.semantic};}));
  for(const {geometry,material,semantic} of variants.get(variantKey)){
   const mesh=new E.InstancedMesh(geometry,material,items.length),matrix=new E.Matrix4(),q=new E.Quaternion(),scale=new E.Vector3();
   items.forEach((item,i)=>{q.setFromEuler(new E.Euler(...item.rotation));matrix.compose(new E.Vector3(...item.position),q,scale.fromArray(item.scale));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new E.Color().copy(landscapePartTint(item,semantic)));});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=first.kind!=='grass';mesh.userData.landscapeInstanceIds=items.map(i=>i.id);root.add(mesh);batches++;
  }
 }
 const source=landscapeWaterGeometry(project),geometry=native?convertGeometry(source):source;
 if(source.getAttribute('position').count){geometry.computeBoundingSphere();if(geometry.boundingSphere)geometry.boundingSphere.radius+=Math.max(0,...(project.landscape?.layers??[]).map(l=>l.water?.waveAmplitude??0));const material=native?new Material({name:'landscape-water',color:'#4f9fba',roughness:.23,metalness:.25,transparent:true,opacity:.72,side:'double'}):new T.MeshStandardMaterial({color:'#4f9fba',roughness:.23,metalness:.25,transparent:true,opacity:.72,side:T.DoubleSide});const water=new E.Mesh(geometry,material);if(native)water.layers.set(2);root.add(water);}
 else {geometry.dispose();}
 root.userData.updateLandscape=time=>{if(!source.getAttribute('position').count)return;updateLandscapeWater(project,source,time);if(native){geometry.getAttribute('position').array.set(source.getAttribute('position').array);geometry.getAttribute('position').needsUpdate=true;}};
 root.userData.disposeLandscape=()=>{if(native)source.dispose();};root.userData.landscapeStats={instances:count,batches};return root;
}
