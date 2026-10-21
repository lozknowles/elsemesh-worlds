import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
// @ts-expect-error Native runtime modules are JavaScript; this test exercises their public API.
import { NativeNavigation, sweepTerrainMotion } from './NativeNavigation.js';
import { sampleTerrain } from '../domain/world.ts';
import type { Terrain } from '../domain/world';

const flat = (height = 0): Terrain => ({ width: 32, depth: 32, resolution: 9, seed: 0, heights: Array(81).fill(height), materials: Array(81).fill(0) });
function project(terrain = flat()) {
  return { metadata: { worldId: 'navigation-fixture' }, terrain, spawn: { position: [3, 0, 5], yaw: 0.7 } };
}
function navigator(terrain = flat(), position = [0, 12, 10]) {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 10000);
  const navigation = new NativeNavigation(camera);
  navigation.setProject(project(terrain));
  camera.position.fromArray(position);
  navigation.yaw = 0; navigation.pitch = 0; navigation.clearInput();
  return { camera, navigation };
}
function advance(navigation: InstanceType<typeof NativeNavigation>, seconds: number, fps: number) {
  let state;
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) state = navigation.update(1 / fps);
  return state;
}

describe('native preview navigation', () => {
  it('accelerates and brakes smoothly with equivalent travel across frame rates', () => {
    const run = (fps: number) => {
      const { camera, navigation } = navigator();
      navigation.setKey('KeyW', true);
      const initial = navigation.update(1 / fps);
      const initialVelocity = navigation.velocity.length();
      expect(initialVelocity).toBeGreaterThan(0);
      expect(initialVelocity).toBeLessThan(initial.baseSpeed);
      advance(navigation, 1 - 1 / fps, fps);
      const moving = camera.position.clone();
      const cruisingVelocity = navigation.velocity.length();
      navigation.setKey('KeyW', false);
      navigation.update(1 / fps);
      expect(navigation.velocity.length()).toBeGreaterThan(0);
      expect(navigation.velocity.length()).toBeLessThan(cruisingVelocity);
      advance(navigation, 1 - 1 / fps, fps);
      expect(navigation.velocity.length()).toBeLessThan(cruisingVelocity * 0.01);
      return { moving, stopped: camera.position.clone() };
    };
    const slow = run(30), fast = run(120);
    expect(slow.moving.distanceTo(fast.moving)).toBeLessThan(0.03);
    expect(slow.stopped.distanceTo(fast.stopped)).toBeLessThan(0.03);
  });

  it('normalizes diagonal movement rather than granting a speed boost', () => {
    const run = (codes: string[]) => {
      const { camera, navigation } = navigator();
      const origin = camera.position.clone();
      for (const code of codes) navigation.setKey(code, true);
      advance(navigation, 1, 60);
      return camera.position.distanceTo(origin);
    };
    expect(run(['KeyW', 'KeyD'])).toBeCloseTo(run(['KeyW']), 5);
  });

  it('bases speed on height above local ground, independently of vertical datum', () => {
    const low = navigator(flat(0), [0, 12, 10]);
    const high = navigator(flat(1000), [0, 1012, 10]);
    low.navigation.setKey('KeyW', true); high.navigation.setKey('KeyW', true);
    const a = advance(low.navigation, 0.5, 60), b = advance(high.navigation, 0.5, 60);
    expect(a.speed).toBeCloseTo(b.speed, 9);
    expect(low.camera.position.z).toBeCloseTo(high.camera.position.z, 8);
    const elevated = navigator(flat(1000), [0, 1200, 10]);
    elevated.navigation.setKey('KeyW', true);
    expect(elevated.navigation.update(1 / 60).baseSpeed).toBeGreaterThan(b.baseSpeed);
  });

  it('sweeps across narrow peaks and cell diagonals instead of checking only the endpoint', () => {
    const terrain = flat(); terrain.heights[40] = 25;
    for (const [start, delta] of [
      [[-15, 5, 0], [30, 0, 0]], [[15, 5, 0], [-30, 0, 0]],
      [[-15, 5, -15], [30, 0, 30]], [[15, 5, 15], [-30, 0, -30]],
    ]) {
      const origin = new THREE.Vector3().fromArray(start!);
      const result = sweepTerrainMotion(origin, new THREE.Vector3().fromArray(delta!), terrain, 2.2);
      expect(result.blocked).toBe(true);
      expect(result.position.distanceTo(origin)).toBeLessThan(new THREE.Vector3().fromArray(delta!).length() * 0.6);
      expect(result.position.y).toBeGreaterThanOrEqual(sampleTerrain(terrain, result.position.x, result.position.z) + 2.2 - 0.001);
    }
    const above = sweepTerrainMotion(new THREE.Vector3(-15, 40, 0), new THREE.Vector3(30, 0, 0), terrain, 2.2);
    expect(above.blocked).toBe(false);
    expect(above.position.toArray()).toEqual([15, 40, 0]);
  });

  it('applies swept clearance to fast wheel travel as well as keyboard input', () => {
    const terrain = flat(); terrain.heights[40] = 25;
    const { camera, navigation } = navigator(terrain, [0, 5, 15]);
    navigation.addWheel(-10000);
    const state = advance(navigation, 1, 60);
    expect(state.collisions).toBeGreaterThan(0);
    expect(camera.position.z).toBeGreaterThan(0);
    expect(camera.position.y).toBeGreaterThanOrEqual(sampleTerrain(terrain, camera.position.x, camera.position.z) + 2.2 - 0.001);
  });

  it('resets held keys, residual wheel motion and velocity when input is cleared', () => {
    const { camera, navigation } = navigator();
    navigation.setKey('KeyW', true); navigation.addWheel(-100);
    navigation.update(1 / 60);
    expect(navigation.velocity.length()).toBeGreaterThan(0);
    navigation.clearInput();
    const origin = camera.position.clone();
    const state = advance(navigation, 0.5, 60);
    expect(navigation.velocity.length()).toBe(0);
    expect(state.wheelRemaining).toBe(0);
    expect(state.keys).toHaveLength(0);
    expect(camera.position.distanceTo(origin)).toBe(0);
  });

  it('positions overview and spawn safely on elevated terrain and honours spawn yaw', () => {
    const terrain = flat(1000); terrain.heights[40] = 1050;
    const { camera, navigation } = navigator(terrain);
    navigation.overview();
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(camera.position.y).toBeGreaterThan(1050);
    expect(navigation.pitch).toBeLessThan(0);
    expect(camera.position.length()).toBeLessThan(10000);
    navigation.returnToSpawn();
    expect(camera.position.x).toBeCloseTo(3, 9);
    expect(camera.position.z).toBeCloseTo(5, 9);
    expect(camera.position.y).toBeGreaterThanOrEqual(sampleTerrain(terrain, 3, 5) + 2.2);
    expect(navigation.yaw).toBeCloseTo(0.7, 9);
    expect(navigation.velocity.length()).toBe(0);
  });
  it('ignores invalid elapsed time and caps a stalled frame to the supported integration step', () => {
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const { camera, navigation } = navigator();
      const origin = camera.position.clone();
      navigation.setKey('KeyW', true); navigation.addWheel(-100);
      const state = navigation.update(time);
      expect(camera.position.distanceTo(origin)).toBe(0);
      expect(navigation.velocity.length()).toBe(0);
      expect(state.speed).toBe(0);
      expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    }
    const stalled = navigator(), bounded = navigator();
    stalled.navigation.setKey('KeyW', true); bounded.navigation.setKey('KeyW', true);
    stalled.navigation.update(10); bounded.navigation.update(0.1);
    expect(stalled.camera.position.distanceTo(bounded.camera.position)).toBeLessThan(1e-10);
    expect(stalled.navigation.velocity.distanceTo(bounded.navigation.velocity)).toBeLessThan(1e-10);
  });
  it('rejects nonfinite sweep vectors rather than poisoning camera state', () => {
    for (const delta of [[Number.NaN, 0, 0], [0, Number.POSITIVE_INFINITY, 0], [0, 0, Number.NEGATIVE_INFINITY]]) {
      const start = new THREE.Vector3(0, 12, 10);
      let result;
      try { result = sweepTerrainMotion(start, new THREE.Vector3().fromArray(delta), flat()); }
      catch { continue; } // Explicit rejection is also an acceptable fail-closed result.
      expect(result.position.toArray().every(Number.isFinite)).toBe(true);
      expect(result.position.distanceTo(start)).toBe(0);
      expect(result.blocked).toBe(true);
    }
  });
});
