import {test,expect,type Page} from '@playwright/test';
import {createWorld,type EditorObject,type Vec3,type WorldProject} from '../src/domain/world';
import {defaultNeonSign} from '../src/domain/neon-sign';
import {defaultComputer} from '../src/domain/computer';
const box=(id:string,size:Vec3,position:Vec3,collision:'solid'|'walkable'='walkable'):EditorObject=>({id,name:id,kind:'box',position,rotation:[0,0,0],scale:size.map(n=>n/1.6) as Vec3,color:'#888877',visible:true,collision});
async function open(page:Page,world:WorldProject){await page.locator('input[type=file][accept*=".emw"]').setInputFiles({name:'walk.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});await expect(page.getByText('Project opened',{exact:true})).toBeVisible();}
async function camera(page:Page){return page.evaluate(async()=>{const fiber=await import('/node_modules/.vite/deps/@react-three_fiber.js');return fiber._roots.get(document.querySelector('main canvas')).store.getState().camera.position.toArray() as [number,number,number];});}
async function renderedFrame(page:Page){return page.evaluate(async()=>{const fiber=await import('/node_modules/.vite/deps/@react-three_fiber.js');return fiber._roots.get(document.querySelector('main canvas')).store.getState().gl.info.render.frame as number;});}
function fixture(){const world=createWorld('Stair and terminal acceptance');world.terrain.heights.fill(0);world.spawn.position=[0,0,3.8];
 world.objects=[...Array.from({length:10},(_,index)=>box('Step '+(index+1),[1.8,.2,.5],[0,.2*(index+1)-.1,3-index*.5])),box('Upper floor',[8,.2,4],[0,1.9,-3.75])];
 const neon=defaultNeonSign("Loz's new build");neon.color='#36ff82';neon.size=.3;
 world.objects.push({id:'sign',name:'Green house sign',kind:'neon-sign',neon,position:[0,3.65,-4],rotation:[0,0,0],scale:[1,1,1],color:neon.color,visible:true,collision:'none'});
 world.objects.push({id:'computer',name:'Upper floor computer',kind:'computer',computer:defaultComputer('sign'),position:[0,3,-3],rotation:[0,0,0],scale:[1,1,1],color:'#111111',visible:true,collision:'none'});return world;}
test('reload, physically climb stairs, use computer world and lighting UI, close and keep walking',async({page},testInfo)=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'New world',exact:true})).toBeEnabled();await open(page,fixture());
 await expect.poll(()=>page.evaluate(async()=>{const persistence=await import('/src/domain/persistence.ts');return(await persistence.loadWorkspace())?.project.metadata.name;})).toBe('Stair and terminal acceptance');await page.reload();await expect(page.locator('header')).toContainText('Stair and terminal acceptance');
 await page.getByRole('button',{name:/Enter preview/}).click();await page.keyboard.down('w');const trajectory:{elapsedMs:number;position:number[]}[]=[],started=Date.now();try{await expect.poll(async()=>{const pos=await camera(page);trajectory.push({elapsedMs:Date.now()-started,position:pos});return {y:Number(pos[1].toFixed(2)),z:Number(pos[2].toFixed(2))};},{timeout:30000}).toMatchObject({y:3.65});}finally{await page.keyboard.up('w');await testInfo.attach('stair-camera-trajectory',{body:JSON.stringify(trajectory,null,2),contentType:'application/json'});}
 const before=await camera(page);expect(before[2]).toBeLessThan(-1);expect(before[1]).toBeCloseTo(3.65,1);
 await expect(page.locator('.neon-interaction')).toContainText('Open Upper floor computer');await page.keyboard.press('e');await expect(page.getByRole('dialog',{name:'World computer'})).toBeVisible();
 await page.getByRole('button',{name:'World Info',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Stair and terminal acceptance');
 await page.getByRole('button',{name:'Lighting Controls',exact:true}).click();await page.getByRole('button',{name:'Turn linked sign off',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('OFF');
 await expect.poll(()=>page.evaluate(async()=>{const fiber=await import('/node_modules/.vite/deps/@react-three_fiber.js');let brightness=-1;fiber._roots.get(document.querySelector('main canvas')).store.getState().scene.traverse((node:{userData:Record<string,unknown>;material?:{emissiveIntensity:number}})=>{if(node.userData.neonCore)brightness=node.material!.emissiveIntensity;});return brightness;})).toBe(0);
 const pausedFrame=await renderedFrame(page);await page.keyboard.down('w');try{await expect.poll(()=>renderedFrame(page),{timeout:15000}).toBeGreaterThanOrEqual(pausedFrame+3);const paused=await camera(page);for(let axis=0;axis<3;axis++)expect(paused[axis]).toBeCloseTo(before[axis]!,3);}finally{await page.keyboard.up('w');await testInfo.attach('paused-camera-render-evidence',{body:JSON.stringify({startFrame:pausedFrame,endFrame:await renderedFrame(page),before,after:await camera(page)},null,2),contentType:'application/json'});}
 await page.getByRole('button',{name:'Close computer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect((await camera(page))[2]).toBeCloseTo(before[2],3);
 const resumeFrame=await renderedFrame(page);await page.keyboard.down('w');const resumeTrajectory:{elapsedMs:number;frame:number;position:number[]}[]=[],resumeStarted=Date.now();try{await expect.poll(async()=>{const position=await camera(page),frame=await renderedFrame(page);resumeTrajectory.push({elapsedMs:Date.now()-resumeStarted,frame,position});return frame>resumeFrame&&position[2]<before[2]-.1;},{timeout:15000}).toBe(true);}finally{await page.keyboard.up('w');await testInfo.attach('resume-camera-trajectory',{body:JSON.stringify(resumeTrajectory,null,2),contentType:'application/json'});}
});
test('standing and jumping under the upper floor never snaps onto its top',async({page})=>{
 const world=fixture();world.objects=world.objects.filter(object=>object.id==='Upper floor');world.spawn.position=[0,0,-3];
 await page.goto('/');await expect(page.getByRole('button',{name:'New world',exact:true})).toBeEnabled();await open(page,world);await page.getByRole('button',{name:/Enter preview/}).click();
 await page.waitForTimeout(250);expect((await camera(page))[1]).toBeCloseTo(1.65,2);
 await page.keyboard.down('Space');const heights:number[]=[];for(let i=0;i<6;i++){await page.waitForTimeout(70);heights.push((await camera(page))[1]);}await page.keyboard.up('Space');expect(Math.max(...heights)).toBeLessThan(1.72);
});
