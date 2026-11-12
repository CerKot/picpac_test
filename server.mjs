import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ImageJobService,createAiHandler} from './api/service.mjs';
import {Accounts} from './api/accounts.mjs';
const aiService=new ImageJobService(process.env.PICPAC_JOB_DIRECTORY?{directory:path.resolve(process.env.PICPAC_JOB_DIRECTORY)}:{});
const handleAi=createAiHandler(aiService,new Accounts(aiService.directory));
setInterval(()=>{void aiService.ready.then(()=>aiService.sweepExpired()).catch(()=>console.error('AI result cleanup failed'));},60000).unref();
const root=path.resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
  try{
    if(await handleAi(req,res))return;
    if(req.url==='/ai-config.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({apiBase:'/api/ai/',version:1,localPortraitProcessing:true}));return;}
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PICPAC_PORT||4173),'127.0.0.1',()=>console.log('PicPac API ready'));
