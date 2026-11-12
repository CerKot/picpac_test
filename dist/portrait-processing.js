// Deterministic photo corrections: no synthesis, face warping or skin smoothing.
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;
function percentile(values,p){return values[Math.min(values.length-1,Math.floor((values.length-1)*p))]||0;}

export function planPortraitLight(pixels,mask,width,height,face,{enabled=true}={}){
 const samples=[],sides=[[],[]];
 const left=clamp(Math.floor(face.left*width),0,width-1),right=clamp(Math.ceil(face.right*width),1,width);
 // Sample cheeks/nose, excluding most hair and chin shadows.
 const top=clamp(Math.floor((face.top+(face.bottom-face.top)*.25)*height),0,height-1);
 const bottom=clamp(Math.ceil((face.top+(face.bottom-face.top)*.8)*height),1,height);
 for(let y=top;y<bottom;y+=2)for(let x=left;x<right;x+=2){const i=y*width+x;if(mask[i]<.85)continue;const value=luma(pixels[i*4],pixels[i*4+1],pixels[i*4+2]);samples.push(value);sides[x<(left+right)/2?0:1].push(value);}
 if(samples.length<16)throw new Error('Не удалось оценить свет на лице. Выберите более чёткий снимок.');
 samples.sort((a,b)=>a-b);sides.forEach(a=>a.sort((a,b)=>a-b));
 const mid=percentile(samples,.6),high=percentile(samples,.9),black=samples.filter(x=>x<18).length/samples.length;
 if(high<32||black>.7)throw new Error('В тенях потеряны детали лица. Нужен новый снимок ближе к окну.');
 if(!enabled)return {gain:1,sideGains:[1,1],before:mid,after:mid,changed:false};
 // A bounded luminance curve lifts dark areas while keeping highlights below white.
 const target=high<210?Math.max(mid,Math.min(142,mid+70)):mid;
 const value=clamp(mid/255,.02,.98),desired=clamp(target/255,value,.8);
 const gain=clamp(desired*(1-value)/(value*(1-desired)),1,3.8);
 const levels=sides.map(a=>percentile(a,.6)),best=Math.max(...levels);
 const sideGains=levels.map(v=>clamp(best/Math.max(1,v),1,1.4));
 const after=255*(gain*value)/(1+(gain-1)*value);
 return {gain,sideGains,before:mid,after,changed:gain>1.04||Math.max(...sideGains)>1.08};
}

export function compositePortrait(pixels,mask,width,height,light,face,{protectFace=false}={}){
 const out=new Uint8ClampedArray(pixels.length),centerX=(face.left+face.right)/2,centerY=(face.top+face.bottom)/2;
 const faceW=Math.max(.1,face.right-face.left),faceH=Math.max(.1,face.bottom-face.top);
 for(let i=0;i<mask.length;i++){
  const offset=i*4;
  const r=pixels[offset],g=pixels[offset+1],b=pixels[offset+2],value=luma(r,g,b)/255;
  const x=(i%width)/width,y=Math.floor(i/width)/height,t=clamp((x-face.left)/faceW,0,1);
  const core=(4*(x-centerX)/faceW)**2+(3.4*(y-centerY)/faceH)**2;
  const protectedAlpha=protectFace?clamp((1.2-core)*5,0,1):0;
  const alpha=Math.max(protectedAlpha,clamp((mask[i]-.08)/.84,0,1));
  const faceWeight=Math.exp(-2*((x-centerX)/faceW)**2-2*((y-centerY)/faceH)**2);
  const side=light.sideGains[0]*(1-t)+light.sideGains[1]*t;
  const gain=light.gain*(1+(side-1)*faceWeight),mapped=gain*value/(1+(gain-1)*value);
  // One RGB multiplier preserves hue. Never clip individual channels to white.
  const ratio=value>0?Math.min(mapped/value,255/Math.max(1,r,g,b)):1;
  out[offset]=r*ratio*alpha+255*(1-alpha);out[offset+1]=g*ratio*alpha+255*(1-alpha);out[offset+2]=b*ratio*alpha+255*(1-alpha);out[offset+3]=255;
 }
 return out;
}

export function portraitGeometry(landmarks,width,height){
 if(!landmarks?.[454])throw new Error('Не удалось найти ориентиры лица. Попробуйте другой снимок.');
 const point=i=>({x:landmarks[i].x*width,y:landmarks[i].y*height});
 const eyes=[point(33),point(263)].sort((a,b)=>a.x-b.x);
 const center={x:(eyes[0].x+eyes[1].x)/2,y:(eyes[0].y+eyes[1].y)/2};
 const angle=Math.atan2(eyes[1].y-eyes[0].y,eyes[1].x-eyes[0].x);
 if(!Number.isFinite(angle)||Math.abs(angle)>12*Math.PI/180)throw new Error('Наклон головы слишком большой. Выпрямите голову и переснимите.');
 return {eyes,center,angle,forehead:point(10),chin:point(152)};
}

export function planPortraitTransform(geometry,sourceWidth,sourceHeight,width,height,{headTop=0}={}){
 const {center,angle}=geometry,c=Math.cos(-angle),s=Math.sin(-angle);
 const rotate=p=>({x:c*(p.x-center.x)-s*(p.y-center.y),y:s*(p.x-center.x)+c*(p.y-center.y)});
 const forehead=rotate(geometry.forehead),chin=rotate(geometry.chin),span=chin.y-forehead.y;
 if(span<=0)throw new Error('Не удалось определить положение головы.');
 const desired=height*.55/span;
 const hair=rotate({x:center.x,y:headTop});
 // Taller hairstyles may need a slightly lower eye line. Never crop hair to force a preset zoom.
 for(const eyeLevel of [.39,.41,.43,.45]){
  const target={x:width*.5,y:height*eyeLevel};let cover=0;
  for(const x of [0,width])for(const y of [0,height]){
   const dx=x-target.x,dy=y-target.y,rx=c*dx+s*dy,ry=-s*dx+c*dy;
   cover=Math.max(cover,rx<0?-rx/center.x:rx/(sourceWidth-center.x),ry<0?-ry/center.y:ry/(sourceHeight-center.y));
  }
  const hairLimit=hair.y<0?(target.y-height*.05)/-hair.y:Infinity,chinLimit=chin.y>0?(height*.84-target.y)/chin.y:Infinity;
  const scale=Math.max(Math.min(desired,hairLimit,chinLimit,1.65),cover*1.005);
  if(scale>hairLimit+.001||scale>chinLimit+.001||scale>1.65)continue;
  return {a:c*scale,b:s*scale,c:-s*scale,d:c*scale,e:target.x-scale*(c*center.x-s*center.y),f:target.y-scale*(s*center.x+c*center.y),rotationDegrees:-angle*180/Math.PI,scale};
 }
 throw new Error('Для ровного кадра не хватает места вокруг головы. Выберите снимок с небольшим запасом сверху и по бокам.');
}
export function transformPortraitPoint(point,t){return {x:t.a*point.x+t.c*point.y+t.e,y:t.b*point.x+t.d*point.y+t.f};}
