export type SurfaceExclusion={id:string;min:[number,number,number];max:[number,number,number]};
export function validateSurfaceExclusions(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>16)return ['Water surface exclusions must contain at most 16 volumes.'];
 const ids=new Set<string>();for(const box of value){
  if(!box||typeof box!=='object'||Array.isArray(box)||Object.keys(box).some(k=>!['id','min','max'].includes(k))||typeof box.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(box.id)||ids.has(box.id)||!Array.isArray(box.min)||!Array.isArray(box.max)||box.min.length!==3||box.max.length!==3||![...box.min,...box.max].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)||box.min.some((n:number,i:number)=>n>=box.max[i]))return ['Water surface exclusion requires a unique stable ID and ordered finite bounds.'];ids.add(box.id);
 }
 return [];
}
