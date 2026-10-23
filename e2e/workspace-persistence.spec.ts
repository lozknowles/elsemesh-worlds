import {test,expect} from '@playwright/test';
test('legacy autosave migrates without deletion, independent workspace drafts and stale-tab recovery',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {createWorld}=await import('/src/domain/world.ts');
  // The app may already have storage open. Use a unique database-free module test
  // via the normal database and preserve its existing records.
  const persistence=await import('/src/domain/persistence.ts');
  const a=createWorld('A'),b={...structuredClone(a),metadata:{...a.metadata,name:'B'}};
  const first=persistence.createWorkspace(a,{location:'repo:a',revision:'commit-a'});
  const saved=await persistence.saveWorkspace(first,a);
  const sibling=persistence.createWorkspace(b,{location:'repo:a',revision:'commit-b'});
  const savedSibling=await persistence.saveWorkspace(sibling,b);
  const winner=await persistence.saveWorkspace(saved.workspace,{...a,metadata:{...a.metadata,name:'Winner'}});
  const loser=await persistence.saveWorkspace(saved.workspace,{...a,metadata:{...a.metadata,name:'Recovered loser'}});
  const rows=await persistence.listWorkspaces();
  const loaded=await persistence.loadWorkspace(winner.workspace.workspaceId);
  return {sameWorld:saved.workspace.worldId===savedSibling.workspace.worldId,differentWorkspaces:saved.workspace.workspaceId!==savedSibling.workspace.workspaceId,conflict:loser.conflict,recovery:loser.workspace.recoveredFrom,winnerId:winner.workspace.workspaceId,loadedName:loaded?.name,names:rows.map(row=>row.name)};
 });
 expect(result.sameWorld).toBe(true);expect(result.differentWorkspaces).toBe(true);expect(result.conflict).toBe(true);expect(result.recovery).toBe(result.winnerId);expect(result.loadedName).toBe('Winner');expect(result.names).toContain('Recovered loser');expect(result.names).toContain('B');
});
test('legacy store migration keeps original autosave',async({page})=>{
 // Seed before App opens IndexedDB.
 await page.addInitScript(()=>{
  const request=indexedDB.open('elsemesh-worlds',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('projects');
  request.onsuccess=()=>request.result.close();
 });
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {createWorld}=await import('/src/domain/world.ts');
  const {loadWorkspace}=await import('/src/domain/persistence.ts');
  const world=createWorld('Legacy world');
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('elsemesh-worlds');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['projects','workspaces'],'readwrite');tx.objectStore('workspaces').delete('active-workspace');tx.objectStore('projects').put({project:world,revision:123},world.metadata.worldId);tx.objectStore('projects').put(world.metadata.worldId,'active-project');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
  const migrated=await loadWorkspace();
  const retained=await new Promise<boolean>(resolve=>{const request=db.transaction('projects','readonly').objectStore('projects').get(world.metadata.worldId);request.onsuccess=()=>resolve(request.result?.revision===123);});
  db.close();return {name:migrated?.name,base:migrated?.base.location,retained};
 });
 expect(result).toEqual({name:'Legacy world',base:'legacy:autosave',retained:true});
});
