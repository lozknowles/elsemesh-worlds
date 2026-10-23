import { useEffect,useState } from 'react';
import * as THREE from 'three';
import { buildComputerGeometry,disposeComputerGeometry } from '../domain/computer';
type Model={value:ReturnType<typeof buildComputerGeometry>;materials:THREE.MeshStandardMaterial[]};
export default function ComputerShape({id,screenColor}:{id:string;screenColor:string}){
 const [model,setModel]=useState<Model|null>(null);
 useEffect(()=>{
  let alive=true,owned:Model|null=null;
  void Promise.resolve().then(()=>{if(!alive)return;const value=buildComputerGeometry();owned={value,materials:value.parts.map(part=>new THREE.MeshStandardMaterial({color:part.emissive?screenColor:part.color,emissive:part.emissive?screenColor:'#000000',emissiveIntensity:part.emissive?1:0,roughness:.65,metalness:.12}))};setModel(owned);});
  return()=>{alive=false;if(owned){owned.materials.forEach(material=>material.dispose());disposeComputerGeometry(owned.value);}};
 },[screenColor]);
 return <group userData={{computerObjectId:id}}>{model?.value.parts.map((part,index)=><mesh key={part.name+index} name={part.name} geometry={part.geometry} material={model.materials[index]} dispose={null} castShadow receiveShadow userData={{computerCore:true,computerObjectId:id}}/>)}</group>;
}
