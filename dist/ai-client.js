import {DOCUMENT_STUDIO_OPERATION} from './document-studio-profile.js';

let getAccessToken=async()=>null;
let apiBase='./api/ai/',sessionPromise,capabilitiesPromise;
const sessionKey='picpac-ai-session';
const timed=(ms,signal)=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
export const setAiSession=({accessToken})=>{getAccessToken=accessToken;};
export const disconnectedCapabilities={connected:false,provider:null,operations:[],albumAssistant:false,requiresAuth:true,maxReferences:3};

async function resolveApiBase(){
  const config=await fetch('./ai-config.json',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>r.json());
  const url=new URL(config.apiBase,location.href);
  if(!config.apiBase||!['https:','http:'].includes(url.protocol)||url.origin!==location.origin&&url.href!=='https://picpac.5-44-44-212.sslip.io/api/ai/')throw new Error('Сервер PicPac недоступен.');
  return url.href;
}

export async function accountRequest(action='',{token,credentials}={}){
  const base=await resolveApiBase(),headers={};
  if(token)headers.Authorization='Bearer '+token;
  if(credentials)headers['Content-Type']='application/json';
  const response=await fetch(base+'account'+(action?'/'+action:''),{
    method:action?'POST':'GET',headers,body:credentials?JSON.stringify(credentials):undefined,
    cache:'no-store',signal:AbortSignal.timeout(12000),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.message||'Сервер PicPac недоступен.'),{status:response.status});
  return data;
}

export function getAiCapabilities(){
  return capabilitiesPromise||=(async()=>{
    try{
      apiBase=await resolveApiBase();
      const r=await fetch(apiBase+'capabilities',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))return disconnectedCapabilities;
      const body=await r.json();
      return typeof body.connected==='boolean'&&Array.isArray(body.operations)?{...disconnectedCapabilities,...body}:disconnectedCapabilities;
    }catch{return disconnectedCapabilities;}
  })().finally(()=>{capabilitiesPromise=null;});
}

async function token(){
  const external=await getAccessToken();if(external)return external;
  const saved=sessionStorage.getItem(sessionKey);
  if(saved){
    try{const session=JSON.parse(saved);if(session.apiBase===apiBase&&session.expiresAt>Date.now())return session.token;}catch{}
  }
  if(!sessionPromise)sessionPromise=(async()=>{
    const base=apiBase,r=await fetch(base+'session',{method:'POST',signal:AbortSignal.timeout(12000)});
    const body=await r.json().catch(()=>({}));
    if(!r.ok||!body.token)throw new Error(body.message||'Не удалось открыть ИИ-студию.');
    sessionStorage.setItem(sessionKey,JSON.stringify({apiBase:base,token:body.token,expiresAt:Date.now()+Math.max(0,(body.expiresIn||0)-60)*1000}));
    return body.token;
  })().finally(()=>{sessionPromise=null;});
  return sessionPromise;
}
async function request(path,options={}){
  const access=await token();
  const r=await fetch(apiBase+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+access,...options.headers},signal:timed(25000,options.signal)});
  const body=await r.json().catch(()=>({message:'Сервис временно недоступен'}));
  if(!r.ok){if(r.status===401)sessionStorage.removeItem(sessionKey);throw new Error(body.message||'Ошибка сервиса');}
  return body;
}
export async function createImageJob({operation,prompt,references=[],consent,documentId},idempotencyKey,{signal}={}){
  if(operation!==DOCUMENT_STUDIO_OPERATION&&!consent)throw new Error('Подтвердите отправку данных для этой задачи.');
  return request('jobs',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify({operation,prompt,references,consent:consent?true:undefined,documentId}),signal});
}
export const proposeAlbumPatch=(instruction,{signal}={})=>request('assistant',{method:'POST',body:JSON.stringify({instruction}),signal});
export const getImageJob=(id,options)=>request('jobs/'+encodeURIComponent(id),options);
export async function getImageResult(id,{signal}={}){
  const access=await token();
  const r=await fetch(apiBase+'jobs/'+encodeURIComponent(id)+'/result',{headers:{Authorization:'Bearer '+access},signal:timed(30000,signal)});
  if(!r.ok)throw new Error('Не удалось загрузить результат');
  return r.blob();
}

const delay=(ms,signal)=>new Promise((resolve,reject)=>{
  signal?.throwIfAborted();
  const cancel=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);
  signal?.addEventListener('abort',cancel,{once:true});
});
export async function waitForImageJob(job,{signal,onStatus=()=>{}}={}){
  let result=job,attempt=0;
  const deadline=Date.now()+155000;
  while(['queued','running'].includes(result.status)&&Date.now()<deadline){
    onStatus(result.status);
    await delay(Math.min(1400+250*attempt++,3700),signal);
    result=await getImageJob(job.id,{signal});
  }
  if(result.status!=='succeeded')throw new Error(result.error||'Не получили результат вовремя. Проверьте соединение.');
  return getImageResult(job.id,{signal});
}
