import { test, expect } from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
test('pen authors landscape features, edits water levels, undoes and reopens downloaded project',async({page})=>{
 test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.getByRole('button',{name:'New world'})).toBeEnabled();await page.getByRole('button',{name:'New world'}).click();await page.getByTitle('Pen & water').click();
 const canvas=page.locator('.viewport canvas');const box=await canvas.boundingBox();expect(box).not.toBeNull();
 const click=async(x:number,y:number)=>canvas.click({position:{x:box!.width*x,y:box!.height*y}});
 for(const kind of ['Pathway','River','Bridge','Shape','Lake','Waterfall']){
 await page.getByRole('button',{name:kind,exact:true}).click();await click(.45,.5);if(kind!=='Waterfall'){await click(.57,.5);if(['Lake','Shape'].includes(kind)){await click(.57,.62);await click(.45,.62);}await page.getByRole('button',{name:'Finish',exact:true}).click();}
 }
 await expect(page.locator('.feature-list-item')).toHaveCount(6); await page.getByTitle('Undo (Ctrl+Z)').click(); await expect(page.locator('.feature-list-item')).toHaveCount(5); await page.getByTitle('Redo (Ctrl+Y)').click(); await expect(page.locator('.feature-list-item')).toHaveCount(6);
 await page.locator('.feature-list-item').filter({hasText:'lake'}).click();await page.getByRole('spinbutton',{name:'Lake water level',exact:true}).fill('7');await page.getByRole('spinbutton',{name:'Lake water level',exact:true}).press('Enter');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save project'}).click()]);const file=await download.path();const project=JSON.parse(readFileSync(file!,'utf8'));expect(project.features).toHaveLength(6);expect(project.features.find((f:{kind:string})=>f.kind==='lake').elevation).toBe(7);
 await page.waitForTimeout(1000); await expect(page.locator('.topbar .save-state')).toContainText(/^Saved /); await page.reload();await page.getByTitle('Pen & water').click();await expect(page.locator('.feature-list-item')).toHaveCount(6);
 await page.locator('label.button.subdued input[type="file"]').first().setInputFiles(file!);await expect(page.getByText('Project opened')).toBeVisible();await expect(page.locator('.feature-list-item')).toHaveCount(6);
 await page.getByRole('button',{name:'Shape',exact:true}).click();await click(.35,.48);await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('.feature-list-item')).toHaveCount(6);
 const out=path.resolve('../../outputs');mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'landscape-pen-editor.png')});expect(errors).toEqual([]);
});


