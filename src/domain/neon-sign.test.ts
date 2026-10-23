import { describe,it,expect,vi } from 'vitest';
import {defaultNeonSign,validateNeonSign,sampleNeonEffect,NEON_EFFECTS,NEON_PRESETS,createNeonPrefab,parseNeonPrefab} from './neon-sign';
import {buildNeonGeometry,disposeNeonGeometry,acquireNeonGeometry,neonGeometryCacheStats,neonGeometryKey,getNeonBounds} from './neon-geometry';
import {createWorld,validateWorld} from './world';
describe('bounded neon signs',()=>{
 it('validates defaults and twelve prefab templates with safe import',()=>{expect(validateNeonSign(defaultNeonSign())).toEqual([]);expect(NEON_PRESETS).toHaveLength(12);for(const p of NEON_PRESETS)expect(parseNeonPrefab(createNeonPrefab(p.config))).toEqual(p.config);expect(()=>parseNeonPrefab({schema:'other',config:defaultNeonSign()})).toThrow();});
 it('rejects invalid typography/effects and controls',()=>{const c=defaultNeonSign();for(const patch of [{text:'x'.repeat(81)},{text:'a\nb\nc\nd'},{text:'\u0000'},{font:'https://example.com/font.json'},{size:NaN},{tubeThickness:4},{effect:{...c.effect,speed:Infinity}},{effect:{...c.effect,intensity:-1}}])expect(validateNeonSign({...c,...patch}).length).toBeGreaterThan(0);});
 it('builds finite real extruded glyphs and visible unsupported fallback',()=>{const c=defaultNeonSign('A🙂');const value=buildNeonGeometry(c);expect(value.glyphs.map(g=>g.character)).toEqual(['A','?']);expect(value.triangles).toBeGreaterThan(0);expect(value.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);expect(value.bounds.max[2]-value.bounds.min[2]).toBeGreaterThan(c.depth);expect(value.mountingGeometry).toBeDefined();disposeNeonGeometry(value);});
 it('bounds include mounts and double sided geometry',()=>{const c=defaultNeonSign('OPEN'),single=getNeonBounds(c),double=getNeonBounds({...c,doubleSided:true}),hanging=getNeonBounds({...c,mounting:'hanging'});expect(double.max[2]).toBeGreaterThan(0);expect(double.min[2]).toBeLessThan(-c.depth);expect(single.min[2]).toBeLessThan(0);expect(hanging.max[1]).toBeGreaterThan(single.max[1]);});
 it('shares geometry for uniform changes and disposes at final release',()=>{const c=defaultNeonSign('HI'),a=acquireNeonGeometry(c),b=acquireNeonGeometry({...c,color:'#00ff00',powered:false,effect:{...c.effect,mode:'pulse'}});expect(a.value).toBe(b.value);expect(neonGeometryKey(c)).toBe(neonGeometryKey({...c,brightness:4}));const dispose=vi.spyOn(a.value.geometry,'dispose');a.release();expect(dispose).not.toHaveBeenCalled();b.release();expect(dispose).toHaveBeenCalledTimes(1);b.release();expect(neonGeometryCacheStats().references).toBe(0);});
 it('samples all eight effects deterministically without changing authored config',()=>{for(const mode of NEON_EFFECTS){const c=defaultNeonSign('HELLO');c.effect.mode=mode;const before=JSON.stringify(c),sample=sampleNeonEffect(c,3.2,21);expect(sample).toEqual(sampleNeonEffect(c,3.2,21));expect(sample.brightness).toBeGreaterThanOrEqual(0);expect(sample.brightness).toBeLessThanOrEqual(c.brightness);expect(JSON.stringify(c)).toBe(before);expect(sampleNeonEffect({...c,powered:false},3.2,21).brightness).toBe(0);}});
 it('supports overnight timed signs and full intensity override',()=>{const c=defaultNeonSign();c.effect.mode='timed';expect(sampleNeonEffect(c,0,22).brightness).toBe(c.brightness);expect(sampleNeonEffect(c,0,12).brightness).toBe(0);c.effect.mode='pulse';c.effect.intensity=0;expect(sampleNeonEffect(c,0,12).brightness).toBe(c.brightness);});
 it('validates schema2 objects and the50sign world limit',()=>{const c=defaultNeonSign('HI'),object={id:'n',name:'Neon',kind:'neon-sign' as const,neon:c,position:[0,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number],scale:[1,1,1] as [number,number,number],color:'#ffffff',visible:true,collision:'none' as const};expect(validateWorld({...createWorld(),objects:[object]}).valid).toBe(true);expect(validateWorld({...createWorld(),objects:Array.from({length:51},(_,i)=>({...object,id:'n'+i}))}).errors).toContain('Worlds may contain at most 50 neon signs.');});
});


import {packWorldRepository,unpackWorldRepository} from './world-repository';
import {cloneSubtrees,resolveWorldMatrices} from './object-hierarchy';
import {neonTriangleCount,MAX_WORLD_NEON_TRIANGLES,MAX_NEON_TRIANGLES} from './neon-geometry';
import type {EditorObject} from './world';
const signObject=(id:string,config=defaultNeonSign('HELLO')):EditorObject=>({id,name:'Neon',kind:'neon-sign',neon:config,position:[1,2,3],rotation:[.1,.2,0],scale:[1,1,1],color:'#ffffff',visible:true,collision:'none'});
describe('neon portable data and budgets',()=>{
 it('round trips authored neon and hierarchy through split repository files',async()=>{
  const config={...defaultNeonSign('CAFE\n🙂'),doubleSided:true,mounting:'hanging' as const,effect:{...defaultNeonSign().effect,mode:'timed' as const,startHour:17,endHour:7}};
  const sign={...signObject('sign',config),parentId:'group'},group:EditorObject={id:'group',name:'Signs',kind:'group',position:[8,0,2],rotation:[0,.4,0],scale:[2,1,1],color:'#ffffff',visible:true,collision:'none'},project={...createWorld(),objects:[group,sign]};
  const files=await packWorldRepository(project),restored=await unpackWorldRepository(async path=>{const bytes=files.get(path);if(!bytes)throw new Error('Missing repository file');return bytes;});
  expect(restored.objects).toEqual(project.objects);expect(restored.objects[1]!.neon).toEqual(config);
  expect(resolveWorldMatrices(restored.objects).get('sign')!.elements).toEqual(resolveWorldMatrices(project.objects).get('sign')!.elements);
 });
 it('clones prefab and hierarchical sign configuration independently',()=>{
  const source=defaultNeonSign('SOURCE'),prefab=createNeonPrefab(source),a=parseNeonPrefab(prefab),b=parseNeonPrefab(prefab);
  a.text='EDITED';a.effect.seed=1;expect(b.text).toBe('SOURCE');expect(prefab.config.effect.seed).toBe(source.effect.seed);
  const group:EditorObject={id:'g',name:'Signs',kind:'group',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#ffffff',visible:true,collision:'none'},sign={...signObject('s',source),parentId:'g'},project={...createWorld(),objects:[group,sign]},clone=cloneSubtrees(project,['g']);
  const clonedSign=clone.objects.find(o=>o.kind==='neon-sign')!;expect(clonedSign.id).not.toBe('s');expect(clonedSign.parentId).toBe(clone.rootIds[0]);clonedSign.neon!.text='CLONE';clonedSign.neon!.effect.seed=3;expect(source.text).toBe('SOURCE');expect(source.effect.seed).toBe(7319);
 });
 it('rejects aggregate triangle overflow while each reused sign stays within its cap',()=>{
  const config={...defaultNeonSign('B'.repeat(20)),quality:'high' as const,doubleSided:true,font:'optimer' as const};
  const triangles=neonTriangleCount(config);expect(triangles).toBeLessThanOrEqual(MAX_NEON_TRIANGLES);
  const count=Math.floor(MAX_WORLD_NEON_TRIANGLES/triangles)+1;expect(count).toBeLessThanOrEqual(50);
  const p={...createWorld(),objects:Array.from({length:count},(_,i)=>signObject('n'+i,config))},saved=JSON.stringify(p),result=validateWorld(p);
  expect(result.valid).toBe(false);expect(result.errors).toContain('Neon signs exceed the world budget of 1,000,000 triangles.');expect(JSON.stringify(p)).toBe(saved);
 });
});

