import {projectReadiness} from './project-rules.js';
export const products=[
 {id:'prints',name:'Фотопечать',category:'prints',image:'prints.jpg',from:1.30,unit:'за фото',tag:'Любимые кадры',color:'pink',description:'Фото с телефона — на настоящей фотобумаге. Для рамки, альбома и маленьких подарков.',details:['От одного отпечатка','Матовая или глянцевая бумага','10 × 15, 15 × 20, 20 × 30 см']},
 {id:'lite',name:'Фотокнига Lite',category:'books',image:'book-lite.png',from:70,tag:'Лёгкая история',color:'yellow',description:'Много тёплых воспоминаний в одной книге. Гибкие страницы и твёрдая обложка — удобно перелистывать всей семьёй.',details:['Твёрдая книжная обложка','Тонкие мелованные страницы','Для большого семейного архива']},
 {id:'classic',name:'Фотокнига Classic',category:'books',image:'book-classic.png',from:81,tag:'Семейная классика',color:'sage',description:'Развороты раскрываются полностью. Большие фотографии, уютные подписи и история, к которой хочется возвращаться.',details:['Плотные страницы','Раскрытие на 180°','Для семейных историй и путешествий']},
 {id:'premium',name:'Фотокнига Premium',category:'books',image:'book-premium.png',from:100.50,tag:'Особенный подарок',color:'peach',description:'Важные события заслуживают особенной книги. Плотная фотобумага и выразительные цвета сохранят каждую деталь.',details:['Настоящая фотобумага','Жёсткие страницы','Для свадьбы, юбилея и большой даты']},
 {id:'documents',name:'Фото на документы',category:'docs',image:null,from:12,tag:'С проверкой специалиста',color:'sage',description:'Снимите фото дома. Подготовьте кадр и передайте его на проверку отделу контроля.',details:['Паспорт, виза или ВНЖ','Направляющие для съёмки','Проверка перед печатью']},
 {id:'postcards',name:'Фотооткрытки',category:'gifts',image:'prints-detail.webp',from:3.5,tag:'Тёплые слова',color:'lavender',description:'Добавьте фотографию и пару слов от себя. Маленький подарок, который останется надолго.',details:['Формат 10 × 15 см','Ваша фотография','Подпись на обороте']}
];
export const templates=[
 {id:'family',name:'Наша семейная история',subtitle:'Для моментов вместе',category:'Семья',image:'template-family.webp',color:'#C4DAD6',title:'Счастье — быть вместе',layout:'duo'},
 {id:'travel',name:'Там, где мы были',subtitle:'Для больших и маленьких поездок',category:'Путешествия',image:'template-travel.webp',color:'#E7D3BA',title:'Наши маленькие открытия',layout:'single'},
 {id:'baby',name:'Первый год',subtitle:'От первого взгляда до первого шага',category:'Дети',image:'template-baby.webp',color:'#EDD5D5',title:'Твой первый год',layout:'duo'},
 {id:'life',name:'Жизнь в фотографиях',subtitle:'Подарок родителям к юбилею',category:'Биография',image:'book-classic.png',color:'#E0DCE8',title:'История, которую мы любим',layout:'story'}
];
export const documents=[
 {id:'by',name:'Паспорт Беларуси',subtitle:'Обычный паспорт · 40 × 50 мм',width:40,height:50,pxW:472,pxH:591,source:'https://base.spinform.ru/show_doc.fwx?rgn=162136',note:'Для обычного паспорта. Для биометрического паспорта и ID-карты уточните порядок съёмки в подразделении. Перед выпуском пресет проверяет специалист.'},
 {id:'schengen',name:'Шенгенская виза',subtitle:'Польша · 35 × 45 мм',width:35,height:45,pxW:413,pxH:531,source:'https://www.gov.pl/web/bialorus/wiza-typu-c',note:'Пресет для визы C в Польшу: светлый однородный фон, лицо занимает 70–80% фото, снимок не старше 6 месяцев. Для другой страны требования нужно сверить.'},
 {id:'residence',name:'ВНЖ в Польше',subtitle:'Вид на жительство · 35 × 45 мм',width:35,height:45,pxW:684,pxH:883,source:'https://www.gov.pl/web/udsc-ru/mos-QA',note:'Цифровая фотография JPG не менее 684 × 883 px, до 2,5 МБ. Окончательный комплект зависит от способа подачи.'},
 {id:'ru',name:'Паспорт России',subtitle:'Внутренний паспорт · 35 × 45 мм',width:35,height:45,pxW:413,pxH:531,source:'https://epp.genproc.gov.ru/upload/iblock/701/11rtwhq8z58el7ebz3gm0lqtlnz21y86.pdf',note:'Внутренний паспорт РФ. Белый ровный фон; поле над головой 5 ± 1 мм; макушка–подбородок не более 80% высоты. Без художественной обработки и улучшения внешности. Постоянно носящим очки нужно отдельно сверить требования к прозрачным очкам. Перед подачей специалист проверяет актуальную редакцию требований.'},
 {id:'us',name:'Виза в США',subtitle:'DS-160 · цифровое фото',width:51,height:51,pxW:600,pxH:600,source:'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html',note:'Нейтральное выражение лица, белый или светлый фон. Без ретуши и изменения внешности. Цифровой JPEG 600–1200 px по каждой стороне, до 240 КБ.'}
];
export const demoPhotos=['family-winter.jpg','prints.jpg','template-family.webp','template-travel.webp','template-baby.webp','prints-detail.webp','book-lite.png','book-classic.png','book-premium.png','family-winter.jpg'];
export const money=n=>new Intl.NumberFormat('ru-BY',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' BYN';
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function projectPrice(p){
 const unit=p.type==='prints'?({'10×15':1.3,'15×20':1.6,'20×30':3.2,'30×45':20}[p.format]||1.3):p.type==='docs'?12:p.type==='gifts'?3.5:(products.find(x=>x.id===p.productId)?.from||70);
 return Math.round(unit*(p.type==='prints'?p.photos.reduce((n,x)=>n+(x.copies||1),0):1)*100)/100;
}
export function totals(cart,promo='',delivery='pickup'){
 const subtotal=Math.round(cart.reduce((n,x)=>n+x.price*x.quantity,0)*100)/100;
 const discount=promo==='PIC10'?Math.round(subtotal*.1*100)/100:0;
 const shipping=delivery==='pickup'?0:delivery==='post'?(subtotal-discount>=150?0:5.9):12;
 return {subtotal,discount,shipping,total:Math.round((subtotal-discount+shipping)*100)/100};
}
export function preflight(p){
 const doc=documents.find(x=>x.id===p.docId);
 const dimensions=p.type==='docs'?[doc?.pxW||472,doc?.pxH||591]:p.type==='books'?[1181,1181]:({'10×15':[591,886],'15×20':[886,1181],'20×30':[1181,1772],'30×45':[1772,2657]}[p.format]||[591,886]);
 return p.photos.map((x,i)=>({id:x.id,index:i,low:x.width<dimensions[0]||x.height<dimensions[1],demo:!!x.demo}));
}
export function makeOrder(state,attempt,contact,delivery){
 const existing=state.orders.find(x=>x.attempt===attempt);if(existing)return existing;
 if(!state.cart.length)throw new Error('Корзина пуста');
 for(const item of state.cart){if(['books','docs'].includes(item.snapshot?.type)){const readiness=projectReadiness(item.snapshot);if(!readiness.ready)throw new Error(readiness.message);}}
 const order={id:'PP-'+Date.now().toString().slice(-7),attempt,created:new Date().toISOString(),items:structuredClone(state.cart),totals:totals(state.cart,state.promo,delivery),contact,delivery,status:'review',events:[{label:'Заказ создан',at:new Date().toISOString()}],test:true};
 state.orders.unshift(order);state.cart=[];state.promo='';return order;
}
