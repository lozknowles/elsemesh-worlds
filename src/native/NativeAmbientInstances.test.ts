import {describe,expect,it} from 'vitest';
import * as T from 'three';
// @ts-expect-error Engine JavaScript module has no declaration file.
import * as N from '../vendor/elsemesh/engine/index.js';
// @ts-expect-error Native preview JavaScript module has no declaration file.
import {createNativeAmbientInstances} from './NativeAmbientInstances';
import {createWorld} from '../domain/world';

describe('native island ambient instance adapter',()=>{
 it('updates only moving indices and leaves saved transforms untouched',()=>{
  const p=createWorld('Wildlife preview');p.terrain.heights.fill(0);
  p.objects=[
   {id:'bird',kind:'glb',name:'Bird',assetId:'bird-asset',position:[0,5,0],rotation:[0,0,0],scale:[1,1,1],color:'#ffffff',visible:true,collision:'none',ambientBehaviour:{schema:'elsemesh.ambient-behaviour/1',kind:'bird-flight',speed:3,radius:8,seed:7}},
   {id:'hut',kind:'glb',name:'Hut',assetId:'hut-asset',position:[8,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#ffffff',visible:true,collision:'solid'},
  ];
  const matrices=new Map([['bird',new T.Matrix4().makeTranslation(0,5,0)],['hut',new T.Matrix4().makeTranslation(8,0,0)]]);
  const root=new N.Group(),mesh=new N.InstancedMesh(new N.BoxGeometry(),null,2);mesh.userData.editorObjectIds=['bird','hut'];mesh.setMatrixAt(0,new N.Matrix4().makeTranslation(0,5,0));mesh.setMatrixAt(1,new N.Matrix4().makeTranslation(8,0,0));root.add(mesh);
  const controller=createNativeAmbientInstances(p,root,matrices);expect(controller.objectCount).toBe(1);controller.update(3);
  const result=new N.Matrix4();mesh.getMatrixAt(0,result);expect(result.elements.slice(12,15)).not.toEqual([0,5,0]);mesh.getMatrixAt(1,result);expect(result.elements.slice(12,15)).toEqual([8,0,0]);expect(p.objects[0]?.position).toEqual([0,5,0]);
  mesh.geometry.dispose();
 });
});
