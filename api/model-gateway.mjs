import {DOCUMENT_STUDIO_OPERATION} from '../dist/document-studio-profile.js';
import {documentStudioPrompt} from './document-studio.mjs';

// Adapter for a PicPac-owned inference gateway (for example Qwen-Image-Edit-2511).
// Provider keys and the upstream URL are never accepted from a browser request.
export class GatewayError extends Error {constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
export const aiAccessEnabled=env=>env.PICPAC_AI_ENABLED==='true'&&String(env.PICPAC_AUTH_SECRET||'').length>=32;
function editGatewayConfigured(env){
  if(!env.PICPAC_MODEL_GATEWAY_URL||!env.PICPAC_MODEL_GATEWAY_KEY)return false;
  try{const u=new URL(env.PICPAC_MODEL_GATEWAY_URL);return !u.username&&!u.password&&!u.search&&!u.hash&&(u.protocol==='https:'||(env.PICPAC_ALLOW_LOCAL_MODEL==='true'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&u.protocol==='http:'));}catch{return false;}
}
const qwenStudioConfigured=env=>typeof env.PICPAC_DASHSCOPE_API_KEY==='string'&&!!env.PICPAC_DASHSCOPE_API_KEY.trim()
  &&(!env.PICPAC_DASHSCOPE_WORKSPACE_ID||/^[a-z0-9-]{1,80}$/i.test(env.PICPAC_DASHSCOPE_WORKSPACE_ID));
const aiaiStudioConfigured=env=>!!env.PICPAC_AIAI_API_KEY
  &&/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(env.PICPAC_AIAI_DOCUMENT_EDIT_MODEL||'');

export function documentStudioProvider(env){
  if(!aiAccessEnabled(env)||env.PICPAC_DOCUMENT_STUDIO_ENABLED!=='true')return null;
  if(aiaiStudioConfigured(env))return 'AIAI.BY';
  if(qwenStudioConfigured(env))return 'Alibaba Cloud';
  if(editGatewayConfigured(env))return 'PicPac Studio';
  return null;
}

export function modelOperations(env){
  if(!aiAccessEnabled(env))return [];
  const edit=editGatewayConfigured(env);
  return [...(edit?['photo.edit']:[]),
    ...(env.PICPAC_AIAI_API_KEY||edit&&env.PICPAC_GENERATE_MODEL?['art.generate']:[]),
    ...(documentStudioProvider(env)?[DOCUMENT_STUDIO_OPERATION]:[])];
}
export const configured=env=>modelOperations(env).length>0;
export function validateGeneration(input){
  const operation=input?.operation,studio=operation===DOCUMENT_STUDIO_OPERATION;
  if(!['photo.edit','art.generate',DOCUMENT_STUDIO_OPERATION].includes(operation))throw new GatewayError('OPERATION_NOT_ALLOWED','Для документов доступно только студийное превью.');
  if(!studio&&input.consent!==true)throw new GatewayError('CONSENT_REQUIRED','Нужно согласие на обработку выбранных фото.');
  const prompt=studio?documentStudioPrompt(input.documentId):input.prompt;
  if(studio&&!prompt)throw new GatewayError('DOCUMENT_NOT_SUPPORTED','Для этого документа студийное ИИ-превью недоступно.');
  if(typeof prompt!=='string'||prompt.trim().length<3||prompt.length>2000)throw new GatewayError('PROMPT_INVALID','Опишите желаемый результат: от 3 до 2000 символов.');
  const refs=input.references||[];
  if(studio&&(!Array.isArray(refs)||refs.length!==1))throw new GatewayError('REFERENCES_INVALID','Для студийного превью нужен один исходный снимок.');
  if(!Array.isArray(refs)||refs.length>3||(operation==='photo.edit'&&!refs.length))throw new GatewayError('REFERENCES_INVALID','Для изменения нужны от 1 до 3 изображений.');
  if(operation==='art.generate'&&refs.length)throw new GatewayError('REFERENCES_INVALID','Генерация иллюстрации не принимает фотографии.');
  for(const ref of refs){
    if(!ref||typeof ref!=='object')throw new GatewayError('FILE_INVALID','Некорректное изображение.');
    if(!['image/jpeg','image/png','image/webp'].includes(ref.mimeType)||typeof ref.data!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(ref.data)||ref.data.length>7_000_000)throw new GatewayError('FILE_INVALID','Нужен JPEG, PNG или WebP до 5 МБ.');
    const bytes=Buffer.from(ref.data,'base64');if(bytes.length>5*1024*1024)throw new GatewayError('FILE_TOO_LARGE','Изображение больше 5 МБ.');
    const valid=ref.mimeType==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:ref.mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!valid)throw new GatewayError('FILE_INVALID','Содержимое файла не соответствует формату.');
  }
  return {operation,prompt:prompt.trim(),references:refs.map(({mimeType,data})=>({mimeType,data})),...(input.consent===true?{consent:true}:{})};
}
export async function runModel(input,env,fetcher=fetch){
  if(!configured(env))throw new GatewayError('NOT_CONFIGURED','Сервис генерации ещё не подключён.',503);
  if(!modelOperations(env).includes(input.operation))throw new GatewayError('OPERATION_NOT_ALLOWED',input.operation===DOCUMENT_STUDIO_OPERATION?'Модель студийного превью ещё не подключена.':'Подключённая модель поддерживает только новую иллюстрацию по описанию.',503);
  if(input.operation===DOCUMENT_STUDIO_OPERATION){
    if(aiaiStudioConfigured(env))return runAiaiStudio(input,env,fetcher);
    if(qwenStudioConfigured(env))return runQwenStudio(input,env,fetcher);
  }
  if(env.PICPAC_AIAI_API_KEY&&input.operation==='art.generate'){
    const response=await fetcher('https://api.aiai.by/v1/images/generations',{method:'POST',headers:{Authorization:'Bearer '+env.PICPAC_AIAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'flux-1-kontext-pro',prompt:input.prompt,size:'1024x1024',response_format:'b64_json'}),signal:AbortSignal.timeout(120000),redirect:'error'});
    if(!response.ok)throw new GatewayError('PROVIDER_FAILED','AIAI.BY не завершил генерацию. Повторите запрос вручную, если нужно.',502);
    const bytes=await response.arrayBuffer();if(bytes.byteLength>22_000_000)throw new GatewayError('RESULT_TOO_LARGE','Результат модели слишком большой.',502);
    let body;try{body=JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{throw new GatewayError('RESULT_INVALID','Модель вернула некорректный ответ.',502);}
    const value=body.data?.[0]?.b64_json;
    if(typeof value!=='string'||value.length>21_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new GatewayError('RESULT_INVALID','Модель не вернула изображение.',502);
    const output=Buffer.from(value,'base64');const jpeg=output[0]===255&&output[1]===216&&output[2]===255;
    const png=output.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if(output.length>15*1024*1024||!jpeg&&!png)throw new GatewayError('RESULT_INVALID','Модель вернула неподдерживаемый формат изображения.',502);
    return {bytes:output,mimeType:jpeg?'image/jpeg':'image/png',model:'flux-1-kontext-pro'};
  }
  const base=env.PICPAC_MODEL_GATEWAY_URL.replace(/\/$/,'');
  const editing=input.operation!=='art.generate';
  const model=editing?(env.PICPAC_EDIT_MODEL||'Qwen-Image-Edit-2511'):env.PICPAC_GENERATE_MODEL;
  const route=editing?'/v1/images/edit':'/v1/images/generate';
  const response=await fetcher(base+route,{method:'POST',headers:{Authorization:'Bearer '+env.PICPAC_MODEL_GATEWAY_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,prompt:input.prompt,images:input.references.map(r=>({mime_type:r.mimeType,base64:r.data})),n:1,output_format:'jpeg',preserve_identity:editing}),signal:AbortSignal.timeout(120000),redirect:'error'});
  if(!response.ok)throw new GatewayError('PROVIDER_FAILED','Модель не завершила запрос. Автоматически повторять платную генерацию не будем.',502);
  const reader=response.body.getReader();let length=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>22_000_000){await reader.cancel();throw new GatewayError('RESULT_TOO_LARGE','Результат модели слишком большой.',502);}chunks.push(value);}}finally{reader.releaseLock();}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GatewayError('RESULT_INVALID','Модель вернула некорректный результат.',502);}
  const value=body.data?.[0]?.b64_json;
  if(typeof value!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new GatewayError('RESULT_INVALID','Модель не вернула изображение.',502);
  const bytes=Buffer.from(value,'base64');if(bytes.length>15*1024*1024||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new GatewayError('RESULT_INVALID','Ожидалось изображение JPEG.',502);
  return {bytes,mimeType:'image/jpeg',model:body.model||model};
}

async function boundedBytes(response,maxBytes){
  const reader=response.body?.getReader();if(!reader)throw new GatewayError('RESULT_INVALID','Модель вернула пустой ответ.',502);
  let size=0;const chunks=[];
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.length;if(size>maxBytes){await reader.cancel();throw new GatewayError('RESULT_TOO_LARGE','Результат модели слишком большой.',502);}
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }finally{reader.releaseLock();}
}

async function runAiaiStudio(input,env,fetcher){
  const model=env.PICPAC_AIAI_DOCUMENT_EDIT_MODEL;
  const [reference]=input.references;
  const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[reference.mimeType];
  const form=new FormData();
  form.append('model',model);
  form.append('prompt',input.prompt);
  form.append('n','1');
  form.append('response_format','b64_json');
  form.append('image',new Blob([Buffer.from(reference.data,'base64')],{type:reference.mimeType}),'portrait.'+extension);
  const response=await fetcher('https://api.aiai.by/v1/images/edits',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.PICPAC_AIAI_API_KEY},
    body:form,
    signal:AbortSignal.timeout(120000),
    redirect:'error',
  });
  if(!response.ok){
    const rejected=response.status===401||response.status===403;
    const message=rejected?'AIAI.BY отклонил доступ к редактированию фото.':'AIAI.BY не завершил редактирование фото (HTTP '+response.status+').';
    await response.body?.cancel();
    throw new GatewayError(rejected?'AIAI_EDIT_ACCESS':'AIAI_EDIT_FAILED',message,502);
  }
  const bytes=await boundedBytes(response,22_000_000);
  let data;
  try{data=JSON.parse(bytes.toString('utf8')).data?.[0]?.b64_json;}
  catch{throw new GatewayError('RESULT_INVALID','AIAI.BY вернул некорректный ответ.',502);}
  if(typeof data!=='string'||data.length>21_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data)){
    throw new GatewayError('RESULT_INVALID','AIAI.BY не вернул изображение в формате base64.',502);
  }
  const output=Buffer.from(data,'base64');
  const jpeg=output[0]===255&&output[1]===216&&output[2]===255;
  const png=output.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=output.toString('ascii',0,4)==='RIFF'&&output.toString('ascii',8,12)==='WEBP';
  if(output.length>15*1024*1024||!(jpeg||png||webp)){
    throw new GatewayError('RESULT_INVALID','AIAI.BY вернул неподдерживаемый формат изображения.',502);
  }
  const mimeType=jpeg?'image/jpeg':png?'image/png':'image/webp';
  return {bytes:output,mimeType,model};
}

async function runQwenStudio(input,env,fetcher){
  const [ref]=input.references,model='qwen-image-2.0-pro';
  const host=env.PICPAC_DASHSCOPE_WORKSPACE_ID?env.PICPAC_DASHSCOPE_WORKSPACE_ID+'.ap-southeast-1.maas.aliyuncs.com':'dashscope-intl.aliyuncs.com';
  const signal=AbortSignal.timeout(120000);
  const response=await fetcher('https://'+host+'/api/v1/services/aigc/multimodal-generation/generation',{
    method:'POST',headers:{Authorization:'Bearer '+env.PICPAC_DASHSCOPE_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({model,input:{messages:[{role:'user',content:[
      {image:'data:'+ref.mimeType+';base64,'+ref.data},{text:input.prompt},
    ]}]},parameters:{n:1,prompt_extend:false,watermark:false}}),
    signal,redirect:'error',
  });
  if(!response.ok)throw new GatewayError('PROVIDER_FAILED','Облачная студия не завершила обработку. Используйте обработку на устройстве или попробуйте позже.',502);
  const bytes=await boundedBytes(response,64*1024);
  let result;
  try{
    const body=JSON.parse(bytes.toString('utf8')),link=body.output?.choices?.[0]?.message?.content?.find(entry=>typeof entry?.image==='string')?.image;
    result=new URL(link);
    if(result.protocol!=='https:'||result.port||result.username||result.password||result.hash||
      !/^dashscope-result-(?:sz|hz|bj|sg|intl)\.oss-(?:cn-(?:shenzhen|hangzhou|beijing)|ap-southeast-1)\.aliyuncs\.com$/.test(result.hostname))throw Error();
  }catch{throw new GatewayError('RESULT_INVALID','Облачная модель не вернула поддерживаемое изображение.',502);}
  const image=await fetcher(result.href,{signal,redirect:'error'});
  if(!image.ok)throw new GatewayError('PROVIDER_FAILED','Не удалось получить готовое студийное превью.',502);
  const output=await boundedBytes(image,15*1024*1024);
  const png=output.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=output[0]===255&&output[1]===216&&output[2]===255;
  if(!png&&!jpeg)throw new GatewayError('RESULT_INVALID','Облачная модель вернула неподдерживаемый формат.',502);
  return {bytes:output,mimeType:png?'image/png':'image/jpeg',model};
}
