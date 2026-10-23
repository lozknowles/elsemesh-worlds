import { useRef, useState } from 'react';
import type { WorldProject } from '../domain/world';
import type { WorkspaceBase } from '../domain/persistence';
import { checkWorldSourceUpdate, forkWorldSource, loadWorldSource, parseGitHubWorldLocation, resolveGitHubWorldSource } from '../domain/world-source';
import type { LoadedWorldSource } from '../domain/world-source';
import type { WorldPackOptions } from '../domain/world-repository';
import { openWorldRepositoryFolder, saveWorldRepositoryFolder } from './repository-files';
import type { RepositoryBinding } from './repository-files';
import './RepositoryPanel.css';

export default function RepositoryPanel({getProject,getGeneration,getRepositoryOptions,onOpen}:{
 getProject:()=>WorldProject;getGeneration:()=>number;getRepositoryOptions?:()=>WorldPackOptions|undefined;
 onOpen:(project:WorldProject,generation:number,base?:WorkspaceBase)=>Promise<boolean>;
}){
 const binding=useRef<{value:RepositoryBinding;generation:number}|null>(null);
 const source=useRef<{loaded:LoadedWorldSource;generation:number;options:WorldPackOptions}|null>(null);
 const packOptions=useRef<{generation:number;options:WorldPackOptions}|null>(null);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('Local drafts are saved separately from repository snapshots, commits and pushes.'),[url,setUrl]=useState(''),[candidate,setCandidate]=useState<LoadedWorldSource|null>(null),[sourceLabel,setSourceLabel]=useState('');
 const candidateGuard=useRef<{project:WorldProject;generation:number}|null>(null);
 const supported=typeof window!=='undefined'&&'showDirectoryPicker' in window;
 function base(loaded:LoadedWorldSource):WorkspaceBase{return {location:loaded.identity.location,revision:loaded.identity.resolvedCommit??loaded.identity.contentDigest,repositoryOptions:options(loaded)};}
 function options(loaded:LoadedWorldSource):WorldPackOptions{return {attribution:loaded.manifest.attribution,provenance:loaded.manifest.provenance};}
 async function replace(next:LoadedWorldSource,generation:number,before:WorldProject):Promise<boolean>{
  if(generation!==getGeneration()||before!==getProject()){setStatus('The world changed during loading. Open it again.');return false;}
  if(!window.confirm('Open this world in a separate local workspace? Current authored edits are retained in local storage.'))return false;
  if(!await onOpen(next.project,generation,base(next)))return false;
  source.current={loaded:next,generation:getGeneration(),options:options(next)};
  packOptions.current={generation:getGeneration(),options:options(next)};
  setSourceLabel(next.identity.location+' @ '+(next.identity.resolvedCommit??next.identity.contentDigest));
  setCandidate(null);return true;
 }
 async function run(mode:'open'|'remote'|'save'|'copy'|'check'|'fork'){
  if(busy)return;const generation=getGeneration(),before=getProject();setBusy(true);
  try{
   if(mode==='open'){
    const next=await openWorldRepositoryFolder();
    if(await replace(next.loaded,generation,before)){binding.current={value:next.binding,generation:getGeneration()};setStatus('Folder opened through the validated world loader.');}
   }else if(mode==='remote'){
    const pinned=await resolveGitHubWorldSource(parseGitHubWorldLocation(url));
    const next=await loadWorldSource(pinned);
    if(await replace(next,generation,before)){binding.current=null;setStatus('Public repository opened at a pinned commit. No GitHub credential was requested.');}
   }else if(mode==='check'){
    const active=source.current;if(!active||active.generation!==generation)throw new Error('Open a repository before checking for updates.');
    const next=active.loaded.source.kind==='local'?await loadWorldSource(active.loaded.source):await checkWorldSourceUpdate(active.loaded);
    if(generation!==getGeneration()||before!==getProject())throw new Error('The world changed while checking. Check again.');
    if(!next||next.identity.contentDigest===active.loaded.identity.contentDigest){setCandidate(null);setStatus('Repository content is unchanged.');}
    else{candidateGuard.current={project:before,generation};setCandidate(next);setStatus('An update is available. Review the revision and apply it explicitly; current edits will be retained.');}
   }else if(mode==='fork'){
    const active=source.current;if(!active||active.generation!==generation)throw new Error('Open a repository before forking it.');
    if(!window.confirm('Fork the current authored world with a new permanent world ID and source provenance?'))return;
    const fork=forkWorldSource({...active.loaded,project:before},before.metadata.name+' (fork)');
    if(!await onOpen(fork.project,generation,{location:'local:fork',revision:active.loaded.identity.resolvedCommit??active.loaded.identity.contentDigest,repositoryOptions:fork.packOptions}))return;
    source.current=null;packOptions.current={generation:getGeneration(),options:fork.packOptions};binding.current=null;setCandidate(null);setSourceLabel('Local fork of '+active.loaded.identity.location);
    setStatus('Fork created with a new world ID. Save a repository snapshot into an empty folder.');
   }else{
    const previous=mode==='save'&&binding.current?.generation===generation?binding.current.value:undefined;
    const activeOptions=packOptions.current?.generation===generation?packOptions.current.options:getRepositoryOptions?.();
    const next=await saveWorldRepositoryFolder(before,previous,activeOptions);
    if(generation!==getGeneration()){setStatus('The earlier authored snapshot was saved; the active world changed.');return;}
    binding.current={value:next,generation};
    setStatus('Repository snapshot saved to '+next.name+'. Commit: not performed. Push: not performed. Further edits need another snapshot.');
   }
  }catch(error){setStatus(error instanceof DOMException&&error.name==='AbortError'?'Folder selection cancelled.':error instanceof Error?error.message:'Repository operation failed.');}
  finally{setBusy(false);}
 }
 async function apply(){
  const guard=candidateGuard.current;
  if(!candidate||!guard||guard.generation!==getGeneration()||guard.project!==getProject()){setCandidate(null);setStatus('World edits changed since the update check. Check again before applying.');return;}
  if(await replace(candidate,guard.generation,guard.project)){binding.current=null;setStatus('Repository update applied into a separate workspace. The earlier draft remains in local workspaces.');}
 }
 return <section className="repository-panel" aria-label="World repository">
  <h3>World repository</h3><p>Each world has its own repository. Local workspaces retain separate drafts for each location and revision.</p>
  {sourceLabel&&<p className="repository-folder">Opened source: {sourceLabel}</p>}
  <div className="repository-actions">
   <button disabled={busy||!supported} onClick={()=>void run('open')}>Open repository folder</button>
   <label>Public GitHub repository or tree URL<input aria-label="GitHub world repository URL" value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://github.com/owner/world"/></label>
   <button disabled={busy||!url.trim()} onClick={()=>void run('remote')}>Open public GitHub world</button>
   <button disabled={busy} onClick={()=>void run('check')}>Check repository updates</button>
   {candidate&&<><p>Available revision: {candidate.identity.resolvedCommit??candidate.identity.contentDigest}</p><button disabled={busy} onClick={()=>void apply()}>Apply checked update…</button></>}
   <button disabled={busy||!supported} onClick={()=>void run('save')}>Save repository snapshot</button>
   <button disabled={busy||!supported} onClick={()=>void run('copy')}>Save repository copy (same world ID)…</button>
   <button disabled={busy} onClick={()=>void run('fork')}>Fork as a new world…</button>
  </div>
  <p role="status" aria-live="polite">{busy?'Working on repository files…':status}</p>
  {!supported&&<p>Folder access requires Edge or Chrome on localhost or HTTPS. Portable .emw files remain available through Open and Save project.</p>}
  <details><summary>Commit and publish a snapshot</summary><ol><li>Save a repository snapshot into a separate world checkout.</li><li>Review changed files and assets in GitHub Desktop or Git.</li><li>Create a commit, then explicitly push it to publish.</li></ol><p>The browser never commits or pushes. It needs no GitHub token. Repository access does not grant private runtime administration.</p></details>
 </section>;
}
