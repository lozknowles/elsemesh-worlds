import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldAsset, Vec3 } from '../domain/world';
import { surfacePlacement } from '../domain/object-catalogue';
import { inspectAndLoadAsset, disposeAssetScene } from './asset-admission';

export type PlacementHit = { point: Vec3; surface: 'terrain' | 'object' };
/** Native canvas listeners capture placement before ordinary editor selection. */
export default function CataloguePlacement({ asset, yaw, scale, onHit, onConfirm, onError }: { asset: WorldAsset; yaw: number; scale: Vec3; onHit: (hit: PlacementHit | null) => void; onConfirm: (hit: PlacementHit) => void; onError: (reason: string) => void }) {
 const { scene, camera, gl }=useThree();
 const [ghost,setGhost]=useState<THREE.Group|null>(null),[hit,setHit]=useState<PlacementHit|null>(null);
 const group=useRef<THREE.Group>(null);
 useEffect(()=>{
  let alive=true,owned:THREE.Group|null=null;
  void fetch(asset.dataUrl).then(r=>r.arrayBuffer()).then(inspectAndLoadAsset).then(loaded=>{
   if(!alive){disposeAssetScene(loaded.scene);return;}
   owned=loaded.scene;loaded.scene.traverse(node=>{if(node instanceof THREE.Mesh){for(const m of Array.isArray(node.material)?node.material:[node.material]){m.transparent=true;m.opacity=.42;m.depthWrite=false;}node.raycast=()=>{};}});
   setGhost(loaded.scene);
  }).catch(error=>{if(alive)onError(error instanceof Error?error.message:'Placement preview failed.');});
  return()=>{alive=false;if(owned)disposeAssetScene(owned);};
 },[asset,onError]);
 useEffect(()=>{
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let last:PlacementHit|null=null;
  const update=(event:PointerEvent)=>{
   const rect=gl.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
   raycaster.setFromCamera(pointer,camera);scene.updateMatrixWorld(true);
   const targets:THREE.Object3D[]=[];scene.traverse(node=>{if(node.userData.placementSurface)targets.push(node);});
   const candidates=raycaster.intersectObjects(targets,true).filter(candidate=>{
    let node:THREE.Object3D|null=candidate.object;while(node){if(!node.visible)return false;node=node.parent;}return true;
   });
   const first=candidates[0];let type:'terrain'|'object'='terrain';
   if(first){let node:THREE.Object3D|null=first.object;while(node){if(node.userData.placementSurface){type=node.userData.placementSurface;break;}node=node.parent;}}
   last=first?{point:first.point.toArray() as Vec3,surface:type}:null;
   setHit(last);onHit(last);
  };
  const down=(event:PointerEvent)=>{if(event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();update(event);if(last)onConfirm(last);};
  gl.domElement.addEventListener('pointermove',update,true);gl.domElement.addEventListener('pointerdown',down,true);;
  return()=>{gl.domElement.removeEventListener('pointermove',update,true);gl.domElement.removeEventListener('pointerdown',down,true);;};
 },[camera,gl,scene,onHit,onConfirm]);
 const transform=hit?surfacePlacement(asset,hit.point,yaw,scale):null;
 return <group ref={group} visible={!!transform} position={transform?.position} rotation={transform?.rotation} scale={scale}>{ghost&&<primitive object={ghost}/>}</group>;
}
