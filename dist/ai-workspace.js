import {escapeHTML as e} from './data.js';
import {icon} from './icons.js';
import {albumInk,albumOptions,normalizeAlbumDesign} from './album-design.js';
import {albumThemes} from './ai-album.js';

export const aiTools=[
  ['album','book','Альбом'],['documents','document','Документы'],
  ['art','sparkles','Иллюстрации'],['photos','image','Фотостудия'],
];
export const albumCommands=[
  ['Сине-фиолетовый','Сине-фиолетовая палитра'],
  ['Один кадр','Один кадр на разворот'],
  ['Обложка без фото','Обложка только текст'],
  ['Книжный шрифт','Шрифт с засечками'],
];

export function albumCover(input,picture){
  const design=normalizeAlbumDesign(input),{cover,title,subtitle,typography,color,accent}=design;
  return `<div class="album-cover cover-${cover} type-${typography}" style="--album-paper:${color};--album-ink:${albumInk(color,accent)}">${cover!=='type'?`<div class="album-cover-media">${picture(0)}${cover==='collage'?picture(1):''}</div>`:''}<div class="album-cover-copy"><span>ФОТОКНИГА · PICPAC</span><h3>${e(title)}</h3>${subtitle?`<p>${e(subtitle)}</p>`:''}</div></div>`;
}

export function albumSpread(input,photos,picture,page=0){
  const {layout,typography,color,accent,chapters,captionMode,title}=normalizeAlbumDesign(input);
  const pageCount=Math.max(1,Math.ceil(photos.length/(layout==='duo'?2:1)));
  const index=page*(layout==='duo'?2:1),chapter=chapters[Math.min(chapters.length-1,Math.floor(page*chapters.length/pageCount))];
  const caption=i=>captionMode==='show'&&photos[i]?.caption?`<p>${e(photos[i].caption)}</p>`:'';
  return `<div class="album-spread layout-${layout} type-${typography}" style="--album-paper:${color};--album-ink:${albumInk(color,accent)}">
    <div class="album-page">${picture(index)}${layout==='duo'?caption(index):''}</div>
    <div class="album-page">${layout==='duo'?`${picture(index+1)}${caption(index+1)}`:`<div class="album-page-copy"><span>${layout==='story'?'ГЛАВА '+String((chapter?chapters.indexOf(chapter):page)+1).padStart(2,'0'):'РАЗВОРОТ '+String(page+1).padStart(2,'0')}</span><h3>${e(layout==='story'?(chapter||title):title)}</h3>${caption(index)}</div>`}</div>
  </div>`;
}

export function albumDesignInputs(design){
  const select=(field,label)=>`<label class="form-field"><span>${label}</span><select name="${field}">${Object.entries(albumOptions[field]).map(([key,value])=>`<option value="${key}" ${key===design[field]?'selected':''}>${value}</option>`).join('')}</select></label>`;
  return `<label class="form-field"><span>Название на обложке</span><input name="title" required maxlength="80" value="${e(design.title)}"></label>
    <label class="form-field"><span>Подзаголовок</span><input name="subtitle" maxlength="100" value="${e(design.subtitle)}"></label>
    <div class="ai-form-row">${select('cover','Обложка')}${select('layout','Разворот')}${select('typography','Шрифт')}${select('captionMode','Подписи')}</div>
    <div class="ai-form-row">${[['color','Цвет обложки'],['accent','Акцент']].map(([key,label])=>`<label class="form-field color-field"><span>${label}</span><input name="${key}" type="color" value="${design[key]}"></label>`).join('')}</div>
    <label class="form-field"><span>Главы (через запятую)</span><input name="chapters" maxlength="365" value="${e(design.chapters.join(', '))}" placeholder="Начало, Вместе, Сегодня"></label>`;
}

export function albumWorkspace({draft,design,books,selected,picture,action,primary,busy,assistantMessage}){
  const photos=selected?.photos||[];
  return `<section class="ai-work-panel" aria-label="Конструктор альбома">
    <div class="section-heading ai-heading"><div><span class="eyebrow">Конструктор</span><h2>Ваш альбом</h2></div><span class="ai-module-icon">${icon('book')}</span></div>
    <div class="agent-panel glass">
      <label class="form-field"><span>Фотографии для макета</span><select id="ai-album-project"><option value="">Новый альбом · примеры</option>${books.map(p=>`<option value="${e(p.id)}" ${draft.projectId===p.id?'selected':''}>${e(p.name)} · ${p.photos.length} фото</option>`).join('')}</select></label>
      <div class="agent-panel-label"><span class="premium-gem">${icon('sparkles')}</span><div><h3>Изменить через ИИ</h3><p>Опишите нужные правки одним сообщением.</p></div></div>
      <form id="album-agent-form" class="agent-composer"><label class="sr-only" for="album-instruction">Что изменить в альбоме</label><input id="album-instruction" name="message" required maxlength="500" placeholder="Например: обложка без фото, тёплая палитра"><button class="premium-surface" aria-label="Показать изменение" type="submit" ${busy?'disabled':''}>${icon('arrow')}</button></form>
      <div class="agent-chips">${albumCommands.map(([label,command])=>action('agent-command',e(label),'chip',command,busy?'disabled':'')).join('')}</div>
      <p class="micro agent-privacy">Если для запроса нужна облачная модель, ей отправится только введённый текст.</p>
      <p class="agent-reply" id="album-agent-status" role="status">${e(busy?'Подбираем оформление…':assistantMessage||'')}</p>
    </div>
    <div class="ai-preview-heading" id="album-preview"><h3>Предпросмотр</h3><span>${photos.length?'Ваши фото':'Пример'}</span></div>
    <div class="ai-preview">${albumCover(design,picture)}${albumSpread(design,photos,picture)}</div>
    <p class="ai-preview-note">${photos.length?'Фото из проекта. Пустые места заполнены примерами.':'Добавьте свои фотографии в редакторе, чтобы заполнить макет.'}</p>
    ${primary(selected?'Применить дизайн':'Создать альбом','ai-use-plan','',busy)}
    ${draft.previous?`<div class="ai-undo-row">${action('ai-undo',icon('refresh')+' Отменить последнюю правку','text-button','',''+(busy?'disabled':''))}</div>`:''}
    <details class="glass album-customize"><summary>${icon('sliders')} Настроить детали</summary><form id="album-design-form">${albumDesignInputs(design)}<button type="submit" class="secondary" ${busy?'disabled':''}>Обновить предпросмотр</button></form></details>
    <div class="ai-preview-heading"><h3>Начать с идеи</h3><span>Готовые стили</span></div>
    <div class="ai-theme-grid">${Object.entries(albumThemes).map(([key,theme],i)=>action('ai-theme',`<span class="ai-theme-icon" aria-hidden="true">${['♡','✦','✳','✿','✧'][i]}</span><strong>${theme.label}</strong>`,'ai-theme glass '+(draft.theme===key?'selected':''),key,`aria-pressed="${draft.theme===key}" ${busy?'disabled':''}`)).join('')}</div>
  </section>`;
}
