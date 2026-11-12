import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {albumProgress,projectReadiness,documentPolicy,selectedDocumentPhoto} from '../dist/project-rules.js';
import {blendForeground} from '../dist/portrait.js';
import {validateGeneration,configured,runModel} from '../api/model-gateway.mjs';
import {ImageJobService,verifySession} from '../api/service.mjs';

test('Three distinct uploaded originals are required; demos, duplicate hashes and generated images do not count',()=>{
 const p={type:'books',photos:[{id:'a',contentHash:'one'},{id:'b',contentHash:'one'},{id:'c',demo:true},{id:'d',generated:true}]};
 assert.equal(albumProgress(p).count,1);assert.equal(projectReadiness(p).ready,false);
 p.photos.push({id:'e',contentHash:'two'},{id:'f',contentHash:'three'});assert.equal(projectReadiness(p).ready,true);
 p.photos.pop();assert.equal(projectReadiness(p).ready,false);
 assert.equal(projectReadiness({type:'prints',photos:[{id:'a'}]}).ready,true);
});
test('Document output preserves original under the current policy; US preset disables preparation',()=>{
 const p={photos:[{id:'original'}],docPrepared:{id:'prepared'},docUsePrepared:false};
 assert.equal(selectedDocumentPhoto(p).id,'original');p.docUsePrepared=true;assert.equal(selectedDocumentPhoto(p).id,'original');
 assert.equal(documentPolicy('us').canPrepare,false);assert.equal(documentPolicy('by').mode,'review-required');
});
test('Matting preserves full foreground pixels, composites white, and bounds exposure',()=>{
 const source=new Uint8ClampedArray([25,50,75,255,12,34,56,255]);
 assert.deepEqual([...blendForeground(source,[1,0],1)],[25,50,75,255,255,255,255,255]);
 assert.deepEqual([...source],[25,50,75,255,12,34,56,255]);
});
test('Generation validation blocks document operations, missing consent and forged file type',()=>{
 assert.throws(()=>validateGeneration({operation:'document.prepare',prompt:'test',consent:true}),/документов/);
 assert.throws(()=>validateGeneration({operation:'art.generate',prompt:'test'}),/согласие/);
 assert.throws(()=>validateGeneration({operation:'photo.edit',prompt:'test',consent:true,references:[null]}),/изображение/);
 assert.throws(()=>validateGeneration({operation:'photo.edit',prompt:'test',consent:true,references:[{mimeType:'image/jpeg',data:Buffer.from('not an image').toString('base64')}]}),/формату/);
 assert.equal(configured({}),false);
});
test('Signed sessions require issuer, audience, expiry and tamper-proof signature',()=>{
 const secret='test-key-not-production-'.repeat(3),now=Date.now();
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const p=Buffer.from(JSON.stringify({sub:'test-user',iss:'picpac',aud:'picpac-ai',exp:Math.floor(now/1000)+600})).toString('base64url');
 const s=createHmac('sha256',secret).update(h+'.'+p).digest('base64url');
 assert.equal(verifySession('Bearer '+h+'.'+p+'.'+s,secret,now),'test-user');
 assert.throws(()=>verifySession('Bearer '+h+'.'+p+'.'+s+'bad',secret,now),/Войдите/);
 assert.throws(()=>verifySession('Bearer '+h+'.'+p+'.'+s,secret,now+700000),/Войдите/);
});
test('Job ledger prevents duplicate provider calls, rejects key conflicts and isolates owners',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'picpac-ai-'));let calls=0,release;
 const env={PICPAC_AI_ENABLED:'true',PICPAC_MODEL_GATEWAY_URL:'https://models.example.invalid',PICPAC_MODEL_GATEWAY_KEY:'test',PICPAC_AUTH_SECRET:'x'.repeat(32),PICPAC_GENERATE_MODEL:'test-only'};
 const done=new Promise(r=>release=r);const service=new ImageJobService({env,directory,runner:async()=>{calls++;await done;return {bytes:Buffer.from([255,216,255]),model:'test'};}});
 try{
  const input={operation:'art.generate',prompt:'A quiet landscape',consent:true,references:[]};
  const first=await service.create('user-a',input,'one-idempotent-key');const second=await service.create('user-a',input,'one-idempotent-key');assert.equal(first.id,second.id);
  await assert.rejects(service.create('user-a',{...input,prompt:'Different'},'one-idempotent-key'),/другого/);
  await assert.rejects(service.get('user-b',first.id),/не найден/);
  release();for(let n=0;n<50;n++){if((await service.get('user-a',first.id)).status==='succeeded')break;await new Promise(r=>setTimeout(r,10));}
  await service.write;assert.equal(calls,1);assert.equal((await service.get('user-a',first.id)).status,'succeeded');assert.equal((await service.result('user-a',first.id)).length,3);
 }finally{release();await service.write;assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith('picpac-ai-'));await rm(directory,{recursive:true,force:true});}
});
test('Upstream adapter sends one bounded request and never accepts remote result URLs',async()=>{
 const env={PICPAC_AI_ENABLED:'true',PICPAC_MODEL_GATEWAY_URL:'https://models.example.invalid',PICPAC_MODEL_GATEWAY_KEY:'test',PICPAC_AUTH_SECRET:'x'.repeat(32)};
 let calls=0;const fakeFetch=async(url,opts)=>{calls++;assert.equal(url,'https://models.example.invalid/v1/images/edit');assert.equal(JSON.parse(opts.body).preserve_identity,true);return new Response(JSON.stringify({data:[{url:'http://internal-service/private'}]}),{headers:{'Content-Type':'application/json'}});};
 await assert.rejects(runModel({operation:'photo.edit',prompt:'soft light',references:[]},env,fakeFetch),/не вернула/);assert.equal(calls,1);
});
