import { useContext, useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { NeonSignConfig } from '../domain/neon-sign';
import { sampleNeonEffect } from '../domain/neon-sign';
import { acquireNeonGeometry,neonGeometryKey } from '../domain/neon-geometry';
import { effectiveObjectState } from '../domain/object-hierarchy';
import type { WorldProject } from '../domain/world';

import { NeonRuntimeContext } from './NeonRuntime';
import type { NeonInteractionTarget } from './NeonRuntime';
type Built = ReturnType<typeof acquireNeonGeometry>['value'];
type Bundle = { built: Built; cores: THREE.MeshStandardMaterial[]; halos: THREE.MeshBasicMaterial[]; backing: THREE.MeshStandardMaterial; frame: THREE.MeshStandardMaterial };
/** Shared immutable lettering geometry; this instance owns all mutable materials. */
export default function NeonSign({ id, config: authoredConfig }: { id: string; config: NeonSignConfig }) {
 const runtime=useContext(NeonRuntimeContext),config=runtime.states[id]?.config??authoredConfig;
 const [bundle,setBundle]=useState<Bundle|null>(null),[error,setError]=useState('');
 const haloGroups=useRef<(THREE.Group|null)[]>([]);
 const geometryKey=neonGeometryKey(config),configRef=useRef(config);
 useEffect(()=>{configRef.current=config;},[config]);
 useEffect(()=>{
  let alive=true,lease:ReturnType<typeof acquireNeonGeometry>|null=null,owned:Bundle|null=null;
  void Promise.resolve().then(()=>{
   if(!alive)return;const config=configRef.current;lease=acquireNeonGeometry(config);
   const layers=config.quality==='high'?3:config.quality==='medium'?2:1;
   owned={built:lease.value,cores:lease.value.glyphs.map(()=>new THREE.MeshStandardMaterial({color:config.color,emissive:config.color,emissiveIntensity:config.brightness,roughness:.25,metalness:.12,toneMapped:false,side:config.doubleSided?THREE.DoubleSide:THREE.FrontSide})),
    halos:Array.from({length:layers},(_,index)=>new THREE.MeshBasicMaterial({color:config.color,transparent:true,opacity:Math.min(.3,config.glow*.08/(index+1)),blending:THREE.AdditiveBlending,depthTest:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide})),
    backing:new THREE.MeshStandardMaterial({color:config.backingColor,roughness:.7,metalness:.1}),frame:new THREE.MeshStandardMaterial({color:'#303b42',roughness:.35,metalness:.75})};
   setError('');setBundle(owned);
  }).catch(reason=>{if(alive)setError(reason instanceof Error?reason.message:'Neon geometry unavailable.');});
  return()=>{alive=false;if(owned){owned.cores.forEach(material=>material.dispose());owned.halos.forEach(material=>material.dispose());owned.backing.dispose();owned.frame.dispose();}lease?.release();};
 },[geometryKey]);
 useFrame(({clock})=>{
  if(!bundle)return;
  const state=runtime.states[id],elapsed=state?.effectStartMs===undefined?clock.elapsedTime-(state?.effectStart??0):(Date.now()+(runtime.serverOffsetMs??0)-state.effectStartMs)/1000,value=sampleNeonEffect({...config,powered:state?.powered??config.powered},Math.max(0,elapsed),runtime.worldHour);
  bundle.backing.color.set(config.backingColor);
  bundle.cores.forEach((material,index)=>{
   const lit=value.litGlyphs===undefined||bundle.built.glyphs[index]!.index<value.litGlyphs;
   material.color.set(value.color).multiplyScalar(.18);material.emissive.set(value.color);material.emissiveIntensity=lit?value.brightness:0;
   if(haloGroups.current[index])haloGroups.current[index]!.visible=lit&&value.brightness>0;
  });
  bundle.halos.forEach((material,index)=>{material.color.set(value.color);material.opacity=Math.min(.35,config.glow*.065*value.brightness/(index+1));});
 });
 if(error)return null;
 if(!bundle)return null;
 return <group userData={{neonObjectId:id}}>
  {config.effect.mode !== 'sequence' ? <group>
   <mesh geometry={bundle.built.geometry} material={bundle.cores[0]} dispose={null} userData={{neonCore:true,neonObjectId:id}}/>
   <group ref={node=>{haloGroups.current[0]=node;}}>{bundle.halos.map((material,layer)=><mesh key={layer} geometry={bundle.built.geometry} material={material} scale={1.012+(layer+1)*.012} dispose={null} raycast={()=>{}} userData={{neonGlow:true}}/>)}</group>
  </group> : bundle.built.glyphs.map((glyph,index)=><group key={glyph.index}>
   <mesh geometry={glyph.geometry} material={bundle.cores[index]} dispose={null} userData={{neonCore:true,neonObjectId:id}}/>
   <group ref={node=>{haloGroups.current[index]=node;}}>{bundle.halos.map((material,layer)=><mesh key={layer} geometry={glyph.geometry} material={material} scale={1.012+(layer+1)*.012} dispose={null} raycast={()=>{}} userData={{neonGlow:true}}/>)}</group>
  </group>)}
  {bundle.built.backingGeometry&&<mesh geometry={bundle.built.backingGeometry} material={bundle.backing} dispose={null}/>}
  {bundle.built.frameGeometry&&<mesh geometry={bundle.built.frameGeometry} material={bundle.frame} dispose={null}/>}
  {bundle.built.mountingGeometry&&<mesh geometry={bundle.built.mountingGeometry} material={bundle.frame} dispose={null}/>}
 </group>;
}
export function NeonInteraction({ project, active, onTarget, onToggle,onOpenComputer }: { project: WorldProject; active: boolean; onTarget: (target: NeonInteractionTarget|null)=>void; onToggle: (id:string,time:number)=>void;onOpenComputer:(id:string,time:number)=>void }) {
 const {scene,camera,clock}=useThree(),runtime=useContext(NeonRuntimeContext),target=useRef<NeonInteractionTarget|null>(null),lastId=useRef(''),lastCheck=useRef(-1);
 const byId=useMemo(()=>new Map(project.objects.map(object=>[object.id,object])),[project.objects]);
 const findTarget=useCallback(():NeonInteractionTarget|null=>{
  scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(camera.position,camera.getWorldDirection(new THREE.Vector3()),0,3);
  for(const hit of ray.intersectObjects(scene.children,true)){
   let node:THREE.Object3D|null=hit.object,signId:string|undefined,tagged=false,visible=true;
   while(node){if(!node.visible||node.userData.neonGlow){visible=false;break;}if(node.userData.neonObjectId)signId=String(node.userData.neonObjectId);if(node.userData.computerObjectId)signId=String(node.userData.computerObjectId);if(node.userData.placementSurface)tagged=true;node=node.parent;}
   if(!visible||(!tagged&&!signId))continue;
   if(!signId)return null;
   const object=byId.get(signId);if(!object||!effectiveObjectState(project.objects,signId).visible)return null;
   if(object.kind==='computer'&&object.computer)return{id:signId,name:object.name,kind:'computer'};
   if(!object.neon)return null;
   return{id:signId,name:object.name,kind:'neon-sign',powered:runtime.states[signId]?.powered??object.neon.powered};
  }
  return null;
 },[scene,camera,byId,project.objects,runtime.states]);
 useEffect(()=>{
  if(!active)return;
  const down=(event:KeyboardEvent)=>{if(event.code==='KeyE'&&!event.repeat&&!/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement|null)?.tagName??'') ){const current=findTarget();if(current){event.preventDefault();if(current.kind==='computer')onOpenComputer(current.id,clock.elapsedTime);else onToggle(current.id,clock.elapsedTime);}}};
  window.addEventListener('keydown',down);return()=>window.removeEventListener('keydown',down);
 },[active,clock,onToggle,onOpenComputer,findTarget]);
 useFrame(()=>{
  if(active&&clock.elapsedTime-lastCheck.current<.1)return;
  lastCheck.current=clock.elapsedTime;
  const next=active?findTarget():null;
  target.current=next;const key=next?next.id+':'+next.powered:'';
  if(lastId.current!==key){lastId.current=key;onTarget(next);}
 });
 return null;
}
