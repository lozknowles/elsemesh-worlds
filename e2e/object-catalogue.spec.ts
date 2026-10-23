import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { WorldProject } from '../src/domain/world';
import { createWorld } from '../src/domain/world';
const catalogue=JSON.parse(readFileSync('public/assets/catalogue/manifest.json','utf8'));
const chair=catalogue.assets.find((entry:{id:string})=>entry.id==='kenney:furniture-kit/chair')??catalogue.assets.find((entry:{sourcePack:{id:string}})=>entry.sourcePack.id==='furniture-kit');
test.setTimeout(90000);
async function saved(page:import('@playwright/test').Page):Promise<WorldProject>{
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save project',exact:true}).click()]);
 return JSON.parse(readFileSync((await download.path())!,'utf8'));
}
async function choose(page:import('@playwright/test').Page){
 await page.getByTitle('Objects',{exact:true}).click();
 await page.getByLabel('Object pack',{exact:true}).selectOption(chair.sourcePack.id);
 await page.getByLabel('Search catalogue objects',{exact:true}).fill(chair.name);
 await page.locator('[aria-label="Object catalogue"] .asset-card').filter({hasText:chair.name}).first().click();
 await page.getByRole('button',{name:'Add '+chair.name,exact:true}).click();
}
test('catalogue pages metadata, cancels cleanly, places on terrain, deduplicates and reopens',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'New world',exact:true})).toBeEnabled();
 await page.getByTitle('Objects',{exact:true}).click();
 await expect(page.locator('[aria-label="Object catalogue"] .asset-card')).toHaveCount(24);
 await page.getByRole('button',{name:'Interiors',exact:true}).click();
 await expect(page.getByText(/359 models/)).toBeVisible();
 await page.getByRole('button',{name:'List view',exact:true}).click();await expect(page.locator('.catalogue-list')).toBeVisible();
 await choose(page);await expect(page.locator('.placement-banner')).toBeVisible();
 expect((await saved(page)).assets).toHaveLength(0);
 await page.keyboard.press('Escape');await expect(page.locator('.placement-banner')).toHaveCount(0);
 expect((await saved(page)).objects).toHaveLength(0);
 // A rendered platform provides a deterministic object triangle. A chair's
 // bounds centre is not guaranteed to intersect its actual rotated seat mesh.
 const fixture=createWorld('Catalogue placement fixture');fixture.terrain.heights.fill(0);
 fixture.objects=[{id:'platform',name:'Placement platform',kind:'box',position:[0,2,0],rotation:[0,0,0],scale:[8,2.5,8],color:'#888888',visible:true,collision:'walkable'}];
 await page.locator('input[accept=".emw,.json,application/json"]').setInputFiles({name:'placement.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(page.getByText('Project opened',{exact:true})).toBeVisible();
 for(let i=0;i<2;i++){
  await choose(page);await expect(page.locator('.placement-banner')).toBeVisible();
  await page.getByTitle('Top view',{exact:true}).click();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const box=(await page.locator('.viewport canvas').first().boundingBox())!;
  await page.mouse.move(box.x+box.width*(i===0?.75:.5),box.y+box.height*(i===0?.8:.5));await expect(page.locator('.placement-banner')).toContainText('Surface: '+(i===0?'terrain':'object'));
  await page.keyboard.press('r');await page.keyboard.press('Enter');
  await expect(page.locator('.placement-banner')).toHaveCount(0);
 }
 const project=await saved(page);expect(project.objects).toHaveLength(3);expect(project.assets).toHaveLength(1);
 expect(project.objects[1]!.rotation[1]).toBeCloseTo(Math.PI/12);
 expect(project.objects[1]!.assetId).toBe(project.objects[2]!.assetId);
 expect(project.objects[2]!.position[1]).toBeGreaterThan(project.objects[1]!.position[1]);
 await page.waitForTimeout(600);await page.reload();await page.getByTitle('Scene',{exact:true}).click();await expect(page.locator('.tree-row.object-row')).toHaveCount(3);
});
test('missing/corrupt model and a cancelled pending download leave project unchanged',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'New world',exact:true})).toBeEnabled();
 await page.route('**/'+chair.model,route=>route.fulfill({status:404,body:'missing'}));
 await choose(page);await expect(page.getByText('Model download failed (404).',{exact:true})).toBeVisible();
 expect((await saved(page)).assets).toHaveLength(0);await page.unroute('**/'+chair.model);
 await page.route('**/'+chair.model,route=>route.fulfill({body:Buffer.alloc(chair.bytes),contentType:'model/gltf-binary'}));
 await choose(page);await expect(page.getByText('Model content hash does not match the catalogue.',{exact:true})).toBeVisible();
 expect((await saved(page)).objects).toHaveLength(0);await page.unroute('**/'+chair.model);
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/'+chair.model,async route=>{await held;await route.continue().catch(()=>{});});
 await choose(page);await page.getByRole('button',{name:'New world',exact:true}).click();release();
 await page.waitForTimeout(300);expect((await saved(page)).assets).toHaveLength(0);expect((await saved(page)).objects).toHaveLength(0);
});
