import type { Box3 } from 'three';
import type { EditorObject, Vec3 } from './world';
export type PlayerMotionInput={position:Vec3;previous:Vec3;velocityY:number;colliders:{object:EditorObject;bounds:Box3}[];terrainHeight:number;terrainHeightAt?:(x:number,z:number)=>number;eyeHeight?:number;bodyHeight?:number;radius?:number;stepHeight?:number};
export type PlayerMotionResult={position:Vec3;velocityY:number;grounded:boolean};
/** Conservative AABB contact: directional landing, bounded stepping and ceiling clearance. */
export function resolvePlayerMotion({position,previous,velocityY,colliders,terrainHeight,terrainHeightAt,eyeHeight=1.65,bodyHeight=1.75,radius=.28,stepHeight=.45}:PlayerMotionInput):PlayerMotionResult{
 if([...position,...previous,velocityY,terrainHeight,eyeHeight,bodyHeight,radius,stepHeight].some(n=>!Number.isFinite(n))||eyeHeight<=0||bodyHeight<=0||radius<0||stepHeight<0)throw new Error('Player contact needs finite positions and valid dimensions.');
 const active=colliders.filter(c=>c.object.collision!=='none'),previousFeet=previous[1]-eyeHeight,proposedFeet=position[1]-eyeHeight;
 const overlaps=(b:Box3,x:number,z:number)=>x>b.min.x-radius&&x<b.max.x+radius&&z>b.min.z-radius&&z<b.max.z+radius;
 const headClear=(feet:number,x:number,z:number)=>!active.some(({bounds:b})=>overlaps(b,x,z)&&b.max.y>feet+.025&&b.min.y<feet+bodyHeight-.025);
 const vertical=(x:number,z:number,allowStep:boolean)=>{
  let feet=proposedFeet,vy=velocityY,grounded=false;
  const hits=active.filter(c=>overlaps(c.bounds,x,z));
  if(proposedFeet>previousFeet){
   const previousHead=previousFeet+bodyHeight,nextHead=proposedFeet+bodyHeight;
   for(const {bounds:b}of hits)if(previousHead<=b.min.y+.02&&nextHead>=b.min.y&&previousFeet<b.min.y){feet=Math.min(feet,b.min.y-bodyHeight);vy=Math.min(0,vy);}
  }
  let floor=terrainHeightAt?terrainHeightAt(x,z):terrainHeight;
  if(!Number.isFinite(floor))throw new Error('Resolved terrain height must be finite.');
  if(proposedFeet<=previousFeet+.001){
   for(const {bounds:b}of hits)if(previousFeet>=b.max.y-.04&&feet<=b.max.y+.001)floor=Math.max(floor,b.max.y);
   if(allowStep&&Math.hypot(x-previous[0],z-previous[2])>1e-7){
    for(const {bounds:b}of hits)if(!overlaps(b,previous[0],previous[2])&&b.max.y>previousFeet+.001&&b.max.y-previousFeet<=stepHeight+.001&&headClear(b.max.y,x,z))floor=Math.max(floor,b.max.y);
   }
  }
  if(feet<=floor+.001){feet=floor;vy=0;grounded=true;}
  return{feet,vy,grounded,hits};
 };
 let x=position[0],z=position[2],contact=vertical(x,z,true);
 const blocked=contact.hits.some(({bounds:b})=>b.max.y>contact.feet+.025&&b.min.y<contact.feet+bodyHeight-.025);
 if(blocked){x=previous[0];z=previous[2];contact=vertical(x,z,false);}
 return{position:[x,contact.feet+eyeHeight,z],velocityY:contact.vy,grounded:contact.grounded};
}

