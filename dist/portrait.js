import {inspectDocumentCanvas} from './document-validator.js';
import {planPortraitLight,compositePortrait,portraitGeometry,planPortraitTransform} from './portrait-processing.js';
export {planPortraitLight,compositePortrait,portraitGeometry,planPortraitTransform} from './portrait-processing.js';
let runtimePromise;
async function getRuntime(){
 return runtimePromise||=(async()=>{
  const {FilesetResolver,ImageSegmenter}=await import('./assets/mediapipe/vision_bundle.mjs');
  const fileset=await FilesetResolver.forVisionTasks(new URL('./assets/mediapipe/wasm',import.meta.url).href);
  return ImageSegmenter.createFromOptions(fileset,{baseOptions:{delegate:'CPU',modelAssetPath:new URL('./assets/mediapipe/selfie_segmenter.tflite',import.meta.url).href},runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true});
 })().catch(error=>{runtimePromise=null;throw error;});
}
export class PortraitError extends Error{constructor(code,message){super(message);this.code=code;}}
// Compatibility helper for the original compositing API.
export function blendForeground(pixels,mask,exposure=1){
 const out=new Uint8ClampedArray(pixels.length);exposure=Math.max(1,Math.min(1.12,Number.isFinite(exposure)?exposure:1));
 for(let i=0;i<mask.length;i++){const a=Math.max(0,Math.min(1,(mask[i]-.08)/.84));for(let c=0;c<3;c++)out[i*4+c]=Math.min(255,pixels[i*4+c]*exposure)*a+255*(1-a);out[i*4+3]=255;}return out;
}
const yieldPaint=()=>new Promise(resolve=>setTimeout(resolve,20));
export async function preparePhotoLight(blob,{onStage=()=>{}}={}){
 onStage('Оцениваем свет на фотографии…');await yieldPaint();
 const bitmap=await createImageBitmap(blob),scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),mask=new Float32Array(canvas.width*canvas.height).fill(1);
 const face={left:.05,right:.95,top:0,bottom:1},light=planPortraitLight(pixels.data,mask,canvas.width,canvas.height,face);
 // General photographs retain their existing illumination direction and background.
 light.sideGains=[1,1];light.changed=light.gain>1.04;
 onStage(light.changed?'Мягко осветляем тени…':'Освещение уже достаточное — сохраняем его…');await yieldPaint();
 ctx.putImageData(new ImageData(compositePortrait(pixels.data,mask,canvas.width,canvas.height,light,face),canvas.width,canvas.height),0,0);
 const result=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.96));if(!result)throw new Error('Не удалось сохранить результат.');
 return {blob:result,width:canvas.width,height:canvas.height,meta:{engine:'picpac-light-2',light:{changed:light.changed,gain:light.gain},processing:'on-device'}};
}
async function inspect(canvas){
 const probe=document.createElement('canvas'),scale=Math.min(1,640/Math.max(canvas.width,canvas.height));
 probe.width=Math.round(canvas.width*scale);probe.height=Math.round(canvas.height*scale);probe.getContext('2d').drawImage(canvas,0,0,probe.width,probe.height);
 return inspectDocumentCanvas(probe);
}
export async function preparePortrait(blob,{softLight=true,targetRatio=.8,onStage=()=>{}}={}){
 if(!Number.isFinite(targetRatio)||targetRatio<.5||targetRatio>1.5)throw new PortraitError('FORMAT','Неизвестные пропорции снимка.');
 const stage=async text=>{onStage(text);await yieldPaint();};
 await stage('Находим лицо и измеряем наклон…');
 const bitmap=await createImageBitmap(blob),factor=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
 const source=document.createElement('canvas');source.width=Math.round(bitmap.width*factor);source.height=Math.round(bitmap.height*factor);
 const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,source.width,source.height);bitmap.close();
 const analysis=await inspect(source),m=analysis.metrics;
 if(m.faceCount!==1||!analysis.landmarks)throw new PortraitError('FACE_COUNT',m.faceCount>1?'В кадре несколько лиц. Нужен снимок одного человека.':'Лицо не удалось найти. Нужен более чёткий и светлый снимок.');
 if(!Number.isFinite(m.yaw+m.pitch)||Math.abs(m.yaw)>13||Math.abs(m.pitch)>14)throw new PortraitError('HEAD_TURN','Повернитесь прямо к камере. Разворот головы нельзя исправить без изменения внешности.');
 if(Math.max(m.blinkLeft,m.blinkRight)>.55||m.mouthOpen>.22||m.smile>.48)throw new PortraitError('EXPRESSION','Откройте глаза и расслабьте лицо. Нужен новый снимок.');
 const geometry=portraitGeometry(analysis.landmarks,source.width,source.height);
 await stage('Отделяем волосы и плечи от фона…');
 let segmenter;try{segmenter=await getRuntime();}catch{throw new PortraitError('MODEL_UNAVAILABLE','Модель не загрузилась. Проверьте соединение и повторите.');}
 const segmentation=segmenter.segment(source);let mask;
 try{if(segmentation.confidenceMasks?.length!==1)throw new Error('Unexpected mask');mask=new Float32Array(segmentation.confidenceMasks[0].getAsFloat32Array());}finally{segmentation.close();}
 if(mask.length!==source.width*source.height)throw new PortraitError('MASK_SIZE','Не удалось выделить силуэт. Попробуйте другой снимок.');
 let foreground=0;for(const v of mask)if(v>.65)foreground++;
 if(foreground/mask.length<.06||foreground/mask.length>.94)throw new PortraitError('MASK_UNCERTAIN','Силуэт сливается с фоном. Отойдите от стены и переснимите.');
 const pixels=ctx.getImageData(0,0,source.width,source.height);
 const light=planPortraitLight(pixels.data,mask,source.width,source.height,m,{enabled:softLight});
 await stage(light.changed?'Осветляем тени и выравниваем свет…':'Сохраняем естественное освещение…');
 ctx.putImageData(new ImageData(compositePortrait(pixels.data,mask,source.width,source.height,light,m,{protectFace:true}),source.width,source.height),0,0);
 let headTop=Math.round(m.top*source.height);
 const left=Math.max(0,Math.floor(m.left*source.width)),right=Math.min(source.width,Math.ceil(m.right*source.width));
 for(let y=0;y<headTop;y++){let count=0;for(let x=left;x<right;x++)if(mask[y*source.width+x]>.75)count++;if(count>Math.max(5,(right-left)*.14)){headTop=y;break;}}
 const height=Math.floor(Math.min(source.height,source.width/targetRatio,1600)),width=Math.round(height*targetRatio);
 const transform=planPortraitTransform(geometry,source.width,source.height,width,height,{headTop});
 await stage('Выравниваем линию глаз и центрируем портрет…');
 const output=document.createElement('canvas');output.width=width;output.height=height;
 const out=output.getContext('2d');out.fillStyle='#fff';out.fillRect(0,0,width,height);out.imageSmoothingQuality='high';out.setTransform(transform.a,transform.b,transform.c,transform.d,transform.e,transform.f);out.drawImage(source,0,0);out.resetTransform();
 await stage('Проверяем свет и положение после обработки…');
 const verified=await inspect(output),after=verified.metrics;
 if(after.faceCount!==1||!Number.isFinite(after.roll)||Math.abs(after.roll)>2.5)throw new PortraitError('ALIGNMENT','Не удалось уверенно выровнять лицо. Попробуйте более фронтальный снимок.');
 if(after.blackRatio>.65||after.whiteRatio>.5)throw new PortraitError('LIGHT','Свет не удалось исправить без потери деталей. Переснимите при мягком дневном свете.');
 const result=await new Promise(resolve=>output.toBlob(resolve,'image/jpeg',.96));if(!result)throw new PortraitError('EXPORT_FAILED','Не удалось сохранить обработанный снимок.');
 return {blob:result,width,height,meta:{engine:'picpac-studio-3',model:'selfie_segmenter-float16-1',background:'#FFFFFF',light:{changed:light.changed,gain:light.gain,before:Math.round(light.before),after:Math.round(light.after)},rotationDegrees:transform.rotationDegrees,centered:true,quality:verified.report,processing:'on-device',reviewRequired:true,createdAt:new Date().toISOString()}};
}
