import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, verify, createPublicKey } from 'node:crypto';
import { chromium } from '@playwright/test';
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
test('browser nonextractable Ed25519 identity persists and matches Node canonical signatures',async()=>{
 const port=23978;const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});let browser;
 try{for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{/* Vite may still be starting. */}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({headless:true,...(process.env.PRIVATE_NEON_CHROMIUM?{executablePath:process.env.PRIVATE_NEON_CHROMIUM}:{})});const context=await browser.newContext();const page=await context.newPage();await page.goto(`http://127.0.0.1:${port}`);
 const payload={protocol:'elsemesh.neon-session/1',nonce:'bounded-test',nested:{z:2,a:1},array:[3,1]};
 const result=await page.evaluate(async payload=>{const m=await import('/src/domain/private-neon-client.ts');const identity=await m.privateNeonIdentity();let rejected=false;try{await crypto.subtle.exportKey('pkcs8',identity.privateKey);}catch{rejected=true;}const sig=await crypto.subtle.sign('Ed25519',identity.privateKey,new TextEncoder().encode(m.canonical(payload)));return{nodeId:identity.nodeId,publicKey:identity.publicKey,rejected,canonical:m.canonical(payload),signature:btoa(String.fromCharCode(...new Uint8Array(sig)))};},payload);
 assert.ok(result.rejected);assert.equal(result.canonical,canonical(payload));assert.equal(result.nodeId,'elsemesh-node:'+createHash('sha256').update(createPublicKey(result.publicKey).export({type:'spki',format:'der'})).digest('hex'));assert.ok(verify(null,Buffer.from(canonical(payload)),result.publicKey,Buffer.from(result.signature,'base64')));
 await page.reload();assert.equal(await page.evaluate(async()=> (await (await import('/src/domain/private-neon-client.ts')).privateNeonIdentity()).nodeId),result.nodeId);
 const isolated=await browser.newContext();const other=await isolated.newPage();await other.goto(`http://127.0.0.1:${port}`);assert.notEqual(await other.evaluate(async()=> (await (await import('/src/domain/private-neon-client.ts')).privateNeonIdentity()).nodeId),result.nodeId);await isolated.close();await context.close();
 }finally{await browser?.close();vite.kill('SIGTERM');}
});
