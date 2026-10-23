import { describe,it,expect } from 'vitest';
import { createWorld,validateWorld,PROJECT_SCHEMA,createPlayerWorldPackage } from './world';
import type { EditorObject } from './world';
import {validateHierarchy,resolveWorldMatrices,groupObjects,ungroupObjects,reparentObjects,pruneSelection,resizeGroup,getGroupBounds,cloneSubtrees,effectiveObjectState,collisionWorldBounds} from './object-hierarchy';
const obj=(id:string,kind:EditorObject['kind']='box',parentId?:string):EditorObject=>({id,name:id,kind,parentId,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,color:'#ffffff',collision:kind==='group'?'none':'solid'});
const project=(objects:EditorObject[])=>({...createWorld(),objects});
const close=(a:number[],b:number[])=>a.forEach((v,i)=>expect(v).toBeCloseTo(b[i]!,6));
describe('hierarchy',()=>{
 it('migrates v1 explicitly and emits v2 packages',()=>{const p=createWorld();const result=validateWorld({...p,schema:'elsemesh.worlds.project/1'});expect(result.valid).toBe(true);expect(result.project!.schema).toBe(PROJECT_SCHEMA);expect(createPlayerWorldPackage(p).schema).toBe('elsemesh.player-world/2');expect(validateWorld({...p,schema:'elsemesh.worlds.project/1',objects:[obj('g','group')]}).valid).toBe(false);});
 it('rejects missing parents, duplicate IDs, cycles, nonfinite and depth overflow',()=>{expect(validateHierarchy([obj('x','box','missing')]).length).toBeGreaterThan(0);expect(validateHierarchy([obj('x'),obj('x')]).length).toBeGreaterThan(0);expect(validateHierarchy([obj('a','group','b'),obj('b','group','a')])).toContain('Hierarchy cycle.');expect(validateHierarchy([{...obj('x'),position:[NaN,0,0]}]).length).toBeGreaterThan(0);expect(validateHierarchy(Array.from({length:33},(_,i)=>obj('g'+i,'group',i?'g'+(i-1):undefined)))).toContain('Hierarchy exceeds maximum depth 32.');});
 it('preserves world matrices when grouped/reparented/ungrouped and clones IDs',()=>{const a={...obj('a'),position:[4,1,2] as [number,number,number],rotation:[.2,.4,0] as [number,number,number]};const p=project([a,obj('b')]);const before=resolveWorldMatrices(p.objects);const grouped=groupObjects(p,['a','b'],'Assembly','g').project;expect(pruneSelection(grouped.objects,['g','a'])).toEqual(['g']);close(resolveWorldMatrices(grouped.objects).get('a')!.elements,before.get('a')!.elements);const ungrouped=ungroupObjects(grouped,['g']);close(resolveWorldMatrices(ungrouped.objects).get('a')!.elements,before.get('a')!.elements);const cloned=cloneSubtrees(grouped,['g']);expect(new Set(cloned.objects.map(o=>o.id)).size).toBe(3);expect(cloned.objects.some(o=>['a','b','g'].includes(o.id))).toBe(false);expect(cloned.objects.filter(o=>o.parentId).every(o=>o.parentId===cloned.rootIds[0])).toBe(true);});
 it('rejects shear reparent atomically',()=>{const g={...obj('g','group'),scale:[2,1,1] as [number,number,number]};const a={...obj('a'),rotation:[0,.6,0] as [number,number,number]};const p=project([g,a]),saved=JSON.stringify(p);expect(()=>reparentObjects(p,['a'],'g')).toThrow(/shear/);expect(JSON.stringify(p)).toBe(saved);});
 it('composes nonuniform parent matrices exactly and inherits visibility/lock',()=>{const g={...obj('g','group'),scale:[2,1,3] as [number,number,number],visible:false,locked:true};const child={...obj('c','box','g'),rotation:[0,.5,0] as [number,number,number]};const p=project([g,child]);expect(effectiveObjectState(p.objects,'c')).toEqual({visible:false,locked:true});expect(()=>resizeGroup(p,'g',[4,4,4])).toThrow(/Unlock/);expect(collisionWorldBounds(p)).toEqual([]);});
 it('scales all group contents using local dimensions and rejects zero extents',()=>{const p=project([obj('g','group'),obj('c','box','g')]);expect(getGroupBounds(p,'g').dimensions).toEqual([1.6,1.6,1.6]);const next=resizeGroup(p,'g',[3.2,4.8,6.4]);expect(next.objects[0]!.scale).toEqual([2,2.9999999999999996,4]);expect(next.objects[1]).toEqual(p.objects[1]);expect(()=>resizeGroup(project([obj('empty','group')]),'empty',[1,1,1])).toThrow(/zero extent/);const bounds=collisionWorldBounds(next)[0]!.bounds;expect(bounds.max.x).toBeCloseTo(1.6);});
 it('prevents edits moving locked descendants indirectly',()=>{const p=project([obj('g','group'),{...obj('c','box','g'),locked:true}]);expect(()=>reparentObjects(p,['g'])).toThrow(/Unlock/);expect(()=>ungroupObjects(p,['g'])).toThrow(/Unlock/);});
});


import {packWorldRepository,unpackWorldRepository} from './world-repository';
describe('hierarchy repository compatibility',()=>{
 it('round trips hierarchy and explicitly migrates old repository manifests',async()=>{
  const p=project([obj('g','group'),obj('c','box','g')]),files=await packWorldRepository(p);
  const read=async(path:string)=>{const bytes=files.get(path);if(!bytes)throw new Error('Missing file');return bytes;};
  expect((await unpackWorldRepository(read)).objects).toEqual(p.objects);
  const old=createWorld(),oldFiles=await packWorldRepository(old);
  const manifest=JSON.parse(new TextDecoder().decode(oldFiles.get('world.json')!));manifest.projectSchema='elsemesh.worlds.project/1';oldFiles.set('world.json',new TextEncoder().encode(JSON.stringify(manifest)));
  const restored=await unpackWorldRepository(async path=>oldFiles.get(path)!);expect(restored.schema).toBe(PROJECT_SCHEMA);expect(restored.metadata).toEqual(old.metadata);
 });
 it('ungroup rejects unrepresentable child shear without mutation',()=>{
  const g={...obj('g','group'),scale:[2,1,1] as [number,number,number]},child={...obj('c','box','g'),rotation:[0,.5,0] as [number,number,number]},p=project([g,child]),original=JSON.stringify(p);
  expect(()=>ungroupObjects(p,['g'])).toThrow(/shear/);expect(JSON.stringify(p)).toBe(original);
 });
});


describe('bounded hierarchy geometry',()=>{
 it('uses cylinder and seeded tree geometry bounds',()=>{
  const p=project([obj('g','group'),obj('c','cylinder','g')]);close(getGroupBounds(p,'g').dimensions,[1.3,1.6,1.3]);
  const tree={...obj('t','tree'),treeSpecies:'palm' as const,treeSeed:912};const treeProject=project([obj('g','group'),{...tree,parentId:'g'}]);const size=getGroupBounds(treeProject,'g').dimensions;expect(size[1]).toBeGreaterThan(5);expect(size).not.toEqual([6,7,6]);
 });
 it('rejects huge or near singular composed transforms before rendering',()=>{
  const chain=Array.from({length:32},(_,i)=>({...obj('g'+i,'group',i?'g'+(i-1):undefined),scale:[1000,1000,1000] as [number,number,number]}));
  expect(validateHierarchy(chain)).toContain('Composed world transform is outside safe finite bounds.');expect(validateWorld(project(chain)).valid).toBe(false);
  expect(validateHierarchy([{...obj('tiny'),scale:[1e-20,1,1]}])).toContain('Composed world transform is outside safe finite bounds.');
  expect(validateHierarchy([{...obj('far'),position:[Number.MAX_VALUE,0,0]}])).toContain('Composed world transform is outside safe finite bounds.');
 });
});

