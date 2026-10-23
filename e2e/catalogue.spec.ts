import { test, expect, type Page } from '@playwright/test';
import { createWorld } from '../src/domain/world';
import fs from 'node:fs/promises';
const catalogue='/assets/catalogue/manifest.json';
async function setup(page:Page, surface=false){
 await page.goto('/'); await expect(page.getByRole('button',{name:'New world',exact:true})).toBeEnabled();
 const world=createWorld('Catalogue acceptance');world.terrain.heights.fill(0);world.objects=surface?[{id:'surface-platform',name:'Placement platform',kind:'box',position:[0,2,0],rotation:[0,0,0],scale:[8,2.5,8],color:'#888888',visible:true,collision:'walkable'}]:[];
 await page.locator('input[accept=".emw,.json,application/json"]').setInputFiles({name:'acceptance.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
 await expect(page.locator('header')).toContainText('Catalogue acceptance');
 await page.locator('button[title="Objects"]').click();await expect(page.getByText('1775 models',{exact:false})).toBeVisible();
}
async function choose(page:Page,pack:string,name:string){
 await page.getByLabel('Object pack').selectOption(pack);await page.getByLabel('Search catalogue objects').fill(name);
 await page.locator('section[aria-label="Object catalogue"] button.asset-card').filter({has:page.getByText(name,{exact:true})}).click();
 await page.getByRole('button',{name:'Add '+name,exact:true}).click();await expect(page.getByRole('button',{name:'Cancel placement',exact:true})).toBeVisible();
}
async function place(page:Page,x=.5,y=.5){
 const box=await page.locator('main canvas').first().boundingBox();if(!box)throw Error('Missing world canvas');
 await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await page.mouse.click(box.x+box.width*x,box.y+box.height*y);
 await expect(page.getByRole('button',{name:'Cancel placement',exact:true})).toHaveCount(0);
}
async function saved(page:Page){const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();const file=await download;const target=await file.path();if(!target)throw Error('No downloaded world');return JSON.parse(await fs.readFile(target,'utf8'));}

test('search, filters, preview and cancellation do not commit content',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Interiors',exact:true}).click();await expect(page.getByText('359 models',{exact:false})).toBeVisible();
 await page.getByLabel('Object pack').selectOption('furniture-kit');await page.getByLabel('Search catalogue objects').fill('Chair');await page.getByRole('button',{name:'List view',exact:true}).click();
 await page.locator('button.asset-card').filter({has:page.getByText('Chair',{exact:true})}).click();await page.getByRole('button',{name:'3D preview',exact:true}).click();await expect(page.getByLabel('Selected object 3D preview')).toBeVisible();
 await page.getByRole('button',{name:'Add Chair',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel placement',exact:true})).toBeVisible();await page.keyboard.press('r');await page.keyboard.press('Escape');
 const project=await saved(page);expect(project.objects).toHaveLength(0);expect(project.assets).toHaveLength(0);
});
test('chair surface placement, terrain placement, dedup, transform and reopen',async({page})=>{
 await setup(page,true);await choose(page,'furniture-kit','Chair');
 const box=await page.locator('main canvas').first().boundingBox();if(!box)throw Error('Missing canvas');await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
 await expect(page.getByRole('status').filter({hasText:'Place Chair'})).toContainText('Surface: object');await place(page);
 await choose(page,'furniture-kit','Chair');await place(page,.75,.8);
 await page.getByRole('spinbutton',{name:'Y °',exact:true}).fill('30');await page.getByRole('spinbutton',{name:'Y °',exact:true}).press('Tab');
 const project=await saved(page);expect(project.objects).toHaveLength(3);expect(project.assets).toHaveLength(1);expect(project.objects[1].position[1]).toBeGreaterThan(3.9);expect(project.objects[2].rotation[1]).toBeCloseTo(Math.PI/6);expect(project.objects[1].assetId).toBe(project.objects[2].assetId);
 await page.getByRole('button',{name:'New world',exact:true}).click();await page.locator('input[accept=".emw,.json,application/json"]').setInputFiles({name:'reopened.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 const reopened=await saved(page);expect(reopened).toEqual(project);
});
test('building and vehicle remain ordinary editable saved objects',async({page})=>{
 await setup(page);await choose(page,'city-kit-suburban','Building type a');await place(page,.4,.55);await choose(page,'car-kit','Ambulance');await place(page,.65,.7);
 const project=await saved(page);expect(project.objects.map((o:any)=>o.name)).toEqual(['Building type a','Ambulance']);expect(project.assets).toHaveLength(2);expect(project.assets.every((a:any)=>a.license.includes('CC0'))).toBe(true);
 await page.getByRole('button',{name:'New world',exact:true}).click();await page.locator('input[accept=".emw,.json,application/json"]').setInputFiles({name:'models.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});expect((await saved(page)).objects).toHaveLength(2);
});
test('corrupted model fails without changing the world',async({page})=>{
 await setup(page);await page.route('**/packs/furniture-kit/chair.glb',route=>route.fulfill({status:200,body:'corrupt'}));await page.getByLabel('Object pack').selectOption('furniture-kit');await page.getByLabel('Search catalogue objects').fill('Chair');await page.locator('button.asset-card').filter({has:page.getByText('Chair',{exact:true})}).click();await page.getByRole('button',{name:'Add Chair',exact:true}).click();await expect(page.getByText('Model byte count does not match the catalogue.',{exact:true})).toBeVisible();const project=await saved(page);expect(project.objects).toHaveLength(0);expect(project.assets).toHaveLength(0);
});
