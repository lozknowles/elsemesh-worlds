import { Box3, Vector3 } from 'three';
import { validateWorld, sampleTerrain } from './world';
import type { WorldProject, Vec3 } from './world';
import { resolveWorldMatrices, effectiveObjectState, objectLocalBounds } from './object-hierarchy';

/** Data-only admission interface for an engine installation. No source lookup or scripts. */
export function describeRuntimeWorld(input: unknown) {
  const result = validateWorld(input);
  if (!result.valid || !result.project) throw new Error(result.errors.join(' '));
  const project: WorldProject = structuredClone(result.project);
  const matrices = resolveWorldMatrices(project.objects);
  const boxes = project.objects.flatMap(object => {
    if (object.kind === 'group' || object.collision === 'none' || !effectiveObjectState(project.objects, object.id).visible) return [];
    const bounds: Box3 = objectLocalBounds(project, object).applyMatrix4(matrices.get(object.id)!);
    const center = bounds.getCenter(new Vector3()), half = bounds.getSize(new Vector3()).multiplyScalar(.5);
    return [{ id: object.id, center: center.toArray() as Vec3, half: half.toArray() as Vec3,
      walkable: object.collision === 'walkable', solid: true }];
  });
  return {
    worldId: project.metadata.worldId, regionId: project.metadata.regionId,
    traffic: project.traffic ? structuredClone(project.traffic) : undefined,
    project, spawn: structuredClone(project.spawn), boxes,
    terrain: { heightAt: (x: number, z: number) => sampleTerrain(project.terrain, x, z) },
    // Interaction identifiers travel as authored data; authority remains external.
    interactions: project.objects.filter(object => object.kind === 'neon-sign' || object.kind === 'computer' || object.kind === 'media-screen')
      .map(object => ({ id: object.id, kind: object.kind, targetSignId: object.computer?.targetSignId })),
  };
}
