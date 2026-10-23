import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { chromium } from '@playwright/test';

const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
async function saved(){
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save project',exact:true}).click()]);
 return JSON.parse(await fs.readFile(await download.path(),'utf8'));
}
try {
 await page.goto(process.env.PORTAL_EDITOR_URL??'http://127.0.0.1:5191/');
 await page.getByTitle('Objects',{exact:true}).click();
 await page.getByRole('button',{name:'Portal opening',exact:true}).click();
 await page.getByLabel('Portal name',{exact:true}).waitFor();
 let world=await saved();assert.equal(world.portals.length,1);
 const id=world.portals[0].id;
 await page.getByLabel('Opening width · m',{exact:true}).fill('3.2');
 await page.getByLabel('Portal yaw · degrees',{exact:true}).fill('90');
 await page.getByLabel('Portal X',{exact:true}).fill('7');
 await page.getByRole('button',{name:'Apply portal changes',exact:true}).click();
 world=await saved();assert.equal(world.portals[0].width,3.2);assert.equal(world.portals[0].position[0],7);assert.ok(Math.abs(world.portals[0].yaw-Math.PI/2)<1e-8);
 await page.getByTitle('Undo (Ctrl+Z)',{exact:true}).click();
 world=await saved();assert.equal(world.portals[0].width,2);assert.equal(world.portals[0].yaw,0);
 await page.getByTitle('Redo (Ctrl+Y)',{exact:true}).click();
 world=await saved();assert.equal(world.portals[0].width,3.2);
 await page.getByLabel('Destination world ID',{exact:true}).fill(world.metadata.worldId);
 await page.getByLabel('Destination region ID',{exact:true}).fill(world.metadata.regionId);
 await page.getByLabel('Destination portal ID',{exact:true}).fill('elsemesh-portal:missing');
 await page.getByRole('button',{name:'Apply portal changes',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'missing local'}).waitFor();
 assert.equal((await saved()).portals[0].destination.worldId,'elsemesh.world:destination');
 await page.getByLabel('Destination portal ID',{exact:true}).fill(id);
 await page.getByRole('button',{name:'Apply portal changes',exact:true}).click();
 await page.getByText('Local destination points to this same opening.',{exact:true}).waitFor();
 await page.getByLabel('Actual game URL',{exact:true}).fill('https://game.example/play');
 assert.equal(await page.getByRole('link',{name:'Open actual game'}).getAttribute('href'),'https://game.example/play');
 await page.getByRole('button',{name:'Frame portal in viewport',exact:true}).click();
 await page.locator('.left-panel').evaluate(el=>{el.scrollTop=0;});
 await page.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
 await fs.mkdir('.local-evidence/portal-editor',{recursive:true});
 await page.screenshot({path:'.local-evidence/portal-editor/authored-opening.png'});
 await page.getByRole('button',{name:'Delete portal',exact:true}).click();
 assert.equal((await saved()).portals.length,0);
 await page.getByTitle('Undo (Ctrl+Z)',{exact:true}).click();
 assert.equal((await saved()).portals[0].id,id);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,portalId:id,checks:['create','numeric position/yaw/size','undo/redo','broken local reference rejection','local target apply','configured game link','delete/undo'],screenshot:'.local-evidence/portal-editor/authored-opening.png'}));
} finally { await browser.close(); }
