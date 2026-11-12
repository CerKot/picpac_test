const DB='picpac-mobile-v1';let db;
export const fresh=()=>({projects:[],cart:[],orders:[],templates:[],favorites:[],profile:{name:'',phone:'',email:'',address:''},promo:''});
export async function openStore(accountId){
 const name=accountId?`${DB}-${accountId}`:DB;
 db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{r.result.createObjectStore('state');r.result.createObjectStore('photos');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return await get('state','main')||fresh();
}
function get(table,key){return new Promise((resolve,reject)=>{const r=db.transaction(table).objectStore(table).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function put(table,key,value){return new Promise((resolve,reject)=>{const tx=db.transaction(table,'readwrite');tx.objectStore(table).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Хранилище недоступно'));});}
export const save=state=>put('state','main',state);
export const savePhoto=(id,blob)=>put('photos',id,blob);
export const getPhoto=id=>get('photos',id);
export const deletePhoto=id=>new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
export async function clearStore(){for(const table of ['state','photos'])await new Promise((resolve,reject)=>{const tx=db.transaction(table,'readwrite');tx.objectStore(table).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
