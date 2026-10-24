import { Mesh, Group } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { buildFeatureGeometry } from './vendor/world-engine-contract.js';

// Builder-authored flowing surfaces. This intentionally does not instantiate the
// game's sea/FFT solver: paths describe direction and authored surface elevation.
export function buildNativeFeatures(project, convertGeometry) {
  const group=new Group();
  for(const feature of project.features??[]) {
    if(feature.visible===false) continue;
    for(const part of buildFeatureGeometry(feature,project)) {
      let material;
      if(part.semantic==='water') {
        const falling=feature.kind==='waterfall';
        const lake=feature.kind==='lake';
        material=new Material({name:`builder-${feature.kind}`,color:part.color,roughness:.22,metalness:.1,transparent:true,opacity:.88,side:'double',receiveShadows:true,
          vertex: falling ? 'v.position.x += sin(v.position.y*2.8+frame.time*6.0)*0.025;' : 'v.position.y += sin(v.position.x*0.55+v.position.z*0.43+frame.time*1.7)*0.025;',
          surface: /* wgsl */`
  let flow = in.uv.y*${falling?'24.0':lake?'2.1':'13.0'} - frame.time*${falling?'3.6':lake?'0.32':'1.4'};
  let wave = sin(flow*6.28318 + sin(in.uv.x*15.0 + frame.time)*0.9);
  let detail = sin(in.P.x*7.0-in.P.z*5.0+frame.time*2.0)*0.5+0.5;
  let streak = smoothstep(${falling?'0.1':'0.7'},0.98,wave);
  s.albedo = mix(mat.color,vec3f(0.55,0.76,0.83),streak*${falling?'0.68':'0.3'});
  s.normal = normalize(in.N + vec3f(wave*0.12,0.0,detail*0.12));
  s.roughness = ${falling?'0.35':'0.2'};
  s.emissive = vec3f(0.01,0.025,0.03)*streak;
  s.alpha = ${falling?'0.8 + detail*0.17':'0.9'};
`});
      } else if(part.semantic==='foam') {
        material=new Material({name:'builder-water-foam',color:part.color,roughness:.9,transparent:true,opacity:.88,side:'double',receiveShadows:false,
          vertex:'v.position.y += sin(v.position.x*3.7+v.position.z*4.1-frame.time*4.0)*0.045;',
          surface:/* wgsl */`
  let bubbles = sin(in.uv.x*21.0+frame.time*2.2)*sin(in.uv.y*17.0-frame.time*3.0);
  s.albedo = mix(vec3f(0.35,0.62,0.69),vec3f(0.85,0.94,0.95),smoothstep(-0.2,0.6,bubbles));
  s.alpha = 0.55+0.35*smoothstep(-0.5,0.4,bubbles);
  s.emissive = vec3f(0.018);
`});
      } else material=new Material({name:`builder-${part.semantic}`,color:part.color,roughness:.88,side:'double'});
      const geometry=convertGeometry(part.geometry);part.geometry.dispose();
      const item=new Mesh(geometry,material);item.castShadow=part.semantic!=='water'&&part.semantic!=='foam';item.receiveShadow=true;
      if(material.transparent) item.layers.set(2);
      group.add(item);
    }
  }
  return group;
}
