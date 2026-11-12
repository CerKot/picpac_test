// Product heuristics for capture assistance, not legal/ICAO certification.
export const VALIDATOR_VERSION='picpac-cv-1';
const check=(id,label,status,message)=>({id,label,status,message});
export function assessDocument(m,{live=false}={}){
 const checks=[];
 const add=(id,label,bad,message,warning=false)=>checks.push(check(id,label,bad?(warning?'warn':'fail'):'pass',bad?message:'Базовая проверка пройдена'));
 add('face','Одно видимое лицо',m.faceCount!==1,m.faceCount>1?'В кадре должен быть только один человек.':'Лицо не видно достаточно хорошо. Повернитесь к камере, уберите препятствия и добавьте света.');
 if(m.faceCount===1&&m.geometryAvailable){
  const cut=m.top<.025||m.bottom>.98||m.left<.02||m.right>.98;
  const close=m.faceHeight>.74||cut,far=m.faceHeight<.36;
  add('distance','Размер лица в кадре',close||far,close?'Отдалите камеру: лицо и волосы должны помещаться целиком.':live?'Приблизьте камеру: лицо слишком маленькое в кадре.':'Лицо слишком мелкое. Загрузите более крупный портрет с головой и плечами.');
  const vertical=m.eyeY<.28||m.eyeY>.49,horizontal=Math.abs(m.eyeX-.5)>.12;
  add('position','Положение в кадре',vertical||horizontal,vertical?(live?(m.eyeY<.28?'Чуть приподнимите камеру, сохраняя голову прямо.':'Немного опустите камеру, сохраняя голову прямо.'):'Расположите глаза ближе к линии в кадре: измените кадрирование или снимок.'):'Сместите лицо к центру овала.');
  const yaw=Math.abs(m.yaw),pitch=Math.abs(m.pitch),roll=Math.abs(m.roll);
  add('pose','Лицо прямо к камере',!Number.isFinite(yaw+pitch+roll)||yaw>13||pitch>14||roll>8,yaw>13?'Поверните лицо полностью к камере. Должны быть видны обе стороны лица.':roll>8?'Выпрямите голову: линия глаз должна быть горизонтальной.':'Держите телефон на уровне глаз и смотрите прямо.');
  add('eyes','Открытые глаза',!Number.isFinite(m.blinkLeft+m.blinkRight)||Math.max(m.blinkLeft,m.blinkRight)>.55,'Откройте оба глаза и смотрите в объектив. Уберите волосы с глаз.');
  add('expression','Спокойное выражение',!Number.isFinite(m.mouthOpen+m.smile)||m.mouthOpen>.22||m.smile>.48,'Мягко сомкните губы и расслабьте лицо. Для документа нужна нейтральная мимика.');
  const dark=m.blackRatio>.65,bright=m.whiteRatio>.5,uneven=Math.abs(m.leftLuma-m.rightLuma)>42&&Math.max(m.leftLuma,m.rightLuma)/Math.max(1,Math.min(m.leftLuma,m.rightLuma))>1.8;
  const uncertainLight=!Number.isFinite(m.meanLuma)||m.meanLuma<60||m.meanLuma>224||uneven;
  checks.push(check('light','Освещение лица',dark||bright?'fail':uncertainLight?'warn':'pass',dark?'Лицо слишком тёмное. Повернитесь к окну или добавьте мягкий свет.':bright?'На лице сильная засветка. Отойдите от прямого света.':uneven?'Одна сторона лица темнее. Повернитесь к источнику мягкого света.':uncertainLight?'Проверьте освещение: детали лица должны быть хорошо различимы.':'Грубых проблем освещения не обнаружено'));
  add('sharpness','Чёткость',!Number.isFinite(m.sharpness)||m.sharpness<20,live?'Держите телефон неподвижно. Протрите объектив и дождитесь фокуса.':'Снимок может быть размыт. Выберите оригинал без сжатия или переснимите.',true);
 }else for(const [id,label] of [['distance','Размер лица в кадре'],['position','Положение в кадре'],['pose','Лицо прямо к камере'],['eyes','Открытые глаза'],['expression','Спокойное выражение'],['light','Освещение лица'],['sharpness','Чёткость']])checks.push(check(id,label,'unknown','Нужно хорошо различимое лицо.'));
 const failed=checks.some(c=>c.status==='fail'||c.status==='unknown'),warnings=checks.some(c=>c.status==='warn');
 return {version:VALIDATOR_VERSION,status:failed?'needs_changes':warnings?'review':'ready',canCapture:!failed,ready:!failed&&!warnings,checks,hint:checks.find(c=>c.status==='fail')?.message||checks.find(c=>c.status==='warn')?.message||(live?'Положение подходит для снимка. Сохраняйте позу.':'Явных проблем в базовых проверках не обнаружено. Требования ведомства подтвердит специалист.'),passed:checks.filter(c=>c.status==='pass').length,total:checks.length};
}
export function documentSignature(p){const ph=p.photos?.[0];return JSON.stringify([VALIDATOR_VERSION,p.docId,ph?.id,ph?.x??50,ph?.y??50,ph?.fit||'cover']);}
export function documentAuditCurrent(p){return !!p?.docAudit&&p.docAudit.signature===documentSignature(p)&&p.docAudit.version===VALIDATOR_VERSION;}
export function documentAuditGate(p){
 if(!documentAuditCurrent(p))return {ready:false,message:'Сначала проверьте текущий снимок валидатором.'};
 if(!p.docAudit.canCapture)return {ready:false,message:p.docAudit.hint||'Для документа нужен другой снимок.'};
 return {ready:true,message:''};
}
// Debounce guidance and require continuous recent evidence before enabling capture.
export class CaptureStability {
 constructor(){this.reset();}
 reset(){this.since=null;this.last=-Infinity;this.report=null;this.hint='Расположите лицо в овале.';this.candidate='';this.count=0;}
 update(report,now){
  if(now-this.last>800)this.since=null;
  this.last=now;this.report=report;
  if(!report.canCapture)this.since=null;else if(this.since===null)this.since=now;
  if(this.candidate===report.hint)this.count++;else{this.candidate=report.hint;this.count=1;}
  if(this.count>=2||!report.canCapture&&report.checks[0].status==='fail')this.hint=report.hint;
  return {hint:this.hint,stable:this.canCapture(now),progress:this.since===null?0:Math.min(1,(now-this.since)/1100)};
 }
 canCapture(now){return !!this.report?.canCapture&&this.since!==null&&now-this.since>=1100&&now-this.last<700;}
}
