import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrivateNeonProxy } from './private-neon-proxy.mjs';
function request(port,path='/',headers={}) {return new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port,path,headers:{host:`localhost:${port}`,...headers}},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));});req.on('error',reject);});}
test('proxy rejects missing or arbitrary upstream targets',()=>{for(const upstreamHost of [undefined,'127.0.0.1','example.com','192.168.1.1','100.63.255.255','100.128.0.1','100.64.0.1:9999','100.64.0.1/api','user@100.64.0.1','100.64.0.1?url=evil'])assert.throws(()=>createPrivateNeonProxy({upstreamHost}),/approved Tailscale/);});
test('loopback proxy restricts host, origin, traversal and websocket path',async()=>{
 const root=await mkdtemp(join(tmpdir(),'neon-proxy-'));await writeFile(join(root,'index.html'),'<html>private test</html>');
 const port=22500+Math.floor(Math.random()*1000);const server=createPrivateNeonProxy({port,root,upstreamHost:'100.64.0.1'});await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 try{assert.equal((await request(port)).status,200);assert.equal((await request(port,'/',{host:'evil.example'})).status,403);assert.equal((await request(port,'/',{origin:'https://evil.example'})).status,403);assert.equal((await request(port,'/%2e%2e%2fsecret')).status,403);assert.equal((await request(port,'/__private-neon?url=ws://evil')).status,404);assert.equal((await request(port,'/missing.js')).status,404);
 const denied=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/__private-neon',headers:{host:`localhost:${port}`,origin:'https://evil.example',connection:'Upgrade',upgrade:'websocket','sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ==','sec-websocket-version':'13'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(denied,403);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
