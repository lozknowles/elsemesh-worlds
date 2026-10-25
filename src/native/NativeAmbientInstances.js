import * as T from 'three';
import {evaluateAmbientBehaviour} from '../domain/ambient-behaviour.ts';
import {sampleTerrain} from '../domain/world.ts';

/** Editor adapter for the engine's instanced native-island asset batches. */
export function createNativeAmbientInstances(project,root,matrices,terrain=project.terrain){
 const byId=new Map(project.objects.filter(o=>o.ambientBehaviour).map(o=>[o.id,o]));
 const entries=new Map(),batches=new Set(),delta=new T.Matrix4(),result=new T.Matrix4();
 root.traverse(mesh=>{
  const ids=mesh.userData.editorObjectIds;
  if(!Array.isArray(ids)||typeof mesh.setMatrixAt!=='function')return;
  let moving=false;
  for(let index=0;index<ids.length;index++){
   const object=byId.get(ids[index]);if(!object)continue;
   let entry=entries.get(object.id);
   if(!entry){const base=matrices.get(object.id)?.clone();if(!base)continue;const e=base.elements;entry={behaviour:object.ambientBehaviour,base,anchor:[e[12],e[13],e[14]],yaw:Math.atan2(e[8],e[10]),bindings:[]};entries.set(object.id,entry);}
   entry.bindings.push({mesh,index});moving=true;
  }
  if(moving){mesh.frustumCulled=false;batches.add(mesh);}
 });
 return {
  update(time){
   for(const entry of entries.values()){
    const pose=evaluateAmbientBehaviour(entry.behaviour,entry.anchor,entry.yaw,time,{groundHeight:(x,z)=>typeof terrain.heightAt==='function'?terrain.heightAt(x,z):sampleTerrain(project.terrain,x,z),waterLevel:project.water?.level??project.nativeIsland?.sea?.level,bounds:project.terrain});
    const angle=pose.yaw-entry.yaw,c=Math.cos(angle),s=Math.sin(angle),a=entry.anchor,p=pose.position;
    delta.set(c,0,s,p[0]-c*a[0]-s*a[2],0,1,0,p[1]-a[1],-s,0,c,p[2]+s*a[0]-c*a[2],0,0,0,1);
    result.multiplyMatrices(delta,entry.base);
    for(const {mesh,index} of entry.bindings)mesh.setMatrixAt(index,result);
   }
   for(const mesh of batches)mesh.instanceMatrix.needsUpdate=true;
  },
  get objectCount(){return entries.size;}
 };
}
