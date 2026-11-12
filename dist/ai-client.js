let getAccessToken=async()=>null;
let apiBase='./api/ai/';
export const setAiSession=({accessToken})=>{getAccessToken=accessToken;};
export const disconnectedCapabilities={connected:false,provider:null,operations:[],requiresAuth:true,maxReferences:3};
export async function getAiCapabilities(){
  try{const config=await fetch('./ai-config.json',{cache:'no-store'}).then(r=>r.json());if(!config.apiBase)return disconnectedCapabilities;
    const url=new URL(config.apiBase,location.href);if(url.origin!==location.origin)return disconnectedCapabilities;apiBase=url.href;
    const r=await fetch(apiBase+'capabilities',{cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))return disconnectedCapabilities;
    const body=await r.json();return typeof body.connected==='boolean'?body:disconnectedCapabilities;
  }catch{return disconnectedCapabilities;}
}
async function request(path,options={}){
  const token=await getAccessToken();if(!token)throw new Error('Войдите в аккаунт PicPac после подключения сервиса генерации.');
  const r=await fetch(apiBase+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...options.headers},signal:options.signal||AbortSignal.timeout(20000)});
  const body=await r.json().catch(()=>({message:'Сервис временно недоступен'}));if(!r.ok)throw new Error(body.message||'Ошибка сервиса');return body;
}
export async function createImageJob({operation,prompt,references=[],consent},idempotencyKey){
  if(!consent)throw new Error('Нужно согласие на обработку выбранных изображений.');
  return request('jobs',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify({operation,prompt,references,consent:true})});
}
export const getImageJob=id=>request('jobs/'+encodeURIComponent(id));
export async function getImageResult(id){const token=await getAccessToken();if(!token)throw new Error('Войдите в аккаунт PicPac.');const r=await fetch(apiBase+'jobs/'+encodeURIComponent(id)+'/result',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Не удалось загрузить результат');return r.blob();}
