import * as N from '../engine/index.js';
import {Material} from '../engine/render/Material.js';
import {Texture} from '../engine/gpu/Texture.js';
import {GPU} from '../engine/gpu/GPU.js';
import {bakeLandscapeAtlas,landscapeChunks,sceneryParts,landscapeWaterGeometry,updateLandscapeWater} from './vendor/world-engine-contract.js';
import {createLandscapeCollisionIndex} from './vendor/world-engine-contract.js';
export async function nativeLandscapeSurface(project){
 const atlas=await bakeLandscapeAtlas(project);if(!atlas)return {textures:{},uniforms:{},surface:'',dispose(){},diagnostics:{tiles:0}};
 const color=new Texture({label:'landscape-color',width:atlas.size,height:atlas.size,format:'rgba8unorm',data:atlas.data}),rough=new Texture({label:'landscape-rough',width:atlas.size,height:atlas.size,format:'rgba8unorm',data:atlas.rough}),index=new Texture({label:'landscape-index',width:4096,height:1,format:'rgba32float',data:atlas.index});
 return {textures:{landscapeColor:color,landscapeRough:rough,landscapeIndex:index},uniforms:{landscapeSize:['vec4f',[atlas.size,atlas.side,project.terrain.width,project.terrain.depth]]},surface:/*wgsl*/`
 let lc=(in.P.xz+mat.landscapeSize.zw*0.5)/16.0;let tile=floor(lc);
 var hash=i32(((i32(tile.x)*17+i32(tile.y)*31)%4096+4096)%4096);var slot=0.0;
 for(var probe=0;probe<256;probe++){let entry=textureLoad(landscapeIndex,vec2i(hash,0),0);if(entry.z<0.5){break;}if(all(abs(entry.xy-tile)<vec2f(0.1))){slot=entry.z;break;}hash=(hash+1)%4096;}
 let n=max(0.0,slot-1.0);let atlasSlot=vec2f(n%mat.landscapeSize.y,floor(n/mat.landscapeSize.y));
 let luv=(atlasSlot*66.0+1.0+fract(lc)*64.0)/mat.landscapeSize.x;
 let land=textureSampleLevel(landscapeColor,smpLinearClamp,luv,0.0);let landR=textureSampleLevel(landscapeRough,smpLinearClamp,luv,0.0);
 if(slot>0.5){s.albedo=mix(s.albedo,land.rgb,land.a);s.roughness=mix(s.roughness,landR.r,landR.a);}
`,diagnostics:{tiles:atlas.tiles,size:atlas.size},dispose(){const destroy=()=>{color.destroy();rough.destroy();index.destroy();};if(GPU.encoder)GPU.onSubmit(null,destroy);else destroy();}};
}
