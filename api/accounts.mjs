import {createHash,randomBytes,randomUUID,scrypt,timingSafeEqual} from 'node:crypto';
import {chmodSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {ACCOUNT_PLANS} from '../dist/account-plans.js';
import {GatewayError} from './model-gateway.mjs';

const derive=promisify(scrypt);
const hashPassword=(password,salt)=>derive(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
const digest=token=>createHash('sha256').update(token).digest('hex');
const sessionMs=7*24*60*60*1000;
const rateWindowMs=15*60*1000;
const dummySalt=randomBytes(16);
const dummyHash=Buffer.alloc(64);
const bearer=header=>/^Bearer (pp_[A-Za-z0-9_-]{43})$/.exec(header||'')?.[1];
const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';

export class Accounts {
  constructor(directory){
    mkdirSync(directory,{recursive:true,mode:0o700});
    const file=path.join(directory,'accounts.sqlite');
    this.db=new DatabaseSync(file);
    if(process.platform!=='win32')chmodSync(file,0o600);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt BLOB NOT NULL, password_hash BLOB NOT NULL,
        plan TEXT NOT NULL DEFAULT 'standart' CHECK(plan IN ('standart','pro','super','vip'))
      );
      CREATE TABLE IF NOT EXISTS account_sessions (
        token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS account_sessions_expiry ON account_sessions(expires_at);
    `);
    this.attempts=new Map();
    this.activeHashes=0;
    this.sweepAt=0;
  }

  authenticate(header){
    const token=bearer(header);
    if(!token)return null;
    return this.db.prepare(`SELECT a.id,a.email,a.plan FROM accounts a JOIN account_sessions s ON s.account_id=a.id
      WHERE s.token_hash=? AND s.expires_at>?`).get(digest(token),Date.now())||null;
  }

  signOut(header){
    const token=bearer(header);
    if(token)this.db.prepare('DELETE FROM account_sessions WHERE token_hash=?').run(digest(token));
  }

  async signIn(input,address,{register=false}={}){
    const email=normalizeEmail(input?.email),password=input?.password;
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof password!=='string'||Buffer.byteLength(password)>256||password.length<(register?10:1)){
      throw new GatewayError('CREDENTIALS_INVALID',register?'Укажите почту и пароль от 10 символов.':'Проверьте почту и пароль.');
    }
    const now=Date.now();
    if(now>=this.sweepAt){
      for(const [key,attempt] of this.attempts)if(attempt.until<=now)this.attempts.delete(key);
      this.db.prepare('DELETE FROM account_sessions WHERE expires_at<=?').run(now);
      this.sweepAt=now+60000;
    }
    const key=address||'local',previous=this.attempts.get(key);
    const attempt=previous?.until>now?previous:{count:0,until:now+rateWindowMs};
    if(attempt.count>=15||this.activeHashes>=4)throw new GatewayError('AUTH_RATE_LIMIT','Слишком много попыток. Попробуйте позже.',429);
    attempt.count++;
    this.attempts.set(key,attempt);
    this.activeHashes++;
    let account;
    try{
      if(register){
        const salt=randomBytes(16),hash=await hashPassword(password,salt);
        account={id:randomUUID(),email,plan:'standart'};
        const created=this.db.prepare('INSERT OR IGNORE INTO accounts (id,email,salt,password_hash) VALUES (?,?,?,?)')
          .run(account.id,email,salt,hash);
        if(!created.changes)throw new GatewayError('ACCOUNT_EXISTS','Эта почта уже зарегистрирована. Войдите в аккаунт.',409);
      }else{
        const row=this.db.prepare('SELECT id,email,plan,salt,password_hash FROM accounts WHERE email=?').get(email);
        const hash=await hashPassword(password,row?.salt||dummySalt);
        if(!timingSafeEqual(hash,row?.password_hash||dummyHash)||!row)throw new GatewayError('LOGIN_INVALID','Неверная почта или пароль.',401);
        account={id:row.id,email:row.email,plan:row.plan};
      }
    }finally{this.activeHashes--;}
    const token='pp_'+randomBytes(32).toString('base64url'),expiresAt=Date.now()+sessionMs;
    this.db.prepare('INSERT INTO account_sessions (token_hash,account_id,expires_at) VALUES (?,?,?)').run(digest(token),account.id,expiresAt);
    return {account,token,expiresAt};
  }

  setPlan(email,plan){
    if(!Object.hasOwn(ACCOUNT_PLANS,plan))throw new Error('Тарифы: standart, pro, super, vip.');
    const updated=this.db.prepare('UPDATE accounts SET plan=? WHERE email=?').run(plan,normalizeEmail(email));
    if(!updated.changes)throw new Error('Аккаунт не найден.');
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [command,email,plan]=process.argv.slice(2);
  if(command!=='set-plan'||!email||!plan)throw new Error('node api/accounts.mjs set-plan EMAIL PLAN');
  const accounts=new Accounts(path.resolve(process.env.PICPAC_JOB_DIRECTORY||'api/.data'));
  try{accounts.setPlan(email,plan);console.log(`Тариф обновлён: ${ACCOUNT_PLANS[plan].name}.`);}
  finally{accounts.db.close();}
}
