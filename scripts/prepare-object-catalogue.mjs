import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inspectGlbJson } from '../src/domain/asset-glb.ts';
const PIN = '7be9b573bc74f32ed766b44b3f46550d02ca83b5';
const root = process.cwd();
const source = path.resolve(process.argv[2] || '../tge-assets');
const actual = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
if (actual !== PIN) throw new Error('Source commit does not match the reviewed catalogue pin.');
if (execFileSync('git', ['-C', source, 'status', '--porcelain', '--untracked-files=normal'], {encoding:'utf8'}).trim()) throw new Error('Source repository must be clean before catalogue preparation.');
const catalog = JSON.parse(await fs.readFile(path.join(source,'catalog.json'),'utf8'));
const output = path.join(root,'public/assets/catalogue');
const version = PIN.slice(0,8);
const assets = [], excluded = [], seen = new Set(), packs = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async relative => {
 if (typeof relative !== 'string' || !/^packs\/[a-z0-9-]+\/(?:thumbs\/)?[a-zA-Z0-9_.-]+\.(?:glb|webp)$/.test(relative)) throw new Error('Unsafe or unsupported source path');
 const target = path.resolve(source, relative), real = await fs.realpath(target);
 if (!real.startsWith(source + path.sep)) throw new Error('Source escaped its repository');
 return fs.readFile(real);
};
function classify(pack, name) {
 const words = name.toLowerCase().replace(/[^a-z0-9]+/g,' '), tags = [...new Set(words.split(' ').filter(Boolean))];
 const categories = new Set([pack.name]);
 if (/furniture/.test(pack.id)) categories.add('Furniture');
 if (/car-kit/.test(pack.id) || /\b(car|truck|vehicle|bus|taxi|train)\b/.test(words)) categories.add('Vehicles');
 if (/nature/.test(pack.id) || /\b(tree|plant|flower|grass|bush)\b/.test(words)) categories.add('Nature and Plants');
 if (/city-kit-roads/.test(pack.id)) categories.add('Roads and Streets');
 if (/\b(chair|table|stool|bench)\b/.test(words)) categories.add('Tables and Chairs');
 if (/\b(door|window)\b/.test(words)) categories.add('Doors and Windows');
 if (/\b(lamp|light|chandelier)\b/.test(words)) categories.add('Lighting');
 if (/food-kit/.test(pack.id)) categories.add('Food and Drink');
 if (/\b(bed|bunk|nightstand|wardrobe)\b/.test(words)) categories.add('Bedroom');
 if (/\b(kitchen|fridge|refrigerator|oven|sink|stove|cooker)\b/.test(words)) categories.add('Kitchen');
 if (/\b(bath|bathtub|toilet|shower|bathroom)\b/.test(words)) categories.add('Bathroom');
 if (/\b(sofa|couch|armchair|television|bookcase)\b/.test(words)) categories.add('Living Room');
 if (/city-kit-commercial/.test(pack.id)) categories.add('Shops and Commercial');
 if (/\b(building|wall|roof|floor|stairs|staircase|column)\b/.test(words)) categories.add('Building Components');
 if (/furniture-kit|food-kit/.test(pack.id) || /\b(door|window|lamp|chandelier)\b/.test(words)) categories.add('Interiors');
 return {categories:[...categories],tags};
}
await fs.mkdir(output,{recursive:true});
for (const pack of catalog.packs) {
 if (pack.author !== 'Kenney' || pack.license !== 'CC0-1.0' || !/^https:\/\/kenney\.nl\/assets\/[a-z0-9-]+$/.test(pack.url)) throw new Error('Unreviewed source pack licence or origin');
 let admitted = 0;
 for (const model of pack.models) {
  const id = 'kenney:' + model.id;
  if (seen.has(id)) throw new Error('Duplicate catalogue ID'); seen.add(id);
  try {
   const bytes = await read(model.file), thumbnail = await read(model.thumb);
   if (bytes.length !== model.size) throw new Error('Source metadata size differs from file');
   if (thumbnail.toString('ascii',0,4) !== 'RIFF' || thumbnail.toString('ascii',8,12) !== 'WEBP') throw new Error('Thumbnail is not a WebP image');
   const result = inspectGlbJson(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
   const classification = classify(pack,model.name);
   const modelPath = `assets/catalogue/${version}/${model.file}`, thumbnailPath = `assets/catalogue/${version}/${model.thumb}`;
   for (const [relative,data] of [[modelPath,bytes],[thumbnailPath,thumbnail]]) { const target=path.join(root,'public',relative); await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,data); }
   assets.push({id,name:model.name,description:`${model.name} from Kenney ${pack.name}. Static visual asset; no movement or interaction is automatically attached.`,sourcePack:{id:pack.id,name:pack.name,url:pack.url},...classification,model:modelPath,thumbnail:thumbnailPath,sha256:hash(bytes),thumbnailSha256:hash(thumbnail),bytes:bytes.length,format:'glb',bounds:result.bounds,dimensions:result.bounds.max.map((v,i)=>v-result.bounds.min[i]),triangleCount:result.triangleCount,vertexCount:result.vertexCount,license:{id:'CC0-1.0',url:'https://creativecommons.org/publicdomain/zero/1.0/',attribution:`Kenney / ${pack.name}; converted models and thumbnails by Hidencod, CC0.`},defaultScale:[1,1,1],components:['Transform','Renderable']});
   admitted++;
  } catch(error) { excluded.push({id,pack:pack.id,file:model.file,reason:error.message}); }
 }
 packs.push({id:pack.id,name:pack.name,url:pack.url,claimed:pack.models.length,admitted,excluded:pack.models.length-admitted,license:'CC0-1.0',licenceEvidence:['https://kenney.nl/support',pack.url,'source/LICENSE']});
}
const manifest = {schema:'elsemesh.object-catalogue/1',source:{repository:'https://github.com/Hidencod/tge-assets',commit:PIN,license:'CC0-1.0'},assets};
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest)+'\n');
await fs.writeFile(path.join(output,'inventory.json'),JSON.stringify({schema:'elsemesh.catalogue-inventory/1',commit:PIN,packs,models:seen.size,admitted:assets.length,excluded,sourceModelBytes:catalog.packs.reduce((s,p)=>s+p.models.reduce((n,m)=>n+m.size,0),0),admittedModelBytes:assets.reduce((s,a)=>s+a.bytes,0),interiors:assets.filter(a=>a.categories.includes('Interiors')).length,imageOnlyPacksExcluded:(catalog.imagePacks||[]).map(p=>p.id),thumbnailIdentity:'Source catalogue pairing and file hashes verified; semantic correspondence requires representative visual inspection.'},null,2)+'\n');
await fs.writeFile(path.join(output,'LICENSE'),await fs.readFile(path.join(source,'LICENSE')));
console.log(JSON.stringify({models:seen.size,admitted:assets.length,excluded:excluded.length,interiors:assets.filter(a=>a.categories.includes('Interiors')).length,packs: packs.length,reasons:[...new Set(excluded.map(x=>x.reason))]}));
