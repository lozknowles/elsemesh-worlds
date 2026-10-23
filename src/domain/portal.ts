import type { Vec3, WorldProject } from './world';

export const MAX_PORTALS = 16;
export const PORTAL_PLAYER_RADIUS = 0.28;
export const PORTAL_PLAYER_HEIGHT = 1.75;
export type WorldPortal = {
  id: string; name: string; position: Vec3; yaw: number; width: number; height: number;
  destination: { worldId: string; regionId: string; portalId: string };
  enabled: boolean; view: { enabled: boolean; maxDistance: number };
  traversal: { enabled: boolean }; policyRef: string;
  visual: { frameColor: string; unavailableColor: string };
};
export type WorldWater = { level: number; waveAmplitude: number; waveSpeed: number; extent: number };
export type RetroTerminal = { id: string; objectId: string; kind: 'c64' | 'bbc' | 'sun'; screenObjectId?: string; screenObjectIds?: string[]; position: Vec3; interactionRadius: number };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bounded = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => bounded(n, -2000, 2000));
const identity = (v: unknown, prefix: string) => typeof v === 'string' && new RegExp('^' + prefix + '[A-Za-z0-9][A-Za-z0-9._-]{0,159}$').test(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
export function validateWorldConnections(project: Partial<WorldProject>): string[] {
  const errors: string[] = [], ids = new Set<string>();
  if (project.portals !== undefined) {
    if (!Array.isArray(project.portals) || project.portals.length > MAX_PORTALS) errors.push('Worlds may contain at most 16 portals.');
    for (const p of Array.isArray(project.portals) ? project.portals : []) {
      if (!record(p) || !keys(p, ['id','name','position','yaw','width','height','destination','enabled','view','traversal','policyRef','visual'])) { errors.push('Invalid portal fields.'); continue; }
      if (!identity(p.id, 'elsemesh-portal:') || ids.has(p.id)) errors.push('Portal has an invalid or duplicate identity.');
      ids.add(p.id);
      if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120 || !vec(p.position) || !bounded(p.yaw, -Math.PI * 2, Math.PI * 2) || !bounded(p.width, Math.round((PORTAL_PLAYER_RADIUS * 2 + .04)*100)/100, 20) || !bounded(p.height, PORTAL_PLAYER_HEIGHT + .04, 20)) errors.push('Portal geometry must be an upright rectangle large enough for the player capsule.');
      if (typeof p.enabled !== 'boolean' || !record(p.view) || !keys(p.view,['enabled','maxDistance']) || typeof p.view.enabled !== 'boolean' || !bounded(p.view.maxDistance,.5,200) || !record(p.traversal) || !keys(p.traversal,['enabled']) || typeof p.traversal.enabled !== 'boolean') errors.push('Portal view or traversal settings are invalid.');
      if (!record(p.destination) || !keys(p.destination,['worldId','regionId','portalId']) || !identity(p.destination.worldId,'elsemesh[.]world:') || !identity(p.destination.regionId,'elsemesh[.]region:') || !identity(p.destination.portalId,'elsemesh-portal:')) errors.push('Portal destination must contain world, region and portal identities.');
      if (typeof p.policyRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/.test(p.policyRef)) errors.push('Portal policy reference must be a bounded identity, never a URL or credential.');
      if (!record(p.visual) || !keys(p.visual,['frameColor','unavailableColor']) || ![p.visual.frameColor,p.visual.unavailableColor].every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) errors.push('Portal colors must be hexadecimal RGB.');
    }
    for (const p of Array.isArray(project.portals) ? project.portals : []) {
      if (!record(p) || !record(p.destination)) continue;
      if (p.destination.worldId === project.metadata?.worldId && (p.destination.regionId !== project.metadata?.regionId || !ids.has(p.destination.portalId))) errors.push('Portal references a missing local region or portal.');
    }
  }
  if (project.water !== undefined) {
    const w = project.water;
    if (!record(w) || !keys(w,['level','waveAmplitude','waveSpeed','extent']) || !bounded(w.level,-2000,2000) || !bounded(w.waveAmplitude,0,3) || !bounded(w.waveSpeed,0,10) || !bounded(w.extent,16,4096)) errors.push('Water settings are outside supported bounds.');
  }
  if (project.terminals !== undefined) {
    const terminalIds = new Set<string>(), objects = new Set((Array.isArray(project.objects) ? project.objects : []).map(o => o?.id));
    if (!Array.isArray(project.terminals) || project.terminals.length > 32) errors.push('Worlds may contain at most 32 retro terminals.');
    for (const t of Array.isArray(project.terminals) ? project.terminals : []) {
      if (!record(t) || !keys(t,['id','objectId','kind','screenObjectId','screenObjectIds','position','interactionRadius']) || typeof t.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/.test(t.id) || terminalIds.has(t.id) || !['c64','bbc','sun'].includes(t.kind) || !objects.has(t.objectId) || (t.screenObjectId !== undefined && !objects.has(t.screenObjectId)) || (t.screenObjectIds !== undefined && (!Array.isArray(t.screenObjectIds) || t.screenObjectIds.length > 8 || new Set(t.screenObjectIds).size !== t.screenObjectIds.length || t.screenObjectIds.some(id => !objects.has(id)))) || !vec(t.position) || !bounded(t.interactionRadius,.5,5)) errors.push('Retro terminal has invalid settings, duplicate identity or missing object references.');
      if (record(t) && typeof t.id === 'string') terminalIds.add(t.id);
    }
  }
  return errors;
}
/** Upright, unit-scale frames only; local +Z is the entrance/front side. */
const rotate = (v: Vec3, yaw: number): Vec3 => [Math.cos(yaw)*v[0]+Math.sin(yaw)*v[2],v[1],-Math.sin(yaw)*v[0]+Math.cos(yaw)*v[2]];
export function portalLocalPoint(portal: WorldPortal, point: Vec3): Vec3 {
  return rotate([point[0]-portal.position[0],point[1]-portal.position[1],point[2]-portal.position[2]],-portal.yaw);
}
export function portalWorldPoint(portal: WorldPortal, point: Vec3): Vec3 {
  const v=rotate(point,portal.yaw); return [v[0]+portal.position[0],v[1]+portal.position[1],v[2]+portal.position[2]];
}
export function mapPortalPoint(source: WorldPortal, destination: WorldPortal, point: Vec3): Vec3 {
  const v=portalLocalPoint(source,point); return portalWorldPoint(destination,[-v[0],v[1],-v[2]]);
}
export function mapPortalDirection(source: WorldPortal, destination: WorldPortal, direction: Vec3): Vec3 {
  return rotate(direction,destination.yaw+Math.PI-source.yaw);
}
/** Column-major Mdestination * Ry(pi) * inverse(Msource), shared by native and Three cameras. */
export function portalMappingElements(source: WorldPortal, destination: WorldPortal): number[] {
  const x=mapPortalDirection(source,destination,[1,0,0]),y=mapPortalDirection(source,destination,[0,1,0]),z=mapPortalDirection(source,destination,[0,0,1]),p=mapPortalPoint(source,destination,[0,0,0]);
  return [x[0],x[1],x[2],0,y[0],y[1],y[2],0,z[0],z[1],z[2],0,p[0],p[1],p[2],1];
}
export function mapPortalYaw(source: WorldPortal, destination: WorldPortal, yaw: number): number {
  const angle=yaw+destination.yaw+Math.PI-source.yaw; return Math.atan2(Math.sin(angle),Math.cos(angle));
}
/** Swept feet coordinates; the entire upright body and horizontal radius must fit at crossing. */
export function sweepPortalCapsule({portal,previousFeet,nextFeet,radius=PORTAL_PLAYER_RADIUS,bodyHeight=PORTAL_PLAYER_HEIGHT}: {portal:WorldPortal;previousFeet:Vec3;nextFeet:Vec3;radius?:number;bodyHeight?:number}): {fraction:number;feet:Vec3}|null {
  if (!portal.enabled || !portal.traversal.enabled || ![...previousFeet,...nextFeet,radius,bodyHeight].every(Number.isFinite) || radius<0 || bodyHeight<=0) return null;
  const a=portalLocalPoint(portal,previousFeet),b=portalLocalPoint(portal,nextFeet);
  if (a[2]<=0 || b[2]>0) return null;
  const fraction=a[2]/(a[2]-b[2]),x=a[0]+(b[0]-a[0])*fraction,y=a[1]+(b[1]-a[1])*fraction;
  if (Math.abs(x)+radius>portal.width/2 || y < -portal.height/2-1e-7 || y+bodyHeight>portal.height/2+1e-7) return null;
  return {fraction,feet:portalWorldPoint(portal,[x,y,0])};
}
