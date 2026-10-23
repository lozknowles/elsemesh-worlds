/** Bounded installed local visual traffic. No scripts or network vehicle authority. */
export type RoadTraffic = {
  schema: 'port-traffic/1'; seed: number; count: number; roadY: number;
  graph: { nodes: {id:string;x:number;z:number}[]; edges: {id:string;from:string;to:string;roadClass:string}[]; classes: Record<string,{width:number;speed:number}> };
  vehicleAssetIds: {car:string;van:string;utility:string};
};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
const bounded=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(v);
export function validateRoadTraffic(value:unknown,assets:readonly {id:string}[]=[]):string[]{
 if(value===undefined)return [];
 const fail=['Invalid port-traffic/1 configuration.'];
 if(!record(value)||!keys(value,['schema','seed','count','roadY','graph','vehicleAssetIds'])||value.schema!=='port-traffic/1'||!bounded(value.seed,0,0xffffffff)||!Number.isInteger(value.seed)||!bounded(value.count,0,12)||!Number.isInteger(value.count)||!bounded(value.roadY,-2000,2000))return fail;
 const graph=value.graph,refs=value.vehicleAssetIds;
 if(!record(graph)||!keys(graph,['nodes','edges','classes'])||!Array.isArray(graph.nodes)||graph.nodes.length<3||graph.nodes.length>64||!Array.isArray(graph.edges)||graph.edges.length<3||graph.edges.length>128||!record(graph.classes)||Object.keys(graph.classes).length<1||Object.keys(graph.classes).length>8)return fail;
 for(const [name,c]of Object.entries(graph.classes))if(!id(name)||!record(c)||!keys(c,['width','speed'])||!bounded(c.width,4,20)||!bounded(c.speed,1,15))return fail;
 const nodes=new Map<string,{x:number;z:number}>(),degree=new Map<string,number>(),links=new Map<string,string[]>(),edges=new Set<string>();
 for(const n of graph.nodes){if(!record(n)||!keys(n,['id','x','z'])||!id(n.id)||nodes.has(n.id)||!bounded(n.x,-2000,2000)||!bounded(n.z,-2000,2000))return fail;nodes.set(n.id,{x:n.x as number,z:n.z as number});degree.set(n.id,0);links.set(n.id,[]);}
 const pairs=new Set<string>();
 for(const e of graph.edges){if(!record(e)||!keys(e,['id','from','to','roadClass'])||!id(e.id)||edges.has(e.id)||!id(e.from)||!id(e.to)||e.from===e.to||!nodes.has(e.from)||!nodes.has(e.to)||!id(e.roadClass)||!Object.hasOwn(graph.classes,e.roadClass))return fail;
 const a=nodes.get(e.from)!,b=nodes.get(e.to)!,pair=[e.from,e.to].sort().join('|');if(pairs.has(pair)||Math.hypot(a.x-b.x,a.z-b.z)<30)return fail;pairs.add(pair);edges.add(e.id);degree.set(e.from,degree.get(e.from)!+1);degree.set(e.to,degree.get(e.to)!+1);links.get(e.from)!.push(e.to);links.get(e.to)!.push(e.from);}
 if([...degree.values()].some(n=>n<2))return ['Traffic graph must have no dead ends.'];
 const seen=new Set<string>(),queue=[...nodes.keys()].slice(0,1);while(queue.length){const n=queue.pop()!;if(seen.has(n))continue;seen.add(n);queue.push(...links.get(n)!);}if(seen.size!==nodes.size)return ['Traffic graph must be connected.'];
 if(!record(refs)||!keys(refs,['car','van','utility'])||!['car','van','utility'].every(k=>typeof refs[k]==='string'&&assets.some(a=>a?.id===refs[k])))return ['Traffic vehicle assets must reference admitted world assets.'];
 return [];
}
