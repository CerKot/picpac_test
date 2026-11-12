import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPrice,totals,makeOrder,preflight} from '../dist/data.js';
test('Print copies and selected size affect price',()=>{
 assert.equal(projectPrice({type:'prints',format:'15×20',photos:[{copies:2},{copies:3}]}),8);
});
test('Discount is rounded in currency and shipping threshold is checked after discount',()=>{
 const cart=[{price:81,quantity:2}];
 assert.deepEqual(totals(cart,'PIC10','post'),{subtotal:162,discount:16.2,shipping:5.9,total:151.7});
 assert.equal(totals(cart,'','post').shipping,0);
 assert.equal(totals(cart,'INVALID','pickup').discount,0);
});
test('Repeated checkout attempt returns original order without charging again',()=>{
 const state={cart:[{price:70,quantity:1,snapshot:{photos:[{id:'original'}]}}],orders:[],promo:''};
 const o=makeOrder(state,'attempt-1',{name:'Тест'},'pickup');
 assert.equal(state.cart.length,0);assert.equal(makeOrder(state,'attempt-1',{},'courier').id,o.id);assert.equal(state.orders.length,1);
 assert.throws(()=>makeOrder(state,'attempt-2',{},'pickup'),/Корзина пуста/);
});
test('Order snapshots do not change when source items are edited',()=>{
 const item={price:12,quantity:1,snapshot:{photos:[{id:'original',x:20}]}};
 const state={cart:[item],orders:[],promo:''};
 const o=makeOrder(state,'attempt',{},'pickup');item.snapshot.photos[0].x=90;
 assert.equal(o.items[0].snapshot.photos[0].x,20);
});
test('Document preflight rejects insufficient resolution and never returns acceptance probability',()=>{
 const result=preflight({type:'docs',docId:'us',photos:[{id:'tiny',width:200,height:300},{id:'ok',width:1200,height:1800}]});
 assert.equal(result[0].low,true);assert.equal(result[1].low,false);assert.equal('probability' in result[1],false);
});
