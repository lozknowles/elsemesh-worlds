import { BufferGeometry, BufferAttribute, Group, Mesh } from '../vendor/elsemesh/engine/index.js';
import { Material } from '../vendor/elsemesh/engine/render/Material.js';
import { createTreeGeometry } from '../domain/trees.ts';

export function buildNativeTree(object) {
  const species=object.treeSpecies??'broadleaf', seed=object.treeSeed??7319;
  const parts=createTreeGeometry(species,seed), group=new Group();
  const factor=species==='palm'?1.4:species==='pine'?.65:1;
  for(const key of ['bark','foliage']) {
    const data=parts[key], geometry=new BufferGeometry();
    geometry.setAttribute('position',new BufferAttribute(new Float32Array(data.positions),3));
    geometry.setIndex(data.indices);geometry.computeVertexNormals();
    const material=new Material({name:`builder-tree-${key}`,color:key==='bark'?'#594633':object.color,roughness:key==='bark'?.94:.78,side:'double',
      uniforms:{treePhase:['f32',(seed>>>0)*.013],treeFactor:['f32',factor]},
      vertex:/* wgsl */`
  let bend = pow(max(0.0,v.position.y/7.0),2.0);
  let gust = sin(frame.time*0.85+mat.treePhase)*0.11+sin(frame.time*1.67+mat.treePhase)*0.035;
  let flutter = sin(frame.time*2.3+v.position.x*2.1+v.position.z*1.7+mat.treePhase)*0.018*bend;
  v.position += vec3f((gust*bend+flutter)*mat.treeFactor,0.0,(cos(frame.time*0.69+mat.treePhase)*0.045*bend+flutter*0.5)*mat.treeFactor);
`});
    const item=new Mesh(geometry,material);item.castShadow=true;item.receiveShadow=true;group.add(item);
  }
  return group;
}
