import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { describeRuntimeWorld } from './runtime-world';
describe('runtime data admission', () => {
  it('keeps identity, terrain, interactions and authored content independent of engine state', () => {
    const world=createWorld('Runtime data');
    const before=JSON.stringify(world), runtime=describeRuntimeWorld(world);
    expect(runtime.worldId).toBe(world.metadata.worldId);
    expect(runtime.terrain.heightAt(0,0)).toBeGreaterThanOrEqual(0);
    runtime.project.metadata.name='runtime copy';
    expect(JSON.stringify(world)).toBe(before);
  });
  it('rejects invalid world content before runtime activation', () => {
    expect(()=>describeRuntimeWorld({schema:'unsupported'})).toThrow();
  });
});
