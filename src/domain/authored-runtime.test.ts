import {describe,it,expect} from 'vitest';
import {createWorld} from './world';
import {defaultNeonSign} from './neon-sign';
import type {PrivateNeonSnapshot} from './private-neon-client';
import {runtimePresentation,adoptRuntimeSettings} from './authored-runtime';
function fixture(){
 const project=createWorld('authored');
 project.objects=[{id:'sign',name:'Sign',kind:'neon-sign',position:[0,1,0],rotation:[0,0,0],scale:[1,1,1],visible:true,collision:'none',color:'#ffffff',neon:defaultNeonSign('AUTHORED')}];
 const snapshot:PrivateNeonSnapshot={type:'snapshot',protocol:'elsemesh.neon-session/1',serverId:'server',worldId:project.metadata.worldId,epoch:'epoch',revision:3,serverNow:100,effectStart:100,worldHour:22,role:'owner',signs:[{id:'sign',config:defaultNeonSign('RUNTIME'),powered:false}]};
 return {project,snapshot};
}
describe('authored/runtime boundary',()=>{
 it('derives runtime presentation without changing serialized authored bytes or references',()=>{
  const {project,snapshot}=fixture(),before=JSON.stringify(project),object=project.objects[0];
  const rendered=runtimePresentation(project,snapshot);
  expect(rendered.environment.timeOfDay).toBe(22);
  expect(rendered.objects[0]?.neon).toEqual(snapshot.signs[0]?.config);
  expect(JSON.stringify(project)).toBe(before);expect(project.objects[0]).toBe(object);
  rendered.objects[0]!.neon!.color='#123456';
  expect(JSON.stringify(project)).toBe(before);expect(snapshot.signs[0]?.config.color).not.toBe('#123456');
 });
 it('ignores foreign worlds and requires owner plus exactly checked revision to adopt',()=>{
  const {project,snapshot}=fixture(),expected={serverId:'server',epoch:'epoch',revision:3};
  expect(runtimePresentation(project,{...snapshot,worldId:'foreign'})).toBe(project);
  for(const changed of [{...snapshot,revision:4},{...snapshot,epoch:'new'},{...snapshot,role:'member' as const}])expect(()=>adoptRuntimeSettings(project,changed,expected)).toThrow();
  const adopted=adoptRuntimeSettings(project,snapshot,expected);
  expect(adopted).not.toBe(project);expect(adopted.metadata.worldId).toBe(project.metadata.worldId);
  expect(adopted.objects[0]?.neon?.powered).toBe(snapshot.signs[0]?.config.powered);
  expect(snapshot.signs[0]?.powered).toBe(false);
 });
});
