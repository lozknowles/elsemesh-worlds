import * as THREE from 'three';

/** Real binary glTF: two material slots, two primitives, a repeated material on
 * another node, authored off-centre/rotated/scaled transforms. */
export function materialFixtureGlb(): Buffer {
  const cube=new THREE.BoxGeometry(2,2,2);
  const shifted=cube.clone().translate(3,0,0);
  const chunks: Buffer[]=[];
  const views: {buffer:number;byteOffset:number;byteLength:number}[]=[];
  const accessors: object[]=[];
  let offset=0;
  const add=(array:ArrayBufferView,type:string,componentType:number,itemSize:number)=>{
    const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
    const view=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});
    const padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);chunks.push(padded);offset+=padded.length;
    const index=accessors.length;
    const values=Array.from(array as unknown as ArrayLike<number>);
    const extrema=type==='VEC3'?{min:Array.from({length:itemSize},(_,c)=>Math.min(...values.filter((_,i)=>i%itemSize===c))),max:Array.from({length:itemSize},(_,c)=>Math.max(...values.filter((_,i)=>i%itemSize===c)))}:{};
    accessors.push({bufferView:view,componentType,count:bytes.length/(componentType===5126?4:2)/itemSize,type,...extrema});return index;
  };
  const positions=add(cube.attributes.position!.array,'VEC3',5126,3),normals=add(cube.attributes.normal!.array,'VEC3',5126,3),uv=add(cube.attributes.uv!.array,'VEC2',5126,2),indices=add(cube.index!.array,'SCALAR',5123,1),second=add(shifted.attributes.position!.array,'VEC3',5126,3);
  const original={attributes:{POSITION:positions,NORMAL:normals,TEXCOORD_0:uv},indices,material:0};
  const json={asset:{version:'2.0',generator:'ElseMesh Worlds native material acceptance fixture'},buffers:[{byteLength:offset}],bufferViews:views,accessors,materials:[{name:'Shared red',pbrMetallicRoughness:{baseColorFactor:[1,.05,.02,1],roughnessFactor:.8,metallicFactor:0}},{name:'Blue metal',pbrMetallicRoughness:{baseColorFactor:[.02,.05,1,1],roughnessFactor:.25,metallicFactor:.6}}],meshes:[{name:'Two material primitives',primitives:[original,{attributes:{POSITION:second,NORMAL:normals,TEXCOORD_0:uv},indices,material:1}]},{name:'Repeated source slot zero',primitives:[original]}],nodes:[{mesh:0,translation:[5,2,0],rotation:[0,Math.sin(Math.PI/8),0,Math.cos(Math.PI/8)],scale:[1,1.2,1]},{mesh:1,translation:[-4,2,0]}],scenes:[{nodes:[0,1]}],scene:0};
  const text=Buffer.from(JSON.stringify(json));const jsonBytes=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(jsonBytes);const binary=Buffer.concat(chunks);
  const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonBytes.length+8+binary.length,8);
  const jsonHeader=Buffer.alloc(8);jsonHeader.writeUInt32LE(jsonBytes.length,0);jsonHeader.writeUInt32LE(0x4e4f534a,4);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  cube.dispose();shifted.dispose();return Buffer.concat([header,jsonHeader,jsonBytes,binHeader,binary]);
}
