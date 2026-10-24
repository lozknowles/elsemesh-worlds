import type { WorldProject } from './world';
export const OBJECT_ACCESS_SCHEMA = 'elsemesh.object-access/1' as const;
export type ObjectAccessAction = 'computer.use' | 'neon.power' | 'neon.configure' | 'media.play';
export type ObjectAccessPolicy = { schema: typeof OBJECT_ACCESS_SCHEMA; rules: { objectId: string; actions: ObjectAccessAction[] }[] };
export function supportedObjectAccessActions(project: Pick<WorldProject,'objects'|'terminals'>, objectId: string): ObjectAccessAction[] {
 const object=project.objects.find(o=>o&&o.id===objectId);
 if(!object)return [];
 if(object.kind==='media-screen')return ['media.play'];
 const actions:ObjectAccessAction[]=object.kind==='neon-sign'?['neon.power','neon.configure']:[];
 if(object.kind==='computer'||project.terminals?.some(t=>t&&t.objectId===objectId))actions.push('computer.use');
 return actions;
}
export function effectiveObjectAccess(project: Pick<WorldProject,'objects'|'terminals'|'objectAccess'>): ObjectAccessPolicy {
 if(Object.prototype.hasOwnProperty.call(project,'objectAccess')) {
  const errors=validateObjectAccess(project);if(errors.length)throw Error(errors[0]);
  return structuredClone(project.objectAccess!);
 }
 return {schema:OBJECT_ACCESS_SCHEMA,rules:project.objects.flatMap(o=>{const actions=supportedObjectAccessActions(project,o.id);return actions.length?[{objectId:o.id,actions}]:[];})};
}
export function validateObjectAccess(project: Partial<WorldProject>): string[] {
 if(!Object.prototype.hasOwnProperty.call(project,'objectAccess'))return [];
 const value=project.objectAccess as unknown;
 const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(!record(value)||Object.keys(value).some(k=>!['schema','rules'].includes(k))||value.schema!==OBJECT_ACCESS_SCHEMA||!Array.isArray(value.rules)||value.rules.length>2000)return ['Invalid object access policy.'];
 const seen=new Set<string>();
 for(const rule of value.rules){
  if(!record(rule)||Object.keys(rule).some(k=>!['objectId','actions'].includes(k))||typeof rule.objectId!=='string'||!rule.objectId.trim()||rule.objectId.length>200||seen.has(rule.objectId)||!Array.isArray(rule.actions)||rule.actions.length>3||new Set(rule.actions).size!==rule.actions.length)return ['Invalid or duplicate object access rule.'];
  seen.add(rule.objectId);
  const objects=Array.isArray(project.objects)?project.objects:[],supported=supportedObjectAccessActions({objects,terminals:Array.isArray(project.terminals)?project.terminals:[]},rule.objectId);
  if(!objects.some(o=>o&&o.id===rule.objectId)||!supported.length||rule.actions.some(a=>!supported.includes(a as ObjectAccessAction)))return ['Object access rule references an unsupported object or action.'];
 }
 return [];
}
export function setObjectAccessActions(project:WorldProject,objectId:string,actions:ObjectAccessAction[]):WorldProject{
 const policy=effectiveObjectAccess(project);
 const next={...project,objectAccess:{schema:OBJECT_ACCESS_SCHEMA,rules:[...policy.rules.filter(r=>r.objectId!==objectId),...(actions.length?[{objectId,actions}]:[])]}};
 const errors=validateObjectAccess(next);if(errors.length)throw Error(errors[0]);return next;
}
