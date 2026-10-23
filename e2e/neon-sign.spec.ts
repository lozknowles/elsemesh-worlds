import { test,expect,type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createWorld,type WorldProject,type EditorObject } from '../src/domain/world';
import { defaultNeonSign,createNeonPrefab } from '../src/domain/neon-sign';
async function start(page:Page){await page.goto('/');await expect(page.getByRole('button',{name:'New world',exact:true})).toBeEnabled();}
async function save(page:Page):Promise<WorldProject>{const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save project',exact:true}).click()]);return JSON.parse(readFileSync((await download.path())!,'utf8'));}
async function open(page:Page,world:WorldProject){await page.locator('input[type=file][accept*=".emw"]').setInputFiles({name:'neon.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});await expect(page.locator('header')).toContainText(world.metadata.name,{timeout:15000});}
async function create(page:Page){await page.getByTitle('Objects',{exact:true}).click();await page.getByRole('button',{name:'Neon Sign',exact:true}).click();await expect(page.getByLabel('Neon sign text',{exact:true})).toHaveValue('THE RED LION');}
async function cores(page:Page){return page.evaluate(async()=>{
 const fiber=await import('/node_modules/.vite/deps/@react-three_fiber.js'),root=fiber._roots.get(document.querySelector('main canvas')).store.getState(),values:{id:string;uuid:string;brightness:number;visible:boolean}[]=[];
 root.scene.traverse((node:{userData:Record<string,unknown>;geometry?:{uuid:string};material?:{emissiveIntensity:number};visible:boolean})=>{if(node.userData.neonCore)values.push({id:String(node.userData.neonObjectId),uuid:node.geometry!.uuid,brightness:node.material!.emissiveIntensity,visible:node.visible});});return values;
 });}
test('designer creates editable 3D lettering, presets, styles, effects, transforms and reusable package',async({page})=>{
 await start(page);await create(page);await expect.poll(async()=>(await cores(page)).length).toBe(1);
 await expect(page.getByLabel('Neon text preset',{exact:true}).locator('option')).toHaveCount(13);
 await page.getByLabel('Neon text preset',{exact:true}).selectOption('bar');await page.getByLabel('Neon sign text',{exact:true}).fill('THE RED LION\nPRIVATE BAR');
 await page.getByLabel('Neon visual style',{exact:true}).selectOption('vintage-pub');await expect(page.getByLabel('Neon font',{exact:true})).toHaveValue('optimer');
 await page.getByLabel('Neon colour preset',{exact:true}).selectOption('pink');await page.getByLabel('Neon tube colour',{exact:true}).fill('#ff00aa');
 await page.getByLabel('Neon mounting',{exact:true}).selectOption('hanging');await page.getByLabel('Double sided neon',{exact:true}).check();await page.getByLabel('Neon quality',{exact:true}).selectOption('low');
 for(const mode of ['steady','flicker','pulse','flash','sequence','colour-cycle','faulty','timed'])await page.getByLabel('Neon effect',{exact:true}).selectOption(mode);
 await page.getByLabel('Neon effect',{exact:true}).selectOption('pulse');await page.getByLabel('Effect speed',{exact:true}).fill('2');
 await page.locator('.vector-editor').filter({hasText:'POSITION'}).locator('input').nth(0).fill('2');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export neon preset',exact:true}).click()]);const file=(await download.path())!,prefab=JSON.parse(readFileSync(file,'utf8'));expect(prefab.schema).toBe('elsemesh.neon-prefab/1');
 await page.getByLabel('Neon sign text',{exact:true}).fill('TEMP');await page.getByLabel('Import neon preset',{exact:true}).setInputFiles(file);await expect(page.getByLabel('Neon sign text',{exact:true})).toHaveValue('THE RED LION\nPRIVATE BAR');
 const before=await save(page);await page.getByLabel('Import neon preset',{exact:true}).setInputFiles({name:'invalid.neon.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema:'elsemesh.neon-prefab/1',config:{...prefab.config,font:'unknown'}}))});await expect(page.getByText('Choose a bundled neon font.',{exact:false})).toBeVisible();expect((await save(page)).objects).toEqual(before.objects);
 await page.keyboard.press('Control+d');const final=await save(page);expect(final.objects).toHaveLength(2);expect(final.objects[0]!.neon!.text).toBe('THE RED LION\nPRIVATE BAR');expect(final.objects[0]!.neon!.color).toBe('#ff00aa');expect(final.objects[1]!.neon).toEqual(final.objects[0]!.neon);expect(final.objects[1]!.id).not.toBe(final.objects[0]!.id);
 await page.getByRole('button',{name:'New world',exact:true}).click();await open(page,final);expect((await save(page)).objects).toEqual(final.objects);
});
test('local first-person E toggles fresh aimed sign, preserves authored power and is blocked by a wall or range',async({page})=>{
 await start(page);const world=createWorld('Local neon interaction');world.terrain.heights.fill(0);world.spawn.position=[0,0,2];const config=defaultNeonSign('OPEN');config.size=.4;
 const sign:EditorObject={id:'sign',name:'Local sign',kind:'neon-sign',neon:config,locked:true,position:[0,1.65,0],rotation:[0,0,0],scale:[1,1,1],color:config.color,visible:true,collision:'none'};world.objects=[sign];await open(page,world);await expect.poll(async()=>(await cores(page)).length).toBe(1);
 await page.getByRole('button',{name:/Enter preview/}).click();await expect(page.locator('.neon-interaction')).toContainText('Turn off Local sign');
 await page.keyboard.press('e');await expect(page.locator('.neon-interaction')).toContainText('Turn on Local sign');await expect.poll(async()=>(await cores(page))[0]?.brightness).toBe(0);
 expect((await save(page)).objects[0]!.neon!.powered).toBe(true);await page.getByRole('button',{name:/Exit preview/}).click();await expect.poll(async()=>(await cores(page))[0]?.brightness).toBe(2);
 const wall:EditorObject={id:'wall',name:'Blocking wall',kind:'box',position:[0,1.65,1],rotation:[0,0,0],scale:[3,3,.2],color:'#333333',visible:true,collision:'solid'};await open(page,{...world,objects:[sign,wall]});await page.getByRole('button',{name:/Enter preview/}).click();await page.waitForTimeout(200);await expect(page.locator('.neon-interaction')).toHaveCount(0);await page.keyboard.press('e');expect((await cores(page))[0]!.brightness).toBe(2);await page.getByRole('button',{name:/Exit preview/}).click();
 await open(page,{...world,spawn:{...world.spawn,position:[0,0,5]}});await page.getByRole('button',{name:/Enter preview/}).click();await page.waitForTimeout(200);await expect(page.locator('.neon-interaction')).toHaveCount(0);await page.keyboard.press('e');expect((await save(page)).objects[0]!.neon!.powered).toBe(true);
});
test('uniform edits preserve shared geometry, sequence retains unlit physical letters and cleanup releases leases',async({page})=>{
 await start(page);await create(page);await expect.poll(async()=>(await cores(page)).length).toBe(1);const original=(await cores(page))[0]!.uuid;
 await page.getByLabel('Neon tube colour',{exact:true}).fill('#3399ff');await page.getByLabel('Neon effect',{exact:true}).selectOption('flicker');await page.getByLabel('Neon brightness',{exact:true}).fill('4');expect((await cores(page))[0]!.uuid).toBe(original);
 await page.getByLabel('Neon effect',{exact:true}).selectOption('sequence');await page.getByLabel('Neon authored power',{exact:true}).uncheck();await expect.poll(async()=>(await cores(page)).length).toBeGreaterThan(1);await expect.poll(async()=>(await cores(page)).every(core=>core.brightness===0&&core.visible)).toBe(true);
 await page.getByLabel('Neon effect',{exact:true}).selectOption('steady');await expect.poll(async()=>(await cores(page)).length).toBe(1);expect((await cores(page))[0]!.uuid).toBe(original);
 await page.getByTitle('Scene',{exact:true}).click();await page.keyboard.press('Control+d');await expect.poll(async()=>(await cores(page)).length).toBe(2);expect(new Set((await cores(page)).map(core=>core.uuid)).size).toBe(1);
 await page.getByRole('button',{name:'New world',exact:true}).click();await expect.poll(async()=>(await cores(page)).length).toBe(0);
 const stats=await page.evaluate(async()=>{const module=await import('/src/domain/neon-geometry.ts');return module.neonGeometryCacheStats();});expect(stats.references).toBe(0);
});
test('delayed preset import cannot mutate a changed world or selection',async({page})=>{
 await start(page);await create(page);const prefab=createNeonPrefab(defaultNeonSign('STALE'));
 await page.evaluate(()=>{
  const original=File.prototype.text;const host=window as unknown as {releaseNeonRead?:()=>void};File.prototype.text=async function(){const text=await original.call(this);if(this.name==='delayed.neon.json')await new Promise<void>(resolve=>{host.releaseNeonRead=resolve;});return text;};
 });
 await expect(page.locator('.save-state')).toContainText('Saved');
 // Hold a real IndexedDB writer so outgoing workspace recovery cannot finish.
 // Import cancellation must occur at New-world intent, before this barrier ends.
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
  const request=indexedDB.open('elsemesh-worlds');request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('workspaces','readwrite'),store=tx.objectStore('workspaces');let held=true,started=false;
   (window as unknown as {releaseWorkspaceSave:()=>void}).releaseWorkspaceSave=()=>{held=false;};
   const keepAlive=()=>{const read=store.get('test-recovery-barrier');read.onsuccess=()=>{if(!started){started=true;resolve();}if(held)keepAlive();else db.close();};};keepAlive();
  };
 }));
 try{
  await page.getByLabel('Import neon preset',{exact:true}).setInputFiles({name:'delayed.neon.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(prefab))});
  await expect.poll(()=>page.evaluate(()=>typeof (window as unknown as {releaseNeonRead?:()=>void}).releaseNeonRead)).toBe('function');
  await page.getByRole('button',{name:'New world',exact:true}).click();
  await page.evaluate(()=>(window as unknown as {releaseNeonRead:()=>void}).releaseNeonRead());
  await expect(page.getByText('Neon preset import cancelled because the world or selection changed.',{exact:true})).toBeVisible();
  const outgoing=await save(page);expect(outgoing.objects).toHaveLength(1);expect(outgoing.objects[0]?.neon?.text).toBe('THE RED LION');
 }finally{await page.evaluate(()=>(window as unknown as {releaseWorkspaceSave:()=>void}).releaseWorkspaceSave());}
 await expect(page.locator('header')).toContainText('Untitled world');
 expect((await save(page)).objects).toHaveLength(0);
});

test('same world with added or missing sign IDs cannot activate a private snapshot',async({page})=>{
 const world=createWorld('Mismatched private fixture');world.metadata.worldId='private-match-test';world.terrain.heights.fill(0);world.spawn.position=[0,0,2];world.environment.timeOfDay=12;
 const local=defaultNeonSign('LOCAL');local.size=.4;const server=defaultNeonSign('SERVER');server.size=.4;server.effect.mode='timed';
 const sign:EditorObject={id:'a',name:'Local sign',kind:'neon-sign',neon:local,position:[0,1.65,0],rotation:[0,0,0],scale:[1,1,1],color:local.color,visible:true,collision:'none'};
 world.objects=[sign,{...sign,id:'extra',name:'Extra local sign',position:[5,1.65,0]}];
 const commands:string[]=[];
 await page.routeWebSocket('**/__private-neon',socket=>{socket.onMessage(raw=>{
  const message=JSON.parse(String(raw));commands.push(message.type);
  if(message.type==='hello')socket.send(JSON.stringify({type:'challenge',challenge:{protocol:'elsemesh.neon-session/1',nodeId:message.nodeId,publicKey:message.publicKey,serverId:'test-server',worldId:world.metadata.worldId,sessionId:'session',nonce:'nonce',expiresAt:Date.now()+60000}}));
  if(message.type==='auth')socket.send(JSON.stringify({type:'snapshot',protocol:'elsemesh.neon-session/1',serverId:'test-server',worldId:world.metadata.worldId,epoch:'epoch',revision:1,serverNow:Date.now(),effectStart:Date.now(),worldHour:22,role:'owner',signs:[{id:'a',config:server,powered:true}]}));
 });});
 await start(page);await open(page,world);await page.getByTitle('Objects',{exact:true}).click();await page.getByRole('button',{name:'Connect / reconnect',exact:true}).click();
 await expect(page.getByRole('button',{name:'Load private world demo',exact:true})).toBeVisible();
 const unchanged=await save(page);expect(unchanged.objects.map(object=>object.neon!.text)).toEqual(['LOCAL','LOCAL']);expect(unchanged.environment.timeOfDay).toBe(12);
 await page.getByRole('button',{name:/Enter preview/}).click();await page.keyboard.press('e');await page.waitForTimeout(150);expect(commands).not.toContain('setPower');expect((await save(page)).objects[0]!.neon!.text).toBe('LOCAL');
 await page.getByRole('button',{name:/Exit preview/}).click();await open(page,{...world,objects:[]});await expect(page.getByRole('button',{name:'Load private world demo',exact:true})).toBeVisible();expect((await save(page)).objects).toHaveLength(0);page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Load private world demo',exact:true}).click();
 const loaded=await save(page);expect(loaded.objects).toHaveLength(1);expect(loaded.objects[0]!.neon!.text).toBe('SERVER');expect(loaded.environment.timeOfDay).toBe(22);
 await expect.poll(async()=>(await cores(page))[0]?.brightness).toBe(2);
});
