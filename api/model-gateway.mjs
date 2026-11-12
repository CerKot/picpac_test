// Adapter for a PicPac-owned inference gateway (for example Qwen-Image-Edit-2511).
// Provider keys and the upstream URL are never accepted from a browser request.
export class GatewayError extends Error {constructor(code,message,status=400){super(message);this.code=code;this.status=status;}}
export function configured(env){
  if(env.PICPAC_AI_ENABLED!=='true'||!env.PICPAC_MODEL_GATEWAY_URL||!env.PICPAC_MODEL_GATEWAY_KEY||String(env.PICPAC_AUTH_SECRET||'').length<32)return false;
  try{const u=new URL(env.PICPAC_MODEL_GATEWAY_URL);return !u.username&&!u.password&&(u.protocol==='https:'||(env.PICPAC_ALLOW_LOCAL_MODEL==='true'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&u.protocol==='http:'));}catch{return false;}
}
export function validateGeneration(input){
  if(!['photo.edit','art.generate'].includes(input?.operation))throw new GatewayError('OPERATION_NOT_ALLOWED','Для документов генеративная обработка недоступна.');
  if(input.consent!==true)throw new GatewayError('CONSENT_REQUIRED','Нужно согласие на обработку выбранных фото.');
  if(typeof input.prompt!=='string'||input.prompt.trim().length<3||input.prompt.length>2000)throw new GatewayError('PROMPT_INVALID','Опишите желаемый результат: от 3 до 2000 символов.');
  const refs=input.references||[];
  if(!Array.isArray(refs)||refs.length>3||(input.operation==='photo.edit'&&!refs.length))throw new GatewayError('REFERENCES_INVALID','Для изменения нужны от 1 до 3 изображений.');
  if(input.operation==='art.generate'&&refs.length)throw new GatewayError('REFERENCES_INVALID','Генерация иллюстрации не принимает фотографии.');
  for(const ref of refs){
    if(!ref||typeof ref!=='object')throw new GatewayError('FILE_INVALID','Некорректное изображение.');
    if(!['image/jpeg','image/png','image/webp'].includes(ref.mimeType)||typeof ref.data!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(ref.data)||ref.data.length>7_000_000)throw new GatewayError('FILE_INVALID','Нужен JPEG, PNG или WebP до 5 МБ.');
    const bytes=Buffer.from(ref.data,'base64');if(bytes.length>5*1024*1024)throw new GatewayError('FILE_TOO_LARGE','Изображение больше 5 МБ.');
    const valid=ref.mimeType==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:ref.mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!valid)throw new GatewayError('FILE_INVALID','Содержимое файла не соответствует формату.');
  }
  return {operation:input.operation,prompt:input.prompt.trim(),references:refs,consent:true};
}
export async function runModel(input,env,fetcher=fetch){
  if(!configured(env))throw new GatewayError('NOT_CONFIGURED','Сервис генерации ещё не подключён.',503);
  const base=env.PICPAC_MODEL_GATEWAY_URL.replace(/\/$/,'');
  const model=input.operation==='photo.edit'?(env.PICPAC_EDIT_MODEL||'Qwen-Image-Edit-2511'):env.PICPAC_GENERATE_MODEL;if(!model)throw new GatewayError('MODEL_NOT_CONFIGURED','Модель иллюстраций ещё не настроена.',503);
  const route=input.operation==='photo.edit'?'/v1/images/edit':'/v1/images/generate';
  const response=await fetcher(base+route,{method:'POST',headers:{Authorization:'Bearer '+env.PICPAC_MODEL_GATEWAY_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:model,prompt:input.prompt,images:input.references.map(r=>({mime_type:r.mimeType,base64:r.data})),n:1,output_format:'jpeg',preserve_identity:input.operation==='photo.edit'}),signal:AbortSignal.timeout(120000),redirect:'error'});
  if(!response.ok)throw new GatewayError('PROVIDER_FAILED','Модель не завершила запрос. Автоматически повторять платную генерацию не будем.',502);
  const reader=response.body.getReader();let length=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>22_000_000){await reader.cancel();throw new GatewayError('RESULT_TOO_LARGE','Результат модели слишком большой.',502);}chunks.push(value);}}finally{reader.releaseLock();}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GatewayError('RESULT_INVALID','Модель вернула некорректный результат.',502);}
  const value=body.data?.[0]?.b64_json;
  if(typeof value!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new GatewayError('RESULT_INVALID','Модель не вернула изображение.',502);
  const bytes=Buffer.from(value,'base64');if(bytes.length>15*1024*1024||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new GatewayError('RESULT_INVALID','Ожидалось изображение JPEG.',502);
  return {bytes,mimeType:'image/jpeg',model:body.model||model};
}
