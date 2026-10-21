import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type * as THREE from 'three';
import type { EditorObject, WorldProject } from '../src/domain/world';
import { createWorld, inspectGlbJson, validateWorld } from '../src/domain/world';
import { assetLibrary, groundObject } from '../src/domain/asset-library';
import { materialFixtureGlb } from './helpers/native-glb-fixture';

type Primitive={materialIndex:number;indices:number;roughness:number;metalness:number;color:number[];textured:boolean;firstPosition:number[]};
type NativeAsset={objectId:string;error?:string;primitives:Primitive[];warnings:string[]};
function addAsset(world:WorldProject,bytes:Buffer,id:string) {
  const inspection=inspectGlbJson(Uint8Array.from(bytes).buffer);
  const asset={id,name:id,bytes:bytes.length,mediaType:'model/gltf-binary',dataUrl:`data:application/octet-stream;base64,${bytes.toString('base64')}`,materialCount:inspection.materialCount,bounds:inspection.bounds};
  world.assets.push(asset);return asset;
}
function object(id:string,assetId:string,x=0):EditorObject {return{id,name:id,kind:'glb',assetId,position:[x,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#ffffff',visible:true,collision:'solid'};}
const out=path.resolve('../../outputs');

test('native real GLB uses source slots across primitives/shared meshes and resets sparse overrides',async({page})=>{
  test.setTimeout(90000);mkdirSync(out,{recursive:true});const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const world=createWorld('Native GLB material slots');world.terrain.heights.fill(0);world.environment.mistDensity=0;
  const asset=addAsset(world,materialFixtureGlb(),'multi-material');
  world.objects=[groundObject(object('original',asset.id,-10),asset,world.terrain),groundObject(object('override',asset.id,-10),asset,world.terrain)];
  world.objects[0]!.position[2]=-8;world.objects[1]!.position[2]=8;
  world.objects[1]!.materialOverrides=[{materialIndex:0,color:'#18e052',roughness:.33,metalness:.44}];
  expect(validateWorld(world).errors).toEqual([]);
  await page.goto('/');await page.locator('input[type=file][accept*=".emw"]').setInputFiles({name:'native-materials.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
  const grouped=await page.evaluate(async dataUrl=>{
    const admission=await import('/src/ui/asset-admission.ts');
    const adapter=await import('/src/native/NativeAssets.js');
    const loaded=await admission.inspectAndLoadAsset(await (await fetch(dataUrl)).arrayBuffer());
    const meshes: THREE.Mesh[]=[];loaded.scene.traverse((child:THREE.Object3D)=>{if((child as THREE.Mesh).isMesh)meshes.push(child as THREE.Mesh);});
    const sample=meshes[0]!.clone();sample.geometry=sample.geometry.clone();sample.geometry.clearGroups();sample.geometry.addGroup(0,18,0);sample.geometry.addGroup(18,18,1);sample.material=[meshes[0]!.material as THREE.Material,meshes[1]!.material as THREE.Material];sample.matrixWorld.makeScale(-1,1,1);
    const parts=adapter.assetPrimitiveGroups(sample);
    const result=parts.map((part:{geometry:THREE.BufferGeometry;material:THREE.Material})=>({slot:loaded.materialIndices.get(part.material),count:part.geometry.index!.count,index:Array.from(part.geometry.index!.array).slice(0,3)}));
    parts.forEach((part:{geometry:THREE.BufferGeometry})=>part.geometry.dispose());sample.geometry.dispose();admission.disposeAssetScene(loaded.scene);return result;
  },asset.dataUrl);
  expect(grouped.map(p=>[p.slot,p.count])).toEqual([[0,18],[1,18]]);expect(grouped[0]!.index).toEqual([0,1,2]);
  await page.getByRole('button',{name:'ElseMesh graphics'}).click();
  await expect(page.frameLocator('iframe[title="ElseMesh native WebGPU preview"]').locator('#status')).toContainText('drag to look',{timeout:45000});
  const frame=page.frames().find(frame=>frame.url().includes('native-preview.html'))!;
  const read=()=>frame.evaluate(()=> (window as unknown as {__nativePreview:{assets:NativeAsset[]}}).__nativePreview?.assets??[]);
  await expect.poll(async()=> (await read()).length,{timeout:30000}).toBe(2);
  const initial=await read(), original=initial.find(a=>a.objectId==='original')!, overridden=initial.find(a=>a.objectId==='override')!;
  expect(original.error).toBeUndefined();expect(overridden.error).toBeUndefined();
  expect(original.primitives.map(p=>p.materialIndex)).toEqual([0,1,0]);expect(original.primitives.map(p=>p.indices)).toEqual([36,36,36]);
  for(const p of overridden.primitives.filter(p=>p.materialIndex===0)) {expect(p.roughness).toBeCloseTo(.33);expect(p.metalness).toBeCloseTo(.44);expect(p.color[1]).toBeGreaterThan(p.color[0]!);}
  expect(overridden.primitives.find(p=>p.materialIndex===1)).toMatchObject(original.primitives.find(p=>p.materialIndex===1)!);
  expect(original.primitives[0]!.firstPosition[0]).toBeCloseTo(6.41421356,4);
  expect(original.primitives[0]!.firstPosition[1]).toBeCloseTo(3.2,4);
  await page.waitForTimeout(1600);await page.screenshot({path:path.join(out,'native-glb-material-slots.png')});
  delete world.objects[1]!.materialOverrides;
  await page.evaluate(project=>document.querySelector('iframe')?.contentWindow?.postMessage({type:'elsemesh-native-project',project},location.origin),world);
  await expect.poll(async()=> (await read()).find(a=>a.objectId==='override')?.primitives[0]?.roughness).toBeCloseTo(.8);
  const reset=await read();expect(reset.find(a=>a.objectId==='override')!.primitives).toEqual(original.primitives);
  writeFileSync(path.join(out,'native-glb-material-evidence.json'),JSON.stringify({errors,initial,reset},null,2));expect(errors).toEqual([]);
});

test('native renders all four catalog GLBs with embedded base-color textures',async({page})=>{
  test.setTimeout(120000);mkdirSync(out,{recursive:true});const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const world=createWorld('ElseMesh donor catalog · native');world.terrain.heights.fill(0);world.environment.mistDensity=0;
  const catalog=assetLibrary.filter(asset=>asset.assetUrl);
  for(const [index,entry] of catalog.entries()) {
    const asset=addAsset(world,readFileSync(path.resolve('public'+entry.assetUrl)),entry.id);
    const item=object(entry.id,asset.id,-15+index*10);item.position[2]=0;
    const extent=Math.max(...asset.bounds!.max.map((n,i)=>n-asset.bounds!.min[i]!)), scale=6/extent;
    item.scale=[scale,scale,scale];
    world.objects.push(groundObject(item,asset,world.terrain));
  }
  expect(world.objects).toHaveLength(4);expect(validateWorld(world).errors).toEqual([]);
  await page.goto('/');await page.locator('input[type=file][accept*=".emw"]').setInputFiles({name:'donor-catalog.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
  await page.getByRole('button',{name:'ElseMesh graphics'}).click();
  await expect(page.frameLocator('iframe[title="ElseMesh native WebGPU preview"]').locator('#status')).toContainText('drag to look',{timeout:60000});
  const frame=page.frames().find(frame=>frame.url().includes('native-preview.html'))!;
  const read=()=>frame.evaluate(()=> (window as unknown as {__nativePreview:{assets:NativeAsset[]}}).__nativePreview?.assets??[]);
  await expect.poll(async()=> (await read()).length,{timeout:60000}).toBe(4);
  const assets=await read();for(const asset of assets) {expect(asset.error).toBeUndefined();expect(asset.primitives.length).toBeGreaterThan(0);expect(asset.primitives.every(p=>p.textured)).toBe(true);expect(asset.warnings.every(w=>w.includes('normal/ORM/AO/emissive'))).toBe(true);}
  await page.getByRole('button',{name:'Hide controls'}).click();
  const canvas=frame.locator('canvas'), bounds=await canvas.boundingBox();
  if(!bounds) throw new Error('Native canvas is missing.');
  await page.mouse.move(bounds.x+400,bounds.y+230);await page.mouse.down();await page.mouse.move(bounds.x+500,bounds.y+230,{steps:10});await page.mouse.up();
  await page.keyboard.down('q');await page.waitForTimeout(700);await page.keyboard.up('q');
  await page.waitForTimeout(2500);await page.screenshot({path:path.join(out,'native-donor-catalog.png')});
  writeFileSync(path.join(out,'native-donor-catalog-evidence.json'),JSON.stringify({errors,assets},null,2));expect(errors).toEqual([]);
});
