import {describe,it,expect} from 'vitest';
import {createWorld,validateWorld,createPlayerWorldPackage,validatePlayerWorldPackage,PROJECT_SCHEMA,LEGACY_PROJECT_SCHEMA,LANDSCAPE_PROJECT_SCHEMA} from './world';
import {describeRuntimeWorld} from './runtime-world';
import {packWorldRepository,unpackWorldRepository} from './world-repository';
const object={id:'collider',name:'Collider',kind:'box' as const,position:[0,1,0] as [number,number,number],rotation:[0,0,0] as [number,number,number],scale:[2,2,2] as [number,number,number],color:'#ffffff',visible:true,collision:'solid' as const,collisionOnly:true};
describe('explicit persisted object visibility',()=>{
 it.each([undefined,null,0,1,'true',{},[]])('rejects invalid visibility %j before runtime admission or repository packaging',async visible=>{
  const world={...createWorld(),objects:[{...object,visible}]};
  expect(validateWorld(world).errors).toContain('Object 1 must declare boolean visibility.');
  expect(()=>describeRuntimeWorld(world)).toThrow(/boolean visibility/);
  expect(()=>createPlayerWorldPackage(world as never)).toThrow(/boolean visibility/);
  await expect(packWorldRepository(world as never)).rejects.toThrow(/boolean visibility/);
 });
 it.each([true,false])('preserves valid legacy visibility %j through explicit migration and runtime collision admission',visible=>{
  const world={...createWorld(),schema:LEGACY_PROJECT_SCHEMA,objects:[{...object,visible}]};
  const result=validateWorld(world);
  expect(result.valid).toBe(true);expect(result.project!.schema).toBe(PROJECT_SCHEMA);
  expect(result.project!.objects[0]!.visible).toBe(visible);
  expect(describeRuntimeWorld(world).boxes).toHaveLength(visible?1:0);
 });
 it('rejects missing visibility in legacy and landscape projects without guessing',()=>{
  const missing={...object} as Partial<typeof object>;delete missing.visible;
  for(const schema of [LEGACY_PROJECT_SCHEMA,PROJECT_SCHEMA,LANDSCAPE_PROJECT_SCHEMA]){
   expect(validateWorld({...createWorld(),schema,objects:[missing]}).errors).toContain('Object 1 must declare boolean visibility.');
  }
 });
 it('retains explicit visible and hidden objects in repository and portable wrapper roundtrips',async()=>{
  const project={...createWorld(),objects:[object,{...object,id:'hidden',visible:false}]};
  const files=await packWorldRepository(project);
  const restored=await unpackWorldRepository(async path=>files.get(path)!);
  expect(restored.objects.map(o=>o.visible)).toEqual([true,false]);
  const admitted=validatePlayerWorldPackage(JSON.parse(JSON.stringify(createPlayerWorldPackage(restored))));
  expect(admitted.valid).toBe(true);expect(describeRuntimeWorld(admitted.project).boxes).toHaveLength(1);
 });
});

