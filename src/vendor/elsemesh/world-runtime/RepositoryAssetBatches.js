import * as N from '../engine/index.js';
import { inspectAndLoadAsset,disposeAssetScene } from './vendor/world-engine-contract.js';
import { buildNativeAsset } from './NativeAssets.js';
import { repositoryRetroScreen } from './RepositoryRetro.js';
/** Share admitted geometry/materials per asset and override, preserving every authored transform and ID. */
export async function buildRepositoryAssetBatches(project,objects,matrices,convertGeometry){
 const root=new N.Group(),diagnostics=[],loadedAssets=new Map(),groups=new Map();
 const screens=new Map((project.terminals??[]).filter(t=>t.screenObjectId).map(t=>[t.screenObjectId,t.kind]));
 for(const object of objects){const kind=screens.get(object.id);const key=object.assetId+JSON.stringify(object.materialOverrides??[])+(kind??'')+(object.landscapeChunk??'');let group=groups.get(key);if(!group){group={objects:[],kind};groups.set(key,group);}group.objects.push(object);}
 try{
  for(const {objects:items,kind} of groups.values()){
   const first=items[0],asset=project.assets.find(a=>a.id===first.assetId);if(!asset)throw Error('Missing asset '+first.assetId);
   let loaded=loadedAssets.get(asset.id);if(!loaded){const response=await fetch(asset.dataUrl);if(!response.ok)throw Error('Asset read failed');loaded=await inspectAndLoadAsset(await response.arrayBuffer());loadedAssets.set(asset.id,loaded);}
   const converted=buildNativeAsset(loaded,first,convertGeometry),container=new N.Group();container.userData.disposeAssetTextures=converted.group.userData.disposeAssetTextures;root.add(container);
   let retro;
   if(kind){retro=repositoryRetroScreen(kind);container.userData.disposeAssetTextures=()=>{converted.group.userData.disposeAssetTextures?.();for(const binding of Object.values(retro.bindings)){const texture=binding?.texture;if(texture?.destroy)texture.destroy();}};}
   const oldMaterials=new Set();
   converted.group.traverse(part=>{if(!part.isMesh)return;const material=retro??part.material;if(retro)oldMaterials.add(part.material);
    const instance=new N.InstancedMesh(part.geometry,material,items.length);instance.castShadow=!kind;instance.receiveShadow=true;instance.userData.editorObjectIds=items.map(o=>o.id);
    for(let i=0;i<items.length;i++){instance.setMatrixAt(i,new N.Matrix4().fromArray(matrices.get(items[i].id).elements));if(items[i].landscapeTint)instance.setColorAt(i,new N.Color().fromArray(items[i].landscapeTint));}instance.instanceMatrix.needsUpdate=true;if(instance.instanceColor)instance.instanceColor.needsUpdate=true;
    if(material.transparent)instance.layers.set(2);container.add(instance);
   });for(const material of oldMaterials)material.dispose();
   for(const object of items)diagnostics.push({objectId:object.id,primitives:converted.diagnostics.primitives,warnings:converted.diagnostics.warnings});
  }
  root.userData.assetBatchCount=groups.size;return {root,diagnostics};
 }catch(error){root.traverse(n=>{n.geometry?.dispose();n.material?.dispose();n.userData.disposeAssetTextures?.();});throw error;}
 finally{for(const loaded of loadedAssets.values())disposeAssetScene(loaded.scene);}
}
