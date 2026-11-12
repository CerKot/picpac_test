import {studioProfile} from './document-studio-profile.js';
import {documentAuditGate} from './document-quality.js';
import {inspectDocumentCanvas} from './document-validator.js';
import {planPortraitLight,compositePortrait} from './portrait-processing.js';

export function studioEligibility(project,{low=false}={}){
  if(!studioProfile(project.docId))return {ready:false,message:'Для этого документа доступна проверка исходного снимка.'};
  if(!project.photos?.[0]||low)return {ready:false,message:'Нужен исходный портрет большего размера.'};
  const gate=documentAuditGate(project);
  if(!gate.ready)return gate;
  const sharpness=project.docAudit.checks?.find(check=>check.id==='sharpness');
  if(sharpness?.status!=='pass')return {ready:false,message:sharpness?.message||'Перед обработкой нужен чёткий портрет.'};
  return {ready:true,message:''};
}

function canvas(width,height){
  const target=document.createElement('canvas');target.width=width;target.height=height;
  const ctx=target.getContext('2d');ctx.fillStyle='#FFF';ctx.fillRect(0,0,width,height);
  return [target,ctx];
}
const asJpeg=target=>new Promise((resolve,reject)=>target.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось подготовить JPEG.')),'image/jpeg',.95));

export async function prepareStudioReference(blob){
  if(!blob)throw new Error('Исходный файл недоступен. Загрузите его снова.');
  const bitmap=await createImageBitmap(blob);
  let target;
  try{
    const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
    const [image,ctx]=canvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale)));
    target=image;ctx.drawImage(bitmap,0,0,image.width,image.height);
  }finally{bitmap.close();}
  // Re-encode the full original, without edits, file name or EXIF.
  const data=target.toDataURL('image/jpeg',.95).split(',')[1];
  if(!data||data.length>Math.floor(5*1024*1024/3)*4)throw new Error('Фото слишком большое для отправки.');
  return {mimeType:'image/jpeg',data};
}

export async function finishStudioPreview(blob,doc){
  const bitmap=await createImageBitmap(blob),ratio=doc.width/doc.height;
  let target;
  try{
    const width=Math.min(bitmap.width,bitmap.height*ratio),height=width/ratio;
    if(width*height/(bitmap.width*bitmap.height)<.72)throw new Error('Модель вернула кадр неподходящих пропорций.');
    const scale=Math.min(1,2000/Math.max(width,height));
    const [image,ctx]=canvas(Math.round(width*scale),Math.round(height*scale));
    if(image.width<doc.pxW||image.height<doc.pxH)throw new Error('Модель вернула слишком маленькое изображение.');
    target=image;ctx.drawImage(bitmap,(bitmap.width-width)/2,(bitmap.height-height)/2,width,height,0,0,image.width,image.height);
  }finally{bitmap.close();}
  const scale=Math.min(1,640/Math.max(target.width,target.height));
  const [probe,ctx]=canvas(Math.round(target.width*scale),Math.round(target.height*scale));
  ctx.drawImage(target,0,0,probe.width,probe.height);
  let {report,metrics}=await inspectDocumentCanvas(probe);
  if(report.canCapture&&report.checks.some(check=>check.id==='light'&&check.status==='warn')){
    const light=planPortraitLight(ctx.getImageData(0,0,probe.width,probe.height).data,
      new Float32Array(probe.width*probe.height).fill(1),probe.width,probe.height,metrics);
    if(light.changed){
      const {width,height}=target,output=target.getContext('2d');
      const pixels=output.getImageData(0,0,width,height);
      const corrected=compositePortrait(pixels.data,new Float32Array(width*height).fill(1),width,height,light,metrics);
      output.putImageData(new ImageData(corrected,width,height),0,0);
      ctx.drawImage(target,0,0,probe.width,probe.height);
      ({report}=await inspectDocumentCanvas(probe));
    }
  }
  if(!report.ready){
    throw new Error('Превью не прошло проверку кадра. '+report.hint);
  }
  return {blob:await asJpeg(target),width:target.width,height:target.height};
}
