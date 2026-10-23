import { useState } from 'react';
import type { EditorObject,WorldProject } from '../domain/world';
import type { NeonRuntimeState } from './NeonRuntime';
import './ComputerPanel.css';
export default function ComputerPanel({object,project,runtime,onToggle,onClose}:{object:EditorObject;project:WorldProject;runtime:Record<string,NeonRuntimeState>;onToggle:(id:string)=>void;onClose:()=>void}){
 const [view,setView]=useState<'home'|'world'|'lighting'>('home');
 const target=project.objects.find(candidate=>candidate.id===object.computer?.targetSignId&&candidate.kind==='neon-sign');
 const powered=target?.neon?(runtime[target.id]?.powered??target.neon.powered):false;
 return <section className="computer-panel" role="dialog" aria-modal="true" aria-label="World computer">
  <header><div><small>WORLD TERMINAL</small><h2>{object.name}</h2></div><button onClick={onClose}>Close computer</button></header>
  <nav><button autoFocus aria-pressed={view==='home'} onClick={()=>setView('home')}>Home</button><button aria-pressed={view==='world'} onClick={()=>setView('world')}>World Info</button><button aria-pressed={view==='lighting'} onClick={()=>setView('lighting')}>Lighting Controls</button></nav>
  {view==='home'&&<div className="computer-content"><h3>Home</h3><p>{project.metadata.name}</p><p>Use this terminal to inspect the world or control its linked neon sign.</p><button onClick={()=>setView('lighting')}>Open lighting controls</button></div>}
  {view==='world'&&<div className="computer-content"><h3>World Info</h3><dl><dt>World</dt><dd>{project.metadata.name}</dd><dt>Scene objects</dt><dd>{project.objects.length}</dd><dt>Neon signs</dt><dd>{project.objects.filter(object=>object.kind==='neon-sign').length}</dd><dt>Terrain</dt><dd>{project.terrain.width} × {project.terrain.depth} m</dd></dl></div>}
  {view==='lighting'&&<div className="computer-content"><h3>Lighting Controls</h3>{target?<><p>{target.name} · <strong>{powered?'ON':'OFF'}</strong></p><button onClick={()=>onToggle(target.id)}>Turn linked sign {powered?'off':'on'}</button></>:<p>No linked neon sign is available. Choose a linked sign in this computer's authoring inspector.</p>}</div>}
  <footer>Escape closes the terminal. Movement resumes when the panel closes.</footer>
 </section>;
}
