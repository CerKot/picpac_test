export const albumOptions = {
  cover: {photo:'Большое фото',collage:'Два фото',type:'Только текст'},
  layout: {duo:'Два кадра',single:'Один кадр',story:'По главам'},
  typography: {sans:'Современный',serif:'Классический',italic:'Рукописный акцент'},
  captionMode: {show:'Показывать',hide:'Скрывать'},
};

const defaults={title:'Наша история',subtitle:'',color:'#DCD9FC',accent:'#413568',cover:'photo',layout:'duo',typography:'sans',captionMode:'show',chapters:[]};
const palettes={
  violet:{color:'#DEDCFF',accent:'#382278'}, blue:{color:'#D4E7FB',accent:'#203E73'},
  warm:{color:'#F3DEC9',accent:'#693A2B'}, green:{color:'#DDEBE0',accent:'#285544'},
  pink:{color:'#F7DFE8',accent:'#712E4D'}, mono:{color:'#EBEBEC',accent:'#24242B'},
};

const limitText=(value,max)=>typeof value==='string'?value.trim().replace(/\s+/gu,' ').slice(0,max):undefined;
const hex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toUpperCase():undefined;

// This is the entire contract for assistant tools. The model cannot choose a
// project, modify photographs or call app actions.
export function sanitizeAlbumPatch(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return {};
  const patch={};
  for(const key of Object.keys(albumOptions))if(typeof input[key]==='string'&&Object.hasOwn(albumOptions[key],input[key]))patch[key]=input[key];
  for(const key of ['color','accent'])if(hex(input[key]))patch[key]=hex(input[key]);
  const title=limitText(input.title,80),subtitle=limitText(input.subtitle,100);
  if(title)patch.title=title;
  if(subtitle!==undefined)patch.subtitle=subtitle;
  if(Array.isArray(input.chapters))patch.chapters=input.chapters.map(value=>limitText(value,45)).filter(Boolean).slice(0,8);
  return patch;
}

export const normalizeAlbumDesign=value=>({...defaults,...sanitizeAlbumPatch(value)});
export const projectDesign=p=>normalizeAlbumDesign({...p.albumDesign,title:p.title,color:p.color,layout:p.layout});
export function albumDesignFields(input){
  const {title,color,layout,...albumDesign}=normalizeAlbumDesign(input);
  return {title,color,layout,albumDesign};
}

const commandFields={title:'заголовок|название|назови(?: альбом)?',subtitle:'подзаголовок',chapters:'главы|разделы'};
export function interpretAlbumCommand(input){
  let text=String(input).trim().slice(0,500);
  const patch={};
  for(const [key,label] of Object.entries(commandFields)){
    const explicit=new RegExp('(?:^|[\\s,.])(?:'+label+')\\s*[:—]\\s*(?:«([^»]*)»|"([^"]*)"|([^;\\n.!?]*))','iu');
    const match=text.match(explicit);
    if(!match)continue;
    const value=match[1]??match[2]??match[3];
    patch[key]=key==='chapters'?value.split(/[,|]/).map(x=>x.trim()).filter(Boolean):value;
    text=text.replace(match[0],' ');
  }
  const q=text.toLocaleLowerCase('ru').replaceAll('ё','е');
  if(!patch.title){
    const named=text.match(/(?:назови(?:те)?\s+(?:альбом|книгу)|(?:поменяй|смени|измени)\s+(?:заголовок|название)\s+на)\s*[«"]([^»"]+)[»"]/iu)
      ||text.match(/^(?:назови(?:те)?\s+(?:альбом|книгу)|(?:поменяй|смени|измени)\s+(?:заголовок|название)\s+на)\s+([^;\n.!?]+)/iu);
    if(named){patch.title=named[1];text=text.replace(named[0],' ');}
  }
  const command=text.toLocaleLowerCase('ru').replaceAll('ё','е');
  if(/(без|убер\w*|убери|скрой|удали)\s+подзаголов/.test(command))patch.subtitle='';
  if(/сине.?фиолет|синий и фиолет|лаванд|фиолет|сирен/.test(command))Object.assign(patch,palettes.violet);
  else if(/голуб|син(ий|юю|яя|ие|яя)|холодн/.test(command))Object.assign(patch,palettes.blue);
  else if(/тепл|беж|крем|персик|песоч/.test(command))Object.assign(patch,palettes.warm);
  else if(/зелен|шалфе|оливк|изумруд/.test(command))Object.assign(patch,palettes.green);
  else if(/розов|пудров/.test(command))Object.assign(patch,palettes.pink);
  else if(/монохром|черно.бел|сер(ый|ую|ая)/.test(command))Object.assign(patch,palettes.mono);
  const colors=text.match(/#[0-9a-f]{6}\b/gi)||[];
  if(colors.length){if(/акцент/.test(q)&&colors.length===1)patch.accent=colors[0];else patch.color=colors[0];if(colors[1])patch.accent=colors[1];}
  if(/без (фото|снимков|кадров)|только текст|текстов.{0,4} обложк/.test(command))patch.cover='type';
  else if(/коллаж|дв[ае].{0,10}(фото|снимк|кадр).{0,14}обложк|обложк.{0,15}дв[ае]/.test(command))patch.cover='collage';
  else if(/обложк.{0,28}(крупн|одн|больш|фото)|фото.{0,12}на обложк/.test(command))patch.cover='photo';
  if(/по главам|хронолог|разбей на глав|раздели на глав/.test(command)||patch.chapters?.length)patch.layout='story';
  else if(/(один|по одному|1)\s+(кадр|фото|сним)|крупные кадры|кажд.{0,14}(кадр|фото).{0,20}отдельн/.test(command))patch.layout='single';
  else if(/(два|по два|2)\s+(кадр|фото|сним)/.test(command)&&!patch.cover)patch.layout='duo';
  if(/рукопис|курсив|каллиграф/.test(command))patch.typography='italic';
  else if(/без засечек|современн.{0,8} шрифт|прям.{0,8} шрифт/.test(command))patch.typography='sans';
  else if(/с засечками|классическ.{0,8} шрифт|книжн.{0,8} шрифт|сериф/.test(command))patch.typography='serif';
  if(/(без|скрой|убери|выключи)\s+подписи/.test(command))patch.captionMode='hide';
  else if(/(с|верни|покажи|включи|добавь)\s+подпис[ия]/.test(command))patch.captionMode='show';
  if(/минимал/.test(command)){patch.layout??='single';patch.typography??='sans';patch.captionMode??='hide';}
  return sanitizeAlbumPatch(patch);
}

export function describeAlbumPatch(patch){
  const changes=[];
  if(patch.title)changes.push('название');
  if(patch.subtitle!==undefined)changes.push('подзаголовок');
  if(patch.color||patch.accent)changes.push('палитру');
  if(patch.cover)changes.push('обложку');
  if(patch.layout)changes.push('композицию');
  if(patch.typography)changes.push('шрифт');
  if(patch.captionMode)changes.push('видимость подписей');
  if(patch.chapters)changes.push('главы');
  return changes.join(', ');
}

const luminance=rgb=>[.2126,.7152,.0722].reduce((value,k,i)=>{const c=parseInt(rgb.slice(1+2*i,3+2*i),16)/255;return value+k*(c<=.04045?c/12.92:((c+.055)/1.055)**2.4);},0);
export function albumInk(color,accent){
  const bg=luminance(color),fg=luminance(accent);
  if((Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)>=4.5)return accent;
  return bg>.179?'#15131E':'#FFFFFF';
}
