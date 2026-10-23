import { test,expect } from '@playwright/test';
import { createWorld,type EditorObject } from '../src/domain/world';
import { defaultComputer } from '../src/domain/computer';
import { defaultNeonSign } from '../src/domain/neon-sign';
import fs from 'node:fs/promises';

test('native neon geometry and effects render with existing bloom',async({page})=>{
 test.setTimeout(90000);const world=createWorld('Native neon acceptance');world.terrain.heights.fill(0);world.environment.timeOfDay=22;
 const neon=defaultNeonSign('THE RED LION');neon.effect.mode='flicker';
 world.objects=[{id:'neon',name:'The Red Lion',kind:'neon-sign',neon,position:[0,3,0],rotation:[0,0,0],scale:[1,1,1],color:neon.color,visible:true,collision:'none'} as EditorObject];
 world.objects.push({id:'computer',name:'Computer',kind:'computer',computer:defaultComputer('neon'),position:[2,1,0],rotation:[0,0,0],scale:[1,1,1],color:'#282e38',visible:true,collision:'solid'});
 await page.goto('/');await page.locator('input[type=file][accept*=".emw"]').setInputFiles({name:'neon.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
 await page.getByRole('button',{name:/ElseMesh graphics/}).click();const frame=page.frames().find(f=>f.url().includes('native-preview.html'))!;
 await expect(page.frameLocator('iframe').locator('#status')).toContainText('drag to look',{timeout:45000});
 const state=await frame.evaluate(()=> (window as unknown as {__nativePreview:{neons:{text:string;glyphs:number;brightness:number;emissive:number[]}[];computers:{id:string;parts:{name:string;vertices:number;emissive:number[]}[]}[];frames:number}}).__nativePreview);
 expect(state.neons).toHaveLength(1);expect(state.neons[0]!.text).toBe('THE RED LION');expect(state.neons[0]!.glyphs).toBeGreaterThan(0);expect(state.neons[0]!.emissive.some(value=>value>0)).toBe(true);
 expect(state.computers).toHaveLength(1);expect(state.computers[0]!.parts).toHaveLength(8);expect(state.computers[0]!.parts.find(part=>part.name==='screen')!.emissive.some(value=>value>0)).toBe(true);
 await page.screenshot({path:'.local-evidence/neon-native.png'});
 await fs.writeFile('.local-evidence/neon-native.json',JSON.stringify(state,null,2));
});

for(const count of [1,10,50])test('software renderer profile '+count+' signs',async({page})=>{
 test.setTimeout(90000);const world=createWorld('Neon profile '+count);world.terrain.heights.fill(0);
 world.objects=Array.from({length:count},(_,i)=>{const neon=defaultNeonSign('OPEN');neon.quality='low';return{id:'neon-'+i,name:'Sign '+i,kind:'neon-sign',neon,position:[(i%10)*5-22,2,-Math.floor(i/10)*4] as [number,number,number],rotation:[0,0,0] as [number,number,number],scale:[1,1,1] as [number,number,number],color:neon.color,visible:true,collision:'none'};});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');
 await page.locator('input[type=file][accept*=".emw"]').setInputFiles({name:'profile.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
 await expect(page.locator('header')).toContainText('Neon profile '+count);
 await expect.poll(()=>page.evaluate(async()=>{
  const fiber=await import('/node_modules/.vite/deps/@react-three_fiber.js');const signs=new Set<string>();
  const root=fiber._roots.get(document.querySelector('main canvas'));root?.store.getState().scene.traverse((node:{userData:Record<string,unknown>;geometry?:{getAttribute:(name:string)=>{count:number}};material?:{isMeshStandardMaterial:boolean;emissiveIntensity:number}})=>{if(node.userData.neonCore&&node.geometry?.getAttribute('position').count&&node.material?.isMeshStandardMaterial&&node.material.emissiveIntensity>0)signs.add(String(node.userData.neonObjectId));});return signs.size;
 })).toBe(count);
 const renderStats=await page.evaluate(async()=>{const fiber=await import('/node_modules/.vite/deps/@react-three_fiber.js');const state=fiber._roots.get(document.querySelector('main canvas')).store.getState();return{drawCalls:state.gl.info.render.calls,triangles:state.gl.info.render.triangles,geometries:state.gl.info.memory.geometries};});
 const intervals=await page.evaluate(()=>new Promise<number[]>(resolve=>{const values:number[]=[];let previous=0;const sample=(time:number)=>{if(previous)values.push(time-previous);previous=time;if(values.length<60)requestAnimationFrame(sample);else resolve(values);};requestAnimationFrame(sample);}));
 const sorted=[...intervals].sort((a,b)=>a-b),result={count,environment:'headless Chromium SwiftShader; low quality; frame scheduling only, not physical GPU qualification',renderStats,samples:intervals.length,meanMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,p95Ms:sorted[Math.floor(sorted.length*.95)],errors};
 await fs.writeFile('.local-evidence/neon-profile-'+count+'.json',JSON.stringify(result,null,2));expect(errors).toEqual([]);
});
