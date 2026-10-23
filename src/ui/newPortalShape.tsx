import { DoubleSide } from 'three';
import type { WorldProject } from '../domain/world';
import { portalDestinationStatus } from './portal-editing';

/** Authored rectangle guides only. The actual game owns realtime rendering and traversal. */
export default function PortalShapes({project, selectedId, onSelect}: {project:WorldProject;selectedId:string|null;onSelect:(id:string)=>void}) {
  return <>{(project.portals ?? []).map(portal => {
    const valid=portalDestinationStatus(project,portal).valid;
    const color=selectedId===portal.id ? '#ffe5a0' : portal.enabled && valid ? portal.visual.frameColor : portal.visual.unavailableColor;
    const w=portal.width,h=portal.height,t=.09;
    return <group key={portal.id} position={portal.position} rotation={[0,portal.yaw,0]} onPointerDown={event=>{event.stopPropagation();onSelect(portal.id);}}>
      {([-1,1] as const).map(sign=><mesh key={'side'+sign} position={[sign*(w+t)/2,0,0]}><boxGeometry args={[t,h+2*t,t]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.3}/></mesh>)}
      {([-1,1] as const).map(sign=><mesh key={'cap'+sign} position={[0,sign*(h+t)/2,0]}><boxGeometry args={[w,t,t]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.3}/></mesh>)}
      <mesh><planeGeometry args={[w,h]}/><meshBasicMaterial color={color} transparent opacity={selectedId===portal.id ? .18 : .07} side={DoubleSide} depthWrite={false}/></mesh>
      <mesh position={[0,0,.2]} rotation={[Math.PI/2,0,0]}><coneGeometry args={[.1,.3,8]}/><meshBasicMaterial color={color}/></mesh>
    </group>;
  })}</>;
}
