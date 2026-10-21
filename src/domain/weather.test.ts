import { describe, expect, it } from 'vitest';
import { quadIndices, RAIN_PARTICLES, rainCount, stormState, writeLightningQuad, writeRainQuads } from './weather';
import type { WeatherSettings } from './weather';

const camera = [17, 9, -23] as const;
function rainAt(time: number, settings: WeatherSettings, origin: readonly number[] = camera) {
  const positions = new Float32Array(RAIN_PARTICLES * 12).fill(Number.NaN);
  const count = writeRainQuads(positions, time, origin, settings);
  return { positions, count, active: positions.slice(0, count * 12) };
}

describe('shared seeded weather geometry', () => {
  it('turns rain off for clear/legacy worlds and varies active density within the allocation', () => {
    for (const settings of [{}, { weather: 'clear', rainIntensity: 1 }, { weather: 'rain', rainIntensity: 0 }] satisfies WeatherSettings[]) {
      const frame = rainAt(10, settings);
      expect(frame.count).toBe(0);
      expect(frame.positions.every(Number.isNaN)).toBe(true);
    }
    const counts = [0.1, 0.35, 0.75, 1].map((rainIntensity) => rainCount({ weather: 'rain', rainIntensity }));
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts.at(-1)).toBe(RAIN_PARTICLES);
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThan(counts[i - 1]!);
    expect(rainCount({ weather: 'storm', rainIntensity: 0.35 })).toBe(counts[1]);
  });

  it('writes finite bounded drop quads at extreme valid seeds, wind speeds and long times', () => {
    for (const weatherSeed of [0, 7341, 0xffffffff]) for (const windSpeed of [0, 30]) for (const time of [0, 0.016, 83.2, 1_000_000]) {
      const frame = rainAt(time, { weather: 'rain', rainIntensity: 1, weatherSeed, windSpeed });
      expect(frame.count).toBe(RAIN_PARTICLES);
      expect(frame.active.every(Number.isFinite)).toBe(true);
      for (let offset = 0; offset < frame.active.length; offset += 12) {
        const p = frame.active;
        // Camera-relative volume, allowing a slanted drop's trailing end.
        for (let vertex = 0; vertex < 4; vertex++) {
          const index = offset + vertex * 3;
          expect(Math.abs(p[index]! - camera[0])).toBeLessThan(37);
          expect(p[index + 1]!).toBeGreaterThan(camera[1] - 15);
          expect(p[index + 1]!).toBeLessThanOrEqual(camera[1] + 25);
          expect(Math.abs(p[index + 2]! - camera[2])).toBeLessThan(36);
        }
        expect(p[offset + 1]! - p[offset + 7]!).toBeGreaterThan(0.6);
        expect(p[offset + 1]! - p[offset + 7]!).toBeLessThan(1.4);
        expect(p[offset + 3]! - p[offset]!).toBeGreaterThan(0);
      }
    }
  });

  it('reproduces seeds and frame times without accumulating frame-rate-dependent state', () => {
    const settings: WeatherSettings = { weather: 'rain', weatherSeed: 1122, rainIntensity: 0.35, windSpeed: 7 };
    const first = rainAt(4, settings);
    expect(first.active).toEqual(rainAt(4, settings).active);
    expect(first.active).not.toEqual(rainAt(4, { ...settings, weatherSeed: 1123 }).active);
    expect(first.active).not.toEqual(rainAt(4.1, settings).active);
    const incremental = new Float32Array(RAIN_PARTICLES * 12);
    for (const time of [0, 1.5, 3.2, 4]) writeRainQuads(incremental, time, camera, settings);
    expect(incremental.slice(0, first.count * 12)).toEqual(first.active);
    expect(first.positions.slice(first.count * 12).every(Number.isNaN)).toBe(true);
    const translated = rainAt(4, settings, [camera[0] + 100, camera[1] - 5, camera[2] + 50]);
    for (let i = 0; i < first.active.length; i++) expect(translated.active[i]! - first.active[i]!).toBeCloseTo([100, -5, 50][i % 3]!, 4);
  });

  it('provides triangle indices that cannot draw inactive rain particles', () => {
    const count = rainCount({ weather: 'rain', rainIntensity: 0.35 });
    const indices = quadIndices(count);
    expect(indices).toHaveLength(count * 6);
    expect(Math.min(...indices)).toBe(0);
    expect(Math.max(...indices)).toBe(count * 4 - 1);
    expect(indices.every((index) => Number.isInteger(index) && index >= 0 && index < count * 4)).toBe(true);
    expect(quadIndices(0)).toEqual([]);
  });

  it('limits lightning flashes to storms with quiet intervals and reproducible event timing', () => {
    const settings: WeatherSettings = { weather: 'storm', weatherSeed: 1122 };
    const frames = Array.from({ length: 6001 }, (_, i) => stormState(i / 100, settings));
    for (const weather of ['clear', 'rain'] as const) for (const time of [0, 3.07, 20, 100]) expect(stormState(time, { weather })).toEqual({ flash: 0, event: -1 });
    expect(stormState(2.99, settings)).toEqual({ flash: 0, event: -1 });
    expect(stormState(3.07, settings).flash).toBeCloseTo(1, 8);
    expect(stormState(3.23, settings).flash).toBeCloseTo(0.75, 8);
    expect(stormState(3.4, settings).flash).toBeCloseTo(0.5, 8);
    expect(stormState(4, settings).flash).toBe(0);
    expect(frames.some((frame) => frame.flash > 0.9 && frame.event > 0)).toBe(true);
    expect(frames.filter((frame) => frame.flash === 0).length).toBeGreaterThan(frames.length * 0.8);
    expect(frames).toEqual(Array.from({ length: 6001 }, (_, i) => stormState(i / 100, settings)));
    expect(frames).not.toEqual(Array.from({ length: 6001 }, (_, i) => stormState(i / 100, { ...settings, weatherSeed: 1123 })));
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]!;
      expect(frame.flash).toBeGreaterThanOrEqual(0);
      expect(frame.flash).toBeLessThanOrEqual(1);
      expect(Number.isInteger(frame.event)).toBe(true);
      if (frame.flash > 0) expect(frame.event).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(frame.event).toBeGreaterThanOrEqual(frames[i - 1]!.event);
    }
  });

  it('generates finite seeded bolt strips with connected adjacent segments', () => {
    const bolt = (seed: number, event: number, yaw = 0) => {
      const positions = new Float32Array(12 * 12).fill(Number.NaN);
      writeLightningQuad(positions, camera, yaw, seed, event);
      return positions;
    };
    for (const yaw of [0, Math.PI / 2, -Math.PI, Math.PI * 2]) {
      const positions = bolt(1122, 1, yaw);
      expect(positions.every(Number.isFinite)).toBe(true);
      for (let segment = 0; segment < 12; segment++) {
        const index = segment * 12;
        expect(positions[index + 1]!).toBeGreaterThan(positions[index + 7]!);
        if (segment < 11) {
          // Shared segment centre prevents disconnected lightning gaps.
          for (const axis of [0, 1, 2]) expect((positions[index + 6 + axis]! + positions[index + 9 + axis]!) / 2).toBeCloseTo((positions[index + 12 + axis]! + positions[index + 15 + axis]!) / 2, 4);
        }
      }
    }
    expect(bolt(1122, 1)).toEqual(bolt(1122, 1));
    expect(bolt(1122, 1)).not.toEqual(bolt(1123, 1));
    expect(bolt(1122, 1)).not.toEqual(bolt(1122, 2));
  });
});
