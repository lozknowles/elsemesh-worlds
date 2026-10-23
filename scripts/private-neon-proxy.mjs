import http from 'node:http';
import { isIP } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
export function createPrivateNeonProxy({port=5198,root=resolve('dist'),upstreamHost}={}) {
 if(typeof upstreamHost!=='string'||isIP(upstreamHost)!==4||upstreamHost.split('.')[0]!=='100'||Number(upstreamHost.split('.')[1])<64||Number(upstreamHost.split('.')[1])>127)throw new Error('Configure one approved Tailscale IPv4 upstream host');
 const origin=`http://localhost:${port}`, rootPath=resolve(root);
 const allowedHost=host=>host===`localhost:${port}`||host===`127.0.0.1:${port}`;
 const allowedOrigin=value=>value===origin||value===`http://127.0.0.1:${port}`;
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary','.png':'image/png','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2'};
 const server=http.createServer(async(req,res)=>{
  if(!allowedHost(req.headers.host)){res.writeHead(403).end();return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  if(req.headers.origin&&!allowedOrigin(req.headers.origin)){res.writeHead(403).end();return;}
  let path;try{path=decodeURIComponent(new URL(req.url,origin).pathname);}catch{res.writeHead(400).end();return;}
  if(path.startsWith('/__private-neon')||path.includes('\\')||path.includes('\0')){res.writeHead(404).end();return;}
  let target=resolve(rootPath,'.'+path);
  if(target!==rootPath&&!target.startsWith(rootPath+sep)){res.writeHead(403).end();return;}
  try{if((await stat(target)).isDirectory())target=resolve(target,'index.html');await stat(target);}catch{if(extname(path)){res.writeHead(404).end();return;}target=resolve(rootPath,'index.html');}
  try{const data=await readFile(target);res.writeHead(200,{'content-type':mime[extname(target)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; connect-src 'self' data: blob: ws://localhost:"+port+' ws://127.0.0.1:'+port+"; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404).end();}
 });
 const sockets=new WebSocketServer({noServer:true,maxPayload:65536});
 server.on('upgrade',(req,socket,head)=>{
  if(!allowedHost(req.headers.host)||!allowedOrigin(req.headers.origin)||req.url!=='/__private-neon'){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  sockets.handleUpgrade(req,socket,head,client=>{
   const upstream=new WebSocket(`ws://${upstreamHost}:5197/api`,{maxPayload:65536,handshakeTimeout:8000});
   const pending=[];client.on('message',(data,binary)=>{if(binary){client.close(1003);return;}if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary:false});else if(pending.length<4)pending.push(data);else client.close(1008);});
   upstream.on('open',()=>{for(const data of pending)upstream.send(data,{binary:false});pending.length=0;});
   upstream.on('message',(data,binary)=>{if(client.readyState===WebSocket.OPEN)client.send(data,{binary});});
   upstream.on('error',()=>client.close(1011,'Private server unavailable'));
   client.on('error',()=>upstream.close());client.on('close',()=>upstream.close());upstream.on('close',()=>client.close(1001,'Private server disconnected'));
  });
 });
 server.on('close',()=>{for(const client of sockets.clients)client.terminate();sockets.close();});
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PRIVATE_NEON_PROXY_PORT||5198);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid loopback port');
 const server=createPrivateNeonProxy({port,root:process.env.PRIVATE_NEON_DIST||resolve('dist'),upstreamHost:process.env.PRIVATE_NEON_UPSTREAM_HOST});server.listen(port,'127.0.0.1',()=>console.log(`Private neon client: http://localhost:${port}`));
}
