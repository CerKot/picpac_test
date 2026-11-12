// Local layout planning stays usable without a paid image-generation service.
export const albumThemes={
 wedding:{label:'Свадьба',title:'День, который всегда с нами',subtitle:'Наша история любви',color:'#DCC7BA',accent:'#795D55',layout:'duo',chapters:['Как всё началось','Наш день','Люди рядом']},
 graduation:{label:'Выпускной',title:'Наш выпускной',subtitle:'Время, которое мы запомним',color:'#CED8E5',accent:'#4C627B',layout:'duo',chapters:['Первые встречи','Наши люди','Большой день']},
 anniversary:{label:'Юбилей',title:'История, которую мы любим',subtitle:'Главные моменты вместе',color:'#D5D8BE',accent:'#53634E',layout:'story',chapters:['Начало истории','Семья и друзья','Сегодня']},
 birthday:{label:'День рождения',title:'Твой особенный день',subtitle:'Моменты радости',color:'#F4D6C8',accent:'#9B6259',layout:'single',chapters:['Ожидание','Праздник','Самые тёплые слова']},
 travel:{label:'Путешествие',title:'Там, где мы были счастливы',subtitle:'Дороги и открытия',color:'#C7DDD4',accent:'#496D63',layout:'duo',chapters:['В путь','Наши открытия','Хочется вернуться']}
};
export function planAlbum({theme='wedding',idea='',style='modern'}={}){
 const text=String(idea).trim().slice(0,500),lower=text.toLocaleLowerCase('ru');
 let key=Object.hasOwn(albumThemes,theme)?theme:'wedding';
 if(/выпуск|школ|университет|класс/.test(lower))key='graduation';
 else if(/свад|венчан|жених|невест/.test(lower))key='wedding';
 else if(/юбиле|годовщин|\b\d{2}\s*лет/.test(lower))key='anniversary';
 else if(/день рожд|именин/.test(lower))key='birthday';
 else if(/путешеств|поездк|отпуск|море/.test(lower))key='travel';
 const base=albumThemes[key],palette=style==='classic'?{color:'#E8DDCB',accent:'#685445'}:style==='bright'?{color:'#DCE7D8',accent:'#3C6C63'}:{color:base.color,accent:base.accent};
 const layout=/один кадр|крупн|минимал/.test(lower)?'single':/глав|хронолог|истори/.test(lower)?'story':base.layout;
 const customTitle=text.match(/(?:названи[ея]|заголовок)\s*[:—-]\s*([^.!?\n]{3,70})/i)?.[1]?.trim();
 return {...base,...palette,key,layout,style,title:customTitle||base.title,idea:text,caption:text?`Вы просили: ${text}`:'Добавьте свои фотографии, чтобы увидеть вашу историю в этом макете.'};
}
