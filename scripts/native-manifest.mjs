import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root='src/vendor/elsemesh';const files=[];
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else {const data=await fs.readFile(p);files.push({path:p.replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(data).digest('hex'),bytes:data.length});}}}
await walk(root);await walk('public/clouds');await fs.writeFile('src/vendor/elsemesh-provenance.json',JSON.stringify({source:'rebroad/ElseMesh',commit:'95719848d5ffa4428b57c75c272483e1c2113a72',license:'MIT',note:'Pristine copies. Builder adaptation is src/native and src/ui/NativePreview.tsx. No game checkout is edited.',files},null,2));
