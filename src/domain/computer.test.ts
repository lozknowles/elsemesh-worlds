import {describe,it,expect} from 'vitest';
import {buildComputerGeometry,disposeComputerGeometry,COMPUTER_BOUNDS,defaultComputer,validateComputer} from './computer';
import {cloneSubtrees} from './object-hierarchy';
import {createWorld,validateWorld} from './world';
import type{EditorObject}from'./world';
import {defaultNeonSign}from'./neon-sign';
const prop=(id:string):EditorObject=>({id,name:id,kind:'computer',computer:defaultComputer(),position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true,color:'#ffffff',collision:'solid'});
describe('computer prop',()=>{
 it('builds shared finite geometry with matching fixed bounds',()=>{const value=buildComputerGeometry();expect(value.parts.find(p=>p.name==='screen')?.emissive).toBe(true);for(const p of value.parts)expect(p.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);value.bounds.min.forEach((n,i)=>expect(n).toBeCloseTo(COMPUTER_BOUNDS.min[i]!,6));value.bounds.max.forEach((n,i)=>expect(n).toBeCloseTo(COMPUTER_BOUNDS.max[i]!,6));disposeComputerGeometry(value);});
 it('validates bounded config and allows missing targets without breaking load',()=>{expect(validateComputer(defaultComputer('not-in-world'))).toEqual([]);expect(validateComputer({...defaultComputer(),screenColor:'url(x)'}).length).toBeGreaterThan(0);expect(validateComputer({...defaultComputer(),targetSignId:'x'.repeat(121)}).length).toBeGreaterThan(0);expect(validateWorld({...createWorld(),objects:[{...prop('pc'),computer:defaultComputer('missing')}]}).valid).toBe(true);expect(validateWorld({...createWorld(),objects:Array.from({length:33},(_,i)=>prop('pc'+i))}).errors).toContain('Worlds may contain at most 32 computers.');});
 it('remaps cloned internal sign references while preserving external links',()=>{const pc={...prop('pc'),computer:defaultComputer('sign')},sign:EditorObject={...prop('sign'),kind:'neon-sign',computer:undefined,neon:defaultNeonSign()},world={...createWorld(),objects:[pc,sign]};const both=cloneSubtrees(world,['pc','sign']);expect(both.objects.find(o=>o.kind==='computer')!.computer!.targetSignId).toBe(both.objects.find(o=>o.kind==='neon-sign')!.id);expect(cloneSubtrees(world,['pc']).objects[0]!.computer!.targetSignId).toBe('sign');expect(pc.computer.targetSignId).toBe('sign');});
});

