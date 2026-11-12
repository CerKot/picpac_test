import test from 'node:test';
import assert from 'node:assert/strict';
import {albumThemes,planAlbum} from '../dist/ai-album.js';

test('Album planner follows an explicit event and a custom cover title',()=>{
 const result=planAlbum({theme:'wedding',idea:'Наш выпускной в школе. Крупные кадры. Заголовок: Последний звонок'});
 assert.equal(result.key,'graduation');
 assert.equal(result.layout,'single');
 assert.equal(result.title,'Последний звонок');
 assert.equal(result.chapters.length,3);
});

test('Themes and styles produce distinct book-ready layouts without changing the source presets',()=>{
 const a=planAlbum({theme:'anniversary',style:'classic',idea:'Сделать альбом по главам'});
 const b=planAlbum({theme:'birthday',style:'bright'});
 assert.equal(a.layout,'story');
 assert.notEqual(a.color,b.color);
 assert.equal(albumThemes.anniversary.color,'#D5D8BE');
 assert.ok(b.title.length>0);
});
