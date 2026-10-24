import * as N from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { acquireNeonGeometry } from './vendor/world-engine-contract.js';
import { sampleNeonEffect } from './vendor/world-engine-contract.js';

/** Uses the native renderer's HDR emissive path and existing PostFX bloom. */
export function buildNativeNeon(config,convertGeometry) {
 const handle=acquireNeonGeometry(config),source=handle.value,group=new N.Group(),letters=[];
 const add=(geometry,material)=>{const item=new N.Mesh(convertGeometry(geometry),material);item.castShadow=false;group.add(item);return item;};
 const glyphParts=config.effect.mode==='sequence'?source.glyphs:[{geometry:source.geometry,index:-1}];
 for(const glyph of glyphParts){
  const material=new Material({name:'neon-letter',color:config.color,emissive:config.color,roughness:.35,side:'double'});
  const item=add(glyph.geometry,material);letters.push({item,material,index:glyph.index});
 }
 if(source.backingGeometry)add(source.backingGeometry,new Material({name:'neon-backing',color:config.backingColor,roughness:.7,side:'double'}));
 if(source.mountingGeometry)add(source.mountingGeometry,new Material({name:'neon-mount',color:'#555b61',metalness:.7,roughness:.4,side:'double'}));
 if(source.frameGeometry)add(source.frameGeometry,new Material({name:'neon-frame',color:'#343b40',metalness:.65,roughness:.35,side:'double'}));
 // Conversion owns its copied native buffers; the shared Three buffers are released here.
 handle.release();
 group.userData.updateNeon=(time,hour,powered=config.powered)=>{
  const state=sampleNeonEffect({...config,powered},time,hour);
  for(const letter of letters){const lit=state.litGlyphs===undefined||letter.index<state.litGlyphs;const amount=lit?state.brightness:0;
   letter.material.color.set(state.color).multiplyScalar(amount>0?.6:.055);
   letter.material.emissive.set(state.color).multiplyScalar(amount*(1+config.glow*2));
  }
  group.userData.neonState={text:config.text,powered,brightness:state.brightness,color:state.color,glyphs:source.glyphs.length,emissive:letters[0]?.material.emissive.toArray()};
 };
 group.userData.updateNeon(0,14);
 return group;
}
