import type { Vec3 } from './world';

export const AMBIENT_BEHAVIOUR_SCHEMA = 'elsemesh.ambient-behaviour/1' as const;
export type AmbientBehaviourKind = 'bird-flight' | 'crab-walk' | 'fish-swim';
export type AmbientBehaviour = {
  schema: typeof AMBIENT_BEHAVIOUR_SCHEMA;
  kind: AmbientBehaviourKind;
  /** Metres per second along a bounded route. */
  speed: number;
  /** Maximum horizontal excursion in metres from the authored transform. */
  radius: number;
  seed: number;
};
export type AmbientHabitat = {
  groundHeight?: (x: number, z: number) => number;
  waterLevel?: number;
  bounds?: { width: number; depth: number };
};
export type AmbientPose = { position: Vec3; yaw: number; active: boolean };

const kinds: AmbientBehaviourKind[] = ['bird-flight', 'crab-walk', 'fish-swim'];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function validateAmbientBehaviour(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Ambient behaviour must be an object.'];
  const b = value as Record<string, unknown>;
  if (Object.keys(b).some(key => !['schema', 'kind', 'speed', 'radius', 'seed'].includes(key))) return ['Ambient behaviour has unsupported fields.'];
  if (b.schema !== AMBIENT_BEHAVIOUR_SCHEMA || !kinds.includes(b.kind as AmbientBehaviourKind)) return ['Ambient behaviour has an unsupported version or kind.'];
  if (!finite(b.speed) || b.speed < 0.05 || b.speed > 12) return ['Ambient speed must be 0.05 to 12 m/s.'];
  if (!finite(b.radius) || b.radius < 0.2 || b.radius > 30) return ['Ambient radius must be 0.2 to 30 m.'];
  if (!Number.isInteger(b.seed) || (b.seed as number) < 0 || (b.seed as number) > 0xffffffff) return ['Ambient seed must be an unsigned 32-bit integer.'];
  return [];
}

/** Installed client software evaluates a visual path; authored content supplies only parameters. */
export function evaluateAmbientBehaviour(
  behaviour: AmbientBehaviour, anchor: Vec3, baseYaw: number, time: number, habitat: AmbientHabitat = {},
): AmbientPose {
  if (validateAmbientBehaviour(behaviour).length || !anchor.every(Number.isFinite) || !finite(baseYaw) || !finite(time)) return { position: [...anchor], yaw: baseYaw, active: false };
  const phase = ((behaviour.seed >>> 0) / 0x100000000) * Math.PI * 2;
  const frequency = behaviour.speed / Math.max(behaviour.radius / 2, 0.2);
  const theta = phase + Math.max(0, time) * frequency;
  const half = behaviour.radius / 2;
  const x = anchor[0] + half * (Math.cos(theta) - Math.cos(phase));
  const z = anchor[2] + half * (Math.sin(theta) - Math.sin(phase));
  const heading = Math.atan2(-Math.sin(theta), Math.cos(theta));
  const stationary = { position: [...anchor] as Vec3, yaw: baseYaw, active: false };
  const edge = habitat.bounds;
  if (edge && (Math.abs(x) > edge.width / 2 - 1 || Math.abs(z) > edge.depth / 2 - 1)) return stationary;
  const ground = habitat.groundHeight?.(x, z);
  if (ground !== undefined && !Number.isFinite(ground)) return stationary;
  if (behaviour.kind === 'crab-walk') {
    if (ground === undefined || ground > anchor[1] + 1 || ground < anchor[1] - 1) return stationary;
    return { position: [x, ground, z], yaw: baseYaw + heading, active: true };
  }
  if (behaviour.kind === 'fish-swim') {
    const water = habitat.waterLevel;
    if (!finite(water) || water - (ground ?? -Infinity) < 0.8) return stationary;
    const y = Math.min(anchor[1] + 0.18 * Math.sin(theta * 1.4), water - 0.35);
    if (ground !== undefined && y < ground + 0.2) return stationary;
    return { position: [x, y, z], yaw: baseYaw + heading, active: true };
  }
  const y = Math.max(anchor[1] + 0.3 * Math.sin(theta * 1.7), (ground ?? -Infinity) + 1.2);
  return { position: [x, y, z], yaw: baseYaw + heading, active: true };
}
