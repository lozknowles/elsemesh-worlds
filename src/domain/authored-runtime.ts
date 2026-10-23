import type { WorldProject } from './world';
import type { PrivateNeonSnapshot } from './private-neon-client';
import { privateNeonMatchesWorld } from './private-neon-client';
/** Runtime presentation is a derived value, never a replacement for the author document. */
export function runtimePresentation(project: WorldProject, snapshot: PrivateNeonSnapshot | null): WorldProject {
  if (!snapshot || !privateNeonMatchesWorld(snapshot, project.metadata.worldId, project.objects.filter(o => o.kind === 'neon-sign').map(o => o.id))) return project;
  const configs = new Map(snapshot.signs.map(s => [s.id, s.config]));
  return {...project, environment: {...project.environment, timeOfDay: snapshot.worldHour}, objects: project.objects.map(o => {
    const config = configs.get(o.id);
    return o.kind === 'neon-sign' && config ? {...o, neon: structuredClone(config), color: config.color} : o;
  })};
}
export function adoptRuntimeSettings(project: WorldProject, snapshot: PrivateNeonSnapshot | null, expected: {serverId:string;epoch:string;revision:number}): WorldProject {
  if (!snapshot || snapshot.role !== 'owner' || snapshot.serverId !== expected.serverId || snapshot.epoch !== expected.epoch || snapshot.revision !== expected.revision) throw new Error('The owner session or server revision changed. Review the latest settings before adopting.');
  const result = runtimePresentation(project, snapshot);
  if (result === project) throw new Error('Connect the matching private world before adopting settings.');
  return result;
}
