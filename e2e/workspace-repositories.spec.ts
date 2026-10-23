import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
async function folders(page:import('@playwright/test').Page,delay?:()=>Promise<void>){
 await page.route('**/world-fixture/**',async route=>{
  const parsed=new URL(route.request().url()),parts=parsed.pathname.split('/').slice(2),name=parts.shift();
  if(!name||!['house','landscape'].includes(name)||parts.some(p=>p==='..'))throw new Error('Invalid fixture path');
  if(delay&&parts.join('/')==='world.json')await delay();
  try{await route.fulfill({status:200,body:await readFile(path.join('/fast/world-repositories',name,...parts))});}catch{await route.fulfill({status:404,body:'Missing fixture file'});}
 });
 await page.addInitScript(()=>{
  let cursor=0;
  const overlay=new Map<string,Uint8Array>();
  Object.defineProperty(window,'showDirectoryPicker',{value:async()=>{
   const name=['house','landscape'][cursor++]??'house';
   (window as unknown as {fixtureFolderPickerCount:number}).fixtureFolderPickerCount=cursor;
   function directory(parts:string[]):unknown{return {kind:'directory',name:parts.at(-1)??name,
    getDirectoryHandle:async(segment:string)=>directory([...parts,segment]),
    getFileHandle:async(segment:string)=>({kind:'file',name:segment,
     getFile:async()=>{const key=name+'/'+[...parts,segment].join('/'),written=overlay.get(key);if(written)return new File([Uint8Array.from(written).buffer],segment);const response=await fetch('/world-fixture/'+key);if(!response.ok)throw new DOMException('Missing','NotFoundError');return new File([await response.arrayBuffer()],segment);},
     createWritable:async()=>{let pending:Uint8Array|undefined;return {write:async(bytes:Uint8Array)=>{pending=Uint8Array.from(bytes);},close:async()=>{if(pending)overlay.set(name+'/'+[...parts,segment].join('/'),pending);},abort:async()=>{pending=undefined;}};}
    }),
    values:async function*(){yield {kind:'file',name:'world.json'};}
   };}
   return directory([]);
  }});
 });
}
test('two real world folders open through UI, preserve edited draft, and restore it',async({page})=>{
 await folders(page);page.on('dialog',dialog=>void dialog.accept());
 await page.goto('/');await page.getByTitle('World settings').click();
 await expect(page.locator('.save-state')).toContainText('Saved');
 await page.getByRole('button',{name:'Open repository folder',exact:true}).click();
 await expect(page.locator('.repository-folder')).toContainText('local:house',{timeout:20000});
 await page.getByRole('textbox',{name:'World name',exact:true}).fill('House edited before switch');
 await page.getByRole('button',{name:'Open repository folder',exact:true}).click();
 await expect(page.locator('.repository-folder')).toContainText('local:landscape',{timeout:20000});
 const registry=page.getByRole('combobox',{name:'Local workspaces'});
 await expect(registry.locator('option')).toContainText(['Choose a saved workspace']);
 const previous=registry.locator('option').filter({hasText:'House edited before switch'});
 await expect(previous).toHaveCount(1);await registry.selectOption(await previous.getAttribute('value')??'');
 await expect(page.getByRole('textbox',{name:'World name',exact:true})).toHaveValue('House edited before switch');
});
test('an in-flight folder load cannot replace subsequent authored edits',async({page})=>{
 let release=()=>{};let requested=()=>{};
 const started=new Promise<void>(resolve=>{requested=resolve;});
 const pending=new Promise<void>(resolve=>{release=resolve;});
 await folders(page,async()=>{requested();await pending;});
 page.on('dialog',dialog=>void dialog.accept());
 await page.goto('/');await page.getByTitle('World settings').click();
 await expect(page.locator('.save-state')).toContainText('Saved');
 await page.getByRole('button',{name:'Open repository folder',exact:true}).click();
 await started;
 await page.getByRole('textbox',{name:'World name',exact:true}).fill('Edit during open');
 release();
 await expect(page.locator('.repository-panel [role=status]')).toContainText('world changed during loading',{timeout:20000});
 await expect(page.getByRole('textbox',{name:'World name',exact:true})).toHaveValue('Edit during open');
});

test('repository binding and source survive leaving the World settings panel',async({page})=>{
 await folders(page);page.on('dialog',dialog=>void dialog.accept());
 await page.goto('/');await page.getByTitle('World settings').click();
 await expect(page.locator('.save-state')).toContainText('Saved');
 await page.getByRole('button',{name:'Open repository folder',exact:true}).click();
 await expect(page.locator('.repository-folder')).toContainText('local:house',{timeout:20000});
 const originalWorldId=await page.locator('.readonly-field').first().textContent();
 await page.getByTitle('Assets').click();
 await page.getByRole('button',{name:/Cube/}).click();
 await page.getByTitle('World settings').click();
 await expect(page.locator('.repository-folder')).toContainText('local:house');
 await page.getByRole('button',{name:'Save repository snapshot',exact:true}).click();
 await expect(page.locator('.repository-panel [role=status]')).toContainText('Repository snapshot saved to house.',{timeout:20000});
 expect(await page.evaluate(()=>(window as unknown as {fixtureFolderPickerCount:number}).fixtureFolderPickerCount)).toBe(1);
 await page.getByRole('button',{name:'Check repository updates',exact:true}).click();
 await expect(page.locator('.repository-panel [role=status]')).toContainText('An update is available',{timeout:20000});
 await page.getByTitle('Scene').click();await page.getByTitle('World settings').click();
 await page.getByRole('button',{name:'Fork as a new world…',exact:true}).click();
 await expect(page.locator('.repository-panel [role=status]')).toContainText('Fork created with a new world ID.',{timeout:20000});
 await expect(page.locator('.readonly-field').first()).not.toHaveText(originalWorldId??'');
 expect(await page.evaluate(()=>(window as unknown as {fixtureFolderPickerCount:number}).fixtureFolderPickerCount)).toBe(1);
});
