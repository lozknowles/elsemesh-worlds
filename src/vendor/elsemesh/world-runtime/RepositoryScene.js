import {buildMediaScreenHousing} from './MediaScreen.js';
import {buildNativeIsland} from './NativeIsland.js';
import {buildRepositoryTraffic} from './RepositoryTraffic.js';
import {buildRepositoryLandscape,addLandscapeCollisions,landscapeAssets} from './RepositoryLandscape.js';
import * as N from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { Colliders } from '../world/Colliders.js';
import { T, resolveWorldMatrices, effectiveObjectState, buildComputerGeometry, disposeComputerGeometry, inspectAndLoadAsset, disposeAssetScene } from './vendor/world-engine-contract.js';
import { buildRepositoryAssetBatches } from './RepositoryAssetBatches.js';
import { repositoryWaterQuery,buildRepositoryWater } from './RepositoryWater.js';
import { buildNativeNeon } from './NativeNeon.js';
import { buildNativeFeatures } from './NativeFeatures.js';
import { buildNativeForest } from './NativeForest.js';
import { createNativeTerrainMaterial } from './NativeTerrain.js';

export function nativeGeometry(geometry) {
 const result=new N.BufferGeometry();
 for(const name of ['position','normal','uv','color']) {
  const a=geometry.getAttribute(name);if(!a)continue;
  const data=new Float32Array(a.count*a.itemSize);
  for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)data[i*a.itemSize+c]=a.getComponent(i,c);
  result.setAttribute(name,new N.BufferAttribute(data,a.itemSize));
 }
 if(geometry.index)result.setIndex(Array.from(geometry.index.array));
 if(!result.getAttribute('normal'))result.computeVertexNormals();return result;
}
export function disposeRepositoryScene(candidate) {
 if(!candidate)return;
 candidate.nativeIsland?.dispose();
 candidate.root.removeFromParent();const materials=new Set(),geometries=new Set();
 candidate.root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)materials.add(n.material);n.userData.disposeAssetTextures?.();n.userData.disposeTerrainImagery?.();n.userData.disposeLandscape?.();});
 for(const g of geometries)g.dispose();
 for(const m of materials)if(!m.userData.sharedBuilderTreeMaterial)m.dispose();
}
export async function buildRepositoryScene(descriptor,camera,options={}) {
 const project=descriptor.project, root=new N.Group(),candidate={root,descriptor,terrain:descriptor.terrain,colliders:new Colliders(),assets:[],query:repositoryWaterQuery(project.water,project)};
 root.name='repository-world:'+descriptor.worldId;
 try {
  for(const b of descriptor.boxes)candidate.colliders.addBox(new N.Vector3(...b.center),new N.Vector3(...b.half),0,{walkable:b.walkable,solid:b.solid,tag:b.id});
  if(project.nativeIsland){candidate.nativeIsland=await buildNativeIsland({project,root,camera,options:options.nativeIsland??{}});candidate.terrain=candidate.nativeIsland.data;candidate.query=candidate.nativeIsland.query;}
  else {
  const {width,depth,resolution,heights,materials}=project.terrain,positions=[],colors=[],indices=[],palette=[[.38,.49,.32],[.54,.39,.27],[.48,.5,.48],[.7,.63,.43]];
  for(let z=0;z<resolution;z++)for(let x=0;x<resolution;x++){
   const i=z*resolution+x,h=heights[i];positions.push(x*width/(resolution-1)-width/2,h,z*depth/(resolution-1)-depth/2);
   colors.push(...palette[materials[i]].map(v=>v*Math.max(.68,Math.min(1.22,.88+h/55))));
   if(x<resolution-1&&z<resolution-1)indices.push(i,i+resolution,i+1,i+1,i+resolution,i+resolution+1);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const surface=await createNativeTerrainMaterial(project),terrainMesh=new N.Mesh(nativeGeometry(geometry),surface.material);geometry.dispose();terrainMesh.userData.disposeTerrainImagery=surface.dispose;root.add(terrainMesh);
  }
  const generatedAssets=landscapeAssets(project),allObjects=[...project.objects,...generatedAssets],matrices=resolveWorldMatrices(allObjects);
  const add=(item,geometry,color)=>{item.add(new N.Mesh(nativeGeometry(geometry),new Material({color,roughness:.85,side:'double'})));geometry.dispose();};
  for(const object of project.objects){
   if(object.collisionOnly||['group','tree','glb'].includes(object.kind)||!effectiveObjectState(project.objects,object.id).visible)continue;
   const item=new N.Group();item.userData.editorObjectId=object.id;item.matrixAutoUpdate=false;item.matrix.fromArray(matrices.get(object.id).elements);root.add(item);
   if(object.kind==='media-screen'){item.add(buildMediaScreenHousing(object.mediaScreen,{api:N,material:props=>new Material(props)}));}
   else if(object.kind==='computer'){
    const computer=buildComputerGeometry();
    try{for(const part of computer.parts){const color=part.emissive?object.computer.screenColor:part.color;item.add(new N.Mesh(nativeGeometry(part.geometry),new Material({color,emissive:part.emissive?color:'#000000',roughness:.45,side:'double'})));}}finally{disposeComputerGeometry(computer);}
   }else if(object.kind==='neon-sign'){
    const neon=buildNativeNeon(object.neon,nativeGeometry);neon.userData.neonObjectId=object.id;item.add(neon);
   }else if(object.kind==='building'){
    add(item,new T.BoxGeometry(3.6,2.2,3).translate(0,1.1,0),object.color);add(item,new T.ConeGeometry(2.7,1.1,4).rotateY(Math.PI/4).translate(0,2.55,0),'#574e42');
   }else add(item,object.kind==='sphere'?new T.SphereGeometry(.8,24,16):object.kind==='cylinder'?new T.CylinderGeometry(.65,.65,1.6,24):object.kind==='cone'?new T.ConeGeometry(.8,1.6,24):new T.BoxGeometry(1.6,1.6,1.6),object.color);
  }
  const assets=await buildRepositoryAssetBatches(project,allObjects.filter(o=>o.kind==='glb'&&effectiveObjectState(allObjects,o.id).visible),matrices,nativeGeometry);root.add(assets.root);candidate.assets=assets.diagnostics;candidate.assetBatchCount=assets.root.userData.assetBatchCount;
  const water=project.nativeIsland?null:buildRepositoryWater(project);if(water)root.add(water);
  if(!project.nativeIsland){candidate.forest=buildNativeForest(project.objects,camera.position);root.add(candidate.forest);}root.add(buildNativeFeatures(project,nativeGeometry));
  const landscape=buildRepositoryLandscape(project,{native:true,convertGeometry:nativeGeometry});root.add(landscape);candidate.landscape=landscape;candidate.landscapeCollisions=addLandscapeCollisions(project,candidate.colliders);const setTime=candidate.query.setTime.bind(candidate.query);candidate.query.setTime=t=>{setTime(t);landscape.userData.updateLandscape(t);};
  candidate.traffic=await buildRepositoryTraffic(project,candidate,{native:true,convertGeometry:nativeGeometry});
  candidate.matrices=matrices;return candidate;
 }catch(error){disposeRepositoryScene(candidate);throw error;}
}
