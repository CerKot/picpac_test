// All inference happens on the device. Model assets are served by PicPac, not a third-party API.
let runtimePromise;
async function getRuntime() {
  runtimePromise ||= (async () => {
    const {FilesetResolver, ImageSegmenter, FaceDetector} = await import('./assets/mediapipe/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks(new URL('./assets/mediapipe/wasm', import.meta.url).href);
    const base = {delegate:'CPU'};
    const [segmenter, detector] = await Promise.all([
      ImageSegmenter.createFromOptions(fileset, {baseOptions:{...base,modelAssetPath:new URL('./assets/mediapipe/selfie_segmenter.tflite',import.meta.url).href},runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true}),
      FaceDetector.createFromOptions(fileset, {baseOptions:{...base,modelAssetPath:new URL('./assets/mediapipe/face_detector.tflite',import.meta.url).href},runningMode:'IMAGE',minDetectionConfidence:0.65})
    ]);
    return {segmenter,detector};
  })().catch(error => {runtimePromise = null; throw error;});
  return runtimePromise;
}
export class PortraitError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
export function blendForeground(pixels, mask, exposure = 1) {
  // Same input colours and geometry. A soft alpha mask blends only the boundary.
  exposure=Math.max(1,Math.min(1.12,Number.isFinite(exposure)?exposure:1));
  const output = new Uint8ClampedArray(pixels.length);
  for(let i=0;i<mask.length;i++){
    const a=Math.max(0,Math.min(1,(mask[i]-.08)/.84));
    for(let c=0;c<3;c++){
      const v=pixels[i*4+c];
      const adjusted=Math.min(255,v*exposure);
      output[i*4+c]=adjusted*a+255*(1-a);
    }
    output[i*4+3]=255;
  }
  return output;
}
export async function preparePortrait(blob,{softLight=true,onStage=()=>{}}={}){
  onStage('Загружаем модель на устройство…');
  let runtime;
  try{runtime=await getRuntime();}catch{throw new PortraitError('MODEL_UNAVAILABLE','Модель не загрузилась. Проверьте интернет и повторите. Исходник сохранён.');}
  onStage('Проверяем, что лицо видно…');
  const bitmap=await createImageBitmap(blob);
  const factor=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*factor);canvas.height=Math.round(bitmap.height*factor);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const detection=runtime.detector.detect(canvas);
  if(detection.detections.length!==1)throw new PortraitError('FACE_COUNT',detection.detections.length?'В кадре несколько лиц. Загрузите снимок одного человека.':'Лицо не удалось уверенно найти. Сделайте фото ближе, при хорошем освещении.');
  const box=detection.detections[0].boundingBox;
  if(!box || box.width<canvas.width*.12 || box.height<canvas.height*.12)throw new PortraitError('FACE_TOO_SMALL','Лицо слишком далеко. Снимите крупнее, оставив голову и плечи в кадре.');
  onStage('Отделяем человека от фона…');
  // The pinned SelfieSegmenter has a single label: "selfie". Its confidenceMasks[0] is foreground.
  const segmentation=runtime.segmenter.segment(canvas);
  let mask;
  try {
    const labels=runtime.segmenter.getLabels();
    if(segmentation.confidenceMasks?.length!==1 || (labels.length && labels[0]!=='selfie'))throw new Error('Unexpected model labels');
    mask=new Float32Array(segmentation.confidenceMasks[0].getAsFloat32Array());
  }finally{segmentation.close();}
  if(mask.length!==canvas.width*canvas.height)throw new PortraitError('MASK_SIZE','Не удалось построить маску. Попробуйте другой снимок.');
  const count=mask.reduce((sum,v)=>sum+(v>.65?1:0),0),coverage=count/mask.length;
  if(coverage<.06 || coverage>.94)throw new PortraitError('MASK_UNCERTAIN','Силуэт сливается с фоном. Отойдите от стены и повторите фото.');
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);let faceLuma=0,n=0;
  for(let y=Math.max(0,Math.floor(box.originY));y<Math.min(canvas.height,box.originY+box.height);y++){
    for(let x=Math.max(0,Math.floor(box.originX));x<Math.min(canvas.width,box.originX+box.width);x++){
      const i=y*canvas.width+x;if(mask[i]>.85){faceLuma+=.2126*pixels.data[i*4]+.7152*pixels.data[i*4+1]+.0722*pixels.data[i*4+2];n++;}
    }
  }
  const mean=n?faceLuma/n:150;
  if(mean<42)throw new PortraitError('TOO_DARK','Лицо слишком тёмное. Повернитесь к окну и переснимите: сильную недосветку исправлять не будем.');
  const exposure=softLight?Math.min(1.12,Math.max(1,132/mean)):1;
  onStage('Собираем белый фон и мягкий свет…');
  ctx.putImageData(new ImageData(blendForeground(pixels.data,mask,exposure),canvas.width,canvas.height),0,0);
  const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.96));
  if(!output)throw new PortraitError('EXPORT_FAILED','Не удалось сохранить результат. Повторите обработку.');
  return {blob:output,width:canvas.width,height:canvas.height,meta:{engine:'mediapipe-0.10.21',model:'selfie_segmenter-float16-1',faceDetector:'blazeface-short-range',faceCount:1,background:'#FFFFFF',exposure,processing:'on-device',reviewRequired:true,createdAt:new Date().toISOString()}};
}
