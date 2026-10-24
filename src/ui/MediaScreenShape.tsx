import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import {buildMediaScreenGeometry,disposeMediaScreenGeometry} from '../domain/media-screen';
import type {MediaScreenConfig} from '../domain/media-screen';
export default function MediaScreenShape({config}:{config:MediaScreenConfig}){
 const model=useMemo(()=>{const parts=buildMediaScreenGeometry(config),materials=parts.parts.map(p=>new THREE.MeshStandardMaterial({color:p.color,roughness:.45,metalness:.25,emissive:p.emissive?p.color:'#000000'}));return {parts,materials};},[config]);
 useEffect(()=>()=>{disposeMediaScreenGeometry(model.parts);model.materials.forEach(m=>m.dispose());},[model]);
 return <group>{model.parts.parts.map((part,i)=><mesh key={part.name} name={part.name} geometry={part.geometry} material={model.materials[i]} castShadow receiveShadow dispose={null}/>)}</group>;
}
