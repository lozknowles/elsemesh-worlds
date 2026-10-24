import {describe,it,expect} from 'vitest';
import {createWorld,validateWorld,createPlayerWorldPackage,validatePlayerWorldPackage,type EditorObject} from './world';
import {OBJECT_ACCESS_SCHEMA,effectiveObjectAccess,validateObjectAccess,setObjectAccessActions} from './object-access';
import {defaultComputer} from './computer';
import {defaultNeonSign} from './neon-sign';
import {packWorldRepository,unpackWorldRepository} from './world-repository';
import {cloneSubtrees} from './object-hierarchy';
const object=(id:string,kind:EditorObject['kind']='box'):EditorObject=>({id,name:id,kind,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#ffffff',visible:true,collision:'none',...(kind==='computer'?{computer:defaultComputer()}:{}),...(kind==='neon-sign'?{neon:defaultNeonSign()}: {})});
const world=()=>({...createWorld(),objects:[object('pc','computer'),object('sign','neon-sign'),object('retro'),object('screen')],terminals:[{id:'terminal-1',objectId:'retro',kind:'c64' as const,screenObjectId:'screen',position:[0,0,0] as [number,number,number],interactionRadius:3}]});
describe('authored object access',()=>{
 it('distinguishes absent legacy defaults, empty deny all and malformed policies',()=>{
  const p=world();expect(effectiveObjectAccess(p).rules).toHaveLength(3);
  const explicit={...p,objectAccess:{schema:OBJECT_ACCESS_SCHEMA,rules:[]}};
  expect(effectiveObjectAccess(explicit).rules).toEqual([]);
  for(const value of [undefined,null,{}, {schema:OBJECT_ACCESS_SCHEMA,rules:[],grants:[]},{schema:OBJECT_ACCESS_SCHEMA,rules:[{objectId:'pc',actions:['computer.use','computer.use']}]},{schema:OBJECT_ACCESS_SCHEMA,rules:[{objectId:'missing',actions:[]}]},{schema:OBJECT_ACCESS_SCHEMA,rules:[{objectId:'pc',actions:[],players:[]}]}])expect(validateWorld({...p,objectAccess:value}).valid).toBe(false);
 });
 it('maps only supported object kinds and canonical retro anchors',()=>{
  const p=world();expect(validateObjectAccess(setObjectAccessActions(p,'retro',['computer.use']))).toEqual([]);
  for(const [objectId,actions] of [['screen',['computer.use']],['pc',['neon.power']],['sign',['computer.use']]] as const)expect(validateObjectAccess({...p,objectAccess:{schema:OBJECT_ACCESS_SCHEMA,rules:[{objectId,actions:[...actions]}]}}).length).toBeGreaterThan(0);
  expect(validateObjectAccess({...p,objectAccess:{schema:OBJECT_ACCESS_SCHEMA,rules:[{objectId:'pc',actions:[]},{objectId:'pc',actions:[]}]}}).length).toBeGreaterThan(0);
 });
 it('roundtrips policy and mandatory export capability with hashed repository components',async()=>{
  const p=setObjectAccessActions(world(),'pc',[]),files=await packWorldRepository(p);
  const manifest=JSON.parse(new TextDecoder().decode(files.get('world.json')!));
  expect(manifest.engine.requires).toContain('object-access/1');
  expect(manifest.components.connections.path).toMatch(/connections.json$/);
  expect(await unpackWorldRepository(async path=>files.get(path)!)).toEqual(p);
  const pkg=createPlayerWorldPackage(p);expect(pkg.capabilities).toContain('object-access/1');expect(validatePlayerWorldPackage(pkg).valid).toBe(true);
  expect(validatePlayerWorldPackage({...pkg,capabilities:pkg.capabilities!.filter(c=>c!=='object-access/1')}).valid).toBe(false);
  expect(createPlayerWorldPackage(createWorld()).capabilities).toContain('object-access/1');
 });
 it('remaps copied rules and retro anchor/screen references without granting other actions',()=>{
  const p=setObjectAccessActions(world(),'sign',['neon.power']),clone=cloneSubtrees(p,['pc','sign','retro','screen']);
  const id=(name:string)=>clone.objects.find(o=>o.name===name)!.id;
  expect(clone.objectAccess!.rules.find(r=>r.objectId===id('sign'))!.actions).toEqual(['neon.power']);
  expect(clone.terminals![0]!.objectId).toBe(id('retro'));expect(clone.terminals![0]!.screenObjectId).toBe(id('screen'));
  expect(p.objectAccess!.rules.find(r=>r.objectId==='sign')!.actions).toEqual(['neon.power']);
 });
});

it('roundtrips a plain text welcome and rejects malformed welcome fields',async()=>{
 const p={...createWorld(),welcome:{schema:'elsemesh.world-welcome/1' as const,text:'Welcome to <Lost Island> — example.org',audio:true}};
 expect(validateWorld(p).valid).toBe(true);
 const files=await packWorldRepository(p);expect(await unpackWorldRepository(async path=>files.get(path)!)).toEqual(p);
 expect(createPlayerWorldPackage(p).capabilities).toContain('welcome/1');
 for(const welcome of [null,undefined,{}, {...p.welcome,audio:'yes'},{...p.welcome,text:' '},{...p.welcome,text:'x'.repeat(2001)},{...p.welcome,text:'a\u0000b'},{...p.welcome,audioUrl:'https://example.org/a.mp3'}])expect(validateWorld({...p,welcome}).valid).toBe(false);
});
