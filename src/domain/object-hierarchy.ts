import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { inspectGlbJson } from './asset-glb';
import { createTreeGeometry } from './trees';
import type { EditorObject, Vec3, WorldProject } from './world';
export const MAX_HIERARCHY_DEPTH = 32;
export const MAX_WORLD_TRANSFORM_COMPONENT = 10_000_000;
export const MAX_WORLD_BOUND_COMPONENT = 1_000_000_000;
const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
export function validateHierarchy(objects: EditorObject[]): string[] {
 const errors:string[]=[], map=new Map<string,EditorObject>();
 for(const o of objects) {
  if(!o || typeof o.id!=='string' || !o.id || map.has(o.id)){errors.push('Hierarchy contains a missing or duplicate ID.');continue;}
  map.set(o.id,o);
  if(!vec(o.position)||!vec(o.rotation)||!vec(o.scale)||o.scale.some(n=>n<=0||n>1000)) errors.push('Hierarchy transforms must be finite positive local TRS.');
  if(o.parentId!==undefined && (typeof o.parentId!=='string'||!o.parentId))errors.push('Invalid parent ID.');
  if(o.locked!==undefined&&typeof o.locked!=='boolean')errors.push('Invalid object lock.');
  if(o.description!==undefined&&(typeof o.description!=='string'||o.description.length>2000))errors.push('Description exceeds 2000 characters.');
  if(o.tags!==undefined&&(!Array.isArray(o.tags)||o.tags.length>32||o.tags.some(t=>typeof t!=='string'||t.length>80)))errors.push('Invalid object tags.');
  if(o.kind==='group'&&(o.assetId!==undefined||o.collision!=='none'))errors.push('Groups cannot reference assets or have collision.');
 }
 for(const o of map.values()){
  let current:EditorObject|undefined=o,depth=0;const seen=new Set<string>();
  while(current){if(seen.has(current.id)){errors.push('Hierarchy cycle.');break;}seen.add(current.id);if(++depth>MAX_HIERARCHY_DEPTH){errors.push('Hierarchy exceeds maximum depth 32.');break;}
   if(current.parentId===undefined)break;
   const parent=map.get(current.parentId);if(!parent||parent.kind!=='group'){errors.push('Parent must reference an existing group.');break;}current=parent;
  }
 }
 if(!errors.length){
  const matrices=new Map<string,Matrix4>();
  const visit=(o:EditorObject):Matrix4=>{
   const cached=matrices.get(o.id);if(cached)return cached;
   const matrix=localMatrix(o);if(o.parentId)matrix.premultiply(visit(map.get(o.parentId)!));
   const inverse=matrix.clone().invert();
   if(matrix.elements.some(n=>!Number.isFinite(n)||Math.abs(n)>MAX_WORLD_TRANSFORM_COMPONENT)||matrix.determinant()===0||inverse.elements.some(n=>!Number.isFinite(n)||Math.abs(n)>1e12))errors.push('Composed world transform is outside safe finite bounds.');
   matrices.set(o.id,matrix);return matrix;
  };
  for(const o of map.values())visit(o);
 }
 return [...new Set(errors)];
}
function assert(objects:EditorObject[]) {const errors=validateHierarchy(objects);if(errors.length)throw new Error(errors.join(' '));}
export function hierarchyOrder(objects:EditorObject[]):EditorObject[]{assert(objects);const result:EditorObject[]=[];const visit=(id?:string)=>{for(const o of objects)if(o.parentId===id){result.push(o);visit(o.id);}};visit();return result;}
export function localMatrix(o:EditorObject):Matrix4{return new Matrix4().compose(new Vector3(...o.position),new Quaternion().setFromEuler(new Euler(...o.rotation)),new Vector3(...o.scale));}
export function resolveWorldMatrices(objects:EditorObject[]):Map<string,Matrix4>{const result=new Map<string,Matrix4>();for(const o of hierarchyOrder(objects)){const matrix=localMatrix(o);if(o.parentId)matrix.premultiply(result.get(o.parentId)!);result.set(o.id,matrix);}return result;}
export function effectiveObjectState(objects:EditorObject[],id:string):{visible:boolean;locked:boolean}{const map=new Map(objects.map(o=>[o.id,o]));let o=map.get(id),visible=true,locked=false;const seen=new Set<string>();while(o&&!seen.has(o.id)){seen.add(o.id);visible=visible&&o.visible;locked=locked||!!o.locked;o=o.parentId?map.get(o.parentId):undefined;}return{visible,locked};}
export function pruneSelection(objects:EditorObject[],ids:string[]):string[]{const chosen=new Set(ids),map=new Map(objects.map(o=>[o.id,o]));return [...chosen].filter(id=>{let o=map.get(id);if(!o)return false;while(o.parentId){if(chosen.has(o.parentId))return false;o=map.get(o.parentId)!;}return true;});}
export function subtreeIds(objects:EditorObject[],ids:string[]):Set<string>{const result=new Set(pruneSelection(objects,ids));for(const o of hierarchyOrder(objects))if(o.parentId&&result.has(o.parentId))result.add(o.id);return result;}
function editable(objects:EditorObject[],ids:string[]){for(const id of subtreeIds(objects,ids))if(effectiveObjectState(objects,id).locked)throw new Error('Unlock the selected objects and descendants before editing.');}
function fromMatrix(o:EditorObject,matrix:Matrix4,parentId?:string):EditorObject{
 const position=new Vector3(),quaternion=new Quaternion(),scale=new Vector3();matrix.decompose(position,quaternion,scale);
 const recomposed=new Matrix4().compose(position,quaternion,scale);
 if(matrix.elements.some((n,i)=>!Number.isFinite(n)||Math.abs(n-recomposed.elements[i]!)>1e-7*Math.max(1,Math.abs(n)))||scale.toArray().some(n=>n<=0||n>1000))throw new Error('This operation would require shear or an unsupported scale; no objects were changed.');
 const rotation=new Euler().setFromQuaternion(quaternion);
 return {...o,parentId,position:position.toArray() as Vec3,rotation:[rotation.x,rotation.y,rotation.z],scale:scale.toArray() as Vec3};
}
function checked(project:WorldProject,objects:EditorObject[]):WorldProject{assert(objects);if(objects.length>2000)throw new Error('Object limit exceeded.');const next={...project,objects};const errors=validateWorldBounds(next);if(errors.length)throw new Error(errors.join(' '));return next;}
export function reparentObjects(project:WorldProject,ids:string[],parentId?:string):WorldProject{
 assert(project.objects);const roots=pruneSelection(project.objects,ids);if(!roots.length)throw new Error('Select objects first.');editable(project.objects,roots);
 const subtree=subtreeIds(project.objects,roots);if(parentId&&(subtree.has(parentId)||!project.objects.some(o=>o.id===parentId&&o.kind==='group')))throw new Error('Choose a group outside the selected subtree.');
 if(parentId&&effectiveObjectState(project.objects,parentId).locked)throw new Error('Destination group is locked.');
 const matrices=resolveWorldMatrices(project.objects),inverse=parentId?matrices.get(parentId)!.clone().invert():new Matrix4(), selected=new Set(roots);
 return checked(project,project.objects.map(o=>selected.has(o.id)?fromMatrix(o,inverse.clone().multiply(matrices.get(o.id)!),parentId):o));
}
export function groupObjects(project:WorldProject,ids:string[],name='Group',id:string=crypto.randomUUID()):{project:WorldProject;groupId:string}{
 const roots=pruneSelection(project.objects,ids);if(!roots.length)throw new Error('Select objects first.');editable(project.objects,roots);
 const group:EditorObject={id,name,kind:'group',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,color:'#8ebcc1',collision:'none'};
 const next=reparentObjects(checked(project,[...project.objects,group]),roots,id);return{project:next,groupId:id};
}
export function ungroupObjects(project:WorldProject,ids:string[]):WorldProject{
 let next=project;const groups=pruneSelection(project.objects,ids);editable(project.objects,groups);
 for(const id of groups){const group=next.objects.find(o=>o.id===id);if(group?.kind!=='group')throw new Error('Select a group to ungroup.');const children=next.objects.filter(o=>o.parentId===id).map(o=>o.id);if(children.length)next=reparentObjects(next,children,group.parentId);next=checked(next,next.objects.filter(o=>o.id!==id));}return next;
}
export function cloneSubtrees(project:WorldProject,ids:string[]):{objects:EditorObject[];rootIds:string[]}{
 const roots=pruneSelection(project.objects,ids),all=subtreeIds(project.objects,roots),map=new Map([...all].map(id=>[id,crypto.randomUUID()]));
 const worlds=resolveWorldMatrices(project.objects),rootSet=new Set(roots);
 const objects=project.objects.filter(o=>all.has(o.id)).map(o=>{const clone=structuredClone(o);clone.id=map.get(o.id)!;if(rootSet.has(o.id))return fromMatrix(clone,worlds.get(o.id)!);clone.parentId=map.get(o.parentId!);return clone;});
 return{objects,rootIds:roots.map(id=>map.get(id)!)};
}
const treeBoundsCache=new Map<string,Box3>();
export function objectLocalBounds(project:WorldProject,o:EditorObject):Box3{
 if(o.kind==='glb'){const asset=project.assets.find(a=>a.id===o.assetId);if(!asset)throw new Error('Asset bounds are unavailable.');let b=asset.bounds;if(!b){const binary=atob(asset.dataUrl.slice(asset.dataUrl.indexOf(',')+1));b=inspectGlbJson(Uint8Array.from(binary,c=>c.charCodeAt(0)).buffer).bounds;}return new Box3(new Vector3(...b.min),new Vector3(...b.max));}
 if(o.kind==='building'){const roof=2.7/Math.sqrt(2);return new Box3(new Vector3(-roof,0,-roof),new Vector3(roof,3.1,roof));}
 if(o.kind==='tree'){
  const species=o.treeSpecies??'broadleaf',seed=o.treeSeed??7319,key=species+':'+seed;
  let bounds=treeBoundsCache.get(key);
  if(!bounds){const geometry=createTreeGeometry(species,seed);bounds=new Box3();const v=new Vector3();for(const part of [geometry.bark,geometry.foliage])for(let i=0;i<part.positions.length;i+=3)bounds.expandByPoint(v.fromArray(part.positions,i));if(treeBoundsCache.size>=128)treeBoundsCache.delete(treeBoundsCache.keys().next().value!);treeBoundsCache.set(key,bounds);}
  return bounds.clone();
 }
 if(o.kind==='cylinder')return new Box3(new Vector3(-.65,-.8,-.65),new Vector3(.65,.8,.65));
 return new Box3(new Vector3(-.8,-.8,-.8),new Vector3(.8,.8,.8));
}
export function getGroupBounds(project:WorldProject,id:string):{min:Vec3;max:Vec3;dimensions:Vec3}{
 const group=project.objects.find(o=>o.id===id);if(group?.kind!=='group')throw new Error('Select a group.');
 const all=subtreeIds(project.objects,[id]),worlds=resolveWorldMatrices(project.objects),inverse=worlds.get(id)!.clone().invert(),bounds=new Box3();
 for(const o of project.objects)if(o.kind!=='group'&&all.has(o.id))bounds.union(objectLocalBounds(project,o).applyMatrix4(inverse.clone().multiply(worlds.get(o.id)!)));
 if(bounds.isEmpty())return{min:[0,0,0],max:[0,0,0],dimensions:[0,0,0]};
 return{min:bounds.min.toArray() as Vec3,max:bounds.max.toArray() as Vec3,dimensions:bounds.getSize(new Vector3()).toArray() as Vec3};
}
export function resizeGroup(project:WorldProject,id:string,dimensions:Vec3,uniform=false):WorldProject{
 editable(project.objects,[id]);const group=project.objects.find(o=>o.id===id);if(group?.kind!=='group'||!vec(dimensions)||dimensions.some(n=>n<=0))throw new Error('Dimensions must be finite and positive.');
 const size=getGroupBounds(project,id).dimensions;if(size.some(n=>n<1e-8))throw new Error('Cannot resize a group with a zero extent.');
 const scales=dimensions.map((n,i)=>n/size[i]!) as Vec3;if(uniform){const axis=dimensions.findIndex((n,i)=>Math.abs(n-size[i]!*group.scale[i]!)>1e-7);const factor=axis<0?1:scales[axis]!/group.scale[axis]!;for(let i=0;i<3;i++)scales[i]=group.scale[i]!*factor;}
 return checked(project,project.objects.map(o=>o.id===id?{...o,scale:scales}:o));
}


/** Conservative world AABBs transformed by the exact hierarchy matrix. */
export function collisionWorldBounds(project:WorldProject):{object:EditorObject;bounds:Box3}[]{
 const matrices=resolveWorldMatrices(project.objects);
 return project.objects.filter(o=>o.kind!=='group'&&o.collision!=='none'&&effectiveObjectState(project.objects,o.id).visible)
 .map(object=>({object,bounds:objectLocalBounds(project,object).applyMatrix4(matrices.get(object.id)!)}));
}


/** Reject unsafe geometry extents before either preview consumes the project. */
export function validateWorldBounds(project:WorldProject):string[]{
 try{
  const matrices=resolveWorldMatrices(project.objects);
  for(const o of project.objects){
   if(o.kind==='group')continue;
   const bounds=objectLocalBounds(project,o).applyMatrix4(matrices.get(o.id)!);
   if([...bounds.min.toArray(),...bounds.max.toArray()].some(n=>!Number.isFinite(n)||Math.abs(n)>MAX_WORLD_BOUND_COMPONENT))return ['Composed object bounds exceed safe finite limits.'];
  }
  return [];
 }catch(error){return [(error as Error).message];}
}
