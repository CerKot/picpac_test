import {icon} from './icons.js';
import {products,templates,documents,demoPhotos,money,escapeHTML as e,projectPrice,totals,preflight,makeOrder,normalizePromo} from './data.js';
import {openStore,save,savePhoto,getPhoto,deletePhoto,clearStore,fresh} from './store.js';
import {albumProgress,projectReadiness,documentPolicy,selectedDocumentPhoto} from './project-rules.js';
import {preparePortrait,preparePhotoLight} from './portrait.js';
import {inspectDocumentCanvas,startDocumentCameraValidator,scanFrameBounds} from './document-validator.js';
import {documentSignature,documentAuditCurrent,documentAuditGate,AutoCaptureGate} from './document-quality.js';
import {getAiCapabilities,createImageJob,waitForImageJob,proposeAlbumPatch,accountRequest,setAiSession} from './ai-client.js';
import {ACCOUNT_PLANS} from './account-plans.js';
import {planAlbum} from './ai-album.js';
import {albumDesignFields,describeAlbumPatch,interpretAlbumCommand,normalizeAlbumDesign,projectDesign,sanitizeAlbumPatch} from './album-design.js';
import {aiTools,albumCover,albumSpread,albumWorkspace} from './ai-workspace.js';
import {DOCUMENT_STUDIO_OPERATION,studioProfile} from './document-studio-profile.js';
import {finishStudioPreview,prepareStudioReference,studioEligibility} from './document-studio.js';
import {animateText,installMotion,motionAllowed} from './motion.js';

const main=document.querySelector('#main'),nav=document.querySelector('#navigation'),overlay=document.querySelector('#overlay'),input=document.querySelector('#photo-input');
let state,route={page:'home'},filter='all',search='',sort='popular',templateFilter='Все',ordersTab='cart',stream=null,uploadTarget=null,checkoutAttempt=null,modalReturn=null,chatMessages=[],pageIndex=0,toastTimer,renderToken=0;
const urls=new Map();
let validatorBusy=false,validatorProjectId=null,queuedAudit=null,liveValidator=null,cameraEpoch=0,captureBusy=false;
let portraitBusy=false,portraitProjectId=null,portraitStage='',aiCapabilities=null,aiSelection=[],aiResult=null,aiPollToken=0;
let albumDraft={theme:'wedding',style:'modern',idea:'',projectId:''};
let aiTool='album',albumAgentBusy=false,albumAgentMessage='',lastView='',liveDocumentReport=null;
let albumArtResult=null;
const docStudioTasks=new Map();
const accountKey='picpac-account-session';
let accountSession=readAccountSession();
setAiSession({accessToken:()=>accountSession?.expiresAt>Date.now()?accountSession.token:null});
const asset=name=>'assets/'+name;
const id=()=>crypto.randomUUID();
const current=()=>state.projects.find(p=>p.id===route.id);
const projectBy=id=>state.projects.find(p=>p.id===id);
const productBy=id=>products.find(p=>p.id===id);
const photoSrc=p=>p.demo?asset(p.file):(urls.get(p.id)||'');
const productImg=p=>asset(productBy(p.productId)?.image||'prints.jpg');
const action=(name,content,cls='',value='',extra='')=>`<button type="button" class="${cls}" data-action="${name}" ${value?`data-value="${e(value)}"`:''} ${extra}>${content}</button>`;
const primary=(label,act,value,disabled=false)=>action(act,label,'primary',value,disabled?'disabled':'');
const note=(text,type='')=>`<div class="soft-note ${type}">${icon(type==='success'?'check':'info')}<div>${text}</div></div>`;
const back=(title,sub='',target='back')=>`<div class="back-title">${action(target,icon('back'),'icon-button','','aria-label="Назад"')}<div><h1>${title}</h1>${sub?`<p class="eyebrow">${sub}</p>`:''}</div></div>`;
const imageTag=(p,cls='',style='')=>`<img ${p.demo||urls.has(p.id)?`src="${photoSrc(p)}"`:''} data-photo-id="${p.id}" alt="${e(p.name||'Фотография')}" class="${cls}" style="object-fit:${p.fit||'cover'};object-position:${p.x??50}% ${p.y??50}%;filter:brightness(${p.brightness??100}%) contrast(${p.contrast??100}%) grayscale(${p.bw?1:0});${style}" loading="lazy">`;
const docThumb=()=>'<div class="category-thumb document-thumb" aria-hidden="true"><span></span><span></span><span></span><span></span></div>';
const top=(title)=>`<header class="top">${title?`<h1>${title}</h1>`:`<img src="${asset('logo.svg')}" alt="PicPac" class="logo">`}<span class="header-meta">${icon('pin')} Беларусь</span></header>`;

async function persist(){try{await save(state);}catch(error){toast('Не удалось сохранить: освободите место в браузере.');throw error;}}
function toast(text){clearTimeout(toastTimer);const t=document.querySelector('#toast');t.textContent=text;t.classList.add('visible');toastTimer=setTimeout(()=>t.classList.remove('visible'),3600);}
function stopCamera(){cameraEpoch++;liveValidator?.stop();liveValidator=null;liveDocumentReport=null;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}const video=document.querySelector('#camera-area video');if(video)video.srcObject=null;updateScanner(document.querySelector('.live-camera'),'stopped','Камера остановлена');const button=document.querySelector('[data-action="take-photo"]');if(button)button.disabled=true;const progress=document.querySelector('.capture-stability span');if(progress)progress.style.transform='scaleX(0)';animateText(document.querySelector('#live-hint'),'Камера остановлена. Включите её снова, когда будете готовы.');document.querySelector('.live-feedback')?.classList.remove('ready');}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream){stopCamera();const status=document.querySelector('#live-hint');if(status)status.textContent='Камера остановлена. Включите её снова, когда будете готовы.';const button=document.querySelector('[data-action="take-photo"]');if(button)button.disabled=true;}});
window.addEventListener('pagehide',stopCamera);
function navigate(page,params={}){
 stopCamera();closeModal();route={page,...params};
 const hash='#'+encodeURIComponent(page)+(params.id?'/'+encodeURIComponent(params.id):'');
 if(location.hash!==hash)history.pushState(null,'',hash);
 render();window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('popstate',()=>{const [page,id]=location.hash.slice(1).split('/').map(decodeURIComponent);stopCamera();closeModal();route={page:page||'home',id};render();});
function renderNav(){const active=['ai','editor','templates','docselect','doccapture','docresult','templatemaker'].includes(route.page)?'create':route.page==='product'?'catalog':['checkout','order','success'].includes(route.page)?'orders':['profile','drafts','favorites','mytemplates','control','digital'].includes(route.page)?'account':route.page;
 if(!nav.children.length){
   const tabs=[['home','home','Главная'],['catalog','grid','Каталог'],['create','plus','Создать'],['orders','cart','Заказы'],['account','user','Аккаунт']];
   nav.innerHTML=tabs.map(([key,ico,label])=>action('nav',icon(ico)+`<span>${label}</span>`+(key==='orders'?'<span class="badge hidden"></span>':''),key==='create'?'create-nav':'',key,`aria-label="${label}"`)).join('');
 }
 const buttons=[...nav.children],selected=Math.max(0,buttons.findIndex(button=>button.dataset.value===active));
 nav.style.setProperty('--nav-index',selected);
 buttons.forEach((button,index)=>{
   button.classList.toggle('active',index===selected);
   if(index===selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
 const badge=nav.querySelector('.badge');
 badge.textContent=state.cart.length;
 badge.classList.toggle('hidden',!state.cart.length);
 nav.dataset.ready='';
 document.body.classList.toggle('has-sticky',!!main.querySelector('.sticky-action'));
 document.body.dataset.page=route.page;
}
function render(){if(!state)return;const views={home:homeView,catalog:catalogView,ai:aiView,create:createView,orders:ordersView,account:accountView,product:productView,editor:editorView,templates:templatesView,docselect:docSelectView,doccapture:docCaptureView,docresult:docResultView,checkout:checkoutView,success:successView,order:orderView,profile:profileView,drafts:draftsView,favorites:favoritesView,mytemplates:myTemplatesView,templatemaker:templateMakerView,control:controlView,digital:digitalView};
 const view=route.page+':'+(route.id||'')+(route.page==='ai'?':'+aiTool:'');
 main.innerHTML=`${!navigator.onLine?'<div class="offline">Вы офлайн. Сохранённые проекты доступны на этом устройстве.</div>':''}<section class="view${lastView!==view?' view-enter':''}">${(views[route.page]||homeView)()}</section>`;lastView=view;
 renderNav();hydrate();document.title='PicPac — '+({home:'ваши моменты рядом',catalog:'каталог',ai:'ИИ-студия',create:'студия',orders:'заказы',account:'аккаунт',editor:'редактор',docselect:'фото на документы'}[route.page]||'ваша история');
}
async function hydrate(){const token=++renderToken;for(const img of document.querySelectorAll('img[data-photo-id]')){const pid=img.dataset.photoId;if(urls.has(pid)){if(!img.getAttribute('src'))img.src=urls.get(pid);continue;}if(img.getAttribute('src'))continue;try{const blob=await getPhoto(pid);if(blob){const url=URL.createObjectURL(blob);urls.set(pid,url);if(token===renderToken)img.src=url;}}catch{img.alt='Фотография недоступна';}}}
function productCard(p){const fav=state.favorites.includes(p.id);return `<article class="product-card">${action('favorite',icon('heart'),'icon-button favorite '+(fav?'on':''),p.id,`aria-label="${fav?'Убрать из избранного':'В избранное'}: ${p.name}" aria-pressed="${fav}"`)}<button class="product-link" data-action="product" data-value="${p.id}"><div class="product-art ${p.color}">${p.image?`<img src="${asset(p.image)}" alt="${p.name}" loading="lazy">`:icon('document')}</div><h3>${p.name}</h3><p class="small">${p.tag}</p><p class="price">от ${money(p.from)}</p></button></article>`;}
function homeView(){return `${top()}<div class="hero"><h1><span>Сохраняйте</span><span>важные</span><span>моменты</span><span>с PicPac!</span></h1><img class="cat" src="${asset('picpac-cat.png')}" alt="Котик PicPac с фотоаппаратом"></div><div class="category-list">${action('new','<img src="'+asset('prints.jpg')+'" alt="Отпечатки фотографий"><div class="category-copy"><h2>Фотопечать</h2><p>Печать фото<br>в пару кликов</p></div>'+icon('chevron'),'category-row pink','prints')}${action('templates','<img src="'+asset('template-baby.webp')+'" alt="Открытая фотокнига"><div class="category-copy"><h2>Фотокниги</h2><p>Соберите историю<br>в красивую книгу</p></div>'+icon('chevron'),'category-row lavender')}${action('docs',docThumb()+'<div class="category-copy"><h2>Фото на документы</h2><p>Быстро и удобно</p></div>'+icon('chevron'),'category-row sage')}</div><div class="ai-home-invite"><div><span class="ai-kicker">Знакомьтесь, PicPac AI</span><h2>Давайте придумаем ваш альбом</h2><p>Расскажите роботу о событии. Он покажет оформление с фотографиями.</p>${action('ai-open','Открыть ИИ-студию '+icon('arrow'),'ai-invite-button')}</div><img src="${asset('picpac-ai-robot.png')}" alt="Робот PicPac"></div><div class="section-heading"><h2>Популярное</h2>${action('nav','Все '+icon('arrow'),'','catalog')}</div><div class="product-grid">${[products[1],products[3]].map(productCard).join('')}</div><div class="banner"><h2>У каждой семьи<br>есть своя история</h2><p>Соберите её в альбом, который захочется передать дальше.</p>${icon('book','icon-deco')}${action('templates','Найти свой шаблон '+icon('arrow'),'text-button')}</div>${state.projects.length?`<div class="section-heading"><h2>Продолжим?</h2>${action('nav','Все проекты','text-button','drafts')}</div>${draftCard(state.projects[0])}`:''}<p class="legal-note">Создано для ваших воспоминаний</p>`;}
function catalogView(){let items=products.filter(p=>(filter==='all'||p.category===filter)&&(`${p.name} ${p.description}`).toLowerCase().includes(search.toLowerCase()));if(sort==='price')items.sort((a,b)=>a.from-b.from);return `${top('Каталог')}<p class="subtext">Всё, что помогает сохранить важное</p><div class="search-box">${icon('search')}<input type="search" id="catalog-search" placeholder="Фотокнига, печать, подарок…" aria-label="Поиск товаров" value="${e(search)}"></div><div class="chips">${[['all','Всё'],['books','Фотокниги'],['prints','Фотопечать'],['docs','Документы'],['gifts','Подарки']].map(([key,label])=>action('filter',label,'chip '+(filter===key?'active':''),key,`aria-pressed="${filter===key}"`)).join('')}</div><div class="catalog-tools"><span>${items.length} ${items.length===1?'товар':'товаров'}</span><select id="sort" aria-label="Сортировка"><option value="popular" ${sort==='popular'?'selected':''}>Рекомендуем</option><option value="price" ${sort==='price'?'selected':''}>Сначала дешевле</option></select></div><div class="product-grid">${items.map(productCard).join('')}</div>${!items.length?emptyView('Ничего не нашлось','Попробуйте другое название или откройте весь каталог.','Показать всё','reset-search'):''}${note('Цены в прототипе ориентировочные. Оформление заказа работает в тестовом режиме.')}`;}
const defaultAlbumDesign=draft=>normalizeAlbumDesign({...planAlbum(draft),cover:'collage'});
function getAlbumDraft(){
 const draft=state.aiAlbumDraft||albumDraft,p=projectBy(draft.projectId),selected=p?.type==='books'?p:null;
 return {...draft,projectId:selected?.id||'',design:normalizeAlbumDesign(draft.design||(selected?projectDesign(selected):defaultAlbumDesign(draft)))};
}
function albumPicture(photos,index,{examples=false}={}){
 const sample=['template-family.webp','template-travel.webp','template-baby.webp'];
 if(photos[index])return imageTag(photos[index]);
 if(examples)return `<img src="${asset(sample[index%sample.length])}" alt="Пример фото" loading="lazy">`;
 return `<div class="album-empty-image" aria-label="Место для фото">${icon('image')}</div>`;
}
function createTabs(inStudio=false){
 return `<nav class="create-tabs glass" aria-label="Разделы создания">${action('nav','Создать проект','create-tab'+(!inStudio?' active':''),'create',!inStudio?'aria-current="page"':'')}${action('ai-open',icon('sparkles')+' ИИ-студия','create-tab'+(inStudio?' active':''),'',inStudio?'aria-current="page"':'')}</nav>`;
}
function aiView(){
 const draft=getAlbumDraft(),books=state.projects.filter(p=>p.type==='books'),selected=books.find(p=>p.id===draft.projectId),photos=selected?.photos||[];
 const tools=aiTools.map(([key,ico,label],index)=>action('ai-tool',icon(ico)+'<span>'+label+'</span>','ai-tool glass '+['lavender','sage','pink','peach'][index]+' '+(aiTool===key?'active':''),key,`aria-pressed="${aiTool===key}"`)).join('');
 let content;
 if(aiTool==='album')content=albumWorkspace({draft,design:draft.design,books,selected,picture:index=>albumPicture(photos,index,{examples:true}),action,primary,busy:albumAgentBusy,assistantMessage:albumAgentMessage});
 if(aiTool==='documents'){
   const recent=state.projects.find(p=>p.type==='docs');
   content=`<section class="ai-work-panel glass ai-tool-panel"><span class="premium-gem">${icon('document')}</span><h2>Фото на документы</h2><p>Снимите лицо прямо, загрузите фото и получите подсказки по позе, свету и чёткости. Для поддерживаемых документов можно сравнить оригинал со студийным превью.</p>${primary('Выбрать документ','docs')}${recent?action('project','Продолжить проверку','secondary',recent.id):''}</section>`;
 }
 if(aiTool==='photos'){
   const editable=state.projects.filter(p=>p.type!=='docs'&&p.photos.some(ph=>!ph.demo));
   content=`<section class="ai-work-panel glass ai-tool-panel"><span class="premium-gem">${icon('image')}</span><h2>Фотостудия</h2><p>Осветлите тени, выровняйте портрет или попробуйте творческий вариант для фотографии из проекта.</p>${editable.length?`<label class="form-field"><span>Проект с фотографиями</span><select id="studio-project">${editable.map(p=>`<option value="${e(p.id)}">${e(p.name)}</option>`).join('')}</select></label>${primary('Свет и фон на устройстве','ai-open-photo-tool','local')}${action('ai-open-photo-tool','Творческое редактирование','secondary','creative')}`:primary('Создать проект с фото','new','prints')}</section>`;
 }
 if(aiTool==='art')content=`<section class="ai-work-panel glass ai-tool-panel"><span class="premium-gem">${icon('sparkles')}</span><h2>Новая иллюстрация</h2><p>Опишите картинку для обложки или разворота и добавьте её в выбранный альбом.</p><form id="ai-art-form"><label class="form-field"><span>Что нарисовать?</span><textarea name="prompt" minlength="3" maxlength="2000" required placeholder="Например: акварельные цветы для обложки, без текста и лиц"></textarea></label><label class="form-field"><span>Добавить в альбом</span><select name="projectId"><option value="">Новый альбом</option>${books.map(p=>`<option value="${e(p.id)}" ${draft.projectId===p.id?'selected':''}>${e(p.name)}</option>`).join('')}</select></label><label class="check-label"><input type="checkbox" name="consent" required><span>Разрешаю отправить описание подключённой модели для создания иллюстрации.</span></label><button class="primary" type="submit">${icon('sparkles')} Создать иллюстрацию</button><div id="ai-art-status" class="processing-status" role="status"></div><div id="ai-art-result"></div></form></section>`;
 return `${top('Создать')}${createTabs(true)}
 <section class="ai-home-invite ai-create-invite"><div><span class="premium-badge premium-surface">${icon('sparkles')} PicPac AI</span><h2>Идеи становятся кадрами</h2><p>Оформляйте альбомы, проверяйте фото и создавайте иллюстрации.</p>${action('ai-chat','Спросить помощника '+icon('arrow'),'ai-invite-button')}</div><img src="${asset('picpac-ai-robot.png')}" alt=""></section>
 <div class="ai-tools" aria-label="Инструменты ИИ-студии">${tools}</div>${content||''}`;
}
async function selectAlbumProject(value){
 const selected=projectBy(value);if(value&&selected?.type!=='books')return;
 const draft=getAlbumDraft();
 state.aiAlbumDraft={...draft,theme:selected?'':'wedding',projectId:selected?.id||'',design:selected?projectDesign(selected):defaultAlbumDesign({}),previous:null};
 albumAgentMessage='';await persist();if(route.page==='ai')render();
}
async function updateAlbumPreview(draft,patch,message){
 state.aiAlbumDraft={...draft,design:normalizeAlbumDesign({...draft.design,...patch}),previous:draft.design};
 albumAgentMessage=message;await persist();
 if(route.page==='ai'&&aiTool==='album'&&!overlay.innerHTML){
   render();
   const preview=document.querySelector('.ai-preview');
   preview?.classList.add('preview-refresh');
   if(motionAllowed())document.querySelector('#album-preview')?.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
}
async function runAlbumCommand(instruction,projectId,{chat=false}={}){
 if(albumAgentBusy)return {text:'Я ещё готовлю предыдущий вариант.'};
 let draft=getAlbumDraft();
 if(projectId&&projectId!==draft.projectId){
   const selected=projectBy(projectId);if(selected?.type==='books')draft={...draft,projectId,theme:'',previous:null,design:projectDesign(selected)};
 }
 let patch=interpretAlbumCommand(instruction);
 if(!Object.keys(patch).length&&/свад|выпуск|юбиле|день рожд|путешеств|отпуск/i.test(instruction)){
   const {color,accent,layout,chapters}=planAlbum({idea:instruction});
   patch={color,accent,layout,chapters,cover:'collage'};
 }
 if(!Object.keys(patch).length){
   const initialState=state,currentDraft=state.aiAlbumDraft,field=document.querySelector('#album-instruction'),button=field?.form.querySelector('[type=submit]');
   albumAgentBusy=true;
   if(button)button.disabled=true;
   animateText(document.querySelector('#album-agent-status'),'Подбираем оформление…');
   try{
     const capabilities=await getAiCapabilities();
     if(capabilities.albumAssistant)patch=sanitizeAlbumPatch((await proposeAlbumPatch(instruction)).patch);
     if(state!==initialState||state.aiAlbumDraft!==currentDraft)return {text:'Альбом сменился. Отправьте команду для выбранного проекта.'};
   }catch(error){
     albumAgentMessage=error.message||'Не получилось предложить оформление.';
     animateText(document.querySelector('#album-agent-status'),albumAgentMessage);
     return {text:albumAgentMessage};
   }finally{
     albumAgentBusy=false;
     if(button)button.disabled=false;
     const currentButton=document.querySelector('#album-agent-form [type=submit]');
     if(currentButton)currentButton.disabled=false;
   }
 }
 const changed=describeAlbumPatch(patch);
 if(!changed){
   albumAgentMessage='Попробуйте указать конкретную правку: «Обложка только текст», «Заголовок: Наше лето» или «Шрифт с засечками».';
   animateText(document.querySelector('#album-agent-status'),albumAgentMessage);
   return {text:albumAgentMessage};
 }
 const message='Обновил '+changed+'. Проверьте макет перед применением.';
 await updateAlbumPreview(draft,patch,message);
 return {text:message,...(chat?{action:'ai-album-preview',label:'Посмотреть макет'}:{})};
}
async function applyAlbumDesign(){
 if(albumAgentBusy)return;
 const draft=getAlbumDraft(),fields=albumDesignFields(draft.design);
 const p=state.projects.find(x=>x.id===draft.projectId&&x.type==='books');
 if(p){
   Object.assign(p,{...fields,updated:new Date().toISOString()});state.aiAlbumDraft={...draft,previous:null};
   await persist();pageIndex=0;navigate('editor',{id:p.id});toast('Дизайн сохранён в альбоме.');
 }else{
   const created=await newProject('books',{...fields,name:fields.title});
   state.aiAlbumDraft={...draft,projectId:created.id,previous:null};await persist();
 }
}
async function generateAlbumArt(form){
 const button=form.querySelector('[type=submit]'),status=form.querySelector('#ai-art-status'),resultBox=form.querySelector('#ai-art-result');
 const data=new FormData(form),prompt=String(data.get('prompt')||'').trim();
 button.disabled=true;animateText(status,'Проверяем подключение…');resultBox.innerHTML='';
 const controller=new AbortController();
 try{
   const capabilities=await getAiCapabilities();
   if(!form.isConnected)return;
   if(!capabilities.operations.includes('art.generate'))throw new Error('Генерация сейчас недоступна.');
   if(!data.has('consent'))throw new Error('Подтвердите отправку описания.');
   const job=await createImageJob({operation:'art.generate',prompt,consent:true},id());
   const blob=await waitForImageJob(job,{signal:controller.signal,onStatus:()=>{
     if(!form.isConnected)controller.abort();else animateText(status,'Рисуем иллюстрацию… Это может занять минуту.');
   }});
   if(!form.isConnected)return;
   if(albumArtResult?.url)URL.revokeObjectURL(albumArtResult.url);
   albumArtResult={blob,url:URL.createObjectURL(blob),jobId:job.id,name:'ИИ-иллюстрация',projectId:String(data.get('projectId')||'')};
   resultBox.innerHTML=`<img class="ai-response" src="${albumArtResult.url}" alt="Новая иллюстрация для альбома">${action('ai-add-art','Добавить в альбом','secondary')}`;
   animateText(status,'Иллюстрация готова.');
 }catch(error){if(form.isConnected)animateText(status,error.message||'Не удалось создать иллюстрацию.');}
 finally{if(button.isConnected)button.disabled=false;}
}
async function addAlbumArt(){
 if(!albumArtResult?.blob)return;
 let p=state.projects.find(x=>x.id===albumArtResult.projectId&&x.type==='books');
 if(!p){const fields=albumDesignFields(getAlbumDraft().design);p=await newProject('books',{...fields,name:fields.title});}
 const bitmap=await createImageBitmap(albumArtResult.blob),photo={id:id(),name:albumArtResult.name,width:bitmap.width,height:bitmap.height,generated:true,jobId:albumArtResult.jobId,x:50,y:50,brightness:100,contrast:100,copies:1};bitmap.close();await savePhoto(photo.id,albumArtResult.blob);urls.set(photo.id,albumArtResult.url);p.photos.push(photo);p.updated=new Date().toISOString();await persist();albumArtResult=null;navigate('editor',{id:p.id});toast('Иллюстрация добавлена в альбом.');
}
function createView(){return `${top('Создать')}${createTabs()}<div class="intro"><p class="subtext">С чего начнётся ваша история?</p></div><div class="create-options">${[['prints','image','Фотопечать','Любимые кадры<br>из вашей галереи','pink'],['books','book','Фотокнига','Целая история<br>под одной обложкой','lavender'],['docs','document','Документы','Снимок дома<br>с проверкой','sage'],['gifts','gift','Открытки','Фото и тёплые<br>слова в подарок','peach']].map(([type,ico,title,sub,color])=>action(type==='books'?'templates':type==='docs'?'docs':'new',icon(ico)+`<h3>${title}</h3><p>${sub}</p>`,'create-card '+color,type)).join('')}</div><div class="section-heading"><h2>Начните с шаблона</h2>${action('templates','Все '+icon('arrow'))}</div><div class="template-grid">${templates.slice(0,2).map(templateCard).join('')}</div><div class="banner sage"><h2>Альбом о вашей жизни</h2><p>Детство, семья, важные встречи. Добавьте настоящие снимки и подписи.</p>${action('template','Собрать биографию '+icon('arrow'),'text-button','life')}</div>${state.projects.length?`<div class="section-heading"><h2>Ваши черновики</h2>${action('nav','Все','text-button','drafts')}</div>${state.projects.slice(0,2).map(draftCard).join('')}`:''}`;}
function templateCard(t){return action('template',`<img src="${asset(t.image||'book-classic.png')}" alt="Пример шаблона ${e(t.name)}" loading="lazy"><span class="tag">${e(t.category||'Мой шаблон')}</span><div class="template-copy"><h3>${e(t.name)}</h3><p>${e(t.subtitle||'Ваш персональный макет')}</p></div>`,'template-card',t.id);}
function templatesView(){const all=[...templates,...state.templates];const list=all.filter(t=>templateFilter==='Все'||t.category===templateFilter);return `${back('Шаблоны фотокниг','Только добавьте ваши фотографии')}<div class="chips">${['Все','Семья','Дети','Путешествия','Биография','Мои'].map(x=>action('template-filter',x,'chip '+(templateFilter===x?'active':''),x)).join('')}</div><div class="template-grid">${list.map(templateCard).join('')}</div>${!list.length?note('Здесь появятся ваши сохранённые шаблоны.'):''}<div class="banner sage"><h2>Ваша идея —<br>ваш альбом</h2><p>Настройте обложку, цвет и композицию. Сохраните шаблон для будущих историй.</p>${action('nav','Создать свой '+icon('plus'),'text-button','templatemaker')}</div>${note('Фотографии шаблонов показывают готовые книги. В редакторе вы сможете заменить их своими снимками.')}`;}
function productView(){const p=productBy(route.id);if(!p)return emptyView('Товар не найден','','В каталог','catalog');return `${back('О продукте')}<div class="${p.image?'':'editor-preview sage'}">${p.image?`<img class="detail-image" src="${asset(p.image)}" alt="${p.name}">`:icon('document')}</div><div class="detail-heading"><div><span class="eyebrow">${p.tag}</span><h1>${p.name}</h1></div></div><p class="subtext">${p.description}</p><div class="detail-features">${p.details.map(x=>`<div>${icon('check')}${x}</div>`).join('')}</div><div class="summary-card"><div class="price-line"><span>Стоимость</span><strong>от ${money(p.from)}</strong></div><p class="small">Окончательная цена зависит от формата и наполнения. Сейчас доступен тестовый заказ.</p></div>${primary(p.category==='docs'?'Сделать фото':p.category==='books'?'Выбрать шаблон':'Создать проект','start-product',p.id)}${p.category==='books'?action('blank-book','Начать с чистого альбома','secondary',p.id):''}`;}
function emptyView(title,text,cta,act,value=''){return `<div class="empty"><img src="${asset('picpac-cat.png')}" alt="Котик PicPac"><h2>${title}</h2><p>${text}</p>${primary(cta,act,value)}</div>`;}
function draftCard(p){const cover=p.photos[0];return action('project',`${cover?imageTag(cover):`<img src="${productImg(p)}" alt="Проект">`}<div><h3>${e(p.name)}</h3><p>${p.type==='docs'?'Фото на документы':p.type==='books'?'Фотокнига':'Фотопечать'} · ${p.photos.length} фото</p><p>Сохранено ${new Date(p.updated).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</p></div>${icon('chevron')}`,'draft-card',p.id);}
function draftsView(){return `${back('Мои проекты')}${state.projects.length?state.projects.map(draftCard).join(''):emptyView('Здесь начнётся ваша история','Сохранённые проекты останутся на этом устройстве.','Создать проект','nav','create')}${note('Проекты и фотографии хранятся в этом браузере. Для резервной копии используйте экспорт в редакторе.')}`;}
function favoritesView(){return `${back('Избранное')}<div class="product-grid">${products.filter(p=>state.favorites.includes(p.id)).map(productCard).join('')}</div>${!state.favorites.length?emptyView('Понравилось? Сохраните','Нажмите на сердечко рядом с товаром, чтобы вернуться к нему позже.','Посмотреть каталог','nav','catalog'):''}`;}
function myTemplatesView(){return `${back('Мои шаблоны')}<div class="template-grid">${state.templates.map(templateCard).join('')}</div>${!state.templates.length?note('Сохраните собственный шаблон — он будет доступен здесь.'):''}${primary('Создать шаблон','nav','templatemaker')}`;}
function templateMakerView(){return `${back('Свой шаблон','Альбом, похожий на вас')}<form id="template-form"><label class="form-field"><span>О чём будет история?</span><textarea name="idea" placeholder="Например: юбилей мамы, от детства до наших дней" required maxlength="500"></textarea></label><button class="secondary" type="button" data-action="suggest-template">${icon('sparkles')} Подобрать структуру</button><label class="form-field"><span>Название шаблона</span><input name="name" type="text" placeholder="Моя семейная история" required maxlength="60"></label><label class="form-field"><span>Заголовок обложки</span><input name="title" type="text" placeholder="История, которую мы любим" required maxlength="80"></label><label class="form-field"><span>Композиция</span><select name="layout"><option value="duo">Две фотографии на разворот</option><option value="single">Крупный кадр и подпись</option><option value="story">История по главам</option></select></label><label class="form-field"><span>Цвет страниц</span><select name="color"><option value="#C4DAD6">Шалфей</option><option value="#EDD5D5">Пудровый розовый</option><option value="#E0DCE8">Сиреневый</option><option value="#E7D3BA">Тёплый песочный</option></select></label><div id="template-suggestion"></div><button class="primary" type="submit">Сохранить шаблон ${icon('check')}</button></form>${note('Подбор структуры использует готовые композиции. События жизни и лица не дорисовываются: историю и фотографии добавляете вы.')}`;}
function readAccountSession(){
 try{
  const session=JSON.parse(sessionStorage.getItem(accountKey));
  if(session?.expiresAt>Date.now()&&/^pp_[A-Za-z0-9_-]{43}$/.test(session.token)&&/^[a-f0-9-]{36}$/.test(session.account?.id))return session;
  sessionStorage.removeItem(accountKey);
 }catch{}
 return null;
}
function switchAccount(session){
 if(session)sessionStorage.setItem(accountKey,JSON.stringify(session));else sessionStorage.removeItem(accountKey);
 history.replaceState(null,'','#account');location.reload();
}
async function refreshAccount(){
 const session=accountSession;
 if(!session)return;
 try{
  const {account}=await accountRequest('',{token:session.token});
  if(accountSession!==session||account?.id!==session.account.id||account.plan===session.account.plan)return;
  session.account=account;sessionStorage.setItem(accountKey,JSON.stringify(session));
  if(route.page==='account'&&!overlay.innerHTML)render();
 }catch(error){if(error.status===401&&accountSession===session)switchAccount(null);}
}
function accountSheet(mode){
 const register=mode==='register';
 openSheet(register?'Создать аккаунт':'Войти в PicPac',`<form id="account-auth-form" data-mode="${register?'register':'login'}"><label class="form-field"><span>Электронная почта</span><input name="email" type="email" autocomplete="username" maxlength="254" required></label><label class="form-field"><span>Пароль</span><input class="field" name="password" type="password" autocomplete="${register?'new-password':'current-password'}" ${register?'minlength="10"':''} maxlength="256" required></label>${register?'<p class="small">Пароль от 10 символов. Тариф при регистрации — Standart.</p>':''}<p class="error-text" role="alert" hidden></p><button type="submit" class="primary">${register?'Создать аккаунт':'Войти'}</button>${action('account-auth',register?'Уже есть аккаунт? Войти':'Создать аккаунт','text-button',register?'login':'register')}</form>`);
}
async function submitAccount(form,data){
 const button=form.querySelector('[type=submit]'),error=form.querySelector('.error-text');
 if(button.disabled)return;
 button.disabled=true;error.hidden=true;
 try{
  const session=await accountRequest(form.dataset.mode,{credentials:{email:data.get('email'),password:data.get('password')}});
  switchAccount(session);
 }catch(failure){error.textContent=failure.message||'Попробуйте ещё раз.';error.hidden=false;button.disabled=false;}
}
function accountPlansView(){
 const currentPlan=accountSession?.account.plan;
 openSheet('Тарифы PicPac',`<div class="row-list">${Object.entries(ACCOUNT_PLANS).map(([key,plan])=>`<div class="row-item">${icon(key===currentPlan?'check':'sparkles')}<div class="row-copy"><h3>${plan.name}</h3>${key===currentPlan?'<p>Ваш тариф</p>':''}</div><strong>${plan.price}</strong></div>`).join('')}</div>`);
}
function accountView(){
 const account=accountSession?.account,plan=ACCOUNT_PLANS[account?.plan],dark=document.documentElement.dataset.theme==='dark';
 const name=state.profile.name||(account?'Ваш аккаунт':'Давайте знакомиться');
 const subtitle=account?`${e(account.email)} · ${plan?.name||'Standart'}`:state.profile.name?'Ваши воспоминания — всегда рядом':'Сохраните имя и данные для заказа';
 const access=account?rowAction('account-logout','back','Выйти из аккаунта',''):rowAction('account-auth','user','Войти или зарегистрироваться','','login');
 return `${top('Аккаунт')}<div class="account-card"><div class="avatar">${state.profile.name?e(state.profile.name.slice(0,1).toUpperCase()):icon('user')}</div><div><h2>${e(name)}</h2><p>${subtitle}</p></div></div><div class="row-list">${access}${rowAction('account-plans','sparkles','Тарифы',plan?`${plan.name} · ${plan.price}`:'Standart, Pro, Super и VIP')}${action('toggle-theme',icon('sliders')+`<div class="row-copy"><h3>Тёмная тема</h3><p>${dark?'Включена':'Выключена'}</p></div>`,'row-item','',`aria-pressed="${dark}"`)}</div><div class="account-stats">${[['orders',state.orders.length,'заказов'],['drafts',state.projects.length,'проектов'],['favorites',state.favorites.length,'избранное']].map(([r,n,label])=>action('nav',`<strong>${n}</strong><span>${label}</span>`,'account-stat',r)).join('')}</div><div class="row-list">${[['profile','user','Личные данные','Имя, телефон и адрес'],['drafts','book','Мои проекты','Продолжите с того же места'],['mytemplates','grid','Мои шаблоны','Для следующих историй'],['digital','document','Фото на документы','Макеты и цифровые копии'],['favorites','heart','Избранное','То, что вам понравилось']].map(([r,ico,title,sub])=>rowAction('nav',ico,title,sub,r)).join('')}</div><div class="section-heading"><h2>Мы рядом</h2></div><div class="row-list">${rowAction('chat','bot','Помощник PicPac','Подскажет, с чего начать')}${rowAction('help','info','Доставка и помощь','Ответы на частые вопросы')}${rowAction('about','shield','О прототипе и данных','Что сохраняется на устройстве')}</div><div class="legal-note">PicPac · мобильный MVP 1.2<br>${action('nav','Демонстрация отдела контроля','','control')}</div>`;
}
function rowAction(act,ico,title,sub,value=''){return action(act,icon(ico)+`<div class="row-copy"><h3>${title}</h3>${sub?`<p>${sub}</p>`:''}</div>`+icon('chevron','chevron'),'row-item',value);}
function profileView(){return `${back('Личные данные')}<form id="profile-form"><label class="form-field"><span>Как вас зовут</span><input type="text" name="name" autocomplete="name" maxlength="80" value="${e(state.profile.name)}" required></label><label class="form-field"><span>Телефон</span><input type="tel" name="phone" autocomplete="tel" placeholder="+375 …" value="${e(state.profile.phone)}"></label><label class="form-field"><span>Электронная почта для заказов</span><input type="email" name="email" autocomplete="email" value="${e(state.profile.email||accountSession?.account.email||'')}"></label><label class="form-field"><span>Адрес доставки</span><textarea name="address" autocomplete="street-address" maxlength="300" placeholder="Город, улица, дом, квартира">${e(state.profile.address)}</textarea></label><button class="primary" type="submit">Сохранить</button></form>${note('Данные доставки сохраняются в этом браузере.')}`;}

function editorView(){const p=current();if(!p)return emptyView('Проект не найден','Возможно, он сохранён в другом браузере.','К проектам','nav','drafts');const book=p.type==='books';const issues=preflight(p);const readiness=projectReadiness(p);const progress=book?albumProgress(p):null;return `${back(book?'Ваша фотокнига':p.type==='gifts'?'Ваша открытка':'Печать фотографий')}<div class="editor-top"><h2>${e(p.name)}</h2><span class="saved">${icon('check')} Сохранено</span></div>${book?`${agentCallout('Оформление альбома','Измените обложку, цвета и развороты одной командой.','ai-edit-book',p.id,'Открыть ИИ-дизайн')}${albumProgressView(p)}`:''}${book?bookPreview(p):''}${!p.photos.length?`<div class="upload-zone">${icon('upload')}<h2>Добавьте любимые фото</h2><p>${book?'Выберите минимум 3 разные фотографии.':'Можно выбрать сразу несколько фотографий.'}<br>JPEG, PNG или WebP · до 25 МБ.</p>${primary('Открыть галерею','upload',p.id)}${action('demo','Попробовать с примерами','text-button',p.id)}</div>`:`<div class="section-heading"><h2>Ваши фотографии <span class="small">${p.photos.length}</span></h2>${action('upload',icon('plus')+' Из галереи','text-button',p.id)}</div><div class="photo-grid">${p.photos.map((ph,i)=>`<div class="photo-tile">${action('edit-photo',imageTag(ph),'',ph.id,`aria-label="Редактировать фото ${i+1}"`)}<span class="photo-index">${i+1}</span>${issues[i].low?'<span class="low">Проверить качество</span>':''}${(ph.copies||1)>1?`<span class="copies">×${ph.copies}</span>`:''}</div>`).join('')}${action('upload',icon('plus')+'<span>Ещё фото</span>','photo-tile add-tile',p.id)}</div><p class="small">Нажмите на фото, чтобы настроить кадрирование, свет или порядок.</p>`}${book?`<label class="form-field"><span>Название на обложке</span><input type="text" id="book-title" value="${e(p.title)}" maxlength="80"></label><div class="settings-grid"><label class="form-field"><span>Фотокнига</span><select id="book-product">${products.filter(x=>x.category==='books').map(x=>`<option value="${x.id}" ${p.productId===x.id?'selected':''}>${x.name}</option>`).join('')}</select></label><label class="form-field"><span>Композиция</span><select id="book-layout"><option value="duo" ${p.layout==='duo'?'selected':''}>Два кадра</option><option value="single" ${p.layout==='single'?'selected':''}>Кадр и подпись</option><option value="story" ${p.layout==='story'?'selected':''}>По главам</option></select></label></div><div class="editor-actions">${action('autofill',icon('grid')+' Разложить по страницам','',p.id,!readiness.ready?'disabled':'')}${action('save-template',icon('copy')+' Сохранить как шаблон','',p.id)}</div>`:`<div class="section-heading"><h2>Как напечатать</h2></div><div class="settings-grid"><label class="form-field"><span>Размер, см</span><select id="print-format">${['10×15','15×20','20×30','30×45'].map(x=>`<option ${p.format===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="form-field"><span>Поверхность</span><select id="print-finish"><option ${p.finish==='Матовая'?'selected':''}>Матовая</option><option ${p.finish==='Глянцевая'?'selected':''}>Глянцевая</option></select></label></div><label class="form-field"><span>${p.type==='gifts'?'Тёплые слова на обороте':'Название проекта'}</span><input type="text" id="project-caption" value="${e(p.caption||'')}" placeholder="На память о самом важном" maxlength="200"></label>`}${p.type!=='docs'?`<div class="prepare-card"><h2>Свет и фон для ваших фото</h2><p>Осветлите тени или подготовьте ровный портрет с белым фоном. Оригинал останется в проекте.</p>${action('ai-studio',icon('sparkles')+' Открыть фотостудию','secondary',p.id)}${action('ai-creative',icon('sparkles')+' Творческое редактирование','secondary',p.id)}</div>`:''}${p.photos.some(x=>x.demo)?note('В проекте есть демонстрационные изображения. Перед настоящей печатью замените их своими фотографиями.'):''}${p.photos.length?`<div class="editor-actions">${action('preflight',icon('shield')+' Проверить макет','',p.id)}${action('export-layout',icon('book')+' Скачать макет','',p.id,!readiness.ready?'disabled':'')}${action('export-project',icon('download')+' Резервная копия','',p.id)}</div><div class="sticky-action"><div class="summary-inline"><span>${book?'Ваш альбом':p.photos.length+' фото'}</span><strong>${money(projectPrice(p))}</strong></div>${primary('В корзину '+icon('arrow'),'add-cart',p.id,!readiness.ready)}</div>`:''}`;}
function bookPreview(p){
 const design=projectDesign(p),total=Math.max(1,Math.ceil(p.photos.length/(design.layout==='duo'?2:1)));
 pageIndex=Math.min(pageIndex,total-1);
 const picture=index=>albumPicture(p.photos,index);
 return `<div class="book-design-preview"><div class="ai-preview-heading"><h3>Обложка</h3><span>Ваш макет</span></div>${albumCover(design,picture)}<div class="ai-preview-heading"><h3>Разворот</h3><span>${pageIndex+1} / ${total}</span></div>${albumSpread(design,p.photos,picture,pageIndex)}</div><div class="page-controls">${action('page-prev',icon('back'),'','','aria-label="Предыдущий разворот" '+(pageIndex===0?'disabled':''))}<span>Разворот ${pageIndex+1} из ${total}</span>${action('page-next',icon('arrow'),'','','aria-label="Следующий разворот" '+(pageIndex>=total-1?'disabled':''))}</div>`;
}
function docSelectView(){return `${back('Фото на документы')}<div class="intro"><span class="tag">PicPac · с проверкой специалиста</span><h2 style="margin-top:16px;font-size:31px">Хороший снимок.<br>Спокойная подача.</h2><p class="subtext">Выберите документ. Мы покажем, как снять фото, и подготовим макет для контроля.</p></div><div class="doc-options">${documents.map(d=>action('select-doc',`<span class="doc-icon">${icon('document')}</span><div><h3>${d.name}</h3><p>${d.subtitle}</p></div>${icon('chevron')}`,'doc-option',d.id)).join('')}</div>${note('ID-карта и биометрический паспорт Беларуси требуют личного присутствия для цифровой съёмки. Домашний файл её не заменяет.')}<a class="small" href="https://mfa.gov.by/ru/visa/passport/" target="_blank" rel="noopener">Порядок оформления биометрических документов РБ ↗</a>${note('Окончательное решение принимает ведомство. Подготовка макета и контроль PicPac не заменяют его проверку.')}`;}
function docCaptureView(){
 const p=current(),d=documents.find(d=>d.id===p?.docId);if(!d)return docSelectView();const policy=documentPolicy(d.id);
 const uploadNotice=studioProfile(d.id)?'После проверки снимок автоматически отправится в AIAI.BY для студийной обработки. ':'';
 return `${back('Съёмка фото','Фото на документы')}<button class="document-preset" data-action="doc-change-type" data-value="${p.id}">${icon('document')}<span><strong>${e(d.name)}</strong><small>${e(d.subtitle)}</small></span>${icon('chevron')}</button><div class="validator-intro"><h2>Сделайте фото на сайте</h2><p>Поставьте камеру на уровне глаз. PicPac подскажет, как расположить лицо и когда сделать снимок.</p></div><div id="camera-area"><div class="validator-idle"><div class="idle-oval">${icon('user')}</div><span>Расположите лицо в овале</span></div></div><p class="micro" style="margin:14px 0">${uploadNotice}Видеопоток остаётся на устройстве.</p>${primary(icon('camera')+' Включить камеру','camera',p.id)}<div style="height:10px"></div>${action('upload',icon('image')+' Проверить фото из галереи','secondary',p.id)}<div class="doc-policy">${e(policy.reason)}</div>${agentCallout('Помощник по съёмке','Подскажу, где поставить телефон и как получить мягкий свет дома.')}<details><summary class="small">Что ещё проверит специалист</summary><p class="small" style="margin-top:10px">Взгляд в объектив, фон, волосы и аксессуары, точные размеры головы, давность снимка и соответствие правилам ведомства.</p><p class="small">${e(d.note)}</p><a class="small" href="${d.source}" target="_blank" rel="noopener">Требования ведомства ↗</a></details>`;
}
function auditRows(report){return `<div class="validator-checks">${report.checks.map(c=>`<div class="validator-check ${c.status}"><span>${icon(c.status==='pass'?'check':c.status==='unknown'?'clock':'info')}</span><div><strong>${e(c.label)}</strong>${c.status!=='pass'?`<p>${e(c.message)}</p>`:''}</div></div>`).join('')}</div>`;}
function scannerOverlay(label){return `<div class="scan-overlay" aria-hidden="true"><div class="scan-frame"><i></i><i></i><i></i><i></i><div class="scan-sweep"><span></span></div></div><span class="scan-label"><span class="scan-dot"></span><span data-scan-label>${e(label)}</span></span><span class="scan-local">${icon('check')} На вашем устройстве</span></div>`;}
function revealScanner(){document.querySelector('.doc-photo.document-scan')?.scrollIntoView({block:'center',behavior:'instant'});}
function updateScanner(root,status,label,metrics=null,mirror=false){
 if(!root)return;root.dataset.scanState=status;
 const text=root.querySelector('[data-scan-label]');if(text&&label)text.textContent=label;
 const frame=root.querySelector('.scan-frame'),bounds=scanFrameBounds(metrics,{mirror});
 if(frame)for(const key of ['left','top','width','height']){if(bounds)frame.style.setProperty('--scan-'+key,bounds[key]+'%');else frame.style.removeProperty('--scan-'+key);}
}
function documentPreview(p,d){
 const scanning=validatorBusy&&validatorProjectId===p.id,preparing=portraitBusy&&portraitProjectId===p.id;
 if(p.docPrepared&&!scanning&&!preparing)return `<section class="studio-local-result" aria-label="Студийное фото: до и после"><div class="studio-result-label"><span class="premium-gem">${icon('sparkles')}</span><div><h2>Студийная копия</h2><span class="small">Обработано на вашем устройстве</span></div></div><div class="before-after"><figure><div class="portrait-frame" style="aspect-ratio:${d.width}/${d.height}">${imageTag(p.photos[0])}</div><figcaption>Исходный снимок</figcaption></figure><figure><div class="portrait-frame" style="aspect-ratio:${d.width}/${d.height}">${imageTag(p.docPrepared)}</div><figcaption>Белый фон · ${p.docPrepared.processing?.light?.changed?'свет скорректирован':'исходный свет'}</figcaption></figure></div><div class="portrait-corrections"><span>✓ Белый фон</span><span>${Math.abs(p.docPrepared.processing?.rotationDegrees||0)>.3?"✓ Наклон исправлен":"✓ Линия глаз ровная"}</span><span>${p.docPrepared.processing?.light?.changed?"✓ Тени осветлены":"✓ Свет сохранён"}</span></div>${action("export-portrait",icon("download")+" Скачать обработанное фото","secondary",p.id)}<p class="micro">Студийная копия сохраняется отдельно. Для документного заказа используется исходник.</p></section>`;
 const checked=documentAuditCurrent(p),status=scanning||preparing?'scanning':checked?(p.docAudit.ready?'ready':'attention'):'idle';
 const label=preparing?'Готовим белый фон':scanning?'Сканируем снимок':checked?(p.docAudit.ready?'Проверка завершена':'Есть замечания'):'Снимок для проверки';
 return `<div class="doc-photo document-scan" data-scan-state="${status}" aria-busy="${scanning||preparing}" style="--document-ratio:${d.width/d.height};aspect-ratio:${d.width}/${d.height}">${imageTag(p.photos[0])}${scannerOverlay(label)}</div>`;
}
function preparationView(p,policy,gate,low){
 if(!policy.canPrepare)return '';
 const busy=portraitBusy&&portraitProjectId===p.id;
 return `<section class="prepare-card"><div class="prepare-heading"><span>${icon('sparkles')}</span><div><span class="eyebrow">Студийная обработка · на устройстве</span><h2>Ровный кадр. Мягкий свет.</h2></div></div><p>Модель выделит лицо, волосы и плечи. Мы заменим фон, выровняем кадр и осветлим тени, сохраняя детали исходного лица.</p><div class="prepare-features"><span>${icon('image')} Белый фон</span><span>${icon('check')} Оригинал сохранён</span></div><label class="check-label"><input type="checkbox" id="soft-light" ${p.docSoftLight!==false?'checked':''} ${busy?'disabled':''}><span>Добавить света, если нужно<small>Адаптивная коррекция теней с сохранением деталей</small></span></label>${primary(busy?'Подготавливаем снимок…':p.docPrepared?'Подготовить заново':icon('sparkles')+' Подготовить копию','prepare-doc',p.id,portraitBusy||validatorBusy||!gate.ready||low)}<div id="portrait-stage" class="processing-status" role="status">${e(busy?portraitStage:p.docProcessingError||'')}</div>${!gate.ready||low?`<p class="micro">${low?'Для обработки нужен оригинал большего размера.':'Сначала пройдите проверку лица выше.'}</p>`:''}<p class="micro">Копия для сравнения. Возможность подачи обработанного фото зависит от требований документа.</p></section>`;
}
function documentStudioContents(p,d){
 const task=docStudioTasks.get(p.id),preview=p.docAiPreview?.signature===documentSignature(p)?p.docAiPreview:null;
 const eligibility=studioEligibility(p,{low:preflight(p)[0]?.low});
 const busy=!!task?.controller;
 return `<div class="prepare-heading"><span class="premium-gem">${icon('sparkles')}</span><div><span class="eyebrow">Студия PicPac AI</span><h2>Студийное превью</h2></div></div>
 <p>Светлый ровный фон, мягкий свет и портрет по центру. Для обработки снимок отправляется в AIAI.BY.</p>
 ${preview?`<div class="before-after studio-ai-comparison"><figure><div class="portrait-frame" style="aspect-ratio:${d.width}/${d.height}">${imageTag(p.photos[0])}</div><figcaption>Исходный снимок</figcaption></figure><figure><div class="portrait-frame" style="aspect-ratio:${d.width}/${d.height}">${imageTag(preview)}</div><figcaption>ИИ-превью</figcaption></figure></div>
 <p class="micro">Сравните лицо, волосы и мелкие детали: модель могла их изменить.</p>${action('doc-ai-download',icon('download')+' Скачать превью','secondary',p.id)}`:''}
 ${action('doc-ai-open',busy?'Готовим превью…':preview?'Создать новый вариант':icon('sparkles')+' Создать студийное превью','primary',p.id,busy||!eligibility.ready||validatorBusy||portraitBusy?'disabled':'')}
 <div class="processing-status studio-ai-status" role="status">${e(task?.text||'')}</div>
 ${!eligibility.ready?`<p class="micro">${e(eligibility.message)}</p>`:''}
 <p class="micro">Превью для сравнения. В заказ и файл для документа входит оригинал.</p>`;
}
function refreshDocumentStudio(p){
 const panel=document.querySelector('#doc-ai-panel'),d=documents.find(x=>x.id===p.docId);
 if(!panel||route.id!==p.id||!d||!studioProfile(d.id))return;
 panel.innerHTML=documentStudioContents(p,d);hydrate();
}
function dropPreviewFile(photo){
 if(!photo?.id)return;
 const url=urls.get(photo.id);if(url)URL.revokeObjectURL(url);urls.delete(photo.id);
 void deletePhoto(photo.id).catch(()=>{});
}
function resetDocumentStudio(p){
 docStudioTasks.get(p.id)?.controller?.abort();
 docStudioTasks.delete(p.id);dropPreviewFile(p.docAiPreview);delete p.docAiPreview;
}
async function generateDocumentPreview(value){
 const p=projectBy(value),source=p?.photos[0],doc=documents.find(d=>d.id===p?.docId);
 if(!source||!doc||docStudioTasks.get(p.id)?.controller)return;
 const eligibility=studioEligibility(p,{low:preflight(p)[0]?.low});
 if(!eligibility.ready){toast(eligibility.message);return;}
 const signature=documentSignature(p),controller=new AbortController(),{signal}=controller,task={controller,text:'Подключаем ИИ-студию…'};
 const isCurrent=()=>!signal.aborted&&projectBy(p.id)===p&&documentSignature(p)===signature;
 const update=text=>{task.text=text;if(route.id===p.id)animateText(document.querySelector('.studio-ai-status'),text);};
 docStudioTasks.set(p.id,task);refreshDocumentStudio(p);
 if(source.capturedWithCamera)document.querySelector('#doc-ai-panel')?.scrollIntoView({block:'start',behavior:motionAllowed()?'smooth':'instant'});
 try{
   const capabilities=await getAiCapabilities();
   if(!isCurrent())return;
   if(!capabilities.operations.includes(DOCUMENT_STUDIO_OPERATION))throw new Error('ИИ-студия сейчас недоступна. Можно подготовить копию на устройстве.');
   update('Подготавливаем снимок…');
   const reference=await prepareStudioReference(await getPhoto(source.id));
   if(!isCurrent())return;
   const job=await createImageJob({operation:DOCUMENT_STUDIO_OPERATION,documentId:doc.id,references:[reference]},id(),{signal});
   const blob=await waitForImageJob(job,{signal,onStatus:status=>update(status==='queued'?'Ждём свободную студию…':'Модель готовит свет и фон…')});
   if(!isCurrent())return;
   update('Проверяем кадр и чёткость превью…');
   const result=await finishStudioPreview(blob,doc);
   if(!isCurrent())return;
   const photo={id:id(),name:'Студийное ИИ-превью',width:result.width,height:result.height,signature,promptVersion:job.promptVersion};
   await savePhoto(photo.id,result.blob);
   if(!isCurrent()){dropPreviewFile(photo);return;}
   const previous=p.docAiPreview;
   p.docAiPreview=photo;urls.set(photo.id,URL.createObjectURL(result.blob));
   try{await persist();}catch(error){p.docAiPreview=previous;dropPreviewFile(photo);throw error;}
   dropPreviewFile(previous);
   update('Превью готово. Сравните его с оригиналом.');
 }catch(error){if(isCurrent())update(error.message||'Не удалось получить превью. Исходник сохранён.');}
 finally{if(docStudioTasks.get(p.id)===task){task.controller=null;if(isCurrent())refreshDocumentStudio(p);}}
}
function auditView(p){
 if(validatorBusy&&validatorProjectId===p.id)return `<div class="validation-summary scanning-summary" role="status" aria-live="polite"><div class="validation-heading"><span>${icon('sparkles')}</span><div><h2>Знакомимся с вашим снимком</h2><p id="audit-stage">Подготавливаем фото к проверке…</p></div></div><div class="scan-steps" aria-hidden="true"><span>Лицо</span><span>Положение</span><span>Свет и резкость</span></div><p class="micro">Фото проверяется на устройстве. При первом запуске загрузим модель — это может занять немного больше времени.</p></div>`;
 if(!documentAuditCurrent(p))return `<div class="validation-summary"><h2>Проверим этот снимок</h2><p>${e(p.docAuditError||'Найдём лицо и подскажем, что нужно изменить перед подготовкой документа.')}</p>${primary('Проверить фото','audit-doc',p.id)}</div>`;
 const processed=p.docPrepared?.processing?.quality,a=processed?.version===p.docAudit.version?processed:p.docAudit;return `<section class="validation-summary ${a.status}" aria-label="Результаты проверки"><div class="validation-heading"><span>${icon(a.ready?'check':'info')}</span><div><h2>${a.ready?(a===processed?'Проверки обработанной копии пройдены':'Базовые проверки пройдены'):a.canCapture?'Нужна проверка деталей':'Нужно изменить снимок'}</h2><p>${a.passed} из ${a.total} автоматических проверок</p></div></div><p class="audit-hint">${e(a.hint)}</p>${auditRows(a)}<p class="micro">Оценка алгоритма, а не вероятность приёмки. Поворот тела, взгляд, головные уборы и требования ведомства проверяет специалист.</p></section>`;
}
function docResultView(){
 const p=current(),d=documents.find(x=>x.id===p?.docId),source=p?.photos[0];if(!d||!source)return docCaptureView();const ph=selectedDocumentPhoto(p),policy=documentPolicy(d.id),low=preflight({...p,photos:[ph]})[0].low,gate=documentAuditGate(p);
 const studio=studioProfile(d.id)?`<details class="glass doc-cloud-option" ${source.capturedWithCamera||p.docAiPreview||docStudioTasks.get(p.id)?.controller?'open':''}><summary>${source.capturedWithCamera?'Студийная обработка · ИИ':'Облачный вариант · ИИ'}</summary><section class="prepare-card studio-ai-card" id="doc-ai-panel">${documentStudioContents(p,d)}</section></details>`:'';
 return `${back('Проверка снимка',e(d.name))}${action('doc-change-type','Другой документ','text-button',p.id,portraitBusy||validatorBusy?'disabled':'')}${documentPreview(p,d)}${source.capturedWithCamera?studio:''}${auditView(p)}${agentCallout('Помощник по снимку',documentAuditCurrent(p)?p.docAudit.hint:'Объясню результаты проверки и что можно поправить.')}<div class="button-row">${action('reshoot-doc',icon('camera')+' Переснять','secondary',p.id,portraitBusy||validatorBusy?'disabled':'')}${action('upload',icon('image')+' Другой снимок','secondary',p.id,portraitBusy||validatorBusy?'disabled':'')}</div><div class="editor-actions">${action('edit-photo','Кадрирование','',source.id,portraitBusy||validatorBusy?'disabled':'')}${action('audit-doc','Проверить ещё раз','',p.id,validatorBusy||portraitBusy?'disabled':'')}</div>${preparationView(p,policy,gate,low)}${source.capturedWithCamera?'':studio}<div class="doc-policy">${e(policy.reason)}</div><div class="doc-check ${low?'pending':''}">${icon(low?'info':'check')}<div><h3>${source.width} × ${source.height} px</h3><p>${low?'Недостаточно для выбранного формата. Загрузите оригинал большего размера.':`Макет ${d.width} × ${d.height} мм · экспорт ${d.pxW} × ${d.pxH} px`}</p></div></div><label class="check-label"><input id="doc-agree" type="checkbox" ${p.reviewConsent?'checked':''}><span>Это актуальное фото. Перед печатью его должен проверить специалист.</span></label><div class="sticky-action"><div class="summary-inline"><span>Макет для контроля</span><strong>${money(12)}</strong></div>${primary('Подготовить к заказу','doc-to-cart',p.id,low||validatorBusy||portraitBusy||!gate.ready)}</div><p class="micro">Лицо и фон оригинала не изменяются. Подготовка и заказы в этой версии тестовые.</p>`;
}
async function auditDocument(p,{prepare=false,generateStudio=false}={}){
 if(!p?.photos[0]||portraitBusy)return;if(validatorBusy){queuedAudit={p,prepare,generateStudio};return;}stopCamera();const signature=documentSignature(p),ph=p.photos[0],d=documents.find(x=>x.id===p.docId);validatorBusy=true;validatorProjectId=p.id;delete p.docAuditError;p.reviewConsent=false;if(route.id===p.id){render();revealScanner();}
 try{
  const scale=Math.min(640/Math.max(d.pxW,d.pxH),ph.width/d.pxW,ph.height/d.pxH);const canvas=await photoCanvas(ph,Math.round(d.pxW*scale),Math.round(d.pxH*scale),{adjust:false});
  const {report}=await inspectDocumentCanvas(canvas,{onStage:async text=>{if(route.id!==p.id)return;const stage=document.querySelector('#audit-stage');if(stage)animateText(stage,text);await new Promise(resolve=>setTimeout(resolve,0));}});
  if(signature!==documentSignature(p))return;
  p.docAudit={...report,signature,createdAt:new Date().toISOString()};p.docUsePrepared=false;await persist();
 }catch{if(signature===documentSignature(p)){p.docAuditError='Не удалось выполнить проверку. Проверьте соединение и повторите. Оригинал сохранён.';delete p.docAudit;}}
 finally{
  validatorBusy=false;validatorProjectId=null;
  if(route.id===p.id)render();
  if(queuedAudit){const {p:next,...options}=queuedAudit;queuedAudit=null;void auditDocument(next,options);}
  else if(signature===documentSignature(p)&&route.id===p.id){
   const low=preflight(p)[0].low;
   if(generateStudio&&route.page==='docresult'&&studioEligibility(p,{low}).ready){
    void generateDocumentPreview(p.id);
   }else if(prepare&&documentPolicy(p.docId).canPrepare&&documentAuditGate(p).ready&&!low){await prepareDocument(p,{automatic:true});}
  }
 }
}

function ordersView(){return `${top('Ваши заказы')}<div class="segmented">${action('orders-tab',`Корзина${state.cart.length?' · '+state.cart.length:''}`,ordersTab==='cart'?'active':'','cart')}${action('orders-tab',`Заказы${state.orders.length?' · '+state.orders.length:''}`,ordersTab==='history'?'active':'','history')}</div>${ordersTab==='cart'?cartView():state.orders.length?state.orders.map(orderCard).join(''):emptyView('Всё хорошее впереди','Здесь появятся ваши заказы и история их создания.','Создать первую историю','nav','create')}`;}
function cartView(){if(!state.cart.length)return emptyView('Здесь пока тихо','Добавьте любимые фотографии — и мы поможем превратить их в воспоминания, которые можно держать в руках.','Выбрать, что создать','nav','create');const t=totals(state.cart,state.promo);return state.cart.map(item=>`<article class="cart-line"><img src="${item.thumb||asset('book-lite.png')}" alt="${e(item.name)}"><div class="cart-copy"><h3>${e(item.name)}</h3><p>${e(item.description)}</p><div class="cart-price"><strong>${money(item.price*item.quantity)}</strong><div class="quantity">${action('qty-minus',icon(item.quantity===1?'trash':'minus'),'',item.id,`aria-label="Уменьшить количество ${e(item.name)}"`)}<span>${item.quantity}</span>${action('qty-plus',icon('plus'),'',item.id,`aria-label="Увеличить количество ${e(item.name)}"`)}</div></div>${action('project','Изменить','text-button',item.projectId)}</div></article>`).join('')+`<form id="promo-form" class="inline-form"><input type="text" name="promo" placeholder="Например, PIC10" aria-label="Промокод" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${e(state.promo)}" maxlength="30"><button class="secondary compact" type="submit">Применить</button></form><p class="micro" style="margin-top:8px">Для тестирования: PIC10 даёт скидку 10%.</p><div class="summary-card">${summaryLines(t,false)}</div>${primary('Перейти к оформлению '+icon('arrow'),'checkout')}${note('Тестовый заказ без оплаты. Данные пока не отправляются на производство.')}`;}
function summaryLines(t,shipping=true){return `<div class="price-line"><span>Товары</span><span>${money(t.subtotal)}</span></div>${t.discount?`<div class="price-line discount"><span>Промокод PIC10</span><span>−${money(t.discount)}</span></div>`:''}${shipping?`<div class="price-line"><span>Доставка</span><span>${t.shipping?money(t.shipping):'Бесплатно'}</span></div>`:''}<div class="price-line total"><span>Итого</span><strong>${money(t.total)}</strong></div>`;}
const statusNames={review:'На проверке',changes:'Нужны изменения',production:'В производстве',ready:'Готов к получению',complete:'Получен'};
function orderCard(o){const step=['review','production','ready','complete'].indexOf(o.status);return `<article class="order-card"><div class="order-heading"><h3>Заказ ${e(o.id)}</h3><span class="status ${o.status}">${statusNames[o.status]}</span></div><p class="small" style="margin-top:8px">${new Date(o.created).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})} · Тестовый заказ</p><div class="order-images">${o.items.slice(0,4).map(x=>`<img src="${x.thumb||asset('book-lite.png')}" alt="${e(x.name)}">`).join('')}</div><div class="steps">${[0,1,2,3].map(n=>`<span class="${n<=step?'done':''}"></span>`).join('')}</div><div class="order-footer"><strong>${money(o.totals.total)}</strong>${action('order','Подробнее '+icon('arrow'),'text-button',o.id)}</div></article>`;}
function checkoutView(){if(!state.cart.length)return emptyView('Корзина пуста','Добавьте проект перед оформлением заказа.','К каталогу','nav','catalog');return `${back('Оформление заказа')}<span class="tag">Тестовый заказ · без оплаты</span><form id="checkout-form"><div class="section-heading"><h2>Как получить заказ?</h2></div>${[['pickup','Самовывоз','Пункт выдачи согласует менеджер','Бесплатно'],['post','Белпочта','Срок и отделение уточняются','от 5,90 BYN'],['courier','Курьер','Доставка по указанному адресу','12,00 BYN']].map(([v,title,sub,price],i)=>`<label class="delivery-option ${i===0?'selected':''}"><input type="radio" name="delivery" value="${v}" ${i===0?'checked':''}><span>${title}<small>${sub}</small></span><strong class="small">${price}</strong></label>`).join('')}<div class="section-heading"><h2>Ваши данные</h2></div><label class="form-field"><span>Имя</span><input name="name" type="text" autocomplete="name" required maxlength="80" value="${e(state.profile.name)}" placeholder="Как к вам обращаться"></label><label class="form-field"><span>Телефон</span><input name="phone" type="tel" autocomplete="tel" required minlength="7" maxlength="25" value="${e(state.profile.phone)}" placeholder="+375 …"></label><label class="form-field"><span>Электронная почта</span><input name="email" type="email" autocomplete="email" value="${e(state.profile.email)}" placeholder="Для цифровых фотографий"></label><label class="form-field hidden" id="address-field"><span>Адрес или отделение</span><textarea name="address" maxlength="300" placeholder="Индекс, город, улица, дом / отделение">${e(state.profile.address)}</textarea></label><div class="summary-card" id="checkout-summary">${summaryLines(totals(state.cart,state.promo))}</div><label class="check-label"><input type="checkbox" name="consent" required><span>Понимаю, что это тестовое оформление. Данные сохранятся в этом браузере, деньги не списываются.</span></label><button class="primary" type="submit">Создать тестовый заказ ${icon('arrow')}</button></form>`;}
function successView(){const o=state.orders.find(x=>x.id===route.id);if(!o)return ordersView();return `<div class="success-view"><div class="success-icon">${icon('check')}</div><h1>История<br>продолжается!</h1><p>Заказ ${e(o.id)} сохранён.<br>Следующий шаг — проверка макета.</p><img src="${asset('picpac-cat.png')}" alt="Котик PicPac" style="height:175px;margin:15px auto;object-fit:contain"><div class="summary-card"><div class="price-line"><span>Статус</span><span class="status review">На проверке</span></div><div class="price-line"><span>Стоимость</span><strong>${money(o.totals.total)}</strong></div><p class="small">Это демонстрационный заказ. Реальная отправка в отдел контроля и оплата появятся после подключения сервера.</p></div>${primary('Следить за заказом','order',o.id)}${action('nav','На главную','text-button','home')}</div>`;}
function orderView(){const o=state.orders.find(x=>x.id===route.id);if(!o)return ordersView();const step=['review','production','ready','complete'].indexOf(o.status);return `${back('Заказ '+e(o.id))}<span class="status ${o.status}">${statusNames[o.status]}</span><p class="small" style="margin-top:12px">Тестовый заказ · ${new Date(o.created).toLocaleDateString('ru-RU')}</p>${o.comment?note('Комментарий контроля: '+e(o.comment),o.status==='changes'?'warn':''):''}<div class="timeline">${[['Макет на проверке','Контролёр проверяет фотографии и параметры печати.'],['В производстве','Заказ готов к передаче в печать.'],['Готов к получению','Доставка или самовывоз по согласованию.'],['Получен','Пусть эти фотографии радуют вас каждый день.']].map(([title,sub],i)=>`<div class="timeline-item ${i<=step?'done':''}"><span>${i<=step?icon('check'):''}</span><h3>${title}</h3><p>${sub}</p></div>`).join('')}</div><h2>В вашем заказе</h2><div style="margin-top:14px">${o.items.map(x=>`<div class="draft-card"><img src="${x.thumb||asset('book-lite.png')}" alt="${e(x.name)}"><div><h3>${e(x.name)}</h3><p>${e(x.description)}</p><p>${x.quantity} × ${money(x.price)}</p></div>${action('project',icon('chevron'),'icon-button',x.projectId,'aria-label="Открыть проект"')}</div>`).join('')}</div><div class="summary-card">${summaryLines(o.totals)}</div>${primary('Повторить заказ','reorder',o.id)}${action('chat',icon('bot')+' Нужна помощь','secondary')}<details class="soft-note"><summary>История изменений</summary>${o.events.map(ev=>`<p class="small">${new Date(ev.at).toLocaleString('ru-RU')} — ${e(ev.label)}</p>`).join('')}</details>`;}
function controlView(){return `${back('Отдел контроля','Демонстрационная очередь')}${note('Эта очередь находится в том же браузере. Здесь можно проверить сценарий контролёра; доступ сотрудников и реальная передача файлов требуют сервера.')}<div class="chips">${action('refresh-view',icon('refresh')+' Обновить','chip')}</div>${state.orders.length?state.orders.map(o=>`<article class="review-card"><div class="order-heading"><h3>${e(o.id)}</h3><span class="status ${o.status}">${statusNames[o.status]}</span></div><p class="small" style="margin-top:8px">${o.items.map(x=>e(x.name)).join(', ')}</p>${o.items.map(x=>{const p=x.snapshot;return p?.photos[0]?imageTag(p.photos[0]):'';}).join('')}${action('control-preview','Просмотреть весь макет','secondary',o.id)}<textarea aria-label="Комментарий для ${o.id}" data-review-comment="${o.id}" placeholder="Комментарий: например, на лице заметна тень">${e(o.comment||'')}</textarea><div class="button-row">${action('control-changes','На доработку','secondary compact',o.id)}${action('control-next',o.status==='review'||o.status==='changes'?'Макет одобрен':o.status==='production'?'Заказ готов':o.status==='ready'?'Заказ получен':'Получен','primary compact',o.id,o.status==='complete'?'disabled':'')}</div></article>`).join(''):emptyView('Очередь пока пуста','Создайте тестовый заказ, чтобы проверить работу контроля.','К студии','nav','create')}`;}
function digitalView(){const docs=state.projects.filter(p=>p.type==='docs'&&p.photos.length);return `${back('Фото на документы')}${docs.length?docs.map(p=>`<div class="review-card"><h3>${e(p.name)}</h3>${imageTag(selectedDocumentPhoto(p))}<p class="small">Макет · ${documents.find(d=>d.id===p.docId)?.subtitle}</p><div class="button-row">${action('export-doc','JPEG','secondary compact',p.id)}${action('export-sheet','Печатный лист','primary compact',p.id)}</div><p class="micro" style="margin-top:10px">Тестовый макет. Перед подачей необходима проверка специалиста.</p></div>`).join(''):emptyView('Ваши снимки будут здесь','Подготовьте фото для паспорта, визы или ВНЖ.','Сделать фото','docs')}`;}

function albumProgressView(p){const progress=albumProgress(p);return `<div class="album-progress"><h3>${progress.ready?'Можно собирать альбом':`Ещё ${progress.missing} фото — и начнём`}</h3><div class="album-dots">${[0,1,2].map(i=>`<span class="${progress.count>i?'complete':''}"></span>`).join('')}</div><p>Загружено ${progress.count} из минимум 3 разных фотографий. ${p.photos.some(x=>x.demo)?'Примеры не учитываются.':''}</p>${action('upload',icon('image')+' Открыть галерею','secondary gallery-button',p.id)}</div>`;}
async function prepareDocument(p,{automatic=false}={}){
 if(!p||portraitBusy)return;if(!documentAuditGate(p).ready){toast('Сначала исправьте замечания проверки снимка.');return;}const policy=documentPolicy(p.docId);if(!policy.canPrepare){toast(policy.reason);return;}
 const ph=p.photos[0],d=documents.find(x=>x.id===p.docId);if(!ph||preflight(p)[0].low){toast('Нужен исходный снимок большего размера.');return;}
 const signature=documentSignature(p),sourceId=ph.id;const softLight=automatic?(p.docSoftLight!==false):(document.querySelector('#soft-light')?.checked??p.docSoftLight!==false);
 p.docSoftLight=softLight;delete p.docProcessingError;portraitBusy=true;portraitProjectId=p.id;portraitStage='Подготавливаем исходный снимок…';if(route.id===p.id){render();revealScanner();}
 const update=text=>{portraitStage=text;const stage=document.querySelector('#portrait-stage');if(stage&&route.id===p.id)animateText(stage,text);};
 try{
  const blob=await getPhoto(ph.id);if(!blob)throw new Error('Исходный файл недоступен. Загрузите его снова.');
  const result=await preparePortrait(blob,{softLight,targetRatio:d.width/d.height,onStage:update});
  if(signature!==documentSignature(p)){toast('Исходник изменился. Подготовьте новый снимок.');return;}
  const prepared={id:id(),name:'Студийная копия · '+ph.name,width:result.width,height:result.height,x:50,y:50,brightness:100,contrast:100,copies:1,originalId:sourceId,sourceHash:ph.contentHash,processing:result.meta};
  await savePhoto(prepared.id,result.blob);urls.set(prepared.id,URL.createObjectURL(result.blob));
  p.docPrepared=prepared;p.docUsePrepared=false;p.docPreparationAccepted=false;p.reviewConsent=false;p.updated=new Date().toISOString();await persist();toast('Готово: белый фон, ровный кадр и коррекция света.');
 }catch(error){toast(error.message||'Обработка не завершена. Исходник сохранён.');if(signature===documentSignature(p))p.docProcessingError=error.message;}
 finally{portraitBusy=false;portraitProjectId=null;portraitStage='';if(route.id===p.id&&route.page==='docresult')render();}
}
function localStudio(p){
 if(!p||p.type==='docs')return;
 if(aiResult?.url)URL.revokeObjectURL(aiResult.url);aiResult=null;
 const photos=p.photos.filter(ph=>!ph.demo);
 openSheet('Фотостудия',`<p class="subtext">Свет, белый фон и ровный портрет. Обработка на вашем устройстве, оригинал сохраняется.</p>${photos.length?`<form id="studio-form" data-project="${p.id}"><label class="form-field"><span>Фотография</span><select name="photo">${photos.map(ph=>`<option value="${ph.id}">${e(ph.name||'Фото')}</option>`).join('')}</select></label><label class="form-field"><span>Что сделать</span><select name="mode"><option value="light">Осветлить тени · сохранить фон</option><option value="portrait">Портрет · белый фон, свет, выравнивание</option></select></label><p class="small">Для портрета нужен один человек анфас, с головой и плечами в кадре.</p><button type="submit" class="primary">${icon('sparkles')} Обработать фото</button><div id="studio-status" class="processing-status" role="status"></div><div id="studio-result"></div></form>`:`${note('Добавьте своё фото из галереи. Демонстрационные изображения не используются для студийных копий.')}${primary(icon('image')+' Выбрать фото','upload',p.id)}`}`);
}
async function processStudio(form){
 if(portraitBusy){toast('Дождитесь обработки текущего портрета.');return;}
 const p=projectBy(form.dataset.project),data=new FormData(form),ph=p?.photos.find(x=>x.id===data.get('photo'));if(!ph||ph.demo)return;
 const button=form.querySelector('[type="submit"]'),status=form.querySelector('#studio-status'),token=++aiPollToken;
 button.disabled=true;form.querySelectorAll('select').forEach(el=>el.disabled=true);form.querySelector('#studio-result').innerHTML='';
 try{
  const blob=await getPhoto(ph.id);if(!blob)throw new Error('Файл недоступен. Загрузите фото снова.');
  const onStage=text=>{if(form.isConnected)status.textContent=text;};
  const result=data.get('mode')==='portrait'?await preparePortrait(blob,{softLight:true,targetRatio:.8,onStage}):await preparePhotoLight(blob,{onStage});
  if(token!==aiPollToken||!form.isConnected)return;
  if(aiResult?.url)URL.revokeObjectURL(aiResult.url);
  aiResult={blob:result.blob,url:URL.createObjectURL(result.blob),projectId:p.id,sourceId:ph.id,name:data.get('mode')==='portrait'?'Студийный портрет':'Мягкий свет',processing:result.meta};
  status.textContent=result.meta.light?.changed?'Готово. Тени осветлены, оригинал сохранён.':'Готово. Исходное освещение сохранено.';
  form.querySelector('#studio-result').innerHTML=`<div class="before-after"><figure><div class="portrait-frame">${imageTag(ph)}</div><figcaption>Оригинал</figcaption></figure><figure><div class="portrait-frame"><img src="${aiResult.url}" alt="Обработанная копия фотографии"></div><figcaption>После обработки</figcaption></figure></div>${primary('Добавить копию в проект','ai-use-result')}`;
 }catch(error){if(form.isConnected)status.textContent=error.message||'Не удалось обработать снимок.';}
 finally{if(button.isConnected){button.disabled=false;form.querySelectorAll('select').forEach(el=>el.disabled=false);}}
}
async function aiStudio(p){
 if(!p||p.type==='docs')return;
 const openedFrom=route;
 if(aiResult?.url)URL.revokeObjectURL(aiResult.url);aiResult=null;
 aiCapabilities=await getAiCapabilities();if(route!==openedFrom)return;
 aiSelection=p.photos.filter(x=>!x.demo).slice(0,3).map(x=>x.id);
 const draft=p.aiDraft||{};openSheet('Творческая студия',`<p class="subtext">Новый фон, мягкий свет или другая атмосфера. Сохраним исходник и дадим сравнить результат.</p>${note(aiCapabilities.connected?'Сервис: '+e(aiCapabilities.provider)+'.':'Подключение модели подготовлено. Генерация появится после настройки сервера; сейчас можно сохранить идею.')}<form id="ai-form" data-project="${p.id}"><label class="form-field"><span>Задача</span><select name="operation"><option value="photo.edit" ${!aiCapabilities.operations.includes('photo.edit')?'disabled':''}>Изменить мои фотографии</option><option value="art.generate" ${draft.operation==='art.generate'||!aiCapabilities.operations.includes('photo.edit')?'selected':''} ${!aiCapabilities.operations.includes('art.generate')?'disabled':''}>Создать иллюстрацию для альбома</option></select></label><p class="small">Выберите до 3 исходных фотографий</p><div class="ai-photos">${p.photos.filter(x=>!x.demo).map(ph=>`<label class="ai-reference">${imageTag(ph)}<input type="checkbox" name="reference" value="${ph.id}" ${aiSelection.includes(ph.id)?'checked':''}><span>${e(ph.name)}</span></label>`).join('')||'<p class="small">Добавьте собственные фотографии через галерею.</p>'}</div><label class="form-field"><span>Что изменить?</span><textarea name="prompt" maxlength="2000" minlength="3" placeholder="Например: спокойный сад на фоне, мягкий дневной свет. Сохранить лицо и естественную текстуру кожи." required>${e(draft.prompt||'')}</textarea></label><label class="check-label"><input type="checkbox" name="consent"><span>Разрешаю отправить выбранные фото серверу PicPac и подключённой модели для этого запроса.</span></label><button class="primary" type="submit" ${!aiCapabilities.operations.some(op=>['photo.edit','art.generate'].includes(op))?'disabled':''}>${icon('sparkles')} Получить вариант</button>${action('ai-save-idea','Сохранить идею','secondary')}<div id="ai-status" class="processing-status" role="status"></div><div id="ai-result"></div></form><p class="micro" style="margin-top:14px">Творческая генерация не применяется к фото на документы. Результат нужно проверить: модель может изменить детали внешности.</p>`);
}
async function saveAiIdea(){const f=document.querySelector('#ai-form');if(!f)return;const p=projectBy(f.dataset.project),data=new FormData(f);p.aiDraft={operation:data.get('operation'),prompt:data.get('prompt').trim()};p.updated=new Date().toISOString();await persist();toast('Идея сохранена в проекте');}
async function generateAiImage(f){
 const p=projectBy(f.dataset.project),data=new FormData(f),operation=data.get('operation'),selected=data.getAll('reference');
 if(!aiCapabilities?.connected){toast('Сервис генерации ещё не подключён');return;}
 if(!aiCapabilities.operations.includes(operation)){toast('Подключённая модель не поддерживает эту задачу');return;}
 if(operation==='photo.edit'&&(!selected.length||selected.length>3)){toast('Выберите от 1 до 3 фотографий');return;}
 if(!data.has('consent')){toast('Нужно согласие на обработку выбранных фотографий');return;}
 await saveAiIdea();const btn=f.querySelector('[type="submit"]');btn.disabled=true;const status=f.querySelector('#ai-status');status.textContent='Подготавливаем выбранные фотографии…';const pollToken=++aiPollToken;
 try{
  const references=[];if(operation==='photo.edit')for(const pid of selected){const ph=p.photos.find(x=>x.id===pid);if(!ph)throw new Error('Фотография недоступна');const scale=Math.min(1,1600/Math.max(ph.width,ph.height));const canvas=await photoCanvas(ph,Math.round(ph.width*scale),Math.round(ph.height*scale));references.push({mimeType:'image/jpeg',data:canvas.toDataURL('image/jpeg',.92).split(',')[1]});}
  const job=await createImageJob({operation,prompt:data.get('prompt'),references,consent:true},id());p.aiJobId=job.id;await persist();status.textContent='Модель создаёт вариант…';
  const controller=new AbortController();
  const blob=await waitForImageJob(job,{signal:controller.signal,onStatus:()=>{if(pollToken!==aiPollToken)controller.abort();}});

  if(pollToken!==aiPollToken)return;const url=URL.createObjectURL(blob);aiResult={blob,url,projectId:p.id,sourceId:selected[0],jobId:job.id};status.textContent='Вариант готов. Проверьте лицо и мелкие детали.';
  f.querySelector('#ai-result').innerHTML=`<img class="ai-response" src="${url}" alt="Результат творческой генерации">${primary('Добавить вариант в проект','ai-use-result')}`;
 }catch(error){status.textContent=error.message;}finally{if(btn.isConnected)btn.disabled=false;}
}
async function useAiResult(){if(!aiResult)return;const p=projectBy(aiResult.projectId),source=p.photos.find(x=>x.id===aiResult.sourceId),bitmap=await createImageBitmap(aiResult.blob);const ph={id:id(),name:aiResult.name||'Творческий вариант',processing:aiResult.processing,width:bitmap.width,height:bitmap.height,generated:true,originalId:source?.id,sourceHash:source?.contentHash||source?.sourceHash,jobId:aiResult.jobId,x:50,y:50,brightness:100,contrast:100,copies:1};bitmap.close();await savePhoto(ph.id,aiResult.blob);urls.set(ph.id,aiResult.url);p.photos.push(ph);p.updated=new Date().toISOString();await persist();aiResult=null;closeModal();navigate('editor',{id:p.id});toast('Копия добавлена. Исходник сохранён.');}

function openSheet(title,body,variant=''){if(!overlay.innerHTML)modalReturn=document.activeElement;document.querySelector('.app-shell').inert=true;overlay.innerHTML=`<div class="scrim" data-scrim><div class="sheet ${variant}" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="sheet-handle"></div><div class="sheet-top"><h2>${title}</h2>${action('close',icon('close'),'icon-button','','aria-label="Закрыть"')}</div>${body}</div></div>`;document.body.style.overflow='hidden';document.querySelector('#assistant-launch').setAttribute('aria-expanded','true');overlay.querySelector('button,input,select,textarea')?.focus();hydrate();}
function closeModal(){aiPollToken++;if(!overlay.innerHTML)return;overlay.innerHTML='';document.querySelector('.app-shell').inert=false;document.body.style.overflow='';document.querySelector('#assistant-launch').setAttribute('aria-expanded','false');if(modalReturn?.isConnected)modalReturn.focus();modalReturn=null;}
function photoModal(pid){const p=current(),ph=p?.photos.find(x=>x.id===pid);if(!ph)return;const index=p.photos.indexOf(ph);openSheet('Ваш кадр',`<div class="crop-frame" style="${p.type==='docs'?`height:320px;width:${Math.round(320*documents.find(d=>d.id===p.docId).width/documents.find(d=>d.id===p.docId).height)}px;margin:auto`:p.type==='books'?'height:300px;width:300px;max-width:100%;margin:auto':`height:320px;width:${Math.round(320*Number(p.format.split('×')[0])/Number(p.format.split('×')[1]))}px;margin:auto`}">${imageTag(ph,'crop-image')}<div class="crop-lines"></div></div><form id="photo-form" data-id="${pid}"><label class="range-label" for="crop-x">Положение по горизонтали</label><input class="range-input" id="crop-x" name="x" type="range" min="0" max="100" value="${ph.x??50}"><label class="range-label" for="crop-y">Положение по вертикали</label><input class="range-input" id="crop-y" name="y" type="range" min="0" max="100" value="${ph.y??50}">${p.type!=='docs'?`<label class="range-label" for="photo-brightness">Освещение <span id="brightness-value">${ph.brightness??100}%</span></label><input class="range-input" id="photo-brightness" name="brightness" type="range" min="65" max="140" value="${ph.brightness??100}"><label class="range-label" for="photo-contrast">Контраст</label><input class="range-input" id="photo-contrast" name="contrast" type="range" min="70" max="130" value="${ph.contrast??100}"><label class="check-label"><input name="bw" type="checkbox" ${ph.bw?'checked':''}>Чёрно-белая фотография</label><div class="editor-actions">${action('photo-auto',icon('sparkles')+' Мягкий свет')}${action('photo-reset',icon('refresh')+' Оригинал')}</div><label class="form-field"><span>Подпись к фотографии</span><input name="caption" type="text" maxlength="160" value="${e(ph.caption||'')}" placeholder="Что хочется запомнить?"></label>`:note('Меняем только кадрирование. Внешность и фон остаются исходными.')}<label class="form-field"><span>Размещение в кадре</span><select name="fit"><option value="cover" ${ph.fit!=='contain'?'selected':''}>Заполнить кадр</option><option value="contain" ${ph.fit==='contain'?'selected':''}>Вписать целиком с полями</option></select></label><div class="settings-grid"><label class="form-field"><span>Позиция в проекте</span><select name="position">${p.photos.map((_,i)=>`<option value="${i}" ${index===i?'selected':''}>${i+1}</option>`).join('')}</select></label>${p.type==='prints'?`<label class="form-field"><span>Копий</span><select name="copies">${[1,2,3,4,5,10].map(n=>`<option ${ph.copies===n?'selected':''}>${n}</option>`).join('')}</select></label>`:''}</div><button class="primary" type="submit">Сохранить кадр ${icon('check')}</button></form>${p.type!=='docs'?action('remove-photo',icon('trash')+' Убрать из проекта','text-button danger',pid):''}`);}
function preflightModal(p,forCart=false){const readiness=projectReadiness(p);if(!readiness.ready){toast(readiness.message);return;}const issues=preflight(p),low=issues.filter(x=>x.low).length;openSheet('Проверка макета',`${note(low?`${low} фото могут получиться недостаточно чёткими. Мы рекомендуем заменить их оригиналами.`:'Разрешения фотографий достаточно для предварительного макета.',low?'warn':'success')}<div class="detail-features"><div>${icon('check')} ${p.photos.length} фото добавлено</div><div>${icon('check')} Порядок и кадрирование сохранены</div><div>${icon('check')} ${p.type==='books'?'Композиция страниц выбрана':e(p.format)+' см · '+e(p.finish)}</div></div>${p.photos.some(x=>x.demo)?note('В проекте используются примеры изображений. Этот заказ остаётся тестовым.'):''}<p class="small">Проверьте важные детали у края кадра. Контролёр должен подтвердить макет перед настоящей печатью.</p>${primary(forCart?'Добавить тестовый заказ':'Всё понятно',forCart?'confirm-cart':'close',p.id)}`);}
function agentCallout(title,text,act='ai-chat',value='',label='Спросить PicPac AI'){
 return `<aside class="agent-callout glass"><span class="premium-gem">${icon('sparkles')}</span><div><h3>${e(title)}</h3><p>${e(text)}</p>${action(act,e(label)+' '+icon('arrow'),'text-button',value)}</div></aside>`;
}
function assistantContext(){
 const p=current(),documentPage=['docselect','doccapture','docresult'].includes(route.page);
 if(documentPage){
   const report=liveDocumentReport||(documentAuditCurrent(p)?p.docAudit:null);
   return {kind:'document',p,report,title:report?'Разберём ваш кадр':'Помогу со снимком',tip:report?.hint||'Подскажу, как поставить свет и расположить лицо.',suggestions:['Что исправить в кадре?','Как поставить свет?','Как сделать студийное превью?']};
 }
 if(route.page==='ai'&&aiTool==='art')return {kind:'art',title:'Придумаем иллюстрацию',tip:'Помогу сформулировать описание и открыть генерацию.',suggestions:['Как описать обложку?','Открыть генерацию иллюстраций']};
 if(route.page==='ai'&&aiTool==='photos'||p&&route.page==='editor'&&p.type!=='books')return {kind:'photo',p:p||projectBy(document.querySelector('#studio-project')?.value),title:'Помогу со светом и фоном',tip:'Выберите обычное фото из проекта для обработки.',suggestions:['Как осветлить тени?','Творческое редактирование']};
 if(route.page==='ai'&&aiTool==='album'||p?.type==='books')return {kind:'album',p,title:'Доработаем ваш альбом',tip:'Поменяю оформление в предпросмотре, чтобы вы могли его оценить.',suggestions:['Сине-фиолетовая палитра','Обложка только текст','Шрифт с засечками']};
 return {kind:'general',title:'С чего начнём?',tip:'Помогу с альбомами, фото на документы и студийной обработкой.',suggestions:['Придумать дизайн альбома','Фото на документы','Где мой заказ?']};
}
function chatView(){
 const context=assistantContext();
 openSheet('PicPac AI',`<div class="chat-header glass"><span class="bot-avatar"><img src="${asset('picpac-ai-face.png')}" alt=""></span><div><h3>${e(context.title)}</h3><p>${e(context.tip)}</p></div></div>
 <div class="chat-messages" id="chat-messages" role="log" aria-label="Диалог с помощником">${chatMessages.map(m=>chatBubble(m)).join('')}</div>
 <div class="suggestions agent-chips">${context.suggestions.map(x=>action('chat-suggest',e(x),'chip',x)).join('')}</div>
 <form id="chat-form" class="chat-form agent-composer"><input type="text" name="message" placeholder="Спросите помощника…" aria-label="Сообщение помощнику" required maxlength="500"><button class="premium-surface" type="submit" aria-label="Отправить">${icon('arrow')}</button></form>
 ${context.kind==='album'?'<p class="micro agent-privacy">Если для запроса нужна облачная модель, ей отправится только введённый текст.</p>':''}`,'assistant-sheet');
 const log=overlay.querySelector('#chat-messages');log.scrollTop=log.scrollHeight;
}
function chatBubble(m,enter=false){
 return `<div class="bubble ${m.role==='user'?'user':''} ${enter?'bubble-enter':''}">${e(m.text)}${m.action?action(m.action,e(m.label)+icon('arrow'),'',m.value||''):''}</div>`;
}
function appendChat(message,form){
 chatMessages.push(message);
 if(chatMessages.length>30)chatMessages.shift();
 if(!form?.isConnected)return;
 const log=overlay.querySelector('#chat-messages');
 log.insertAdjacentHTML('beforeend',chatBubble(message,true));log.scrollTop=log.scrollHeight;
}
function documentReply(q,{p,report}){
 if(!p)return {text:'Выберите страну и документ, чтобы открыть инструкцию к кадру.',action:'docs',label:'Выбрать документ'};
 if(/студи|превью|обработ/.test(q)){
   if(!studioProfile(p.docId))return {text:'Для этого пресета PicPac использует исходное фото. Встаньте перед однотонной светлой стеной, а телефон держите на уровне глаз.'};
   if(!p.photos.length)return {text:'Сначала сделайте или загрузите кадр анфас. После базовой проверки можно будет сравнить его со студийным вариантом.',action:'agent-camera',value:p.id,label:'Включить камеру'};
   const eligibility=studioEligibility(p,{low:preflight(p)[0]?.low});
   return eligibility.ready?{text:'Можно подготовить студийную копию с мягким светом и белым фоном прямо на устройстве. Также можно проверить доступность облачного варианта.',action:'doc-local-from-sheet',value:p.id,label:'Подготовить студийную копию'}:{text:eligibility.message};
 }
 if(/свет|тен[ьи]|фон/.test(q)){
   const light=report?.checks.find(check=>check.id==='light');
   return {text:(light&&light.status!=='pass'?light.message+' ':'')+'Встаньте лицом к окну без прямого солнца. Уберите яркие лампы сбоку и отойдите от стены, чтобы на фоне не было тени.'};
 }
 if(/снять|камер|пересн/.test(q))return {text:'Поставьте телефон на уровне глаз. Смотрите в объектив, оставьте место над макушкой и не приближайте телефон слишком сильно.',action:'agent-camera',label:'Открыть камеру',value:p.id};
 if(report){
   const issues=report.checks.filter(check=>check.status==='fail'||check.status==='warn');
   if(issues.length)return {text:issues.slice(0,2).map(issue=>issue.message).join(' '),...(route.page==='docresult'?{action:'agent-camera',label:'Переснять кадр',value:p.id}:{})};
   return {text:'Базовые проверки выглядят хорошо. Проверьте, что видны волосы и верх плеч, а фон чистый и ровный.'};
 }
 return p.photos.length?{text:'Пока нет результата проверки для этого снимка.',action:'agent-audit',label:'Проверить фото',value:p.id}:{text:'Включите камеру или загрузите снимок из галереи. Я смогу подсказать по результату проверки.',action:'agent-camera',label:'Открыть камеру',value:p.id};
}
async function assistantReply(text,context){
 const q=text.toLocaleLowerCase('ru');
 if(context.kind==='document')return documentReply(q,context);
 if(/заказ|доставк|трек/.test(q)){
   const match=q.match(/(?:pp-)?\d{4,}/),found=match?state.orders.find(o=>o.id.toLowerCase().includes(match[0])):state.orders[0];
   return {text:found?`Заказ ${found.id}: ${statusNames[found.status]||'статус уточняется'}.`:'В этом браузере не нашёл такой заказ.',action:found?'order':'nav',label:found?'Открыть заказ':'Мои заказы',value:found?.id||'orders'};
 }
 if(/сша|ds.?160|америк/.test(q))return {text:'Открою пресет DS-160 с инструкцией и направляющими для камеры.',action:'select-doc',label:'Фото для визы США',value:'us'};
 if(/виз[ауые]|документ|паспорт|внж/.test(q))return {text:'Сначала выберите документ. Я помогу с проверкой позы, света и чёткости.',action:'docs',label:'Выбрать документ'};
 if(/иллюстрац|нарисуй|что нарисовать/.test(q)||context.kind==='art')return {text:'Укажите сюжет, стиль и цвета. Например: «Ветка яблони, лёгкая акварель, белый фон, без надписей».',action:'ai-tool',value:'art',label:'Открыть иллюстрации'};
 if(Object.keys(interpretAlbumCommand(text)).length||context.kind==='album'&&/сдела|хочу|стиль|добав|измени|оформление|палитр|подзаголов/.test(q))
   return runAlbumCommand(text,context.p?.id,{chat:true});
 if(/фон|улучш|свет|ретуш|портрет|творческ/.test(q)){
   const p=context.p,creative=/творческ/.test(q);
   return {text:creative?'В творческой студии можно описать новый фон или атмосферу.':'Выберите фотографию и режим: мягкий свет или портрет с ровным фоном.',action:p&&p.type!=='docs'?(creative?'ai-creative':'ai-studio'):'ai-tool',value:p&&p.type!=='docs'?p.id:'photos',label:'Открыть фотостудию'};
 }
 if(/дизайн|оформ|альбом|макет|обложк|свадьб|выпуск/.test(q))return {text:'Открою конструктор. Выберите свой альбом и напишите, что изменить: палитру, обложку, шрифт или развороты.',action:'ai-album-preview',label:'Открыть ИИ-дизайн'};
 if(/книг|шаблон/.test(q))return {text:'В шаблонах есть семейные, детские и туристические макеты. Их оформление можно менять в ИИ-студии.',action:'templates',label:'Посмотреть шаблоны'};
 return {text:'Попробуйте «Фото на документы», «Обложка только текст» или «Осветлить тени». Я подскажу следующий шаг.'};
}
let chatPending=false;
async function respond(input){
 const text=String(input||'').trim().slice(0,500);
 const form=overlay.querySelector('#chat-form');if(!text||!form||chatPending)return;
 chatPending=true;const button=form.querySelector('[type=submit]');button.disabled=true;form.reset();
 appendChat({role:'user',text},form);
 try{appendChat({role:'bot',...await assistantReply(text,assistantContext())},form);}
 catch{appendChat({role:'bot',text:'Не удалось обновить макет. Попробуйте ещё раз.'},form);}
 finally{chatPending=false;button.disabled=false;if(form.isConnected)form.elements.message.focus({preventScroll:true});}
}

async function newProject(type,options={}){const p={id:id(),type,productId:type==='books'?'lite':type==='prints'?'prints':type==='gifts'?'postcards':'documents',name:type==='books'?'Наша история':type==='gifts'?'Открытка с теплом':type==='docs'?'Фото на документы':'Любимые фотографии',title:'Счастье — быть вместе',layout:'duo',color:'#C4DAD6',format:type==='books'?'20×20':'10×15',finish:'Матовая',photos:[],updated:new Date().toISOString(),...options};state.projects.unshift(p);await persist();pageIndex=0;navigate(type==='docs'?'doccapture':'editor',{id:p.id});return p;}
async function addDemo(p){for(let i=0;i<demoPhotos.length;i++){const file=demoPhotos[i],img=new Image();img.src=asset(file);await img.decode();p.photos.push({id:id(),demo:true,file,width:img.naturalWidth,height:img.naturalHeight,name:'Пример '+(i+1),x:50,y:50,brightness:100,contrast:100,copies:1,caption:''});}p.updated=new Date().toISOString();await persist();render();toast('10 примеров добавлены. Можно заменить своими.');}
function choosePhotos(pid){
 const p=projectBy(pid);if(!p)return;if(p.type!=='docs'&&p.photos.length>=100){toast('В проекте уже 100 фото. Уберите лишние перед загрузкой.');return;}stopCamera();
 openSheet('Фото из вашей галереи',`<div class="gallery-permission"><div class="gallery-permission-art" aria-hidden="true"><span>${icon('image')}</span><span>${icon('check')}</span></div><h3>Разрешить выбор фотографий?</h3><p>Откроем галерею или окно выбора файлов. ${p.type==='docs'?'Выберите один снимок, где хорошо видно лицо.':'Выберите фотографии, которые хотите добавить в проект.'}</p><div class="gallery-privacy">${icon('check')}<span>PicPac получит только выбранные фото. Остальная галерея останется закрытой.</span></div><p class="small">${p.type==='docs'?'Сохраним оригинал и проверим лицо, положение и освещение на устройстве.':'Фотографии сохранятся в проекте на этом устройстве.'}</p>${primary(icon('image')+' Разрешить выбор фото','gallery-allow',pid)}${action('close','Не сейчас','secondary')}<p class="micro">JPEG, PNG, WebP · до 25 МБ на фото. Если телефон сохраняет в HEIC, выберите копию в JPEG.</p></div>`);
}
function openGallery(pid){
 const p=projectBy(pid);if(!p)return;closeModal();uploadTarget=pid;input.multiple=p.type!=='docs';input.value='';
 // Keep the picker in this click's user activation, including on mobile Safari.
 try{input.click();}catch{uploadTarget=null;toast('Не удалось открыть галерею. Нажмите ещё раз или проверьте разрешения браузера.');}
}
async function acceptFiles(files,pid){
 const p=projectBy(pid);if(!p||!files.length)return;const max=p.type==='docs'?1:Math.max(0,100-p.photos.length),list=[...files].slice(0,max);
 if(!list.length){toast('Можно добавить до 100 фото в проект.');return;}toast('Сохраняем фотографии…');let added=0,skipped=files.length-list.length,duplicates=0;
 for(const file of list){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25*1024*1024){skipped++;continue;}
  const bytes=await file.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(p.type!=='docs'&&p.photos.some(x=>x.contentHash===hash||x.sourceHash===hash)){duplicates++;continue;}
  let bitmap;try{bitmap=await createImageBitmap(file);}catch{skipped++;continue;}
  if(bitmap.width*bitmap.height>70e6){bitmap.close();skipped++;continue;}
  const photo={id:id(),name:file.name,width:bitmap.width,height:bitmap.height,x:50,y:50,brightness:100,contrast:100,copies:1,bytes:file.size,contentHash:hash};bitmap.close();await savePhoto(photo.id,file);urls.set(photo.id,URL.createObjectURL(file));
  if(p.type==='docs'){resetDocumentStudio(p);p.photos=[photo];delete p.docPrepared;delete p.docAudit;delete p.docProcessingError;p.docUsePrepared=false;p.docPreparationAccepted=false;p.reviewConsent=false;}else p.photos.push(photo);added++;
 }
 p.updated=new Date().toISOString();await persist();if(added){if(p.type==='docs'){navigate('docresult',{id:p.id});await auditDocument(p,{prepare:true});}else render();}
 toast(`Добавлено: ${added}${duplicates?'. Повторов: '+duplicates:''}${skipped?'. Не загружено: '+skipped+' (нужен JPEG, PNG или WebP до 25 МБ)':''}`);
}
async function startCamera(p){
 if(!p||captureBusy)return;stopCamera();const epoch=cameraEpoch,area=document.querySelector('#camera-area'),d=documents.find(x=>x.id===p.docId),autoGate=new AutoCaptureGate();if(!area)return;
 area.innerHTML=`<div class="live-camera document-scan" data-scan-state="loading" style="--camera-ratio:${d.width/d.height};aspect-ratio:${d.width}/${d.height}"><video autoplay playsinline muted></video><svg class="live-guide" viewBox="0 0 400 500" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="200" cy="224" rx="115" ry="157"/><path d="M85 185H315 M52 450Q200 354 348 450"/></svg><canvas class="live-landmarks" aria-hidden="true"></canvas>${scannerOverlay('Подключаем камеру')}</div><div class="live-feedback"><span class="live-icon premium-gem">${icon('sparkles')}</span><div><strong id="live-hint" role="status" aria-live="polite">Подключаем камеру…</strong><span id="live-stability">Поставьте телефон устойчиво</span></div></div><div class="capture-stability" aria-hidden="true"><span></span></div><label class="check-label auto-capture-option"><input id="auto-capture" type="checkbox" ${p.autoCapture!==false?"checked":""}><span>Автоснимок<small>Сделаем фото, когда все проверки подходят 2 секунды подряд</small></span></label><div id="live-checks" class="live-check-chips"></div>${primary(icon('camera')+' Сделать снимок','take-photo',p.id,true)}<p class="micro" style="margin:12px 0">Готовность означает базовые проверки кадра. Это не подтверждение приёмки ведомством.</p>${action('ai-chat',icon('sparkles')+' Спросить про кадр','secondary live-assistant')}`;
 try{
  const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1920},height:{ideal:2560}},audio:false});
  if(epoch!==cameraEpoch||!area.isConnected){media.getTracks().forEach(t=>t.stop());return;}stream=media;
  const video=area.querySelector('video');video.srcObject=stream;await video.play();if(epoch!==cameraEpoch)return;
  area.querySelector('#live-hint').textContent='Загружаем модель проверки лица…';
  updateScanner(area.querySelector('.live-camera'),'loading','Загружаем проверку');
  const validation=await startDocumentCameraValidator({video,overlay:area.querySelector('canvas'),ratio:d.width/d.height,onUpdate:(report,status,metrics)=>{
   if(epoch!==cameraEpoch||!area.isConnected)return;
   const autoEnabled=area.querySelector('#auto-capture')?.checked!==false,auto=autoGate.update(report,performance.now(),{enabled:autoEnabled,visible:!document.hidden&&!overlay.innerHTML});
   updateScanner(area.querySelector('.live-camera'),status.stable?'ready':'scanning',autoEnabled&&report.ready?'Снимок через '+auto.remaining:status.stable?'Кадр готов к снимку':metrics.faceCount===1?'Сканируем лицо':'Расположите лицо в рамке',metrics,true);
   area.querySelector('.capture-stability span').style.transform=`scaleX(${autoEnabled?auto.progress:status.progress})`;
   liveDocumentReport=report;
   animateText(area.querySelector('#live-hint'),status.hint);
   area.querySelector('#live-stability').textContent=autoEnabled&&report.ready?'Не двигайтесь — снимем автоматически через '+auto.remaining+' сек.':status.stable?(report.ready?'Можно снимать':'Автоснимок ждёт все проверки. Можно снять вручную для контроля.'):report.canCapture?'Удерживайте положение около секунды':'Исправьте подсказку — проверим снова';
   area.querySelector('[data-action="take-photo"]').disabled=!status.stable;
   area.querySelector('.live-feedback').classList.toggle('ready',status.stable&&report.ready);
   area.querySelector('#live-checks').innerHTML=report.checks.map(c=>`<span class="${c.status}">${icon(c.status==='pass'?'check':'info')}${e(c.label)}</span>`).join('');
   if(auto.trigger&&status.stable&&!captureBusy)void takePhoto(p,{automatic:true}).catch(()=>toast('Снимок не сохранился. Включите камеру и повторите.'));
  },onError:()=>{stopCamera();const hint=area.querySelector('#live-hint');if(hint)hint.textContent='Проверка остановилась. Включите камеру снова или проверьте фото из галереи.';const btn=area.querySelector('[data-action="take-photo"]');if(btn)btn.disabled=true;}});
  if(epoch!==cameraEpoch){validation.stop();return;}liveValidator=validation;area.scrollIntoView({block:'start',behavior:motionAllowed()?'smooth':'instant'});
 }catch{if(epoch===cameraEpoch){stopCamera();area.innerHTML=note('Камера или модель недоступна. Проверьте разрешение камеры и соединение либо выберите фото из галереи.','warn');}}
}
async function takePhoto(p,{automatic=false}={}){
 if(captureBusy||document.hidden||overlay.innerHTML)return;
 const video=document.querySelector('#camera-area video');if(!video?.videoWidth||!liveValidator?.canCapture()){if(!automatic)toast('Удерживайте положение и следуйте подсказке.');return;}
 captureBusy=true;const sourceId=p.photos[0]?.id,docId=p.docId;
 try{
 const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
 stopCamera();const stoppedEpoch=cameraEpoch;const hint=document.querySelector('#live-hint');if(hint)hint.textContent='Снимок сделан. Сохраняем и проверяем…';
 const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.96));if(!blob)throw new Error('Снимок не получился');
 const photo={id:id(),name:'Снимок с камеры',capturedWithCamera:true,width:canvas.width,height:canvas.height,x:50,y:50,brightness:100,contrast:100,copies:1};
 await savePhoto(photo.id,blob);if(p.photos[0]?.id!==sourceId||p.docId!==docId){await deletePhoto(photo.id);return;}urls.set(photo.id,URL.createObjectURL(blob));resetDocumentStudio(p);p.photos=[photo];delete p.docPrepared;delete p.docAudit;delete p.docProcessingError;p.docUsePrepared=false;p.docPreparationAccepted=false;p.reviewConsent=false;p.updated=new Date().toISOString();await persist();
 if(route.id===p.id&&route.page==='doccapture'&&cameraEpoch===stoppedEpoch){
  navigate('docresult',{id:p.id});
  const generateStudio=Boolean(studioProfile(docId));
  await auditDocument(p,{prepare:!generateStudio,generateStudio});
 }
 }finally{captureBusy=false;}
}

async function photoCanvas(photo,w,h,{adjust=true}={}){const img=new Image();img.src=photo.demo?asset(photo.file):(urls.get(photo.id)||URL.createObjectURL(await getPhoto(photo.id)));await img.decode();const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);if(adjust)ctx.filter=`brightness(${photo.brightness??100}%) contrast(${photo.contrast??100}%) grayscale(${photo.bw?1:0})`;const scale=(photo.fit==='contain'?Math.min:Math.max)(w/img.naturalWidth,h/img.naturalHeight);const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;ctx.drawImage(img,-(dw-w)*(photo.x??50)/100,-(dh-h)*(photo.y??50)/100,dw,dh);ctx.filter='none';return canvas;}
async function addCart(p){const readiness=projectReadiness(p);if(!readiness.ready){toast(readiness.message);return;}const canvas=await photoCanvas(p.type==='docs'?selectedDocumentPhoto(p):p.photos[0],160,160,{adjust:p.type!=='docs'});const item={id:id(),projectId:p.id,name:p.type==='docs'?p.name:p.type==='books'?(productBy(p.productId)?.name||'Фотокнига')+' · '+p.title:p.name,description:p.type==='books'?p.photos.length+' фото · '+(p.layout==='duo'?'два кадра на разворот':'кадр и подпись'):p.type==='docs'?documents.find(x=>x.id===p.docId).subtitle:p.photos.reduce((n,x)=>n+(x.copies||1),0)+' отпечатков · '+p.format+' · '+p.finish.toLowerCase(),price:projectPrice(p),quantity:1,thumb:canvas.toDataURL('image/jpeg',.8),snapshot:structuredClone(p)};delete item.snapshot.docAiPreview;const old=state.cart.findIndex(x=>x.projectId===p.id);if(old>=0)state.cart[old]=item;else state.cart.push(item);await persist();closeModal();ordersTab='cart';navigate('orders');toast(old>=0?'Проект в корзине обновлён':'История добавлена в корзину');}
async function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function exportDoc(p,sheet=false){const d=documents.find(x=>x.id===p.docId),ph=selectedDocumentPhoto(p);if(!ph)return;const portrait=await photoCanvas(ph,d.pxW,d.pxH,{adjust:false});let canvas=portrait;if(sheet){canvas=document.createElement('canvas');canvas.width=1181;canvas.height=1772;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);const w=Math.round(d.width*300/25.4),h=Math.round(d.height*300/25.4),gap=22;const cols=Math.floor((canvas.width-40+gap)/(w+gap)),rows=Math.min(3,Math.floor((canvas.height-100+gap)/(h+gap)));for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)ctx.drawImage(portrait,25+x*(w+gap),25+y*(h+gap),w,h);ctx.fillStyle='#888';ctx.font='18px Arial';ctx.fillText('PicPac · ТЕСТОВЫЙ МАКЕТ · 10 × 15 см · печать 100%',25,canvas.height-24);}let quality=.95,blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(d.id==='us'&&!sheet){while(blob.size>240000&&quality>.25){quality-=.08;blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));}if(blob.size>240000){toast('Не удалось получить файл до 240 КБ. Нужна проверка специалиста.');return;}}await downloadBlob(blob,`PicPac-${d.id}-${sheet?'print-sheet':'draft'}.jpg`);toast('Тестовый макет скачан. Проверьте его перед подачей.');}
async function exportProject(p){const files=[];for(const ph of [...p.photos,...(p.docPrepared?[p.docPrepared]:[])]){if(ph.demo)continue;const blob=await getPhoto(ph.id);if(!blob)continue;const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});files.push({id:ph.id,data});}await downloadBlob(new Blob([JSON.stringify({schema:'picpac-project-v1',project:p,files},null,2)],{type:'application/json'}),'PicPac-project-'+p.id.slice(0,8)+'.json');toast('Проект с фотографиями сохранён в файл');}

const actions={
 'account-auth':accountSheet,
 'account-plans':accountPlansView,
 'account-logout':async(_,button)=>{
  button.disabled=true;
  try{await accountRequest('logout',{token:accountSession?.token});switchAccount(null);}
  catch(error){toast(error.message||'Не удалось выйти из аккаунта.');button.disabled=false;}
 },
 'toggle-theme':()=>{
  window.setPicPacTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
  render();document.querySelector('[data-action="toggle-theme"]')?.focus({preventScroll:true});
 },
 nav:async value=>{if(value==='orders'&&state.orders.length&&!state.cart.length)ordersTab='history';navigate(value);},
 back:()=>navigate(['editor','templates','docselect','templatemaker'].includes(route.page)?'create':['doccapture','docresult'].includes(route.page)?'docselect':['checkout','order','success'].includes(route.page)?'orders':['profile','drafts','favorites','mytemplates','control','digital'].includes(route.page)?'account':'catalog'),
 catalog:()=>navigate('catalog'),'ai-open':()=>navigate('ai'),'ai-chat':chatView,'ai-add-art':addAlbumArt,
 'ai-tool':value=>{if(!aiTools.some(([key])=>key===value))return;aiTool=value;if(route.page==='ai'){closeModal();render();document.querySelector('.ai-tool.active')?.focus({preventScroll:true});}else navigate('ai');},
 'ai-open-photo-tool':value=>{const p=projectBy(document.querySelector('#studio-project')?.value);return value==='creative'?aiStudio(p):localStudio(p);},
 'ai-album-preview':()=>{aiTool='album';navigate('ai');},
 'ai-edit-book':async value=>{await selectAlbumProject(value);aiTool='album';navigate('ai');},
 'ai-theme':async value=>{if(albumAgentBusy)return;const draft={...getAlbumDraft(),theme:value};await updateAlbumPreview(draft,defaultAlbumDesign({theme:value}),'Пример оформления готов. Можно изменить детали или применить дизайн.');},
 'agent-command':value=>runAlbumCommand(value),
 'ai-undo':async()=>{const draft=getAlbumDraft();if(!draft.previous||albumAgentBusy)return;state.aiAlbumDraft={...draft,design:draft.previous,previous:null};albumAgentMessage='Вернул предыдущий вариант.';await persist();render();},
 'ai-use-plan':applyAlbumDesign,close:closeModal,'refresh-view':render,
 product:value=>navigate('product',{id:value}),
 favorite:async value=>{state.favorites=state.favorites.includes(value)?state.favorites.filter(x=>x!==value):[...state.favorites,value];await persist();render();},
 filter:value=>{filter=value;render();},'reset-search':()=>{search='';filter='all';render();},
 new:type=>newProject(type),templates:()=>{templateFilter='Все';navigate('templates');},
 template:value=>{const t=[...templates,...state.templates].find(x=>x.id===value);return newProject('books',{templateId:t.id,name:t.name,title:t.title,layout:t.layout,color:t.color,albumDesign:t.albumDesign});},
 'template-filter':value=>{templateFilter=value;render();},
 'blank-book':value=>newProject('books',{productId:value}),
 'start-product':value=>{const p=productBy(value);if(p.category==='docs')navigate('docselect');else if(p.category==='books'){openSheet('С чего начнём?',`<p class="subtext">${p.name} — добавьте фотографии в готовую композицию или создайте свою.</p>${primary('Выбрать шаблон','templates')}${action('blank-book','Чистый альбом','secondary',p.id)}`);}else return newProject(p.category==='prints'?'prints':'gifts',{productId:value});},
 project:value=>{const p=projectBy(value);if(p)navigate(p.type==='docs'?(p.photos.length?'docresult':'doccapture'):'editor',{id:value});else toast('Исходный проект недоступен');},
 upload:choosePhotos,'gallery-allow':openGallery,demo:value=>addDemo(projectBy(value)),
 'edit-photo':photoModal,
 'remove-photo':async value=>{const p=current();p.photos=p.photos.filter(x=>x.id!==value);p.updated=new Date().toISOString();await persist();closeModal();render();toast('Фотография убрана из проекта');},
 'photo-auto':()=>{const f=document.querySelector('#photo-form');f.elements.brightness.value=108;f.elements.contrast.value=103;updatePhotoPreview();toast('Свет +8%, контраст +3%. Можно настроить вручную.');},
 'photo-reset':()=>{const f=document.querySelector('#photo-form');f.elements.x.value=50;f.elements.y.value=50;if(f.elements.brightness){f.elements.brightness.value=100;f.elements.contrast.value=100;f.elements.bw.checked=false;}updatePhotoPreview();},
 'page-prev':()=>{pageIndex=Math.max(0,pageIndex-1);render();},'page-next':()=>{pageIndex++;render();},
 autofill:async()=>{const p=current();if(!projectReadiness(p).ready){toast(projectReadiness(p).message);return;}p.layout='duo';p.updated=new Date().toISOString();await persist();pageIndex=0;render();toast('Фотографии разложены по два на разворот');},
 'save-template':async()=>{const p=current();state.templates.unshift({id:id(),name:p.name,title:p.title,layout:p.layout,color:p.color,albumDesign:p.albumDesign,category:'Мои',image:'book-classic.png',subtitle:'Ваш сохранённый макет'});await persist();toast('Шаблон сохранён в аккаунте');},
 'suggest-template':()=>{const f=document.querySelector('#template-form'),q=f.elements.idea.value.trim().toLowerCase();if(!q){f.elements.idea.focus();toast('Опишите идею альбома');return;}const family=/мам|пап|сем|жизн|юбиле|биограф/.test(q),baby=/реб|дет|малыш|год/.test(q);f.elements.name.value=family?'История нашей семьи':baby?'Маленькие большие открытия':'Наши счастливые моменты';f.elements.title.value=family?'Жизнь, наполненная любовью':baby?'Как быстро ты растёшь':'Там, где мы были счастливы';f.elements.layout.value=family?'story':'duo';f.elements.color.value=baby?'#EDD5D5':family?'#E7D3BA':'#C4DAD6';document.querySelector('#template-suggestion').innerHTML=note(family?'Предлагаем главы: детство, семья, важные встречи, наши дни. Наполнение каждой главы вы сможете изменить.':'Предлагаем чередовать общие планы и крупные детали, добавив короткие подписи.','success');},
 preflight:value=>preflightModal(projectBy(value)),
 'add-cart':value=>preflightModal(projectBy(value),true),
 'confirm-cart':value=>addCart(projectBy(value)),
 docs:()=>navigate('docselect'),
 'prepare-doc':value=>prepareDocument(projectBy(value)),
 'doc-ai-open':generateDocumentPreview,
 'doc-local-from-sheet':value=>{closeModal();return prepareDocument(projectBy(value));},
 'doc-ai-download':async value=>{const p=projectBy(value),photo=p?.docAiPreview;if(!photo||photo.signature!==documentSignature(p))return;const blob=await getPhoto(photo.id);if(blob)await downloadBlob(blob,'PicPac-studio-AI-preview.jpg');},
 'agent-camera':value=>{const p=projectBy(value);if(!p)return;if(route.id!==value||route.page!=='doccapture')navigate('doccapture',{id:value});else closeModal();if(!stream)return startCamera(p);},
 'agent-audit':value=>{const p=projectBy(value);if(!p?.photos.length)return;if(route.id!==value||route.page!=='docresult')navigate('docresult',{id:value});else closeModal();return auditDocument(p,{prepare:true});},
 'export-portrait':async value=>{const p=projectBy(value);if(!p?.docPrepared)return;const blob=await getPhoto(p.docPrepared.id);if(blob)await downloadBlob(blob,'PicPac-studio-portrait.jpg');},
 'audit-doc':value=>auditDocument(projectBy(value),{prepare:true}),
 'reshoot-doc':value=>navigate('doccapture',{id:value}),
 'doc-change-type':value=>{stopCamera();openSheet('Тип документа',documents.map(d=>action('doc-switch',e(d.name)+' · '+e(d.subtitle),'secondary',d.id)).join(''));},
 'doc-switch':async value=>{const p=current();if(p.docId===value){closeModal();return;}resetDocumentStudio(p);p.docId=value;p.name=documents.find(d=>d.id===value).name;delete p.docPrepared;delete p.docAudit;delete p.docProcessingError;p.docUsePrepared=false;p.docPreparationAccepted=false;p.reviewConsent=false;await persist();closeModal();render();},
 'doc-original':async value=>{const p=projectBy(value);p.docUsePrepared=false;p.reviewConsent=false;await persist();render();},
 'doc-prepared':async value=>{const p=projectBy(value);p.docUsePrepared=true;p.reviewConsent=false;await persist();render();},
 'ai-studio':value=>localStudio(projectBy(value)),
 'ai-creative':value=>aiStudio(projectBy(value)),
 'ai-save-idea':()=>saveAiIdea(),
 'ai-use-result':()=>useAiResult(),
 'select-doc':value=>{const d=documents.find(x=>x.id===value);return newProject('docs',{docId:value,name:d.name});},
 camera:value=>startCamera(projectBy(value)),'take-photo':value=>takePhoto(projectBy(value)),
 'doc-to-cart':async value=>{const p=projectBy(value);const gate=documentAuditGate(p);if(!gate.ready){toast(gate.message);return;}if(p.docUsePrepared&&!p.docPreparationAccepted){toast('Сначала проверьте результат обработки');return;}if(!document.querySelector('#doc-agree').checked){toast('Подтвердите ознакомление с проверкой');return;}if(preflight({...p,photos:[selectedDocumentPhoto(p)]})[0].low){toast('Загрузите снимок большего размера');return;}p.reviewConsent=true;await persist();await addCart(p);},
 'orders-tab':value=>{ordersTab=value;render();},
 'qty-plus':async value=>{const item=state.cart.find(x=>x.id===value);if(item.quantity<99)item.quantity++;await persist();render();},
 'qty-minus':async value=>{const item=state.cart.find(x=>x.id===value);if(item.quantity>1)item.quantity--;else state.cart=state.cart.filter(x=>x.id!==value);await persist();render();},
 checkout:()=>{const invalid=state.cart.find(x=>['books','docs'].includes(x.snapshot?.type)&&!projectReadiness(x.snapshot).ready);if(invalid){toast(projectReadiness(invalid.snapshot).message);return;}checkoutAttempt=id();navigate('checkout');},order:value=>navigate('order',{id:value}),
 reorder:async value=>{const o=state.orders.find(x=>x.id===value);for(const item of o.items){state.cart.push({...structuredClone(item),id:id()});}await persist();ordersTab='cart';navigate('orders');toast('Товары добавлены в корзину');},
 'control-preview':value=>controlPreview(value),
 'control-changes':value=>controlUpdate(value,'changes'),
 'control-next':value=>{const o=state.orders.find(x=>x.id===value);return controlUpdate(value,({review:'production',changes:'production',production:'ready',ready:'complete'})[o.status]||'complete');},
 'export-layout':value=>exportLayout(projectBy(value)),
 'export-doc':value=>exportDoc(projectBy(value)),'export-sheet':value=>exportDoc(projectBy(value),true),'export-project':value=>exportProject(projectBy(value)),
 chat:chatView,'chat-suggest':respond,
 help:()=>openSheet('Доставка и помощь',`<div class="stack"><details open><summary><h3 style="display:inline">Как получить заказ?</h3></summary><p class="subtext">На сайте PicPac доступны Белпочта, Европочта и курьер. Точные сроки и стоимость зависят от заказа.</p></details><div class="divider"></div><details><summary><h3 style="display:inline">Какую бумагу выбрать?</h3></summary><p class="subtext">Матовая меньше бликует и не так заметны отпечатки пальцев. Глянцевая делает цвета выразительнее.</p></details><details><summary><h3 style="display:inline">Где мои фотографии?</h3></summary><p class="subtext">В этом MVP проекты хранятся в браузере на вашем устройстве. Очистка данных браузера удалит их. Скачайте резервную копию в редакторе.</p></details><a class="secondary" href="https://super.picpac.by/help" target="_blank" rel="noopener">Помощь на сайте PicPac ${icon('arrow')}</a><a class="secondary" href="mailto:support@picpac.by">${icon('mail')} support@picpac.by</a></div>`),
 about:()=>openSheet('О прототипе',`<p class="subtext">PicPac — мобильный веб-MVP. Работают проекты, редактор, проверка лица в камере и на загруженном фото, корзина и локальные тестовые заказы.</p>${note('Ваши фотографии и контактные данные сохраняются в IndexedDB этого браузера. Подготовка белого фона выполняется на устройстве. При доступной облачной обработке отдельный экран спрашивает согласие на отправку выбранного фото.')}<p class="small">Для запуска сервиса нужны сервер, авторизация, API каталога и производства, платёжная интеграция и калибровка CV-проверок на реальных устройствах. Демо-контролёр доступен из аккаунта.</p><div class="divider"></div>${action('confirm-clear','Удалить локальные данные','secondary danger')}`),
 'confirm-clear':()=>openSheet('Удалить локальные данные?',`<p class="subtext">Проекты, фотографии и тестовые заказы будут удалены из этого браузера. Сначала сохраните резервные копии нужных проектов.</p>${primary('Удалить данные с устройства','clear-data')}${action('close','Сохранить данные','secondary')}`),
 'clear-data':async()=>{docStudioTasks.forEach(task=>task.controller?.abort());docStudioTasks.clear();albumArtResult=null;chatMessages=[];await clearStore();urls.forEach(URL.revokeObjectURL);urls.clear();state=fresh();await persist();navigate('home');toast('Локальные данные удалены');}
};
async function controlUpdate(orderId,status){const o=state.orders.find(x=>x.id===orderId);const comment=document.querySelector(`[data-review-comment="${orderId}"]`).value.trim();if(status==='changes'&&!comment){toast('Укажите, что нужно исправить');return;}o.status=status;o.comment=comment;o.events.push({label:statusNames[status]+(comment?': '+comment:''),at:new Date().toISOString()});await persist();render();toast('Тестовый статус обновлён');}
function updatePhotoPreview(){const f=document.querySelector('#photo-form');if(!f)return;const img=overlay.querySelector('.crop-image');img.style.objectPosition=`${f.elements.x.value}% ${f.elements.y.value}%`;img.style.objectFit=f.elements.fit?.value||'cover';if(f.elements.brightness){img.style.filter=`brightness(${f.elements.brightness.value}%) contrast(${f.elements.contrast.value}%) grayscale(${f.elements.bw.checked?1:0})`;document.querySelector('#brightness-value').textContent=f.elements.brightness.value+'%';}}
function controlPreview(orderId){const o=state.orders.find(x=>x.id===orderId);openSheet('Макет '+e(o.id),o.items.map(item=>{const p=item.snapshot;return `<div class="layout-review"><h2>${e(item.name)}</h2><p class="small">${e(item.description)} · Зафиксированная версия заказа</p>${p.type==='docs'&&p.docPrepared?`<div class="before-after"><figure><div class="portrait-frame">${imageTag(p.photos[0])}</div><figcaption>Исходник</figcaption></figure><figure><div class="portrait-frame">${imageTag(p.docPrepared)}</div><figcaption>Обработка · ${p.docUsePrepared?'выбрана':'не выбрана'}</figcaption></figure></div><p class="doc-policy">Нужна проверка допустимости обработки для ${e(p.name)}.</p>`:''}${p.type==='books'?`<div class="template-preview" style="background:${e(p.color)}"><h2>${e(p.title)}</h2></div>`:''}<div class="photo-grid">${p.photos.map((ph,i)=>`<div><div class="photo-tile">${imageTag(ph)}</div><p class="small">${i+1}. ${e(ph.caption||ph.name||'Фото')}${ph.copies>1?' · '+ph.copies+' копий':''}</p></div>`).join('')}</div><p class="small">${p.type==='books'?'Композиция: '+e(({duo:'два кадра на разворот',single:'кадр и подпись',story:'по главам'})[p.layout]):'Размер: '+e(p.format)}</p></div>`;}).join(''));}
async function exportAlbumLayout(p){
 const response=await fetch('./album-render.css');if(!response.ok)throw new Error('Не удалось загрузить оформление макета.');
 const css=await response.text(),pictures=[],design=projectDesign(p);
 for(const ph of p.photos){
  const canvas=await photoCanvas(ph,850,850);
  pictures.push(`<img src="${canvas.toDataURL('image/jpeg',.89)}" alt="${e(ph.name)}">`);
 }
 const picture=i=>pictures[i]||'<div class="album-empty-image"></div>';
 const count=Math.ceil(p.photos.length/(design.layout==='duo'?2:1));
 const pages=[albumCover(design,picture),...Array.from({length:count},(_,i)=>albumSpread(design,p.photos,picture,i))];
 const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(design.title)} — PicPac</title><style>${css}
 body{font:16px system-ui,sans-serif;margin:24px;background:#f5f1f8;color:#262035}header,main{max-width:670px;margin:auto}header{padding:12px 0 24px}header h1{margin:0}article{margin-bottom:20px;break-inside:avoid}small{display:block;margin-top:5px;color:#564d62}button{padding:10px 16px;border:0;border-radius:20px;background:#47368b;color:white;font:inherit}@page{size:A4;margin:14mm}@media print{body{margin:0;background:white}button{display:none}article{break-after:page}article:last-child{break-after:auto}}</style>
 <header><h1>${e(design.title)}</h1><p>PicPac · макет для просмотра · ${e(p.format)} см</p><button onclick="window.print()">Печать / сохранить как PDF</button></header><main>${pages.map((markup,i)=>`<article>${markup}<small>${i?'Разворот '+i:'Обложка'}</small></article>`).join('')}</main></html>`;
 await downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),'PicPac-layout-'+p.id.slice(0,8)+'.html');
 toast('Макет скачан: откройте файл для просмотра или печати.');
}
async function exportLayout(p){
 if(!projectReadiness(p).ready){toast(projectReadiness(p).message);return;}
 if(p.type==='docs')return exportDoc(p,true);
 toast('Подготавливаем макет…');let pages='';
 if(p.type==='books')return exportAlbumLayout(p);
 for(let i=0;i<p.photos.length;i++){
  const ph=p.photos[i],book=p.type==='books',ratio=book?1:Number(p.format.split('×')[0])/Number(p.format.split('×')[1]);
  const canvas=await photoCanvas(ph,Math.round(1000*ratio),1000);const data=canvas.toDataURL('image/jpeg',.9);
  pages+=`<article><img src="${data}" alt="${e(ph.name)}"><p>${e(ph.caption||'')}<small>${i+1} / ${p.photos.length}${ph.copies>1?' · копий: '+ph.copies:''}</small></p></article>`;
 }
 const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><title>${e(p.name)} — макет PicPac</title><style>body{font:18px Arial;color:#364c49;background:#f6efe6;margin:24px}header{text-align:center;margin:35px 0}h1{font-size:30px}main{display:grid;grid-template-columns:${p.type==='books'&&p.layout==='duo'?'1fr 1fr':'1fr'};gap:24px;max-width:900px;margin:auto}article{background:#fff;padding:20px;break-inside:avoid}img{width:100%;max-height:700px;object-fit:contain}small{display:block;margin-top:12px;color:#777;font-size:12px}button{padding:14px 24px;background:#dd5757;color:#fff;border:0;border-radius:12px;font-size:16px}@media print{body{background:white;margin:0}button{display:none}header{break-after:page}main{gap:12mm}article{padding:0;break-inside:avoid}img{max-height:200mm}}@page{size:A4;margin:15mm}</style><header><h1>${e(p.type==='books'?p.title:p.name)}</h1><p>PicPac · макет для согласования · ${e(p.format)} см</p><p>Просмотр композиции. Это не производственный PDF.</p><button onclick="window.print()">Печать / сохранить как PDF</button></header><main>${pages}</main></html>`;
 await downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),'PicPac-layout-'+p.id.slice(0,8)+'.html');toast('Макет скачан: откройте файл для просмотра или печати');
}
document.addEventListener('click',async ev=>{if(ev.target.hasAttribute('data-scrim')){closeModal();return;}const btn=ev.target.closest('[data-action]');if(!btn||btn.disabled)return;const handler=actions[btn.dataset.action];if(!handler)return;ev.preventDefault();try{await handler(btn.dataset.value,btn);}catch(error){console.error(error);toast('Не удалось выполнить действие. Попробуйте ещё раз.');}});
document.querySelector('#assistant-launch').addEventListener('click',chatView);
input.addEventListener('change',async()=>{const files=[...input.files],pid=uploadTarget;uploadTarget=null;input.value='';try{await acceptFiles(files,pid);}catch(err){console.error(err);toast('Не удалось сохранить фотографии. Проверьте свободное место.');}});
input.addEventListener('cancel',()=>{uploadTarget=null;toast('Выбор отменён. Фотографии не добавлены.');});
document.addEventListener('input',ev=>{if(ev.target.id==='catalog-search'){const start=ev.target.selectionStart;search=ev.target.value;render();const field=document.querySelector('#catalog-search');field.focus();try{field.setSelectionRange(start,start);}catch{}}if(ev.target.closest('#photo-form'))updatePhotoPreview();});
document.addEventListener('change',async ev=>{try{const el=ev.target,p=current();if(el.closest('#photo-form'))updatePhotoPreview();if(el.id==='ai-album-project'){await selectAlbumProject(el.value);return;}if(el.id==='sort'){sort=el.value;render();return;}const fields={'book-title':'title','book-layout':'layout','book-product':'productId','print-format':'format','print-finish':'finish','project-caption':'caption'};if(fields[el.id]&&p){p[fields[el.id]]=el.value;if(el.id==='book-title')p.name=el.value||'Наша история';p.updated=new Date().toISOString();await persist();render();}if(el.name==='delivery'){document.querySelectorAll('.delivery-option').forEach(n=>n.classList.toggle('selected',n.querySelector('input').checked));const address=document.querySelector('#address-field');address.classList.toggle('hidden',el.value==='pickup');address.querySelector('textarea').required=el.value!=='pickup';document.querySelector('#checkout-summary').innerHTML=summaryLines(totals(state.cart,state.promo,el.value));}if(el.id==='auto-capture'&&p){p.autoCapture=el.checked;await persist();}if(el.id==='soft-light'&&p){p.docSoftLight=el.checked;await persist();}if(el.id==='prepared-agree'&&p){p.docPreparationAccepted=el.checked;await persist();render();}if(el.id==='doc-agree'&&p){p.reviewConsent=el.checked;await persist();}}catch(err){console.error(err);toast('Изменение не удалось сохранить');}});
document.addEventListener('submit',async ev=>{const f=ev.target;ev.preventDefault();const data=new FormData(f);const submit=f.querySelector('[type=submit]');try{
 if(f.id==='account-auth-form'){await submitAccount(f,data);}
 else if(f.id==='profile-form'){state.profile={name:data.get('name').trim(),phone:data.get('phone').trim(),email:data.get('email').trim(),address:data.get('address').trim()};await persist();navigate('account');toast('Данные сохранены');}
 else if(f.id==='template-form'){const t={id:id(),name:data.get('name').trim(),title:data.get('title').trim(),layout:data.get('layout'),color:data.get('color'),category:'Мои',image:'book-classic.png',subtitle:'Ваш персональный макет',idea:data.get('idea').trim()};state.templates.unshift(t);await persist();navigate('mytemplates');toast('Шаблон сохранён');}
 else if(f.id==='photo-form'){const p=current(),ph=p.photos.find(x=>x.id===f.dataset.id),oldIndex=p.photos.indexOf(ph);ph.x=Number(data.get('x'));ph.y=Number(data.get('y'));ph.fit=data.get('fit')||'cover';if(p.type!=='docs'){ph.brightness=Number(data.get('brightness'));ph.contrast=Number(data.get('contrast'));ph.bw=data.has('bw');ph.caption=data.get('caption')||'';}if(data.has('copies'))ph.copies=Number(data.get('copies'));p.photos.splice(oldIndex,1);p.photos.splice(Number(data.get('position')),0,ph);if(p.type==='docs'){resetDocumentStudio(p);delete p.docPrepared;p.docUsePrepared=false;p.docPreparationAccepted=false;p.reviewConsent=false;}p.updated=new Date().toISOString();await persist();closeModal();render();toast('Кадр сохранён');}
 else if(f.id==='promo-form'){const code=normalizePromo(data.get('promo'));if(code&&code!=='PIC10'){toast('Промокод не найден. Для тестирования доступен PIC10.');return;}state.promo=code;await persist();render();toast(code?'Скидка 10% применена':'Промокод убран');}
 else if(f.id==='checkout-form'){submit.disabled=true;const contact={name:data.get('name').trim(),phone:data.get('phone').trim(),email:data.get('email').trim(),address:data.get('address').trim()};if(contact.phone.replace(/\D/g,'').length<7){toast('Проверьте номер телефона');submit.disabled=false;return;}if(!data.has('consent'))return;checkoutAttempt||=id();const before=structuredClone(state);let o;try{o=makeOrder(state,checkoutAttempt,contact,data.get('delivery'));await persist();}catch(error){state=before;throw error;}navigate('success',{id:o.id});}
 else if(f.id==='album-agent-form'){const command=String(data.get('message')||'').trim();if(command)await runAlbumCommand(command);}
 else if(f.id==='album-design-form'){const draft=getAlbumDraft();if(!albumAgentBusy){const fields=Object.fromEntries(data);fields.chapters=String(fields.chapters||'').split(',');await updateAlbumPreview(draft,sanitizeAlbumPatch(fields),'Предпросмотр обновлён.');}}
 else if(f.id==='ai-art-form'){await generateAlbumArt(f);}
 else if(f.id==='studio-form'){await processStudio(f);}
 else if(f.id==='ai-form'){await generateAiImage(f);}
 else if(f.id==='chat-form'){const text=data.get('message').trim();if(text)await respond(text);}
 }catch(error){console.error(error);toast('Не удалось сохранить. Проверьте доступное место в браузере.');if(submit)submit.disabled=false;}});
document.addEventListener('keydown',ev=>{if(!overlay.innerHTML)return;if(ev.key==='Escape')closeModal();if(ev.key==='Tab'){const nodes=[...overlay.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]')].filter(x=>x.offsetParent!==null);const first=nodes[0],last=nodes.at(-1);if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus();}}});
window.addEventListener('beforeunload',stopCamera);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
window.addEventListener('offline',()=>toast('Вы офлайн. Проекты доступны на этом устройстве.'));
installMotion();
try{state=await openStore(accountSession?.account.id);albumDraft={...albumDraft,...state.aiAlbumDraft};const [page,pid]=location.hash.slice(1).split('/').map(decodeURIComponent);if(page)route={page,id:pid};render();void refreshAccount();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});}catch(err){console.error(err);main.innerHTML=`${top()}${note('Не удалось открыть хранилище браузера. Разрешите локальное хранение данных и перезагрузите страницу.','warn')}`;}
