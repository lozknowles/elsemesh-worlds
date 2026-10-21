// Builder weather shared by both renderers. Analytic seeded motion is independent
// of frame rate; particle state is never saved in the world document.
export const RAIN_PARTICLES = 900;
export type WeatherSettings = { weather?: 'clear' | 'rain' | 'storm'; rainIntensity?: number; windSpeed?: number; weatherSeed?: number };
export const weatherHash = (index: number, seed = 7341) => {
  let value = (Math.imul(index + 1, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};
const wrap = (value: number, range: number) => ((value % range) + range) % range;
export function rainCount(settings: WeatherSettings) {
  return settings.weather === 'clear' || !settings.weather ? 0 : Math.floor(RAIN_PARTICLES * (settings.rainIntensity ?? .7));
}
export function writeRainQuads(positions: Float32Array, time: number, camera: readonly number[], settings: WeatherSettings) {
  const seed = settings.weatherSeed ?? 7341;
  const wind = settings.windSpeed ?? 6;
  const active = rainCount(settings);
  const radius = 34;
  for (let i = 0; i < active; i++) {
    const speed = 17 + weatherHash(i * 4 + 3, seed) * 13;
    const x = wrap(weatherHash(i * 4, seed) * radius * 2 + time * wind * .65, radius * 2) - radius + camera[0]!;
    const y = wrap(weatherHash(i * 4 + 1, seed) * 38 - time * speed, 38) - 13 + camera[1]!;
    const z = wrap(weatherHash(i * 4 + 2, seed) * radius * 2 + time * wind * .25, radius * 2) - radius + camera[2]!;
    const length = .7 + weatherHash(i + 991, seed) * .65;
    const dx = wind * length / speed * .65;
    const dz = wind * length / speed * .25;
    const w = .018;
    positions.set([x-w,y,z,x+w,y,z,x+dx-w,y-length,z+dz,x+dx+w,y-length,z+dz], i*12);
  }
  return active;
}
export function stormState(time: number, settings: WeatherSettings) {
  if (settings.weather !== 'storm') return { flash: 0, event: -1 };
  const period = 8 + weatherHash(938, settings.weatherSeed ?? 7341) * 5;
  const elapsed = time - 3;
  if (elapsed < 0) return { flash: 0, event: -1 };
  const event = Math.floor(elapsed / period);
  const phase = elapsed % period;
  const pulse = (at: number, width: number) => Math.max(0, 1 - Math.abs(phase - at) / width);
  return { event, flash: Math.max(pulse(.07,.07), pulse(.23,.065)*.75, pulse(.4,.09)*.5) };
}
export function writeLightningQuad(positions: Float32Array, camera: readonly number[], yaw: number, seed: number, event: number) {
  // One bounded forkless bolt, facing the viewer and placed in the middle distance.
  const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw), rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
  const x = camera[0]! + forwardX * 110 + rightX * 18;
  const z = camera[2]! + forwardZ * 110 + rightZ * 18;
  let previous = 0;
  for (let i=0;i<12;i++) {
    const next = (weatherHash(i + Math.max(event,0)*17,seed)-.5)*9;
    const y0 = camera[1]! + 62 - i*5.5, y1 = y0 - 5.5;
    const width = .12 + (12-i)*.015;
    positions.set([x+rightX*(previous-width),y0,z+rightZ*(previous-width),x+rightX*(previous+width),y0,z+rightZ*(previous+width),x+rightX*(next-width),y1,z+rightZ*(next-width),x+rightX*(next+width),y1,z+rightZ*(next+width)],i*12);
    previous=next;
  }
}
export function quadIndices(count: number) {
  const indices: number[]=[];
  for(let i=0;i<count;i++) {const n=i*4;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  return indices;
}
