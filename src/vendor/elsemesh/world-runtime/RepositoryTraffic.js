import * as N from '../engine/index.js';
import {T,inspectAndLoadAsset,disposeAssetScene} from './vendor/world-engine-contract.js';
import {PortTraffic} from '../world/PortTraffic.js';
import {createPortRoadGraph} from '../world/PortRoadGraph.js';
import {assetPrimitiveGroups,buildNativeAsset} from './NativeAssets.js';

/** Trusted local visual simulation. Config/assets have passed repository admission. */
export async function buildRepositoryTraffic(project,candidate,{native=false,convertGeometry}={}){
 if(!project.traffic)return null;
 const config=project.traffic,traffic=new PortTraffic(config.count,createPortRoadGraph(config),config.seed);
 const Root=native?N.Group:T.Group,root=new Root();root.name='repository-local-traffic';candidate.root.add(root);
 const loaded=new Map(),vehicles=[];
 try{
  for(const car of traffic.cars){
   const assetId=config.vehicleAssetIds[car.kind];let source=loaded.get(assetId);
   if(!source){
    const asset=project.assets.find(a=>a.id===assetId);if(!asset)throw Error('Traffic asset missing');
    const response=await fetch(asset.dataUrl);if(!response.ok)throw Error('Traffic asset read failed');
    source=await inspectAndLoadAsset(await response.arrayBuffer());loaded.set(assetId,source);
    if(!native)candidate.loadedAssets.add(source);
    source.scene.updateMatrixWorld(true);
    source.scene.traverse(child=>{if(child.isSkinnedMesh||child.morphTargetInfluences?.length)throw Error('Traffic requires static GLB meshes.');});
   }
   const vehicle=new Root();vehicle.name='local-traffic:'+car.id;vehicle.userData.localTrafficId=car.id;root.add(vehicle);
   if(native)vehicle.add(buildNativeAsset(source,{},convertGeometry).group);
   else{
    const materials=new Map();
    source.scene.traverse(child=>{
     if(!child.isMesh||!child.visible)return;
     for(const part of assetPrimitiveGroups(child)){
      let material=materials.get(part.material);if(!material){material=part.material.clone();materials.set(part.material,material);}
      vehicle.add(new T.Mesh(part.geometry,material));
     }
    });
   }
   vehicles.push({car,vehicle});
  }
  const sync=()=>{for(const {car,vehicle}of vehicles){vehicle.position.set(car.pose.x,car.pose.y,car.pose.z);vehicle.rotation.y=car.pose.yaw;}};
  sync();
  return {root,cars:traffic.cars,update(dt,obstacle){traffic.update(dt,obstacle);sync();},scope:'local-visual'};
 }finally{if(native)for(const source of loaded.values())disposeAssetScene(source.scene);}
}
