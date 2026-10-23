import { Box3, BoxGeometry, BufferGeometry, Vector3 } from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import type { FontData } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import helvetiker from './fonts/helvetiker_regular.typeface.json' with { type: 'json' };
import optimer from './fonts/optimer_regular.typeface.json' with { type: 'json' };
import { validateNeonSign } from './neon-sign.ts';
import type { NeonSignConfig } from './neon-sign.ts';
import type { Vec3 } from './world';
const fonts={helvetiker:new FontLoader().parse(helvetiker as unknown as FontData),optimer:new FontLoader().parse(optimer as unknown as FontData)};
export const MAX_NEON_TRIANGLES=150_000;
export const MAX_WORLD_NEON_TRIANGLES=1_000_000;
export type NeonGeometry={triangles:number;geometry:BufferGeometry;bounds:{min:Vec3;max:Vec3};glyphs:{geometry:BufferGeometry;index:number;character:string}[];backingGeometry?:BufferGeometry;frameGeometry?:BufferGeometry;mountingGeometry?:BufferGeometry};
function join(parts:BufferGeometry[]):BufferGeometry{if(!parts.length)return new BufferGeometry();const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());if(!geometry)throw new Error('Neon geometry could not be merged.');return geometry;}
export function disposeNeonGeometry(value:NeonGeometry){value.geometry.dispose();for(const glyph of value.glyphs)glyph.geometry.dispose();value.backingGeometry?.dispose();value.frameGeometry?.dispose();value.mountingGeometry?.dispose();}
export function buildNeonGeometry(config:NeonSignConfig):NeonGeometry{
 const errors=validateNeonSign(config);if(errors.length)throw new Error(errors.join(' '));
 const font=fonts[config.font],glyphs:NeonGeometry['glyphs']=[],segments={low:2,medium:4,high:6}[config.quality],scale=config.size/font.data.resolution;
 const lines=config.text.split('\n'),lineWidths=lines.map(line=>[...line].reduce((n,char)=>n+(font.data.glyphs[char]??font.data.glyphs['?']!).ha*scale+config.letterSpacing,0)-config.letterSpacing);
 let index=0;
 try{
  for(let row=0;row<lines.length;row++){
   let x=config.align==='left'?0:config.align==='right'?-lineWidths[row]!:-lineWidths[row]!/2;
   for(const char of [...lines[row]!]){
    const character=font.data.glyphs[char]?char:'?',data=font.data.glyphs[character]!;
    if(character!==' '){
     const geometry=new TextGeometry(character,{font,size:config.size,depth:config.depth,curveSegments:segments,bevelEnabled:true,bevelThickness:config.tubeThickness,bevelSize:config.tubeThickness,bevelSegments:1,steps:1});
     geometry.translate(x,-row*config.lineHeight*config.size,0);glyphs.push({geometry,index,character});
    }
    x+=data.ha*scale+config.letterSpacing;index++;
   }
  }
  const bounds=new Box3();for(const g of glyphs){g.geometry.computeBoundingBox();bounds.union(g.geometry.boundingBox!);}
  if(bounds.isEmpty())throw new Error('Neon text has no visible glyphs.');
  const center=bounds.getCenter(new Vector3());center.z=0;for(const g of glyphs)g.geometry.translate(-center.x,-center.y,0);
  bounds.translate(center.clone().negate());
  if(config.doubleSided){for(const g of glyphs){const front=g.geometry,back=front.clone().rotateY(Math.PI).translate(0,0,-.04);g.geometry=join([front,back]);}bounds.makeEmpty();for(const g of glyphs){g.geometry.computeBoundingBox();bounds.union(g.geometry.boundingBox!);}}
  const size=bounds.getSize(new Vector3()),middle=bounds.getCenter(new Vector3()),pad=config.size*.16;let backingGeometry:BufferGeometry|undefined,frameGeometry:BufferGeometry|undefined;
  if(config.backing==='panel'){backingGeometry=new BoxGeometry(size.x+pad*2,size.y+pad*2,.04).translate(middle.x,middle.y,config.doubleSided?middle.z:-config.tubeThickness-.04);}
  if(config.frame){const thickness=Math.max(.025,config.size*.035),w=size.x+pad*2,h=size.y+pad*2,z=config.doubleSided?middle.z:-.04;frameGeometry=join([new BoxGeometry(w+thickness*2,thickness,.08).translate(middle.x,middle.y+h/2,z),new BoxGeometry(w+thickness*2,thickness,.08).translate(middle.x,middle.y-h/2,z),new BoxGeometry(thickness,h,.08).translate(middle.x+w/2,middle.y,z),new BoxGeometry(thickness,h,.08).translate(middle.x-w/2,middle.y,z)]);}
  const mountZ=config.doubleSided?middle.z:-.1,mountWidth=size.x+pad*2,mountHeight=size.y+pad*2;
  const mountingGeometry=config.mounting==='hanging'?join([-1,1].map(side=>new BoxGeometry(.015,config.size*.8,.015).translate(side*mountWidth*.3,middle.y+mountHeight/2+config.size*.4,mountZ))):config.mounting==='freestanding'?join([-1,1].flatMap(side=>[new BoxGeometry(.055,config.size,.055).translate(side*mountWidth*.3,middle.y-mountHeight/2-config.size/2,mountZ),new BoxGeometry(config.size*.35,.05,config.size*.5).translate(side*mountWidth*.3,middle.y-mountHeight/2-config.size,mountZ)])):join([-1,1].map(side=>new BoxGeometry(.07,.07,.2).translate(side*mountWidth*.3,middle.y,mountZ-.1)));
  const geometry=join(glyphs.map(g=>g.geometry.clone())),value:NeonGeometry={triangles:0,geometry,glyphs,bounds:{min:[0,0,0],max:[0,0,0]},backingGeometry,frameGeometry,mountingGeometry};
  for(const extra of [backingGeometry,frameGeometry,mountingGeometry])if(extra){extra.computeBoundingBox();bounds.union(extra.boundingBox!);}
  value.bounds={min:bounds.min.toArray() as Vec3,max:bounds.max.toArray() as Vec3};
  const triangles=[geometry,backingGeometry,frameGeometry,mountingGeometry].reduce((n,g)=>n+(g?(g.index?.count??g.getAttribute('position')?.count??0)/3:0),0);
  value.triangles=triangles;
  if(triangles>MAX_NEON_TRIANGLES){value.geometry.dispose();value.backingGeometry?.dispose();value.frameGeometry?.dispose();value.mountingGeometry?.dispose();throw new Error('Neon sign exceeds 150,000 triangles.');}return value;
 }catch(error){for(const g of glyphs)g.geometry.dispose();throw error;}
}
export function neonGeometryKey(c:NeonSignConfig):string{return JSON.stringify([c.text,c.font,c.size,c.depth,c.tubeThickness,c.letterSpacing,c.lineHeight,c.align,c.backing,c.frame,c.doubleSided,c.mounting,c.quality]);}
const boundCache=new Map<string,{bounds:NeonGeometry['bounds'];triangles:number}>();
export function getNeonBounds(config:NeonSignConfig):NeonGeometry['bounds']{
 const key=neonGeometryKey(config);let metadata=boundCache.get(key);
 if(!metadata){const value=buildNeonGeometry(config);metadata={bounds:value.bounds,triangles:value.triangles};disposeNeonGeometry(value);if(boundCache.size>=64)boundCache.delete(boundCache.keys().next().value!);boundCache.set(key,metadata);}
 return{min:[...metadata.bounds.min],max:[...metadata.bounds.max]};
}
export function neonTriangleCount(config:NeonSignConfig):number{getNeonBounds(config);return boundCache.get(neonGeometryKey(config))!.triangles;}
type Entry={value:NeonGeometry;refs:number};
const cache=new Map<string,Entry>();
/** Borrow immutable geometry. Release once; final release disposes all buffers. No idle GPU cache. */
export function acquireNeonGeometry(config:NeonSignConfig):{value:NeonGeometry;release:()=>void}{
 const errors=validateNeonSign(config);if(errors.length)throw new Error(errors.join(' '));
 const key=neonGeometryKey(config);let entry=cache.get(key);if(!entry){if(cache.size>=100)throw new Error('Neon geometry cache limit reached.');entry={value:buildNeonGeometry(config),refs:0};cache.set(key,entry);}entry.refs++;let released=false;
 return{value:entry.value,release:()=>{if(released)return;released=true;if(--entry!.refs===0){disposeNeonGeometry(entry!.value);cache.delete(key);}}};
}
export function neonGeometryCacheStats(){return{entries:cache.size,references:[...cache.values()].reduce((n,e)=>n+e.refs,0)};}

