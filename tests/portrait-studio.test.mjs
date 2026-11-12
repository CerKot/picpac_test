import test from 'node:test';
import assert from 'node:assert/strict';
import {planPortraitLight,compositePortrait,planPortraitTransform,transformPortraitPoint} from '../dist/portrait-processing.js';
import {AutoCaptureGate,assessDocument} from '../dist/document-quality.js';
import {normalizePromo,totals} from '../dist/data.js';

const face={left:.1,right:.9,top:.1,bottom:.9};
function fixture(value){const pixels=new Uint8ClampedArray(64*80*4),mask=new Float32Array(64*80).fill(1);for(let i=0;i<mask.length;i++)pixels.set([value,value,value,255],i*4);return {pixels,mask};}
test('Dark portraits receive meaningful shadow recovery, keep white background, and leave the source unchanged',()=>{
 const {pixels,mask}=fixture(55),original=pixels.slice();mask[0]=0;pixels.set([245,245,245,255],4);
 const light=planPortraitLight(pixels,mask,64,80,face),out=compositePortrait(pixels,mask,64,80,light,face);
 assert.ok(light.changed);assert.ok(light.gain>2);assert.ok(out[8]>110);assert.ok(out[4]>=245&&out[4]<255);
 assert.deepEqual([...out.slice(0,4)],[255,255,255,255]);assert.deepEqual([...pixels.slice(8)],[...original.slice(8)]);
});
test('Adequate lighting and the disabled-light option preserve original colours; unrecoverable shadows fail explicitly',()=>{
 for(const [value,enabled] of [[172,true],[55,false]]){const {pixels,mask}=fixture(value);const light=planPortraitLight(pixels,mask,64,80,face,{enabled});assert.equal(light.gain,1);assert.deepEqual(compositePortrait(pixels,mask,64,80,light,face),pixels);}
 const {pixels,mask}=fixture(8);assert.throws(()=>planPortraitLight(pixels,mask,64,80,face),/потеряны детали/);
});
test('Portrait rotation levels the actual eye line, centers it and keeps the output within the source',()=>{
 const eyes=[{x:290,y:360},{x:510,y:380}],center={x:400,y:370};
 const geometry={eyes,center,angle:Math.atan2(20,220),forehead:{x:410,y:220},chin:{x:375,y:730}};
 const t=planPortraitTransform(geometry,800,1000,640,800,{headTop:105});
 const a=transformPortraitPoint(eyes[0],t),b=transformPortraitPoint(eyes[1],t);
 assert.ok(Math.abs(a.y-b.y)<1e-8);assert.ok(Math.abs((a.x+b.x)/2-320)<1e-8);assert.ok(Math.abs((a.y+b.y)/2-312)<1e-8);
 const det=t.a*t.d-t.b*t.c;
 for(const x of [0,640])for(const y of [0,800]){const sx=(t.d*(x-t.e)-t.c*(y-t.f))/det,sy=(-t.b*(x-t.e)+t.a*(y-t.f))/det;assert.ok(sx>=0&&sx<=800);assert.ok(sy>=0&&sy<=1000);}
 assert.throws(()=>planPortraitTransform(geometry,800,1000,640,800,{headTop:0}),/не хватает места/);
});
test('Auto capture fires once only after all checks stay ready; warning, hidden page, mode change and stale frames cancel it',()=>{
 const gate=new AutoCaptureGate(),good={ready:true},warning={ready:false,canCapture:true};
 for(const at of [0,250,500,750,1000,1250,1500,1750])assert.equal(gate.update(good,at).trigger,false);
 assert.equal(gate.update(good,2000).trigger,true);assert.equal(gate.update(good,2250).trigger,false);
 for(const stop of [()=>gate.update(warning,750),()=>gate.update(good,750,{enabled:false}),()=>gate.update(good,750,{visible:false}),()=>gate.update(good,2500)]){
  gate.reset();gate.update(good,0);gate.update(good,500);stop();assert.equal(gate.update(good,2750).trigger,false);
 }
});
test('Auto capture also completes on a slow device analysing one frame per second',()=>{
 const gate=new AutoCaptureGate();assert.equal(gate.update({ready:true},0).trigger,false);assert.equal(gate.update({ready:true},1000).trigger,false);assert.equal(gate.update({ready:true},2000).trigger,true);
});
test('Promo accepts the spacing and letter case from the reported mobile screenshot',()=>{
 for(const code of ['Pic 10',' pic10 ','PIC\u00a010','ＰＩＣ１０']){assert.equal(normalizePromo(code),'PIC10');assert.equal(totals([{price:12,quantity:1}],code).total,10.8);}
 assert.equal(totals([{price:12,quantity:1}],'PIC11').discount,0);
});
test('A small tilt is correctable in a still image but prevents an automatic camera shot',()=>{
 const m={faceCount:1,geometryAvailable:true,top:.12,bottom:.68,left:.25,right:.75,faceHeight:.56,eyeX:.5,eyeY:.37,yaw:0,pitch:0,roll:5,blinkLeft:.05,blinkRight:.04,mouthOpen:.02,smile:.05,meanLuma:145,leftLuma:142,rightLuma:148,blackRatio:0,whiteRatio:0,sharpness:90};
 assert.equal(assessDocument(m).canCapture,true);assert.equal(assessDocument(m).ready,false);assert.equal(assessDocument(m,{live:true}).canCapture,false);
 assert.equal(assessDocument({...m,yaw:22}).canCapture,false);
});
