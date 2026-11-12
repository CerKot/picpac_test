import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDocument,CaptureStability,documentSignature,documentAuditGate} from '../dist/document-quality.js';
import {poseFromMatrix} from '../dist/document-validator.js';
import {makeOrder} from '../dist/data.js';
const neutral={faceCount:1,geometryAvailable:true,top:.12,bottom:.68,left:.25,right:.75,faceHeight:.56,eyeX:.5,eyeY:.37,yaw:0,pitch:0,roll:0,blinkLeft:.05,blinkRight:.04,mouthOpen:.02,smile:.05,meanLuma:145,leftLuma:142,rightLuma:148,blackRatio:0,whiteRatio:0,sharpness:90};
test('Capture guidance distinguishes absent, multiple, distant, close and rotated faces',()=>{
 assert.equal(assessDocument(neutral).ready,true);
 for(const values of [{faceCount:0},{faceCount:2},{faceHeight:.2},{faceHeight:.82},{yaw:30},{pitch:25},{roll:15},{blinkLeft:.8},{mouthOpen:.6}])assert.equal(assessDocument({...neutral,...values}).canCapture,false,JSON.stringify(values));
 assert.match(assessDocument({...neutral,faceHeight:.2},{live:true}).hint,/Приблизьте/);
 assert.match(assessDocument({...neutral,faceHeight:.8},{live:true}).hint,/Отдалите/);
 assert.match(assessDocument({...neutral,eyeY:.2},{live:true}).hint,/приподнимите/);
 assert.match(assessDocument({...neutral,eyeY:.6},{live:true}).hint,/опустите/);
});
test('Poor lighting is specific; uncertain sharpness goes to review rather than a fake acceptance score',()=>{
 assert.match(assessDocument({...neutral,blackRatio:.8}).hint,/тёмное/);
 assert.match(assessDocument({...neutral,whiteRatio:.7}).hint,/засветка/);
 const uncertain=assessDocument({...neutral,sharpness:5});assert.equal(uncertain.status,'review');assert.equal(uncertain.ready,false);assert.equal(uncertain.canCapture,true);assert.equal('acceptanceProbability' in uncertain,false);
});
test('Capture requires a stable recent sequence and immediately resets after lost face',()=>{
 const gate=new CaptureStability(),good=assessDocument(neutral),bad=assessDocument({faceCount:0});
 for(const at of [0,250,500,750,1000])assert.equal(gate.update(good,at).stable,false);
 assert.equal(gate.update(good,1250).stable,true);assert.equal(gate.canCapture(2100),false);
 gate.update(bad,1500);assert.equal(gate.canCapture(1500),false);assert.equal(gate.update(good,1750).stable,false);
});
test('Changing crop, document or source invalidates a prior audit and checkout rejects stale document snapshots',()=>{
 const p={type:'docs',docId:'by',photos:[{id:'photo-a',x:50,y:50,width:1200,height:1600}]};p.docAudit={...assessDocument(neutral),signature:documentSignature(p)};
 assert.equal(documentAuditGate(p).ready,true);
 for(const altered of [{...p,docId:'us'},{...p,photos:[{...p.photos[0],x:60}]},{...p,photos:[{...p.photos[0],id:'photo-b'}]}])assert.equal(documentAuditGate(altered).ready,false);
 const state={orders:[],cart:[{snapshot:{...p,docId:'us'},price:12,quantity:1}],promo:''};assert.throws(()=>makeOrder(state,'attempt',{},'pickup'),/валидатором/);assert.equal(state.orders.length,0);
});
test('Column-major rotation exposes head turn and vertical tilt without claiming camera motion',()=>{
 const deg=Math.PI/180,c=Math.cos(30*deg),s=Math.sin(30*deg);
 const yaw=poseFromMatrix({data:[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,-40,1]});assert.ok(Math.abs(yaw.yaw-30)<1e-8);assert.ok(Math.abs(yaw.pitch)<1e-8);
 const pitch=poseFromMatrix({data:[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,-40,1]});assert.ok(Math.abs(pitch.pitch-30)<1e-8);assert.equal(pitch.yaw,0);
 assert.equal(Number.isNaN(poseFromMatrix(null).yaw),true);
});
