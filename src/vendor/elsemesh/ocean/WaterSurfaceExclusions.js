
/** Installed rendering capability only: it never changes water queries or physics. */
export function canonicalWaterSurfaceExclusions(volumes=[]){
 if(!Array.isArray(volumes)||volumes.length>16)throw Error('Invalid water surface exclusions');
 const ids=new Set();
 return Object.freeze(volumes.map(volume=>{
  if(!volume||typeof volume.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(volume.id)||Object.keys(volume).some(key=>!['id','min','max'].includes(key))||ids.has(volume.id))throw Error('Invalid water surface exclusion id');
  ids.add(volume.id);
  const min=volume.min,max=volume.max;
  if(!Array.isArray(min)||!Array.isArray(max)||min.length!==3||max.length!==3||min.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(max[i])||Math.abs(v)>1e5||Math.abs(max[i])>1e5||v>=max[i]))throw Error('Invalid water surface exclusion bounds');
  return Object.freeze({id:volume.id,min:Object.freeze([...min]),max:Object.freeze([...max])});
 }));
}
const number=value=>Number.isInteger(value)?value+'.0':String(value);
export function waterSurfaceExclusionTest(volumes,position,language='wgsl'){
 const vector=language==='glsl'?'vec3':'vec3f';
 const test=volume=>language==='glsl'
 ?'all(greaterThanEqual('+position+','+vector+'('+volume.min.map(number).join(',')+'))) && all(lessThanEqual('+position+','+vector+'('+volume.max.map(number).join(',')+')))'
 :'all('+position+'>='+vector+'('+volume.min.map(number).join(',')+')) && all('+position+'<='+vector+'('+volume.max.map(number).join(',')+'))';
 return volumes.length?volumes.map(v=>'('+test(v)+')').join(' || '):'false';
}
