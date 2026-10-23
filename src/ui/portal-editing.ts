import type { Vec3, WorldProject } from '../domain/world';
import type { WorldPortal } from '../domain/portal';

export function createEditorPortal(project: WorldProject, position: Vec3, id = 'elsemesh-portal:' + crypto.randomUUID()): WorldPortal {
  return {
    id, name: 'Portal ' + ((project.portals?.length ?? 0) + 1), position, yaw: 0, width: 2, height: 2.5,
    destination: { worldId: 'elsemesh.world:destination', regionId: 'elsemesh.region:main', portalId: 'elsemesh-portal:arrival' },
    enabled: true, view: { enabled: true, maxDistance: 40 }, traversal: { enabled: true }, policyRef: 'portal-policy:public',
    visual: { frameColor: '#55aaff', unavailableColor: '#553333' },
  };
}
export function portalDestinationStatus(project: WorldProject, portal: WorldPortal): { valid: boolean; text: string } {
  if (portal.destination.worldId !== project.metadata.worldId) return { valid: true, text: 'External destination: availability and access are checked in the game.' };
  if (portal.destination.regionId !== project.metadata.regionId) return { valid: false, text: 'Broken local reference: this region does not exist in this repository.' };
  if (!project.portals?.some(p => p.id === portal.destination.portalId)) return { valid: false, text: 'Broken local reference: destination portal is missing.' };
  if (portal.destination.portalId === portal.id) return { valid: true, text: 'Local destination points to this same opening.' };
  return { valid: true, text: 'Local destination identity found. Access and landing clearance are checked in the game.' };
}
export function configuredGameUrl(value: string): string | null {
  try { const url=new URL(value);return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
