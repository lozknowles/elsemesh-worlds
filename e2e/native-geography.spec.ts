import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { createWorld, validateWorld } from '../src/domain/world';

const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as {PNG:{sync:{read(buffer:Buffer):{width:number;height:number;data:Buffer}}}};
test('native geographic imagery preserves north/east orientation, exact bounds and uncovered palette',async({page})=>{
  test.setTimeout(90000);const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const out=path.resolve('../../outputs');mkdirSync(out,{recursive:true});
  await page.goto('/');
  const image=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d')!;for(const [color,x,y] of [['#f02020',0,0],['#20e020',32,0],['#2020f0',0,32],['#e0e020',32,32]] as const){ctx.fillStyle=color;ctx.fillRect(x,y,32,32);}return canvas.toDataURL('image/png');});
  const world=createWorld('Synthetic BNG orientation fixture');world.terrain.heights.fill(100);world.environment.mistDensity=0;world.environment.timeOfDay=12;
  world.geography={crs:'EPSG:27700',center:{easting:483000,northing:365000},bounds:{west:482936,east:483064,south:364936,north:365064},sourceSpacing:2,outputSpacing:2,sourceName:'Synthetic test elevations (not a survey)',license:'Test fixture',attribution:'Authored orientation test',verticalDatum:'Synthetic metres'};
  world.terrainImagery={crs:'EPSG:27700',bounds:{west:482968,east:483032,south:364968,north:365032},dataUrl:image,sourceName:'Synthetic orientation quadrants',license:'Test fixture',attribution:'Authored red NW, green NE, blue SW, yellow SE'};
  expect(validateWorld(world).errors).toEqual([]);
  await page.locator('input[type=file][accept*=".emw"]').setInputFiles({name:'native-geography.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
  await page.getByRole('button',{name:'ElseMesh graphics'}).click();
  const locator=page.frameLocator('iframe[title="ElseMesh native WebGPU preview"]');await expect(locator.locator('#status')).toContainText('drag to look',{timeout:45000});
  const native=page.frames().find(frame=>frame.url().includes('native-preview.html'))!;
  const read=()=>native.evaluate(()=> (window as unknown as {__nativePreview:{terrain:{imagery:boolean;error?:string;localBounds?:unknown};camera:number[];frames:number}}).__nativePreview);
  await expect.poll(async()=> (await read())?.terrain.imagery,{timeout:20000}).toBe(true);
  const state=await read();expect(state.camera[1]).toBeGreaterThan(100);expect(state.terrain.localBounds).toEqual({west:-32,northZ:-32,width:64,depth:64});
  await page.getByRole('button',{name:'Hide controls'}).click();await page.waitForTimeout(2000);
  const canvas=locator.locator('canvas'), rect=await canvas.boundingBox();if(!rect) throw new Error('Native canvas missing.');
  const screenshot=await canvas.screenshot(), png=PNG.sync.read(screenshot);
  const camera=new THREE.PerspectiveCamera(62,rect.width/rect.height,.06,60000);camera.position.fromArray(state.camera);camera.rotation.order='YXZ';camera.rotation.x=-Math.atan2(state.camera[1]!-100,state.camera[2]!);camera.updateMatrixWorld();
  const sample=(x:number,z:number)=>{
    const p=new THREE.Vector3(x,100,z).project(camera), px=Math.round((p.x*.5+.5)*png.width),py=Math.round((.5-p.y*.5)*png.height);const color=[0,0,0];
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const i=((py+dy)*png.width+px+dx)*4;for(let c=0;c<3;c++)color[c]!+=png.data[i+c]!/25;}
    return {pixel:[px,py],color};
  };
  const samples={NW:sample(-16,-16),NE:sample(16,-16),SW:sample(-16,16),SE:sample(16,16),uncovered:sample(48,0)};
  expect(samples.NW.color[0]!).toBeGreaterThan(samples.NW.color[1]!*1.3);expect(samples.NW.color[0]!).toBeGreaterThan(samples.NW.color[2]!*1.3);
  expect(samples.NE.color[1]!).toBeGreaterThan(samples.NE.color[0]!*1.3);expect(samples.NE.color[1]!).toBeGreaterThan(samples.NE.color[2]!*1.3);
  expect(samples.SW.color[2]!).toBeGreaterThan(samples.SW.color[0]!*1.3);expect(samples.SW.color[2]!).toBeGreaterThan(samples.SW.color[1]!*1.3);
  expect(samples.SE.color[0]!).toBeGreaterThan(samples.SE.color[2]!*1.3);expect(samples.SE.color[1]!).toBeGreaterThan(samples.SE.color[2]!*1.3);
  expect(Math.abs(samples.uncovered.color[0]!-samples.uncovered.color[1]!)).toBeLessThan(35);
  await page.screenshot({path:path.join(out,'native-geographic-imagery.png')});
  const pngBytes=Buffer.from(image.split(',')[1]!,'base64');world.terrainImagery.dataUrl='data:image/png;base64,'+pngBytes.subarray(0,24).toString('base64');
  await page.evaluate(project=>document.querySelector('iframe')?.contentWindow?.postMessage({type:'elsemesh-native-project',project},location.origin),world);
  await expect.poll(async()=> (await read())?.terrain.error??'',{timeout:10000}).not.toBe('');expect((await read()).terrain.imagery).toBe(false);
  writeFileSync(path.join(out,'native-geographic-imagery-evidence.json'),JSON.stringify({errors,state,samples,failedDecodeFallback:(await read()).terrain},null,2));expect(errors).toEqual([]);
});
