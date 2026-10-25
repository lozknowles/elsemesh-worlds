import * as T from 'three';
import {evaluateAmbientBehaviour} from '../domain/ambient-behaviour.ts';
import {sampleTerrain} from '../domain/world.ts';

/** Editor native-preview adapter. Authored matrices remain immutable. */
export function createNativeAmbientObjects(project){
 const entries=[],delta=new T.Matrix4(),result=new T.Matrix4();
 return {
  add(item,object,worldMatrix){
   if(!object.ambientBehaviour)return;
   const base=worldMatrix.clone(),e=base.elements;
   item.matrixAutoUpdate=false;
   entries.push({item,behaviour:object.ambientBehaviour,base,anchor:[e[12],e[13],e[14]],yaw:Math.atan2(e[8],e[10])});
  },
  update(time){
   for(const entry of entries){
    const pose=evaluateAmbientBehaviour(entry.behaviour,entry.anchor,entry.yaw,time,{
     groundHeight:(x,z)=>sampleTerrain(project.terrain,x,z),
     waterLevel:project.water?.level??project.nativeIsland?.sea?.level,bounds:project.terrain,
    });
    const angle=pose.yaw-entry.yaw,c=Math.cos(angle),s=Math.sin(angle),a=entry.anchor,p=pose.position;
    delta.set(c,0,s,p[0]-c*a[0]-s*a[2],0,1,0,p[1]-a[1],-s,0,c,p[2]+s*a[0]-c*a[2],0,0,0,1);
    result.multiplyMatrices(delta,entry.base);
    entry.item.matrix.fromArray(result.elements);
    entry.item.matrixWorldNeedsUpdate=true;
   }
  },
  get objectCount(){return entries.length;},
  poses(){return entries.map(e=>({kind:e.behaviour.kind,position:e.item.matrix.elements.slice(12,15)}));},
 };
}
