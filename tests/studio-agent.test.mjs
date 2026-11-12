import test from 'node:test';
import assert from 'node:assert/strict';
import {modelOperations,runModel,validateGeneration} from '../api/model-gateway.mjs';
import {runAlbumAssistant} from '../api/album-assistant.mjs';
import {DOCUMENT_STUDIO_OPERATION} from '../dist/document-studio-profile.js';
import {studioEligibility} from '../dist/document-studio.js';
import {documentSignature,VALIDATOR_VERSION} from '../dist/document-quality.js';
import {selectedDocumentPhoto} from '../dist/project-rules.js';
import {interpretAlbumCommand,projectDesign,albumDesignFields} from '../dist/album-design.js';

const jpeg=Buffer.from([255,216,255,11,12,13]);
const reference={mimeType:'image/jpeg',data:jpeg.toString('base64')};
const studio={operation:DOCUMENT_STUDIO_OPERATION,documentId:'by',references:[reference]};
const env={PICPAC_AI_ENABLED:'true',PICPAC_AUTH_SECRET:'test-only-secret-'.repeat(3),
  PICPAC_MODEL_GATEWAY_URL:'https://images.example.invalid',PICPAC_MODEL_GATEWAY_KEY:'test-only',
  PICPAC_AIAI_API_KEY:'art-only',PICPAC_DOCUMENT_STUDIO_ENABLED:'true'};

test('Studio preview edits one reference with a fixed visual prompt via the image editor',async()=>{
  assert.ok(!modelOperations({...env,PICPAC_DOCUMENT_STUDIO_ENABLED:'false'}).includes(DOCUMENT_STUDIO_OPERATION));
  assert.ok(!modelOperations({...env,PICPAC_MODEL_GATEWAY_KEY:''}).includes(DOCUMENT_STUDIO_OPERATION));
  assert.equal(Object.hasOwn(validateGeneration(studio),'consent'),false);
  assert.equal(validateGeneration({...studio,consent:true}).consent,true);
  assert.throws(()=>validateGeneration({...studio,references:[reference,reference]}),/один исходный/);
  for(const documentId of ['ru','us','unknown','__proto__'])assert.throws(()=>validateGeneration({...studio,documentId}),/недоступно/);
  const input=validateGeneration({...studio,documentId:'schengen',prompt:'malicious custom prompt'});
  const result=await runModel(input,env,async(url,options)=>{
    assert.equal(url,'https://images.example.invalid/v1/images/edit');
    const body=JSON.parse(options.body);
    assert.deepEqual(body.images,[{mime_type:'image/jpeg',base64:reference.data}]);
    assert.equal(body.preserve_identity,true);
    assert.match(body.prompt,/7:9[\s\S]*upper shoulders/);
    assert.match(body.prompt,/#FFFFFF/);
    assert.match(body.prompt,/Keep the exact same person/);
    assert.doesNotMatch(body.prompt,/malicious custom/);
    return new Response(JSON.stringify({data:[{b64_json:reference.data}]}));
  });
  assert.deepEqual(result.bytes,jpeg);
});

test('Studio eligibility uses a current, sharp source and document export keeps that source',()=>{
  const project={docId:'by',photos:[{id:'original'}],docAiPreview:{id:'cloud-preview'},docUsePrepared:true};
  project.docAudit={signature:documentSignature(project),version:VALIDATOR_VERSION,canCapture:true,
    checks:[{id:'sharpness',status:'pass'},{id:'light',status:'warn'}]};
  assert.equal(studioEligibility(project).ready,true);
  assert.equal(selectedDocumentPhoto(project).id,'original');
  assert.equal(studioEligibility(project,{low:true}).ready,false);
  project.docAudit.checks[0].status='warn';
  assert.equal(studioEligibility(project).ready,false);
  project.photos=[{id:'replacement'}];
  assert.match(studioEligibility(project).message,/текущий снимок/);
});

test('Direct Qwen studio sends the uploaded image plus server prompt and downloads only from DashScope storage',async()=>{
  const direct={PICPAC_AI_ENABLED:'true',PICPAC_AUTH_SECRET:env.PICPAC_AUTH_SECRET,
    PICPAC_DOCUMENT_STUDIO_ENABLED:'true',PICPAC_DASHSCOPE_API_KEY:'test-qwen'};
  assert.deepEqual(modelOperations(direct),[DOCUMENT_STUDIO_OPERATION]);
  const input=validateGeneration(studio),url='https://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/result.png?Expires=1';
  const provider=image=>new Response(JSON.stringify({output:{choices:[{message:{content:[{image}]}}]}}));
  let count=0;
  const result=await runModel(input,direct,async(address,options)=>{
    count++;
    if(count===1){
      assert.match(address,/^https:\/\/dashscope-intl\.aliyuncs\.com\//);
      assert.equal(options.headers.Authorization,'Bearer test-qwen');
      const body=JSON.parse(options.body);
      assert.equal(body.model,'qwen-image-2.0-pro');
      assert.deepEqual(body.input.messages[0].content,[{image:'data:image/jpeg;base64,'+reference.data},{text:input.prompt}]);
      return provider(url);
    }
    assert.equal(address,url);assert.equal(options.headers,undefined);assert.equal(options.redirect,'error');
    return new Response(jpeg);
  });
  assert.equal(count,2);assert.deepEqual(result.bytes,jpeg);
  let blockedCalls=0;
  await assert.rejects(runModel(input,direct,async()=>{blockedCalls++;return provider('https://example.invalid/file.png');}),/не вернула/);
  assert.equal(blockedCalls,1);
});

test('AIAI document edits upload exactly one original and make no text-only retry',async()=>{
  const edit={PICPAC_AI_ENABLED:'true',PICPAC_AUTH_SECRET:env.PICPAC_AUTH_SECRET,
    PICPAC_DOCUMENT_STUDIO_ENABLED:'true',PICPAC_AIAI_API_KEY:'test-aiai',
    PICPAC_AIAI_DOCUMENT_EDIT_MODEL:'flux-1-kontext-pro'};
  assert.deepEqual(modelOperations(edit),['art.generate',DOCUMENT_STUDIO_OPERATION]);
  assert.deepEqual(modelOperations({...edit,PICPAC_DOCUMENT_STUDIO_ENABLED:'false'}),['art.generate']);
  const input=validateGeneration(studio);
  let calls=0;
  const result=await runModel(input,edit,async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.aiai.by/v1/images/edits');
    assert.deepEqual(options.headers,{Authorization:'Bearer test-aiai'});
    assert.equal(options.body.get('model'),'flux-1-kontext-pro');
    assert.equal(options.body.get('prompt'),input.prompt);
    assert.equal(options.body.getAll('image').length,1);
    assert.equal(options.body.get('image').type,'image/jpeg');
    assert.deepEqual(Buffer.from(await options.body.get('image').arrayBuffer()),jpeg);
    return Response.json({data:[{b64_json:reference.data}]});
  });
  assert.equal(calls,1);
  assert.deepEqual(result.bytes,jpeg);
  let failedCalls=0;
  await assert.rejects(runModel(input,edit,async()=>{
    failedCalls++;
    return new Response('unsupported model',{status:400});
  }),/HTTP 400/);
  assert.equal(failedCalls,1);
});

test('Album commands combine several visual edits without rewriting unrelated data',()=>{
  const project={title:'Семейная книга',color:'#DDEBED',layout:'duo',photos:[{id:'a',caption:'У моря'}]};
  const patch=interpretAlbumCommand('Сине-фиолетовая палитра; обложка только текст; шрифт с засечками; главы: Начало, Путешествие; убери подписи');
  assert.deepEqual(patch,{cover:'type',layout:'story',typography:'serif',captionMode:'hide',color:'#DEDCFF',accent:'#382278',chapters:['Начало','Путешествие']});
  const fields=albumDesignFields({...projectDesign(project),...patch});
  assert.equal(fields.title,project.title);
  assert.deepEqual(fields.albumDesign.chapters,['Начало','Путешествие']);
  assert.equal(project.photos[0].caption,'У моря');
  assert.equal(interpretAlbumCommand('Назови альбом «Лавандовое лето»').title,'Лавандовое лето');
  assert.equal(interpretAlbumCommand('Назови альбом «Лавандовое лето»').color,undefined);
});

test('Cloud album assistant receives only text and can return only allowed design fields',async()=>{
  const result=await runAlbumAssistant('Мягкий винтаж', {...env,PICPAC_ASSISTANT_MODEL:'test-model'},async(url,options)=>{
    assert.equal(url,'https://api.aiai.by/v1/chat/completions');
    const body=JSON.parse(options.body);
    assert.deepEqual(body.messages[1],{role:'user',content:'Мягкий винтаж'});
    assert.equal(body.model,'test-model');
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
      color:'#f0dcba',typography:'serif',cover:'large-photo',photos:['a'],action:'delete-project',
    })}}]}));
  });
  assert.deepEqual(result,{color:'#F0DCBA',typography:'serif'});
});
