import { test,expect,type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWorld } from '../src/domain/world';
import type { EditorObject,WorldProject } from '../src/domain/world';
import { resolveWorldMatrices } from '../src/domain/object-hierarchy';
const cube=(id:string,x:number):EditorObject=>({id,name:id,kind:'box',position:[x,1,0],rotation:[0,0,0],scale:[1,1,1],color:'#889977',visible:true,collision:'solid'});
async function saved(page:Page):Promise<WorldProject>{const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save project',exact:true}).click()]);return JSON.parse(readFileSync((await download.path())!,'utf8'));}
async function open(page:Page,world:WorldProject|object){await page.locator('input[accept=".emw,.json,application/json"]').setInputFiles({name:'manager.emw',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});await expect(page.getByText('Project opened',{exact:true})).toBeVisible();}
async function setup(page:Page){await page.goto('/');await expect(page.getByRole('button',{name:'New world',exact:true})).toBeEnabled();const world=createWorld('Object manager fixture');world.terrain.heights.fill(0);world.objects=[cube('Leaf A',-3),cube('Leaf B',3)];await open(page,world);return world;}
async function select(page:Page,id:string,shift=false){await page.locator('.tree-row.object-row[data-object-id="'+id+'"] .scene-object-name').click({modifiers:shift?['Shift']:[]});}
test('shift selection, group dimensions, inherited locking, copy subtree and save/reopen',async({page})=>{
 await setup(page);await select(page,'Leaf A');await select(page,'Leaf B',true);
 await expect(page.getByText('2 selected · Shift-click adds or removes a selection.',{exact:true})).toBeVisible();
 await page.getByLabel('Object description',{exact:true}).fill('Editable object description');
 await page.getByLabel('Object description',{exact:true}).press('Delete');
 expect((await saved(page)).objects).toHaveLength(2);
 await page.getByRole('button',{name:'Group selected',exact:true}).click();
 let project=await saved(page);const group=project.objects.find(o=>o.kind==='group')!;expect(project.objects.filter(o=>o.parentId===group.id)).toHaveLength(2);
 const width=Number(await page.getByLabel('Group width m',{exact:true}).inputValue());
 await page.getByLabel('Group width m',{exact:true}).fill(String(width*2));await page.getByLabel('Group width m',{exact:true}).press('Tab');
 project=await saved(page);expect(project.objects.find(o=>o.id===group.id)!.scale[0]).toBeCloseTo(2);
 expect(project.objects.find(o=>o.id==='Leaf A')!.scale).toEqual([1,1,1]);
 await page.getByRole('button',{name:'Copy selection',exact:true}).click();await page.getByRole('button',{name:'Paste objects',exact:true}).click();
 project=await saved(page);expect(project.objects).toHaveLength(6);expect(new Set(project.objects.map(o=>o.id)).size).toBe(6);expect(project.objects.filter(o=>o.kind==='group')).toHaveLength(2);
 const copiedGroup=project.objects.find(o=>o.kind==='group'&&o.id!==group.id)!;
 expect(project.objects.filter(o=>o.parentId===copiedGroup.id)).toHaveLength(2);
 await page.getByRole('button',{name:'Lock selected object',exact:true}).click();
 await expect(page.getByRole('button',{name:'Unlock selected object',exact:true})).toBeEnabled();
 await expect(page.getByLabel('Object description',{exact:true})).toBeDisabled();
 const copiedChild=project.objects.find(o=>o.parentId===copiedGroup.id)!;await select(page,copiedChild.id);
 await expect(page.getByRole('button',{name:'Lock selected object',exact:true})).toBeDisabled();
 await select(page,copiedGroup.id);await page.getByRole('button',{name:'Unlock selected object',exact:true}).click();
 const final=await saved(page);expect(final.schema).toBe('elsemesh.worlds.project/2');
 await page.getByRole('button',{name:'New world',exact:true}).click();await open(page,final);expect((await saved(page)).objects).toEqual(final.objects);
});
test('legacy migration, reparent, ungroup and undo preserve world transforms',async({page})=>{
 const fixture=await setup(page);await open(page,{...fixture,schema:'elsemesh.worlds.project/1'});
 expect((await saved(page)).schema).toBe('elsemesh.worlds.project/2');
 await select(page,'Leaf A');await page.getByRole('button',{name:'Group selected',exact:true}).click();
 let project=await saved(page);const group=project.objects.find(o=>o.kind==='group')!;
 await page.locator('.vector-editor').filter({hasText:'POSITION'}).locator('input').nth(0).fill('10');
 await select(page,'Leaf B');const before=resolveWorldMatrices((await saved(page)).objects).get('Leaf B')!.elements;
 await page.getByLabel('Parent group',{exact:true}).selectOption(group.id);
 project=await saved(page);expect(project.objects.find(o=>o.id==='Leaf B')!.parentId).toBe(group.id);
 resolveWorldMatrices(project.objects).get('Leaf B')!.elements.forEach((n,i)=>expect(n).toBeCloseTo(before[i]!,7));
 await page.getByLabel('Parent group',{exact:true}).selectOption('');project=await saved(page);expect(project.objects.find(o=>o.id==='Leaf B')!.parentId).toBeUndefined();
 await select(page,group.id);await page.getByRole('button',{name:'Ungroup selected',exact:true}).click();
 expect((await saved(page)).objects.filter(o=>o.kind==='group')).toHaveLength(0);
 await page.getByTitle('Undo (Ctrl+Z)',{exact:true}).click();expect((await saved(page)).objects.find(o=>o.id===group.id)).toBeTruthy();
});
test('warehouse whole world grouping and numeric resizing retain every component',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Load warehouse world',exact:true})).toBeEnabled();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Load warehouse world',exact:true}).click();
 await expect(page.locator('.tree-row.object-row')).toHaveCount(1755,{timeout:60000});
 await page.getByRole('button',{name:'Group entire world',exact:true}).click();
 await expect(page.getByLabel('Group width m',{exact:true})).toBeVisible({timeout:60000});
 const width=Number(await page.getByLabel('Group width m',{exact:true}).inputValue());
 await page.getByLabel('Group width m',{exact:true}).fill(String(width*1.25));await page.getByLabel('Group width m',{exact:true}).press('Tab');
 const project=await saved(page),group=project.objects.find(o=>o.kind==='group')!;
 expect(project.objects).toHaveLength(1756);expect(project.objects.filter(o=>o.parentId===group.id)).toHaveLength(1755);expect(project.assets).toHaveLength(59);
 expect(group.scale[0]).toBeCloseTo(1.25,3);
 expect(project.objects.filter(o=>o.name.endsWith(' keyboard legends')).every(o=>!o.visible)).toBe(true);
 await page.getByRole('button',{name:'Copy selection',exact:true}).click();await page.getByRole('button',{name:'Paste objects',exact:true}).click();
 await expect(page.getByText('Projects may contain at most 2,000 scene objects.',{exact:true})).toBeVisible();expect((await saved(page)).objects).toHaveLength(1756);
});

test('nested rotated scaled parent uses scene-root gizmo and commits local child translation',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'New world',exact:true})).toBeEnabled();
 const fixture=createWorld('Nested gizmo fixture');fixture.terrain.heights.fill(0);
 fixture.objects=[{...cube('Parent',0),kind:'group',collision:'none',position:[4,0,2],rotation:[0,Math.PI/4,0],scale:[2,1.5,.75]},{...cube('Nested child',2),parentId:'Parent'}];
 await open(page,fixture);await select(page,'Nested child');await page.getByTitle('translate tool',{exact:true}).click();
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 const box=(await page.locator('.viewport canvas').first().boundingBox())!;
 const camera=new THREE.PerspectiveCamera(42,box.width/box.height,.1,12000);camera.position.set(82,65,88);camera.lookAt(0,3,0);camera.updateMatrixWorld();
 const before=new THREE.Vector3().setFromMatrixPosition(resolveWorldMatrices(fixture.objects).get('Nested child')!);
 const factor=camera.position.distanceTo(before)*Math.min(1.9*Math.tan(42*Math.PI/360),7)/4;
 const screen=(point:THREE.Vector3)=>{const v=point.project(camera);return {x:box.x+(v.x+1)/2*box.width,y:box.y+(1-v.y)/2*box.height};};
 const start=screen(before.clone().add(new THREE.Vector3(factor*.65,0,0))),end=screen(before.clone().add(new THREE.Vector3(factor*.95,0,0)));
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();
 const result=await saved(page),child=result.objects.find(o=>o.id==='Nested child')!,parent=result.objects.find(o=>o.id==='Parent')!;
 expect(parent.position).toEqual(fixture.objects[0]!.position);expect(parent.scale).toEqual(fixture.objects[0]!.scale);expect(parent.rotation).toEqual(fixture.objects[0]!.rotation);
 const after=new THREE.Vector3().setFromMatrixPosition(resolveWorldMatrices(result.objects).get('Nested child')!);
 expect(after.x-before.x).toBeGreaterThan(.1);expect(Math.abs(after.z-before.z)).toBeLessThan(.15);expect(child.parentId).toBe('Parent');
 expect(child.position).not.toEqual(fixture.objects[1]!.position);
});
