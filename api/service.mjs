import {createHmac,timingSafeEqual,createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {configured,validateGeneration,runModel,GatewayError} from './model-gateway.mjs';

export function verifySession(header,secret,now=Date.now()){
  if(!secret||secret.length<32)throw new GatewayError('AUTH_NOT_CONFIGURED','Вход в PicPac ещё не подключён.',503);
  try{
    if(!header?.startsWith('Bearer '))throw Error();
    const [h,p,s,...rest]=header.slice(7).split('.');if(rest.length||!h||!p||!s)throw Error();
    const meta=JSON.parse(Buffer.from(h,'base64url'));if(meta.alg!=='HS256')throw Error();
    const expected=createHmac('sha256',secret).update(h+'.'+p).digest(),actual=Buffer.from(s,'base64url');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error();
    const claims=JSON.parse(Buffer.from(p,'base64url'));
    if(claims.iss!=='picpac'||claims.aud!=='picpac-ai'||typeof claims.sub!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub)||!Number.isFinite(claims.exp)||claims.exp*1000<=now||claims.exp*1000>now+86400000||(claims.nbf&&claims.nbf*1000>now))throw Error();
    return claims.sub;
  }catch{throw new GatewayError('UNAUTHORIZED','Войдите в аккаунт PicPac.',401);}
}
export class ImageJobService {
  constructor({env=process.env,directory=path.resolve('api/.data'),runner=runModel}={}){this.env=env;this.directory=directory;this.runner=runner;this.jobs=[];this.write=Promise.resolve();this.ready=this.init();}
  async init(){await mkdir(this.directory,{recursive:true});try{this.jobs=JSON.parse(await readFile(path.join(this.directory,'jobs.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    for(const job of this.jobs)if(['queued','running'].includes(job.status)){job.status='failed';job.error='Сервис был перезапущен. Автоматический повтор отключён.';}
    await this.sweepExpired();await this.flush();}
  flush(){this.write=this.write.catch(()=>{}).then(async()=>{const file=path.join(this.directory,'jobs.json');await writeFile(file+'.tmp',JSON.stringify(this.jobs));await rename(file+'.tmp',file);});return this.write;}
  async sweepExpired(now=Date.now()){
    for(const job of this.jobs)if(now>Date.parse(job.expiresAt)&&/^[a-f0-9-]{36}$/.test(job.id))await rm(path.join(this.directory,job.id+'.jpg'),{force:true});
  }
  capabilities(){return {connected:configured(this.env),provider:configured(this.env)?'PicPac model gateway':null,operations:configured(this.env)?['photo.edit',...(this.env.PICPAC_GENERATE_MODEL?['art.generate']:[])]:[],requiresAuth:true,maxReferences:3};}
  publicJob(job){const {userId,key,digest,...publicData}=job;return {...publicData,result:job.status==='succeeded'?{url:'/api/ai/jobs/'+job.id+'/result',mimeType:'image/jpeg'}:null};}
  async create(userId,input,key){await this.ready;input=validateGeneration(input);
    if(!configured(this.env))throw new GatewayError('NOT_CONFIGURED','Сервис генерации ещё не подключён.',503);
    if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new GatewayError('IDEMPOTENCY_REQUIRED','Нужен корректный ключ запроса.');
    const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing=this.jobs.find(j=>j.userId===userId&&j.key===key);
    if(existing){if(existing.digest!==digest)throw new GatewayError('IDEMPOTENCY_CONFLICT','Этот ключ уже использован для другого запроса.',409);return this.publicJob(existing);}
    const now=Date.now(),userJobs=this.jobs.filter(j=>j.userId===userId);
    if(userJobs.filter(j=>['queued','running'].includes(j.status)).length>=2)throw new GatewayError('CONCURRENCY_LIMIT','Дождитесь завершения предыдущих запросов.',429);
    if(userJobs.filter(j=>now-Date.parse(j.createdAt)<86400000).length>=Number(this.env.PICPAC_DAILY_JOB_LIMIT||20))throw new GatewayError('DAILY_LIMIT','Достигнут дневной лимит генераций.',429);
    if(this.jobs.filter(j=>['queued','running'].includes(j.status)).length>=Number(this.env.PICPAC_GLOBAL_CONCURRENCY||4))throw new GatewayError('BUSY','Сервис занят. Попробуйте позже.',429);
    const job={id:randomUUID(),userId,key,digest,operation:input.operation,status:'queued',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString(),error:null};
    this.jobs.push(job);await this.flush();
    void this.run(job,input).catch(()=>{job.status='failed';job.error='Не удалось сохранить состояние запроса. Обратитесь в поддержку.';});
    return this.publicJob(job);
  }
  async run(job,input){try{job.status='running';await this.flush();const result=await this.runner(input,this.env);await writeFile(path.join(this.directory,job.id+'.jpg'),result.bytes);job.status='succeeded';job.model=result.model;}catch(error){job.status='failed';job.error=error instanceof GatewayError?error.message:'Генерация не завершена. Повтор требует нового запроса.';}finally{job.finishedAt=new Date().toISOString();await this.flush();}}
  async get(userId,id){await this.ready;const job=this.jobs.find(j=>j.id===id&&j.userId===userId);if(!job)throw new GatewayError('NOT_FOUND','Запрос не найден.',404);
    if(Date.now()>Date.parse(job.expiresAt)){await rm(path.join(this.directory,job.id+'.jpg'),{force:true});throw new GatewayError('EXPIRED','Срок хранения результата истёк.',410);}return job;}
  async result(userId,id){const job=await this.get(userId,id);if(job.status!=='succeeded')throw new GatewayError('NOT_READY','Результат ещё не готов.',409);return readFile(path.join(this.directory,job.id+'.jpg'));}
}
export function createAiHandler(service){return async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!pathname.startsWith('/api/ai/'))return false;
  const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  try{
    if(req.method==='GET'&&pathname==='/api/ai/capabilities'){json(200,service.capabilities());return true;}
    const user=verifySession(req.headers.authorization,service.env.PICPAC_AUTH_SECRET);
    if(req.method==='POST'&&pathname==='/api/ai/jobs'){
      if(!req.headers['content-type']?.startsWith('application/json'))throw new GatewayError('CONTENT_TYPE','Ожидался JSON.',415);
      if(req.headers.origin&&req.headers.origin!==new URL(service.env.PICPAC_PUBLIC_ORIGIN||'http://127.0.0.1:4173').origin)throw new GatewayError('ORIGIN_DENIED','Источник запроса не разрешён.',403);
      let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>22_000_000)throw new GatewayError('REQUEST_TOO_LARGE','Слишком большой запрос.',413);chunks.push(chunk);}
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GatewayError('JSON_INVALID','Некорректный запрос.');}
      const job=await service.create(user,input,req.headers['idempotency-key']);json(202,job);return true;
    }
    const match=pathname.match(/^\/api\/ai\/jobs\/([a-f0-9-]{36})(\/result)?$/);
    if(req.method==='GET'&&match){if(match[2]){const bytes=await service.result(user,match[1]);res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);}else json(200,service.publicJob(await service.get(user,match[1])));return true;}
    throw new GatewayError('NOT_FOUND','Маршрут не найден.',404);
  }catch(error){json(error instanceof GatewayError?error.status:500,{code:error instanceof GatewayError?error.code:'INTERNAL_ERROR',message:error instanceof GatewayError?error.message:'Сервис временно недоступен.'});return true;}
};}
