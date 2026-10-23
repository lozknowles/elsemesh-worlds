import { describe,it,expect } from 'vitest';
import { privateNeonMatchesWorld } from './private-neon-client';
import type { PrivateNeonSnapshot } from './private-neon-client';
import { defaultNeonSign } from './neon-sign';
const snapshot:PrivateNeonSnapshot={type:'snapshot',protocol:'elsemesh.neon-session/1',serverId:'server',worldId:'world',epoch:'epoch',revision:1,serverNow:1000,effectStart:1000,worldHour:22,role:'owner',signs:[{id:'a',config:defaultNeonSign('OPEN'),powered:true},{id:'b',config:defaultNeonSign('BAR'),powered:false}]};
describe('exact private scene binding',()=>{
 it('accepts only the same world and exact unique sign identity set, independent of order',()=>{
  expect(privateNeonMatchesWorld(snapshot,'world',['b','a'])).toBe(true);
  for(const [world,ids] of [['other',['a','b']],['world',['a']],['world',['a','b','c']],['world',['a','c']],['world',['a','a']]] as [string,string[]][])expect(privateNeonMatchesWorld(snapshot,world,ids)).toBe(false);
  expect(privateNeonMatchesWorld(null,'world',['a','b'])).toBe(false);
 });
 it('rejects duplicate remote identities and equal-count substitutions',()=>{
  expect(privateNeonMatchesWorld({...snapshot,signs:[snapshot.signs[0]!,snapshot.signs[0]!]},'world',['a','b'])).toBe(false);
  expect(privateNeonMatchesWorld(snapshot,'world',['a','renamed-b'])).toBe(false);
 });
});
