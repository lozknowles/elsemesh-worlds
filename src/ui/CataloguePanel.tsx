import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls } from '@react-three/drei';
import type { Group } from 'three';
import { parseObjectCatalogue, filterCatalogue, fetchCatalogueModel } from '../domain/object-catalogue';
import type { CatalogueAsset, ObjectCatalogue } from '../domain/object-catalogue';
import { inspectAndLoadAsset, disposeAssetScene } from './asset-admission';
import './CataloguePanel.css';
const EMPTY_ENTRIES: CatalogueAsset[] = [];

function ModelPreview({ entry }: { entry: CatalogueAsset }) {
 const [model,setModel]=useState<Group|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();let owned:Group|null=null;
  void fetchCatalogueModel(entry,controller.signal).then(inspectAndLoadAsset).then(result=>{
   if(controller.signal.aborted){disposeAssetScene(result.scene);return;}owned=result.scene;setModel(owned);
  }).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Preview failed.');});
  return()=>{controller.abort();if(owned)disposeAssetScene(owned);};
 },[entry]);
 if(error)return <p className="catalogue-error" role="alert">{error}</p>;
 return <div className="catalogue-preview" aria-label="Selected object 3D preview">
  {!model&&<span role="status">Loading preview…</span>}
  <Canvas camera={{position:[3,2,3],fov:45}} dpr={[1,1.5]}><ambientLight intensity={1.4}/><directionalLight position={[4,6,3]} intensity={2}/>{model&&<Bounds fit clip observe margin={1.3}><primitive object={model}/></Bounds>}<OrbitControls makeDefault/></Canvas>
 </div>;
}
export default function CataloguePanel({ onAdd, busy }: { onAdd: (entry: CatalogueAsset) => void; busy: boolean }) {
 const [catalogue,setCatalogue]=useState<ObjectCatalogue|null>(null),[error,setError]=useState(''),[query,setQuery]=useState(''),[pack,setPack]=useState('All'),[category,setCategory]=useState('All'),[page,setPage]=useState(0),[layout,setLayout]=useState<'grid'|'list'>('grid'),[selected,setSelected]=useState<CatalogueAsset|null>(null),[preview,setPreview]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(new URL('assets/catalogue/manifest.json',document.baseURI),{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw new Error('Object catalogue could not be loaded ('+response.status+').');
   const text=await response.text();if(new TextEncoder().encode(text).byteLength>8*1024*1024)throw new Error('Object catalogue exceeds its 8 MiB limit.');
   return parseObjectCatalogue(JSON.parse(text));
  }).then(value=>{if(!controller.signal.aborted)setCatalogue(value);}).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Invalid catalogue.');});
  return()=>controller.abort();
 },[]);
 const entries=catalogue?.assets??EMPTY_ENTRIES,filtered=useMemo(()=>filterCatalogue(entries,query,pack,category),[entries,query,pack,category]);
 const pages=Math.max(1,Math.ceil(filtered.length/24)),currentPage=Math.min(page,pages-1),visible=filtered.slice(currentPage*24,(currentPage+1)*24);
 const packs=[...new Map(entries.map(entry=>[entry.sourcePack.id,entry.sourcePack.name])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
 const categories=[...new Set(entries.flatMap(entry=>entry.categories))].sort();
 return <section aria-label="Object catalogue">
  <div className="panel-heading"><div><span className="eyebrow">OBJECT CATALOGUE</span><h2>Objects</h2></div></div>
  <p className="library-note">Browse reusable models. Add starts a movable preview; click terrain or an object surface to place. R rotates; Escape cancels.</p>
  {error&&<p role="alert" className="catalogue-error">{error}</p>}
  {!catalogue&&!error&&<p role="status">Loading object catalogue…</p>}
  <div className="catalogue-controls">
   <input aria-label="Search catalogue objects" placeholder="Search names and tags" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/>
   <select aria-label="Object pack" value={pack} onChange={event=>{setPack(event.target.value);setPage(0);}}><option value="All">All packs</option>{packs.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
   <select aria-label="Object category" value={category} onChange={event=>{setCategory(event.target.value);setPage(0);}}><option value="All">All categories</option>{categories.map(name=><option key={name}>{name}</option>)}</select>
   <div className="catalogue-actions"><button className="subdued" aria-pressed={category==='Interiors'} onClick={()=>{setCategory(category==='Interiors'?'All':'Interiors');setPage(0);}}>Interiors</button><button className="subdued" onClick={()=>setLayout(layout==='grid'?'list':'grid')}>{layout==='grid'?'List view':'Grid view'}</button></div>
  </div>
  <div className="catalogue-pages"><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button><span aria-live="polite">{filtered.length} models · {currentPage+1}/{pages}</span><button disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Next</button></div>
  <div className={layout==='grid'?'asset-grid':'catalogue-list'}>{visible.map(entry=><button className="asset-card" key={entry.id} aria-pressed={selected?.id===entry.id} title={entry.name+' · '+entry.sourcePack.name} onClick={()=>{setSelected(entry);setPreview(false);}}><span className="asset-thumb"><img src={new URL(entry.thumbnail,document.baseURI).href} loading="lazy" alt={entry.name}/></span><span>{entry.name}</span><small>{entry.sourcePack.name}</small></button>)}</div>
  {selected&&<div className="catalogue-selection"><b>{selected.name}</b><p>{selected.description}</p><small>{selected.dimensions.map(n=>n.toFixed(2)).join(' × ')} m · {selected.triangleCount.toLocaleString()} triangles</small><p>{selected.license.attribution}</p><div className="catalogue-actions"><button disabled={busy} onClick={()=>onAdd(selected)}>Add {selected.name}</button><button onClick={()=>setPreview(!preview)}>{preview?'Close 3D preview':'3D preview'}</button></div>{preview&&<ModelPreview key={selected.id} entry={selected}/>}</div>}
 </section>;
}
