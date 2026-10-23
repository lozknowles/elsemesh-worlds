import { validateWorld } from './world';
import type { WorldProject } from './world';
import type { WorldPackOptions } from './world-repository';
const DB_NAME='elsemesh-worlds', DB_VERSION=2, LEGACY='projects', DRAFTS='workspaces', ACTIVE='active-workspace';
export type WorkspaceBase={location:string;revision?:string;repositoryOptions?:WorldPackOptions};
export type Workspace={workspaceId:string;worldId:string;name:string;base:WorkspaceBase;editRevision:number;updatedAt:number;project:WorldProject;recoveredFrom?:string};
let database:Promise<IDBDatabase>|null=null;
function openDatabase():Promise<IDBDatabase>{
 if(database)return database;
 database=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);
 request.onupgradeneeded=()=>{for(const name of [LEGACY,DRAFTS])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
 request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null;};resolve(request.result);};
 request.onerror=()=>reject(request.error??new Error('Could not open local project storage.'));});
 database.catch(()=>{database=null;});return database;
}
function checked(value:unknown):Workspace|null{
 if(!value||typeof value!=='object'||!('project' in value))return null;
 const result=validateWorld((value as Workspace).project);if(!result.valid||!result.project)return null;
 return {...value as Workspace,project:result.project};
}
export function createWorkspace(project:WorldProject,base:WorkspaceBase={location:'local:draft'}):Workspace{
 return {workspaceId:crypto.randomUUID(),worldId:project.metadata.worldId,name:project.metadata.name,base,editRevision:0,updatedAt:Date.now(),project};
}
export async function listWorkspaces():Promise<Workspace[]>{
 const db=await openDatabase();return new Promise((resolve,reject)=>{const req=db.transaction(DRAFTS,'readonly').objectStore(DRAFTS).getAll();
 req.onsuccess=()=>resolve(req.result.map(checked).filter((w):w is Workspace=>!!w).sort((a,b)=>b.updatedAt-a.updatedAt));req.onerror=()=>reject(req.error);});
}
export async function loadWorkspace(id?:string):Promise<Workspace|null>{
 const db=await openDatabase();
 return new Promise((resolve,reject)=>{const tx=db.transaction([DRAFTS,LEGACY],'readwrite'),drafts=tx.objectStore(DRAFTS),legacy=tx.objectStore(LEGACY);let found:Workspace|null=null;
 const read=(key:string)=>{const req=drafts.get(key);req.onsuccess=()=>{found=checked(req.result);};req.onerror=()=>tx.abort();};
 if(id)read(id);else{const active=drafts.get(ACTIVE);active.onsuccess=()=>{if(typeof active.result==='string'){read(active.result);return;}
 const oldActive=legacy.get('active-project');oldActive.onsuccess=()=>{if(typeof oldActive.result!=='string')return;const old=legacy.get(oldActive.result);old.onsuccess=()=>{const result=validateWorld(old.result?.project);if(!result.valid||!result.project)return;
 found=createWorkspace(result.project,{location:'legacy:autosave'});drafts.put(found,found.workspaceId);drafts.put(found.workspaceId,ACTIVE);};};};}
 tx.oncomplete=()=>resolve(found);tx.onabort=()=>reject(tx.error??new Error('Could not read workspace.'));tx.onerror=()=>reject(tx.error);});
}
/** Transactional compare and swap. A losing tab retains its own recovery workspace. */
export async function saveWorkspace(workspace:Workspace,project:WorldProject):Promise<{workspace:Workspace;conflict:boolean}>{
 const valid=validateWorld(project);if(!valid.valid||!valid.project)throw new Error(valid.errors.join(' '));
 const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(DRAFTS,'readwrite'),store=tx.objectStore(DRAFTS);let result:{workspace:Workspace;conflict:boolean};
 const req=store.get(workspace.workspaceId);req.onsuccess=()=>{const previous=checked(req.result);
 const conflict=!!previous&&(previous.editRevision!==workspace.editRevision||previous.base.location!==workspace.base.location||previous.base.revision!==workspace.base.revision);
 const next:Workspace={...workspace,workspaceId:conflict?crypto.randomUUID():workspace.workspaceId,recoveredFrom:conflict?workspace.workspaceId:workspace.recoveredFrom,worldId:project.metadata.worldId,name:project.metadata.name,project:valid.project!,editRevision:conflict?1:workspace.editRevision+1,updatedAt:Date.now()};
 store.put(next,next.workspaceId);store.put(next.workspaceId,ACTIVE);result={workspace:next,conflict};};
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error??new Error('Workspace save was aborted.'));tx.onerror=()=>reject(tx.error);});
}
