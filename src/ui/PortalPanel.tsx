import { useState } from 'react';
import type { FormEvent } from 'react';
import type { WorldPortal } from '../domain/portal';
import { MAX_PORTALS } from '../domain/portal';
import type { Vec3, WorldProject } from '../domain/world';
import { configuredGameUrl, portalDestinationStatus } from './portal-editing';
import './PortalPanel.css';

function PortalForm({portal,onUpdate}:{portal:WorldPortal;onUpdate:(portal:WorldPortal)=>void}) {
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const values=new FormData(event.currentTarget);
    const text=(key:string)=>String(values.get(key)??'').trim(),number=(key:string)=>Number(values.get(key));
    onUpdate({...portal,name:text('name'),position:['x','y','z'].map(number) as Vec3,yaw:number('yaw')*Math.PI/180,width:number('width'),height:number('height'),
      destination:{worldId:text('worldId'),regionId:text('regionId'),portalId:text('portalId')},enabled:values.has('enabled'),
      view:{enabled:values.has('viewEnabled'),maxDistance:number('maxDistance')},traversal:{enabled:values.has('traversalEnabled')},policyRef:text('policyRef'),
      visual:{frameColor:text('frameColor'),unavailableColor:text('unavailableColor')}});
  }
  const numberField=(name:string,label:string,value:number,min:number,max:number)=><label key={name}>{label}<input name={name} aria-label={label} type="number" required defaultValue={Number(value.toFixed(6))} min={min} max={max} step="any"/></label>;
  return <form className="portal-form" onSubmit={submit}>
    <label>Name<input name="name" aria-label="Portal name" required maxLength={120} defaultValue={portal.name}/></label>
    <p className="portal-identity">ID: {portal.id}</p>
    <h4>Aperture centre · metres</h4>
    <div className="portal-coordinates">{(['x','y','z'] as const).map((axis,i)=>numberField(axis,'Portal '+axis.toUpperCase(),portal.position[i]!,-2000,2000))}</div>
    {numberField('yaw','Portal yaw · degrees',portal.yaw*180/Math.PI,-360,360)}
    <div className="portal-fields">{numberField('width','Opening width · m',portal.width,.6,20)}{numberField('height','Opening height · m',portal.height,1.79,20)}</div>
    <h4>Destination identities</h4>
    {([['worldId','Destination world ID'],['regionId','Destination region ID'],['portalId','Destination portal ID']] as const).map(([name,label])=><label key={name}>{label}<input name={name} aria-label={label} required maxLength={180} defaultValue={portal.destination[name]}/></label>)}
    <label>Policy reference<input name="policyRef" aria-label="Portal policy reference" required maxLength={160} defaultValue={portal.policyRef}/></label>
    <p className="portal-note">Use world, region and portal IDs. Policy references name server policies; destination addresses and credentials are resolved by the game.</p>
    <label className="portal-check"><input name="enabled" type="checkbox" defaultChecked={portal.enabled}/>Portal enabled</label>
    <label className="portal-check"><input name="viewEnabled" type="checkbox" defaultChecked={portal.view.enabled}/>View through opening enabled</label>
    <label className="portal-check"><input name="traversalEnabled" type="checkbox" defaultChecked={portal.traversal.enabled}/>Traversal enabled</label>
    {numberField('maxDistance','View distance · m',portal.view.maxDistance,.5,200)}
    <div className="portal-fields"><label>Frame colour<input type="color" name="frameColor" defaultValue={portal.visual.frameColor}/></label><label>Unavailable colour<input type="color" name="unavailableColor" defaultValue={portal.visual.unavailableColor}/></label></div>
    <button type="submit">Apply portal changes</button>
  </form>;
}
export default function PortalPanel({project,selectedId,onSelect,onAdd,onUpdate,onDelete,notice}:{
  project:WorldProject;selectedId:string|null;onSelect:(id:string)=>void;onAdd:()=>void;onUpdate:(portal:WorldPortal)=>void;onDelete:(id:string)=>void;notice?:string;
}) {
  const selected=project.portals?.find(p=>p.id===selectedId),[gameUrl,setGameUrl]=useState(String((import.meta as ImportMeta & {env?:Record<string,string|undefined>}).env?.VITE_ELSEMESH_GAME_URL??''));
  const href=configuredGameUrl(gameUrl),status=selected?portalDestinationStatus(project,selected):null;
  return <section className="portal-panel" aria-label="Portals">
    <h3>Portals <small>{project.portals?.length??0} / {MAX_PORTALS}</small></h3>
    <p className="portal-note">Place an upright opening, then set its destination. Coloured frames in this viewport show the authored geometry. The actual game renders the connected view and handles traversal.</p>
    <button disabled={(project.portals?.length??0)>=MAX_PORTALS} onClick={onAdd}>Add portal near spawn</button>
    <div className="portal-list">{(project.portals??[]).map(portal=><button key={portal.id} className={portal.id===selectedId?'chosen':''} onClick={()=>onSelect(portal.id)}><span>{portal.name}</span><small>{portal.enabled?'Enabled':'Disabled'} · {portal.width} × {portal.height} m</small></button>)}</div>
    {notice&&<p className="portal-warning" role="alert">{notice}</p>}
    {selected&&<>
      <button onClick={()=>onSelect(selected.id)}>Frame portal in viewport</button>
      <p className={status?.valid?'portal-note':'portal-warning'} role="status">{status?.text}</p>
      <PortalForm key={JSON.stringify(selected)} portal={selected} onUpdate={onUpdate}/>
      <button className="delete-button" onClick={()=>onDelete(selected.id)}>Delete portal</button>
    </>}
    <div className="portal-game"><h4>Test in the actual game</h4><p className="portal-note">Save this world repository snapshot, open the game, then load that repository. Unsaved editor changes stay here.</p>
      <label>Game URL<input aria-label="Actual game URL" type="url" placeholder="https://your-game-host/" value={gameUrl} onChange={event=>setGameUrl(event.target.value)}/></label>
      {href?<a href={href} target="_blank" rel="noopener noreferrer">Open actual game ↗</a>:<p className="portal-note">Set the game URL here or configure VITE_ELSEMESH_GAME_URL.</p>}
    </div>
  </section>;
}
