// Builder-owned effect. Upstream AirHaze has stationary exponential layers;
// this dry-world post adapter adds moving world-space density before native ACES.
// The layer starts at the authored terrain's lowest valid elevation; height is
// vertical reach above that valley floor, rather than an absolute world datum.
import { ShaderModule, UniformBlock } from '../vendor/elsemesh/engine/gpu/Shader.js';
import { commonModule } from '../vendor/elsemesh/engine/render/wgsl/common.js';

export function terrainMistBase(terrain) {
  let minimum = Infinity;
  for (const height of terrain?.heights ?? []) if (Number.isFinite(height)) minimum = Math.min(minimum, height);
  return Number.isFinite(minimum) ? minimum : 0;
}

export function createDryWorldMedium(depth) {
  const uniforms = new UniformBlock('BuilderMist', {
    density: ['f32', 0.004], speed: ['f32', 2], height: ['f32', 9], base: ['f32', 0],
    storm: ['f32', 0], lightning: ['f32', 0],
  }, { label: 'builderMist' });
  return {
    uniforms,
    module: new ShaderModule({ name: 'builder-dry-medium', code: 'fn underwaterMedium(uv: vec2f) -> f32 { return 0.0; }' }),
    compositeModule: new ShaderModule({
      name: 'builder-drifting-mist', deps: [commonModule], uniforms, uniformName: 'builderMist',
      bindings: { builderDepth: { texture: depth } },
      code: /* wgsl */`
fn bmHash(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1,311.7,74.7))) * 43758.5453); }
fn bmNoise(p: vec3f) -> f32 {
  let i = floor(p); let q = fract(p); let u = q*q*(3.0-2.0*q);
  return mix(mix(mix(bmHash(i),bmHash(i+vec3f(1,0,0)),u.x),mix(bmHash(i+vec3f(0,1,0)),bmHash(i+vec3f(1,1,0)),u.x),u.y),
    mix(mix(bmHash(i+vec3f(0,0,1)),bmHash(i+vec3f(1,0,1)),u.x),mix(bmHash(i+vec3f(0,1,1)),bmHash(i+vec3f(1,1,1)),u.x),u.y),u.z);
}
fn underwaterComposite(uv: vec2f, pixel: vec2f) -> vec4f {
  let source = postSceneSample(uv) * mix(1.0,0.34,builderMist.storm) + vec3f(0.6,0.7,0.9)*builderMist.lightning;
  if (builderMist.density <= 0.0) { return vec4f(source,1.0); }
  let size = vec2i(textureDimensions(builderDepth));
  let d = textureLoad(builderDepth,clamp(vec2i(uv*vec2f(size)),vec2i(0),size-1),0);
  let clip = vec2f(uv.x*2.0-1.0,1.0-uv.y*2.0);
  let wp = frame.invViewProj * vec4f(clip,max(d,0.00001),1.0);
  let point = wp.xyz / wp.w;
  let ray = normalize(point-frame.cameraPos);
  let distance = select(min(length(point-frame.cameraPos),700.0),700.0,d <= 0.000001);
  let step = distance/24.0;
  var optical = 0.0;
  for (var i=0; i<24; i++) {
    let p = frame.cameraPos + ray * (f32(i)+0.5)*step;
    let moving = p * vec3f(0.045,0.09,0.045) - vec3f(frame.time*builderMist.speed*0.045,0,frame.time*builderMist.speed*0.018);
    let noise = bmNoise(moving)*0.72 + bmNoise(moving*2.13)*0.28;
    let bank = smoothstep(0.28,0.7,noise);
    let layer = exp(-max(p.y-builderMist.base,0.0)/max(builderMist.height,0.5));
    optical += bank * layer * builderMist.density * step;
  }
  let transmittance = exp(-optical);
  let light = frame.skyIrradiance*0.65 + frame.sunColor*0.025 + vec3f(0.003);
  return vec4f(source*transmittance + light*(1.0-transmittance),1.0);
}`,
    }),
  };
}
