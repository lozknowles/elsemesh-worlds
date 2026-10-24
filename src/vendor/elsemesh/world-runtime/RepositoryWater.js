import {sampleLandscapeWater} from './vendor/world-engine-contract.js';
import * as N from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
// The same analytic surface is queried by the existing Player and rendered by the material.
export function repositoryWaterHeight(water,x,z,time=0){
 if(!water||Math.abs(x)>water.extent/2||Math.abs(z)>water.extent/2)return -100000;
 return water.level+water.waveAmplitude*Math.sin(x*.04+z*.03+time*water.waveSpeed);
}
/** Shared camera/player surface query; bounded ponds override legacy sea only inside their wet boundary. */
export function repositoryProjectWaterHeight(project,x,z,time=0){return (project?sampleLandscapeWater(project,x,z,time)?.height:undefined)??repositoryWaterHeight(project?.water,x,z,time);}
export function repositoryMediumWaterSettings(project,position,time=0){
 const height=repositoryProjectWaterHeight(project,position.x,position.z,time),enabled=height>-99999;
 return {waterEnabled:enabled?1:0,waterLevel:enabled?height:0,waveAmplitude:0,waveSpeed:0,waterExtent:Math.max(16,Math.abs(position.x)*2+4,Math.abs(position.z)*2+4)};
}
export function repositoryWaterQuery(water,project){
 const cpu=new Float32Array([-100000,0,0,0]);let time=0,x=0,z=0;
 const height=()=>project?repositoryProjectWaterHeight(project,x,z,time):repositoryWaterHeight(water,x,z,time);
 return {cpu,cpuValid:true,allocate:()=>0,setPoint(_slot,nx,nz){x=nx;z=nz;cpu[0]=height();},setTime(t){time=t;cpu[0]=height();}};
}
export function buildRepositoryWater(project){
 const water=project.water;if(!water)return null;
 const geometry=new N.PlaneGeometry(water.extent,water.extent,128,128);geometry.rotateX(-Math.PI/2);
 const material=new Material({name:'repository-sea',color:'#13627c',roughness:.16,metalness:.12,transparent:true,opacity:.94,side:'double',receiveShadows:true,
 uniforms:{seaLevel:['f32',water.level],waveAmplitude:['f32',water.waveAmplitude],waveSpeed:['f32',water.waveSpeed]},
 vertex:'v.position.y = mat.seaLevel + mat.waveAmplitude * sin(v.position.x*.04 + v.position.z*.03 + frame.time*mat.waveSpeed);',
 surface:`let phase=in.P.x*.04+in.P.z*.03+frame.time*mat.waveSpeed;
 s.normal=normalize(vec3f(-mat.waveAmplitude*.04*cos(phase),1.0,-mat.waveAmplitude*.03*cos(phase)));
 let ripple=sin(in.P.x*.8+in.P.z*.55+frame.time*.8)*sin(in.P.x*.31-in.P.z*.7-frame.time*.6);
 s.albedo=mix(vec3f(.025,.18,.24),vec3f(.055,.34,.4),.5+.5*ripple);s.roughness=.12+abs(ripple)*.07;`});
 const mesh=new N.Mesh(geometry,material);mesh.layers.set(2);mesh.castShadow=false;mesh.userData.repositoryWater=true;return mesh;
}
