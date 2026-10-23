import { useMemo, useState } from 'react';
import type { WorldProject } from '../domain/world';
import './SceneExplorer.css';
export default function SceneExplorer({ project, selectedIds, onSelect, onAdd, onTerrain, onVisible, onLock, onGroup, onUngroup, onGroupAll, onCopy, onPaste }: {
 project: WorldProject; selectedIds: string[]; onSelect: (id: string, additive?: boolean) => void; onAdd: () => void; onTerrain: () => void;
 onVisible: (id: string) => void; onLock: (id: string) => void; onGroup: () => void; onUngroup: () => void; onGroupAll: () => void; onCopy: () => void; onPaste: () => void;
}) {
 const [query,setQuery]=useState(''),[collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const children=useMemo(()=>{const map=new Map<string|undefined,typeof project.objects>();for(const object of project.objects){const list=map.get(object.parentId)??[];list.push(object);map.set(object.parentId,list);}return map;},[project]);
 const keep=useMemo(()=>{
  const ids=new Set<string>(),byId=new Map(project.objects.map(object=>[object.id,object]));
  for(const object of project.objects)if(!query.trim() || [object.name,object.description??'',...(object.tags??[])].join(' ').toLowerCase().includes(query.toLowerCase())){let current:typeof object|undefined=object;while(current&&!ids.has(current.id)){ids.add(current.id);current=current.parentId?byId.get(current.parentId):undefined;}}
  return ids;
 },[project,query]);
 const rows=(parentId?:string,depth=0,parentLocked=false,parentVisible=true):React.ReactNode=>(children.get(parentId)??[]).filter(object=>keep.has(object.id)).map(object=>{
  const nested=children.get(object.id)??[],locked=parentLocked||!!object.locked,visible=parentVisible&&object.visible,closed=collapsed.has(object.id)&&!query;
  return <div key={object.id}>
   <div className={'tree-row object-row '+(selectedIds.includes(object.id)?'selected':'')} data-object-id={object.id} data-parent-id={object.parentId??''} style={{paddingLeft:depth*13+6,opacity:visible?1:.6}}>
    {nested.length>0?<button className="scene-collapse" aria-label={(closed?'Expand ':'Collapse ')+object.name} onClick={()=>setCollapsed(previous=>{const next=new Set(previous);if(next.has(object.id))next.delete(object.id);else next.add(object.id);return next;})}>{closed?'▸':'▾'}</button>:<span className="scene-collapse"/>}
    <button className="scene-object-name" aria-pressed={selectedIds.includes(object.id)} onClick={event=>onSelect(object.id,event.shiftKey)} title={object.name+(locked?' · locked':'')}><span className="scene-icon">{object.kind==='group'?'▣':object.kind==='tree'?'♣':object.kind==='building'?'⌂':'◻'}</span><span>{object.name}</span></button>
    <button className="row-eye" title={object.visible?'Hide object':'Show object'} disabled={locked} onClick={()=>onVisible(object.id)}>{object.visible?'◉':'○'}</button>
    <button className="row-eye" title={object.locked?'Unlock object':'Lock object'} disabled={parentLocked} onClick={()=>onLock(object.id)}>{locked?'🔒':'◇'}</button>
   </div>
   {!closed&&rows(object.id,depth+1,locked,visible)}
  </div>;
 });
 return <section aria-label="Scene explorer">
  <div className="panel-heading"><div><span className="eyebrow">WORLD OUTLINE</span><h2>Scene</h2></div><button className="icon-btn" title="Add object" onClick={onAdd}>＋</button></div>
  <div className="asset-search">⌕ <input aria-label="Search scene objects" placeholder="Search objects and tags" value={query} onChange={event=>setQuery(event.target.value)}/></div>
  <p className="library-note">{selectedIds.length} selected · Shift-click adds or removes a selection.</p><p className="library-note">Transforms edit the active object. Group selected objects to transform them together.</p>
  <div className="scene-commands"><button onClick={onGroup} disabled={!selectedIds.length}>Group selected</button><button onClick={onUngroup} disabled={!selectedIds.length}>Ungroup selected</button><button onClick={onCopy} disabled={!selectedIds.length}>Copy selection</button><button onClick={onPaste}>Paste objects</button><button onClick={onGroupAll} disabled={!project.objects.length}>Group entire world</button></div>
  <div className="scene-meta">{project.objects.length+(project.features?.length??0)+1} entities · {project.terrain.resolution} × {project.terrain.resolution} terrain</div>
  <div className="tree-list"><div className="tree-row root"><span className="scene-icon">◈</span><span>{project.metadata.name}</span></div><button className="tree-row terrain-row" onClick={onTerrain}><span className="scene-icon">▱</span><span>Terrain</span></button>{rows()}</div>
 </section>;
}
