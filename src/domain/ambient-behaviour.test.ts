import {describe,expect,it} from 'vitest';
import {AMBIENT_BEHAVIOUR_SCHEMA,evaluateAmbientBehaviour,validateAmbientBehaviour} from './ambient-behaviour';
import {assetLibrary,createLibraryObject} from './asset-library';
import {createWorld,validateWorld,type WorldAsset} from './world';
import {packWorldRepository,unpackWorldRepository} from './world-repository';
import {readFileSync} from 'node:fs';

const bird={schema:AMBIENT_BEHAVIOUR_SCHEMA,kind:'bird-flight' as const,speed:3,radius:8,seed:17};
const crab={...bird,kind:'crab-walk' as const,speed:.25,radius:2};
const fish={...bird,kind:'fish-swim' as const,speed:1,radius:5};

describe('declarative ambient wildlife',()=>{
 it('rejects executable and unbounded behaviour data',()=>{
  expect(validateAmbientBehaviour({...bird,code:'alert(1)'})).not.toEqual([]);
  expect(validateAmbientBehaviour({...bird,speed:Infinity})).not.toEqual([]);
  expect(validateAmbientBehaviour({...bird,radius:100000})).not.toEqual([]);
  expect(validateAmbientBehaviour({...bird,kind:'script'})).not.toEqual([]);
 });
 it('evaluates deterministic bounded paths without changing the authored anchor',()=>{
  const habitat={groundHeight:()=>0,waterLevel:8,bounds:{width:80,depth:80}};
  for(const [behaviour,anchor] of [
   [bird,[0,4,0]],[crab,[0,0,0]],[fish,[0,4,0]],
  ] as const){
   const pose=evaluateAmbientBehaviour(behaviour,[...anchor],0,3,habitat);
   expect(pose).toEqual(evaluateAmbientBehaviour(behaviour,[...anchor],0,3,habitat));
   expect(pose.active).toBe(true);
   expect(Math.hypot(pose.position[0]-anchor[0],pose.position[2]-anchor[2])).toBeLessThanOrEqual(behaviour.radius+1e-8);
   if(behaviour.kind==='crab-walk')expect(pose.position[1]).toBe(0);
   if(behaviour.kind==='fish-swim'){expect(pose.position[1]).toBeGreaterThanOrEqual(.2);expect(pose.position[1]).toBeLessThanOrEqual(7.65);}
   if(behaviour.kind==='bird-flight')expect(pose.position[1]).toBeGreaterThanOrEqual(1.2);
   expect(anchor).toEqual(behaviour.kind==='crab-walk'?[0,0,0]:[0,4,0]);
  }
  const anchor:[number,number,number]=[0,4,0];
  expect(evaluateAmbientBehaviour(fish,anchor,0,3,{groundHeight:()=>3}).active).toBe(false);
  expect(evaluateAmbientBehaviour(crab,anchor,0,3,{groundHeight:()=>-4}).active).toBe(false);
 });
 it('saves a placed bird route and world weather unchanged through a repository',async()=>{
  const project=createWorld('Wildlife and weather');
  const entry=assetLibrary.find(a=>a.id==='wildlife-laughing-gull')!;
  const bytes=readFileSync('public'+entry.assetUrl!);
  const asset:WorldAsset={id:'bird-asset',name:entry.name,mediaType:'model/gltf-binary',dataUrl:'data:application/octet-stream;base64,'+bytes.toString('base64'),bytes:bytes.length,source:entry.source,license:entry.license};
  project.assets.push(asset);
  const object=createLibraryObject(entry,[2,5,3],'bird-one');object.assetId=asset.id;project.objects.push(object);
  project.environment={...project.environment,weather:'storm',cloudCoverage:.92,mistDensity:0,rainIntensity:.7,windSpeed:0};
  expect(object.ambientBehaviour?.kind).toBe('bird-flight');
  expect(validateWorld(project).valid).toBe(true);
  const files=await packWorldRepository(project);
  const restored=await unpackWorldRepository(async path=>files.get(path)!);
  expect(restored.objects[0]?.ambientBehaviour).toEqual(object.ambientBehaviour);
  expect(restored.environment).toEqual(project.environment);
  expect(validateWorld({...project,objects:[{...object,collision:'solid'}]}).valid).toBe(false);
 });
});
