import { Vector3 } from 'three';
import { sampleTerrain } from '../domain/world.ts';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const movementKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);

/**
 * Exact continuous clearance against the builder's two-triangle heightfield.
 * Terrain height is affine between grid-X, grid-Z and diagonal crossings, so
 * checking those breakpoints also detects a ridge between the motion endpoints.
 */
export function sweepTerrainMotion(start, delta, terrain, clearance = 2.2) {
  if (![start.x, start.y, start.z, delta.x, delta.y, delta.z, clearance].every(Number.isFinite) || clearance < 0) throw new RangeError('Navigation sweep needs finite positions, motion and nonnegative clearance.');
  const from = new Vector3(start.x, start.y, start.z);
  from.y = Math.max(from.y, sampleTerrain(terrain, from.x, from.z) + clearance);
  const times = [0, 1], { resolution, width, depth } = terrain;
  const fx = (from.x / width + 0.5) * (resolution - 1), fz = (from.z / depth + 0.5) * (resolution - 1);
  const dx = delta.x / width * (resolution - 1), dz = delta.z / depth * (resolution - 1);
  const crossings = (a, change, maximum) => {
    if (Math.abs(change) < 1e-12) return;
    const first = Math.max(0, Math.ceil(Math.min(a, a + change))), last = Math.min(maximum, Math.floor(Math.max(a, a + change)));
    for (let value = first; value <= last; value++) { const t = (value - a) / change; if (t > 0 && t < 1) times.push(t); }
  };
  crossings(fx, dx, resolution - 1); crossings(fz, dz, resolution - 1); crossings(fx + fz, dx + dz, 2 * (resolution - 1));
  times.sort((a, b) => a - b);
  let previousT = 0, previousGap = from.y - sampleTerrain(terrain, from.x, from.z) - clearance;
  for (const t of times) {
    const x = from.x + delta.x * t, y = from.y + delta.y * t, z = from.z + delta.z * t;
    const gap = y - sampleTerrain(terrain, x, z) - clearance;
    if (gap < -1e-8) {
      const intersection = previousT + (t - previousT) * previousGap / Math.max(1e-12, previousGap - gap);
      const safe = Math.max(0, intersection - 1e-5 / Math.max(1, delta.length()));
      return { position: from.addScaledVector(delta, safe), blocked: true };
    }
    previousT = t; previousGap = Math.max(0, gap);
  }
  return { position: from.add(delta), blocked: false };
}

export class NativeNavigation {
  constructor(camera, { clearance = 2.2 } = {}) {
    this.camera = camera;
    this.minimumClearance = clearance;
    this.project = null;
    this.yaw = 0.4; this.pitch = -0.15;
    this.velocity = new Vector3(); this.keys = new Set();
    this.speedMultiplier = 1; this.wheelRemaining = 0;
    this.blocked = false; this.collisions = 0; this.speed = 0; this.mode = 'overview';
    this.detach = null; this.projectIdentity = '';
    this.camera.rotation.order = 'YXZ';
  }
  ground(x = this.camera.position.x, z = this.camera.position.z) {
    return this.project ? sampleTerrain(this.project.terrain, x, z) : 0;
  }
  get clearance() { return Math.max(0, this.camera.position.y - this.ground()); }
  get baseSpeed() { return clamp(6 + this.clearance * 0.65, 8, 180); }
  forward() { return new Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  setProject(project) {
    const geo = project.geography;
    const identity = JSON.stringify([project.metadata.worldId, project.terrain.width, project.terrain.depth, geo?.center, geo?.bounds]);
    const changed = identity !== this.projectIdentity;
    this.project = project; this.projectIdentity = identity;
    if (changed) this.overview();
  }
  setKey(code, pressed) {
    if (!movementKeys.has(code)) return;
    if (pressed) this.keys.add(code); else this.keys.delete(code);
  }
  setSpeedMultiplier(value) {
    if (Number.isFinite(value) && value >= 0.25 && value <= 8) this.speedMultiplier = value;
  }
  clearInput() {
    this.keys.clear(); this.velocity.set(0, 0, 0); this.wheelRemaining = 0; this.speed = 0;
  }
  addWheel(deltaY) {
    if (!this.project || !Number.isFinite(deltaY)) return;
    const scale = clamp(this.clearance * 0.004, 0.04, 2) * this.speedMultiplier;
    const maximum = Math.max(30, Math.max(this.project.terrain.width, this.project.terrain.depth) * 0.8);
    this.wheelRemaining = clamp(this.wheelRemaining - clamp(deltaY, -1000, 1000) * scale, -maximum, maximum);
    this.mode = 'fly';
  }
  orient() {
    this.pitch = clamp(this.pitch, -1.52, 1.52);
    this.camera.rotation.set(this.pitch, this.yaw, 0); this.camera.updateMatrixWorld();
  }
  overview() {
    if (!this.project) return;
    this.clearInput();
    const terrain = this.project.terrain;
    const maximum = terrain.heights.reduce((height, value) => Math.max(height, value), -Infinity);
    const average = terrain.heights.reduce((sum, value) => sum + value, 0) / terrain.heights.length;
    const distance = Math.max(45, terrain.depth * 0.58);
    this.camera.position.set(0, maximum + Math.max(18, terrain.width * 0.3), distance);
    this.yaw = 0; this.pitch = -Math.atan2(this.camera.position.y - average, distance);
    this.mode = 'overview'; this.blocked = false; this.orient();
  }
  returnToSpawn() {
    if (!this.project) return;
    this.clearInput();
    const { position, yaw } = this.project.spawn;
    this.camera.position.set(position[0], Math.max(position[1], this.ground(position[0], position[2])) + this.minimumClearance + 0.3, position[2]);
    this.yaw = yaw; this.pitch = -0.08; this.mode = 'spawn'; this.blocked = false; this.orient();
  }
  recenter() {
    if (!this.project) return;
    this.clearInput();
    const extent = Math.max(this.project.terrain.width, this.project.terrain.depth), distance = Math.max(12, Math.min(180, extent * 0.12));
    const ground = this.ground(0, 0), height = Math.max(12, Math.min(120, extent * 0.08));
    this.camera.position.set(0, Math.max(ground + height, this.ground(0, distance) + this.minimumClearance), distance);
    this.yaw = 0; this.pitch = -Math.atan2(this.camera.position.y - ground, distance);
    this.mode = 'center'; this.blocked = false; this.orient();
  }
  command(message) {
    if (message.action === 'overview') this.overview();
    else if (message.action === 'spawn') this.returnToSpawn();
    else if (message.action === 'recenter') this.recenter();
    else if (message.action === 'speed') this.setSpeedMultiplier(message.value);
    else if (message.action === 'hold') this.setKey(message.code, true);
    else if (message.action === 'release') this.setKey(message.code, false);
    else if (message.action === 'stop') this.clearInput();
  }
  update(frameDelta) {
    if (!this.project) return this.diagnostics();
    const dt = clamp(Number.isFinite(frameDelta) ? frameDelta : 0, 0, 0.1);
    const has = (...codes) => codes.some((code) => this.keys.has(code));
    const forward = this.forward(), right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const input = new Vector3().addScaledVector(forward, Number(has('KeyW', 'ArrowUp')) - Number(has('KeyS', 'ArrowDown')))
      .addScaledVector(right, Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft')));
    input.y += Number(has('KeyE', 'Space')) - Number(has('KeyQ'));
    const active = input.lengthSq() > 1e-10;
    if (active) input.normalize();
    const boost = has('ShiftLeft', 'ShiftRight') ? 3 : 1;
    const target = input.multiplyScalar(Math.min(800, this.baseSpeed * this.speedMultiplier * boost));
    const response = active ? 5 : 9;
    const blend = 1 - Math.exp(-response * dt);
    // Analytical integration of exponential velocity gives consistent movement
    // at different frame rates and a short, predictable braking distance.
    const displacement = target.clone().multiplyScalar(dt).add(this.velocity.clone().sub(target).multiplyScalar(blend / response));
    this.velocity.lerp(target, blend);
    const dolly = this.wheelRemaining * (1 - Math.exp(-7 * dt));
    this.wheelRemaining -= dolly;
    if (Math.abs(this.wheelRemaining) < 0.001) this.wheelRemaining = 0;
    displacement.addScaledVector(forward, dolly);
    const before = new Vector3(this.camera.position.x, this.camera.position.y, this.camera.position.z);
    const result = sweepTerrainMotion(before, displacement, this.project.terrain, this.minimumClearance);
    this.camera.position.copy(result.position);
    this.blocked = result.blocked;
    if (result.blocked) { this.velocity.set(0, 0, 0); this.wheelRemaining = 0; this.collisions++; }
    if (active || Math.abs(dolly) > 0.001) this.mode = 'fly';
    this.speed = dt > 0 ? before.distanceTo(result.position) / dt : 0;
    this.orient();
    return this.diagnostics();
  }
  diagnostics() {
    return { clearance: this.clearance, baseSpeed: this.baseSpeed, speedMultiplier: this.speedMultiplier, speed: this.speed, blocked: this.blocked, collisions: this.collisions, mode: this.mode, yaw: this.yaw, pitch: this.pitch, wheelRemaining: this.wheelRemaining, keys: [...this.keys] };
  }
  attach(canvas, eventWindow = window) {
    this.detach?.();
    canvas.tabIndex = 0;
    let pointer = null, previousX = 0, previousY = 0;
    const down = (event) => { if (event.button !== 0) return; pointer = event.pointerId; previousX = event.clientX; previousY = event.clientY; canvas.setPointerCapture(pointer); canvas.focus(); };
    const move = (event) => {
      if (pointer !== event.pointerId) return;
      this.yaw -= (event.clientX - previousX) * 0.004; this.pitch = clamp(this.pitch - (event.clientY - previousY) * 0.004, -1.52, 1.52);
      previousX = event.clientX; previousY = event.clientY;
    };
    const up = (event) => { if (pointer === event.pointerId) { pointer = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); } };
    const cancel = () => { const released = pointer; pointer = null; if (released !== null && canvas.hasPointerCapture(released)) canvas.releasePointerCapture(released); this.clearInput(); };
    const lost = () => { if (pointer !== null) cancel(); };
    const wheel = (event) => { event.preventDefault(); canvas.focus(); this.addWheel(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1)); };
    const keydown = (event) => { if (!movementKeys.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return; this.setKey(event.code, true); event.preventDefault(); };
    const keyup = (event) => this.setKey(event.code, false);
    const visibility = () => { if (canvas.ownerDocument.hidden) cancel(); };
    const entries = [[canvas, 'pointerdown', down], [canvas, 'pointermove', move], [canvas, 'pointerup', up], [canvas, 'pointercancel', cancel], [canvas, 'lostpointercapture', lost], [canvas, 'wheel', wheel], [eventWindow, 'keydown', keydown], [eventWindow, 'keyup', keyup], [eventWindow, 'blur', cancel], [canvas.ownerDocument, 'visibilitychange', visibility]];
    for (const [target, event, listener] of entries) target.addEventListener(event, listener, event === 'wheel' ? { passive: false } : undefined);
    this.detach = () => { for (const [target, event, listener] of entries) target.removeEventListener(event, listener); cancel(); };
    return this.detach;
  }
  dispose() { this.detach?.(); this.detach = null; this.clearInput(); }
}
