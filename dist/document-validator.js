import {assessDocument,CaptureStability} from './document-quality.js';
let runtimePromise,mode='IMAGE',serial=Promise.resolve();
async function getRuntime(){
 return runtimePromise||=(async()=>{
  const {FaceLandmarker,FilesetResolver}=await import('./assets/mediapipe/vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks(new URL('./assets/mediapipe/wasm',import.meta.url).href);
  return FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./assets/mediapipe/face_landmarker.task',import.meta.url).href,delegate:'CPU'},runningMode:'IMAGE',numFaces:2,minFaceDetectionConfidence:.65,minFacePresenceConfidence:.65,minTrackingConfidence:.65,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true});
 })().catch(error=>{runtimePromise=null;throw error;});
}
export function drawCameraFrame(video,canvas,ratio){
 canvas.width=Math.round(640*ratio);canvas.height=640;
 const scale=Math.max(canvas.width/video.videoWidth,canvas.height/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale;
 canvas.getContext('2d',{willReadFrequently:true}).drawImage(video,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
}
export function poseFromMatrix(matrix){
 const m=matrix?.data;if(!m||m.length!==16)return {yaw:NaN,pitch:NaN};
 // MediaPipe 0.10.21: column-major canonical→runtime matrix, positive z face normal.
 const n=Math.hypot(m[8],m[9],m[10]);if(!n)return {yaw:NaN,pitch:NaN};
 return {yaw:Math.atan2(m[8]/n,m[10]/n)*180/Math.PI,pitch:Math.atan2(-m[9]/n,Math.hypot(m[8],m[10])/n)*180/Math.PI};
}
function lightMetrics(canvas,lm){
 const probe=document.createElement('canvas'),scale=Math.min(1,400/canvas.height);probe.width=Math.round(canvas.width*scale);probe.height=Math.round(canvas.height*scale);
 const ctx=probe.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,probe.width,probe.height);
 const {data}=ctx.getImageData(0,0,probe.width,probe.height),w=probe.width,h=probe.height;
 const luma=(x,y)=>{const i=(Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x)))*4;return .2126*data[i]+.7152*data[i+1]+.0722*data[i+2];};
 const eyeSpan=Math.abs(lm[33].x-lm[263].x)*w,r=Math.max(2,Math.round(eyeSpan*.12));
 const patches=[50,280,4].map(index=>{const x=Math.round(lm[index].x*w),y=Math.round(lm[index].y*h),a=[];for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r)a.push(luma(x+dx,y+dy));return a;});
 const all=patches.flat(),mean=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
 const x0=Math.max(1,Math.floor(Math.min(lm[234].x,lm[454].x)*w)),x1=Math.min(w-2,Math.ceil(Math.max(lm[234].x,lm[454].x)*w));
 const y0=Math.max(1,Math.floor(lm[10].y*h)),y1=Math.min(h-2,Math.ceil(lm[152].y*h));
 let sum=0,sq=0,count=0;for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){const v=luma(x-1,y)+luma(x+1,y)+luma(x,y-1)+luma(x,y+1)-4*luma(x,y);sum+=v;sq+=v*v;count++;}
 return {meanLuma:mean(all),leftLuma:mean(patches[0]),rightLuma:mean(patches[1]),blackRatio:all.filter(v=>v<25).length/all.length,whiteRatio:all.filter(v=>v>246).length/all.length,sharpness:count?sq/count-(sum/count)**2:0};
}
function measures(result,canvas){
 const lm=result.faceLandmarks?.[0];if(result.faceLandmarks?.length!==1||!lm?.[478-1])return {faceCount:result.faceLandmarks?.length||0,geometryAvailable:false};
 const a={x:(lm[33].x+lm[133].x)/2,y:(lm[33].y+lm[133].y)/2},b={x:(lm[263].x+lm[362].x)/2,y:(lm[263].y+lm[362].y)/2};
 const blends=Object.fromEntries((result.faceBlendshapes?.[0]?.categories||[]).map(x=>[x.categoryName,x.score]));
 const bounds=lm.slice(0,468),left=Math.min(...bounds.map(p=>p.x)),right=Math.max(...bounds.map(p=>p.x)),top=Math.min(...bounds.map(p=>p.y)),bottom=Math.max(...bounds.map(p=>p.y));
 return {faceCount:1,geometryAvailable:true,left,right,top,bottom,faceHeight:bottom-top,eyeX:(a.x+b.x)/2,eyeY:(a.y+b.y)/2,roll:Math.atan2((b.y-a.y)*canvas.height,(b.x-a.x)*canvas.width)*180/Math.PI,...poseFromMatrix(result.facialTransformationMatrixes?.[0]),blinkLeft:blends.eyeBlinkLeft,blinkRight:blends.eyeBlinkRight,mouthOpen:blends.jawOpen,smile:Math.max(blends.mouthSmileLeft??NaN,blends.mouthSmileRight??NaN),...lightMetrics(canvas,lm)};
}
export function inspectDocumentCanvas(canvas,{live=false,timestamp=performance.now(),onStage=()=>{}}={}){
 const task=serial.catch(()=>{}).then(async()=>{
  if(!live)await onStage('Загружаем проверку лица…');
  const model=await getRuntime(),next=live?'VIDEO':'IMAGE';if(mode!==next){await model.setOptions({runningMode:next});mode=next;}
  if(!live)await onStage('Сканируем лицо, проверяем свет и резкость…');
  const result=live?model.detectForVideo(canvas,timestamp):model.detect(canvas);
  const metrics=measures(result,canvas),report=assessDocument(metrics,{live});
  return {report,landmarks:result.faceLandmarks?.length===1?result.faceLandmarks[0]:null,metrics};
 });serial=task;return task;
}
// Transient display coordinates only; never persisted with a document audit.
export function scanFrameBounds(metrics,{mirror=false}={}){
 if(metrics?.faceCount!==1||![metrics.left,metrics.right,metrics.top,metrics.bottom].every(Number.isFinite)||metrics.left>=metrics.right||metrics.top>=metrics.bottom)return null;
 const clamp=v=>Math.max(.035,Math.min(.965,v));
 const left=clamp((mirror?1-metrics.right:metrics.left)-.045),right=clamp((mirror?1-metrics.left:metrics.right)+.045);
 const top=clamp(metrics.top-.045),bottom=clamp(metrics.bottom+.045);
 if(right<=left||bottom<=top)return null;
 return {left:left*100,top:top*100,width:(right-left)*100,height:(bottom-top)*100};
}
function drawOverlay(canvas,landmarks,report){
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!landmarks)return;
 const color=report.ready?'#7CB4A1':report.canCapture?'#D0AB6A':'#DC8A87';
 const points=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
 ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();points.forEach((i,n)=>{const p=landmarks[i];n?ctx.lineTo(p.x*canvas.width,p.y*canvas.height):ctx.moveTo(p.x*canvas.width,p.y*canvas.height);});ctx.closePath();ctx.stroke();
 ctx.lineWidth=2;ctx.beginPath();for(const [n,i] of [33,263].entries()){const p=landmarks[i];n?ctx.lineTo(p.x*canvas.width,p.y*canvas.height):ctx.moveTo(p.x*canvas.width,p.y*canvas.height);}ctx.stroke();
}
export async function startDocumentCameraValidator({video,overlay,ratio,onUpdate,onError}){
 await getRuntime();let stopped=false,raf,last=0;const canvas=document.createElement('canvas'),gate=new CaptureStability();
 overlay.width=Math.round(640*ratio);overlay.height=640;
 const tick=async(now)=>{
  if(stopped)return;
  if(document.hidden||video.readyState<2||!video.videoWidth||now-last<250){raf=requestAnimationFrame(tick);return;}
  last=now;
  try{drawCameraFrame(video,canvas,ratio);const {report,landmarks,metrics}=await inspectDocumentCanvas(canvas,{live:true,timestamp:performance.now()});if(stopped)return;drawOverlay(overlay,landmarks,report);onUpdate(report,gate.update(report,performance.now()),metrics);}
  catch(error){if(!stopped){gate.reset();onError(error);}stopped=true;return;}
  if(!stopped)raf=requestAnimationFrame(tick);
 };
 raf=requestAnimationFrame(tick);
 return {canCapture:()=>gate.canCapture(performance.now()),stop:()=>{stopped=true;cancelAnimationFrame(raf);gate.reset();overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);}};
}
