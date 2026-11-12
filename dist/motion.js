const reduced=matchMedia('(prefers-reduced-motion: reduce)');
export const motionAllowed=()=>!reduced.matches;

const textEffects=new WeakMap();
export function animateText(el,value){
  if(!el||el.textContent===value)return;
  el.textContent=value;
  textEffects.get(el)?.cancel();
  if(motionAllowed()&&el.animate){
    textEffects.set(el,el.animate([{opacity:.45,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],
      {duration:260,easing:'cubic-bezier(.2,.75,.3,1)'}));
  }
}

export function installMotion(){
  document.addEventListener('click',event=>{
    const button=event.target.closest('button:not(:disabled),summary,.secondary[href]');
    if(!button||!motionAllowed()||!button.animate)return;
    const box=button.getBoundingClientRect();
    if(!box.width||!box.height)return;
    // The glint can finish even when this press replaces the current view.
    const effect=document.createElement('span');
    effect.className='liquid-press-glint';
    effect.style.left=(event.detail?event.clientX:box.left+box.width/2)+'px';
    effect.style.top=(event.detail?event.clientY:box.top+box.height/2)+'px';
    effect.setAttribute('aria-hidden','true');document.body.append(effect);
    const scale=Math.min(3,Math.max(1.1,box.width/82));
    const pulse=effect.animate([
      {opacity:.72,transform:'translate(-50%, -50%) scale(.22)'},
      {opacity:.38,transform:'translate(-50%, -50%) scale(1)',offset:.35},
      {opacity:0,transform:'translate(-50%, -50%) scale('+scale+')'},
    ],{duration:410,easing:'cubic-bezier(.17,.78,.23,1)'});
    pulse.onfinish=pulse.oncancel=()=>effect.remove();
    button.animate([{scale:'.96'},{scale:'1.025',offset:.48},{scale:'1'}],
      {duration:330,easing:'cubic-bezier(.21,.72,.32,1)'});
  },{capture:true});
}
