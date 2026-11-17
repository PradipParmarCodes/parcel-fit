import './style.css';
import {achievementProgress,type AchievementStatus} from './achievements';
import {GameSound} from './sound';
import {installSettings} from './settings';
import {routes} from './routes';
import {WorldMap} from './world-map';
import {difficultyOrder,difficultyBands,difficultyOf,deliveryNumber,nextDelivery,firstUnsolved,canPlayLevel} from './difficulty';
import {landingPose,landingImpactMs,landingDurationMs,sparkleAlpha,truckArrivalMs,truckDepartureDelayMs,truckDepartureMs,truckTravelOffset,suspensionBounce,waveLift} from './juice';
import {fitStage} from './layout';
import {readProgress,saveVersion,writeProgress,type Guide} from './progress';
import {Game,levels,rotate,valid,solve,help,type Cell,type Placement} from './engine';
import {actionCount,emptyAttempt,starText,starsFor,type AttemptStats,type StarRating} from './stars';
import {freeHintsFor,shouldOfferRewardedHint} from './hints';
import {createAds,type AdHost} from './ads';

const game=new Game();
const restored=readProgress();
let packings=restored?.packings??levels.map(l=>l.parcels.map(()=>null));
let completed=restored?.completed??levels.map(()=>false);
const hintedAttempts=restored?.hintedAttempts??levels.map(()=>false);
const hintFreeClears=restored?.hintFreeClears??levels.map(()=>false);
const bestStars=restored?.bestStars??levels.map(()=>0);
const attempts=restored?.attempts??levels.map(()=>emptyAttempt());
let activeAttempt:AttemptStats=structuredClone(attempts[game.index]??emptyAttempt());
let bonusHints=0,rewardedHintUsed=false;
const assistedResets=new WeakSet<Placement[]>();
if(restored){
 game.index=canPlayLevel(restored.index,completed)?restored.index:firstUnsolved(completed)??difficultyOrder[0];
 game.state=structuredClone(packings[game.index]);
 activeAttempt=structuredClone(attempts[game.index]??emptyAttempt());
}
let guide:Guide=restored?.guide??'drag';
let guidedTarget:{id:number;p:Exclude<Placement,null>}|null=null;
let guideKey='';
let newPostcard:number|null=null,stampPlayed=false;
let newAchievements:AchievementStatus[]=[];
let achievementsOpener:HTMLElement|null=null;
let unlockedLevel:number|undefined;
let landingRings:{id:number;p:Exclude<Placement,null>;start:number}[]=[];
let cssWidth=600,stage=fitStage(600,720,game.level);
const canvas=document.querySelector<HTMLCanvasElement>('#board')!;
const ctx=canvas.getContext('2d')!;
const $=(id:string)=>document.getElementById(id)!;
const gameElement=document.querySelector<HTMLElement>('.game')!;
const homeElement=$('home-screen');
const sound=new GameSound();
let playing=false,gameFrameQueued=false,adOpen=false;
const ads=createAds({
 document,
 host:typeof window==='undefined'?undefined:window as AdHost,
 location:typeof window==='undefined'?undefined:window.location,
 onPause:()=>{adOpen=true;},
 onResume:()=>{adOpen=false;requestGameFrame();},
});
const homeAdSlot=document.querySelector<HTMLElement>('.home-ad-slot');
const homeAdContainer=$('container-9dedbeb1a7039a5b63a52d317c3a8904');
if(homeAdSlot&&homeAdContainer&&typeof MutationObserver!=='undefined'){
 const hasAd=()=>Array.from(homeAdContainer.querySelectorAll<HTMLElement>('iframe, img, video, a, [role="img"]')).some(node=>{
  const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
  if(rect.width<4||rect.height<4||style.display==='none'||style.visibility==='hidden')return false;
  return node.tagName!=='IFRAME'||Boolean((node as HTMLIFrameElement).src&&(node as HTMLIFrameElement).src!=='about:blank');
 });
 const adObserver=new MutationObserver(()=>{
  if(!hasAd()){return;}
  homeAdSlot.dataset.filled='true';
  adObserver.disconnect();
 });
 adObserver.observe(homeAdContainer,{childList:true,subtree:true});
 window.setTimeout(()=>{
  if(hasAd())homeAdSlot.dataset.filled='true';
  else homeAdSlot.classList.add('ad-empty');
  adObserver.disconnect();
 },15000);
}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
type DeviceNavigator=Navigator&{deviceMemory?:number};
const deviceNavigator=typeof navigator==='undefined'?null:navigator as DeviceNavigator;
const deviceMemory=deviceNavigator?.deviceMemory??8;
const lowEndDevice=!!deviceNavigator&&(
 deviceMemory<=2||
 (deviceNavigator.hardwareConcurrency??8)<=2||
 (deviceMemory<=4&&(deviceNavigator.hardwareConcurrency??8)<=4)
);
const frameInterval=lowEndDevice?1000/30:0;
let lastRenderedAt=-Infinity;
let W=stage.w,H=stage.h;
let selected=-1,rotation=0,lastComplete=game.complete,lastRunStars:StarRating=0,newBest=false;
let cursor:Cell|null=null;
let completedAt=game.complete?performance.now()-3000:0,feedbackUntil=0,arrivedAt=performance.now(),deliveryDone=game.complete;
let deadEnd=false,assessedState='';
let sparks:{x:number;y:number;start:number}|null=null;
let loadedPulse=0,departedSound=false,previousCount=-1;
let rowWaves:{row:number;start:number}[]=[];
type Particle={x:number;y:number;vx:number;vy:number;size:number;color:string;start:number;duration:number;shape:'star'|'ribbon'|'dot';follow:boolean};
let particles:Particle[]=[];
function burst(x:number,y:number,count=16,celebration=false,delay=0){
 if(reducedMotion)return;
 const particleCount=lowEndDevice?Math.ceil(count*.55):count;
 const now=performance.now()+delay,colors=celebration?['#e6b75b','#77aa84','#e9a08a','#a1cfc3','#f5dd91']:['#e8bb60','#f6d886','#a3bf75','#fff2c7'];
 for(let i=0;i<particleCount;i++){const a=-Math.PI*.95+i/particleCount*Math.PI*.9;const speed=celebration?120+(i%7)*26:65+(i%5)*19;particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-(celebration?70:20),size:celebration?4+i%4:2+i%3,color:colors[i%colors.length],start:now,duration:celebration?2100:650,shape:celebration?'ribbon':i%3?'dot':'star',follow:!celebration});}
 particles=particles.slice(-(lowEndDevice?48:100));
}
function packedRows(){const l=game.level,occupied=new Set<string>(l.blocked.map(([x,y])=>`${x},${y}`));game.state.forEach((p,id)=>{if(p)cells(id,p.r).forEach(([x,y])=>occupied.add(`${x+p.x},${y+p.y}`));});return Array.from({length:l.h},(_,y)=>y).filter(y=>Array.from({length:l.w},(_,x)=>occupied.has(`${x},${y}`)).every(Boolean));}
function drawDelight(time:number,offset:number){
 particles=particles.filter(p=>time-p.start<p.duration);
 for(const p of particles){const t=(time-p.start)/1000;if(time<p.start)continue;ctx.save();ctx.globalAlpha=sparkleAlpha(time-p.start,p.duration);ctx.translate(p.x+p.vx*t+(p.follow?offset:0),p.y+p.vy*t+170*t*t);ctx.rotate(t*4+p.x);ctx.fillStyle=p.color;
 if(p.shape==='star'){ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?p.size*.35:p.size;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();}else if(p.shape==='ribbon')ctx.fillRect(-p.size/2,-p.size,p.size,p.size*1.8);else circle(0,0,p.size,p.color);ctx.restore();}
}

let feedbackPersistent=false;
type Rect={x:number;y:number;s:number};
type Hit=Rect&{id:number;cells:Cell[]};
type Drag={id:number;x:number;y:number;startX:number;startY:number;touch:boolean;r:number;ox:number;oy:number;moved:boolean;pointer:number;tilt:number;liftAt:number};
type Motion={id:number;start:number;from:Rect;to:Rect;r:number;kind:'snap'|'return'|'reject'};
let drag:Drag|null=null,motion:Motion|null=null;
let spin:{id:number;start:number}|null=null;
let hits:Hit[]=[];

function board(){return stage.board;}
function roadY(){return stage.road;}
function uiFont(px:number){return px*W/cssWidth;}
function cells(id:number,r:number){return rotate(game.level.parcels[id].cells,r);}
function bounds(c:Cell[]){return {w:Math.max(...c.map(p=>p[0]))+1,h:Math.max(...c.map(p=>p[1]))+1};}
function tray(id:number):Rect{
 const slot=stage.slots[id],shape=cells(id,id===selected?rotation:0),size=bounds(shape),padding=16;
 const s=Math.max(5,Math.min(66,(slot.w-20)/size.w,(slot.h-padding)/size.h));
 return {x:slot.x+(slot.w-size.w*s)/2,y:slot.y+(slot.h-size.h*s)/2,s};
}
function refreshGuide(){
 const key=guide+game.index+JSON.stringify(game.state)+selected+':'+rotation;
 if(key===guideKey)return;guideKey=key;guidedTarget=null;
 if(guide!=='drag'||game.complete||deadEnd)return;
 const ids=selected>=0&&!game.state[selected]?[selected]:game.state.map((p,id)=>p?-1:id).filter(id=>id>=0).sort((a,b)=>(game.level.solution[a].r===0?-1:1)-(game.level.solution[b].r===0?-1:1));
 for(const id of ids){const r=id===selected?rotation:0,shape=bounds(cells(id,r)),preferred=game.level.solution[id];const candidates=[...(preferred.r===r?[preferred]:[])];
 for(let y=0;y<=game.level.h-shape.h;y++)for(let x=0;x<=game.level.w-shape.w;x++)candidates.push({x,y,r});
 for(const p of candidates){if(!valid(game.level,game.state,id,p))continue;const future=structuredClone(game.state);future[id]=p;if(solve(game.level,future)){guidedTarget={id,p};return;}}
 }
}
function drawTutorial(time:number){
 if(!guidedTarget||guide!=='drag'||drag||game.complete||motion||time-arrivedAt<780)return;
 const {id,p}=guidedTarget,b=board(),slot=stage.slots[id],source=tray(id),shape=cells(id,id===selected?rotation:0),[firstX,firstY]=shape[0];
 ctx.save();ctx.strokeStyle='#dca74a';ctx.lineWidth=3+(reducedMotion?0:Math.sin(time/300));ctx.setLineDash([]);ctx.strokeRect(slot.x+2,slot.y+2,slot.w-4,slot.h-4);ctx.restore();
 if(selected>=0)return;
 const from={x:source.x+(firstX+.5)*source.s,y:source.y+(firstY+.5)*source.s},to={x:b.x+(p.x+firstX+.5)*b.s,y:b.y+(p.y+firstY+.5)*b.s};
 ctx.save();ctx.strokeStyle='#bd9e5a88';ctx.lineWidth=2;ctx.setLineDash([4,7]);ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.quadraticCurveTo(from.x-uiFont(25),(from.y+to.y)/2,to.x,to.y);ctx.stroke();ctx.setLineDash([]);
 const raw=reducedMotion?.7:((time-arrivedAt-780)%3700)/3700,t=Math.max(0,Math.min(1,(raw-.15)/.6)),ease=t*t*(3-2*t),x=from.x+(to.x-from.x)*ease-uiFont(15)*Math.sin(ease*Math.PI),y=from.y+(to.y-from.y)*ease;
 if(!reducedMotion&&raw>.15&&raw<.88){ctx.save();ctx.globalAlpha=.42;const ds=source.s+(b.s-source.s)*ease;parcel(id,shape,{x:x-(firstX+.5)*ds,y:y-(firstY+.5)*ds,s:ds},{lifted:true});ctx.restore();}
 ctx.shadowColor='#61794933';ctx.shadowBlur=8;circle(x,y,uiFont(13),'#fffcf1','#a88c4e',1.5);text('↑',x,y+uiFont(5),uiFont(20),'#a58440','center',true);ctx.restore();
}
function target(id:number):Rect{const p=game.state[id];if(!p)return tray(id);const b=board();return {x:b.x+p.x*b.s,y:b.y+p.y*b.s,s:b.s};}
function lift(){return drag?.touch?65*W/canvas.getBoundingClientRect().width:17;}
function floating():Rect{const b=board();return {x:drag!.x-drag!.ox*b.s,y:drag!.y-lift()-drag!.oy*b.s,s:b.s};}
function preview():Exclude<Placement,null>{const b=board(),f=floating();return {x:Math.round((f.x-b.x)/b.s),y:Math.round((f.y-b.y)/b.s),r:drag!.r};}
function intersectsVan(){if(!drag)return false;const b=board(),f=floating(),size=bounds(cells(drag.id,drag.r));return f.x+size.w*b.s>b.x-12&&f.x<b.x+game.level.w*b.s+12&&f.y+size.h*b.s>b.y-12&&f.y<b.y+game.level.h*b.s+12;}
function rounded(x:number,y:number,w:number,h:number,r:number,fill:string|CanvasGradient,stroke?:string){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.3;ctx.stroke();}}
function text(str:string,x:number,y:number,size:number,color:string,align:CanvasTextAlign='left',bold=false){ctx.fillStyle=color;ctx.font=`${bold?'600 ':''}${size}px Arial`;ctx.textAlign=align;ctx.fillText(str,x,y);}
function line(x:number,y:number,x2:number,y2:number,color:string,width=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function parcel(id:number,shape:Cell[],rect:Rect,options:{ghost?:boolean;ok?:boolean;lifted?:boolean;selected?:boolean;scale?:number;angle?:number;scaleX?:number;scaleY?:number}={}){
 const {x,y,s}=rect,dim=bounds(shape),solid=new Set(shape.map(([x,y])=>`${x},${y}`));
 ctx.save();
 const cx=x+dim.w*s/2,cy=y+dim.h*s/2;
 ctx.translate(cx,cy);ctx.rotate(options.angle??0);ctx.scale(options.scaleX??options.scale??1,options.scaleY??options.scale??1);ctx.translate(-cx,-cy);
 // One continuous silhouette per parcel; shared edges remain joined.
 const path=new Path2D();for(const [px,py]of shape)path.rect(x+px*s+1,y+py*s+1,s-2,s-2);
 for(const [px,py]of shape){if(solid.has(`${px+1},${py}`))path.rect(x+(px+1)*s-2,y+py*s+1,4,s-2);if(solid.has(`${px},${py+1}`))path.rect(x+px*s+1,y+(py+1)*s-2,s-2,4);}
 if(options.ghost){ctx.shadowColor=options.ok?'#a6d47d':'#d7926a';ctx.shadowBlur=reducedMotion?0:lowEndDevice?4:12;ctx.fillStyle=options.ok?'#8de2a9b8':'#ffa693a8';ctx.fill(path);ctx.shadowBlur=0;}
 else{
 const depth=Math.max(2,s*.065);
  ctx.shadowColor=options.lifted?'#273b325e':'#5b48393b';
  ctx.shadowBlur=options.lifted?(lowEndDevice?8:20):(lowEndDevice?2:5);
 ctx.shadowOffsetY=options.lifted?10:3;
 ctx.fillStyle='#8e5d39';
 ctx.save();ctx.translate(0,depth);ctx.fill(path);ctx.restore();
 ctx.shadowColor='transparent';
 const paper=ctx.createLinearGradient(x,y,x+dim.w*s,y+dim.h*s);
 const highlights=['#edc98b','#e6b985','#edbe98','#dec890','#e7af87','#e8ca9a'];
 paper.addColorStop(0,highlights[id%highlights.length]);
 paper.addColorStop(1,game.level.parcels[id].color);
 ctx.fillStyle=paper;ctx.fill(path);
 ctx.save();ctx.clip(path);
 // Fibers are decorative but expensive on a low-end canvas.
 if(!lowEndDevice)for(const [px,py] of shape){
  const cellX=x+px*s,cellY=y+py*s;
  for(let i=0;i<12;i++){
   const fiberX=cellX+s*(.06+(i*37%89)/100);
   const fiberY=cellY+s*(.08+(i*29%81)/100);
   line(fiberX,fiberY,fiberX+s*.045,fiberY+s*.012,i%2?'#fff2d14c':'#71492625');
  }
 }
 const tape=ctx.createLinearGradient(x,y,x+dim.w*s,y+dim.h*s);
 tape.addColorStop(0,'#fff2c5aa');
 tape.addColorStop(1,'#d29a568b');
 ctx.fillStyle=tape;
 ctx.fillRect(x+dim.w*s*.5-s*.105,y,s*.21,dim.h*s);
 ctx.fillRect(x,y+dim.h*s*.5-s*.085,dim.w*s,s*.17);
 line(x+dim.w*s*.5-s*.105,y,x+dim.w*s*.5-s*.105,y+dim.h*s,'#fff6d49c');
 line(x,y+dim.h*s*.5-s*.085,x+dim.w*s,y+dim.h*s*.5-s*.085,'#fff6d49c');
 ctx.restore();
 }
 // Outline only exposed edges, to make L/T parcels read as a single box.
 if(options.ghost&&!options.ok)ctx.setLineDash([6,4]);
 const outline=options.ghost?(options.ok?'#1c6147':'#9c3b37'):'#795332';
 for(const [px,py]of shape){const tx=x+px*s+1,ty=y+py*s+1;
 if(!solid.has(`${px},${py-1}`)){line(tx,ty,tx+s-2,ty,outline,options.ghost?2.5:1.5);if(!options.ghost)line(tx+2,ty+3,tx+s-4,ty+3,'#f9dba6',2);}
 if(!solid.has(`${px-1},${py}`))line(tx,ty,tx,ty+s-2,outline,options.ghost?2.5:1.5);
 if(!solid.has(`${px+1},${py}`))line(tx+s-2,ty,tx+s-2,ty+s-2,outline,2);
 if(!solid.has(`${px},${py+1}`))line(tx,ty+s-2,tx+s-2,ty+s-2,outline,2);
 }
 ctx.setLineDash([]);
 const [lx,ly]=shape[0],labelX=x+lx*s+s*.09,labelY=y+ly*s+s*.17;
 if(!options.ghost){
 rounded(labelX+1,labelY+2,s*.79,s*.58,3,'#76502e3b');
  rounded(labelX,labelY,s*.79,s*.58,3,'#fffaf0','#9d794d');
  if(s>=14){
   ctx.save();ctx.fillStyle='#594632';
   const bars=[.08,.14,.20,.28,.34,.43,.49,.58,.64,.72];
   for(const [index,offset] of bars.entries())ctx.fillRect(labelX+s*offset,labelY+s*.12,s*(index%3===0?.026:.014),s*.28);
   ctx.fillStyle='#b28b5b';ctx.fillRect(labelX+s*.08,labelY+s*.45,s*.52,s*.045);ctx.restore();
  }
 const [endX,endY]=shape[shape.length-1],sx=x+(endX+.72)*s,sy=y+(endY+.77)*s;
 ctx.save();ctx.translate(sx,sy);ctx.rotate(-.12);ctx.strokeStyle='#926e4366';ctx.lineWidth=Math.max(1,s*.018);
 if(id%3===0){ctx.beginPath();ctx.moveTo(-s*.08,-s*.05);ctx.bezierCurveTo(-s*.15,-s*.14,-s*.2,s*.02,0,s*.1);ctx.bezierCurveTo(s*.2,s*.02,s*.15,-s*.14,0,-s*.05);ctx.stroke();}
 else if(id%3===1){ctx.beginPath();ctx.arc(0,0,s*.11,Math.PI,Math.PI*2);ctx.lineTo(s*.11,0);ctx.moveTo(0,-s*.11);ctx.lineTo(0,s*.1);ctx.quadraticCurveTo(-s*.05,s*.15,-s*.065,s*.08);ctx.stroke();}
 else{ctx.strokeRect(-s*.09,-s*.1,s*.16,s*.11);ctx.beginPath();ctx.moveTo(-s*.01,s*.01);ctx.lineTo(-s*.01,s*.12);ctx.moveTo(-s*.07,s*.12);ctx.lineTo(s*.05,s*.12);ctx.stroke();}ctx.restore();
 
 }
 if(options.selected&&!options.ghost){ctx.save();ctx.strokeStyle='#346d55';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.stroke(path);ctx.restore();}
 ctx.restore();
}
function driveOffset(time:number){
 const distance=game.complete?W+200:cabBounds().right+stage.cab+26;
 return truckTravelOffset(time-(game.complete?completedAt:arrivedAt),distance,game.complete,reducedMotion);
}
function truckBodyOffset(time:number){
 if(reducedMotion)return 0;
 const suspension=loadedPulse?suspensionBounce(time-loadedPulse-landingImpactMs,3):0;
 const motion=game.complete?suspensionBounce(time-completedAt-1000,4):
  suspensionBounce(time-arrivedAt-truckArrivalMs+90,4.8);
 return suspension+motion;
}
function circle(x:number,y:number,r:number,fill:string,stroke?:string,width=2){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
// Preserve route rewards already earned when loading a save from before milestones.
const legacyPostcards=restored?.legacyPostcards??routes.map(route=>
 difficultyOrder.filter(index=>levels[index].chapter===route.name).every(index=>completed[index]));
let pickerRoute=-1;
let pickerDifficulty='';
function routeIndex(){return routes.findIndex(route=>route.name===game.level.chapter);}
function palette(){return routes[routeIndex()]??routes[0];}
function drawFixedCargo(){
 const b=board();for(const [x,y]of game.level.blocked){const px=b.x+x*b.s,py=b.y+y*b.s,s=b.s;
 rounded(px+2,py+2,s-4,s-4,4,'#829a99','#4c6d6c');rounded(px+5,py+5,s-10,5,2,'#b3c6b8');
 ctx.save();ctx.strokeStyle='#617e7b';ctx.lineWidth=Math.max(1,s*.025);ctx.beginPath();ctx.moveTo(px+5,py+s*.72);ctx.lineTo(px+s*.72,py+5);ctx.moveTo(px+s*.28,py+s-5);ctx.lineTo(px+s-5,py+s*.28);ctx.stroke();ctx.restore();
 for(const [dx,dy]of [[.14,.17],[.85,.17],[.14,.85],[.85,.85]])circle(px+s*dx,py+s*dy,Math.max(1,s*.035),'#d3dcc4');
 // Bolted plates look unlike cardboard and never enter the drag hit list.
 rounded(px+s*.33,py+s*.43,s*.34,s*.27,2,'#c3d2ba','#5e7b73');ctx.beginPath();ctx.arc(px+s*.5,py+s*.43,s*.1,Math.PI,0);ctx.strokeStyle='#d6dec7';ctx.lineWidth=2;ctx.stroke();circle(px+s*.5,py+s*.56,Math.max(1,s*.025),'#617d71');
 }
}
function polygon(points:Cell[],fill:string){
 ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.closePath();ctx.fillStyle=fill;ctx.fill();
}
function tree(x:number,y:number,s:number,foliage:string,fruit=false){
 line(x,y,x,y-s*.8,'#807355',Math.max(2,s*.085));
 circle(x-s*.19,y-s*.66,s*.29,foliage);
 circle(x+s*.24,y-s*.68,s*.26,foliage);
 circle(x,y-s*.89,s*.32,foliage);
 circle(x-s*.12,y-s*.98,s*.19,'#fff2cc50');
 if(fruit)for(const [dx,dy] of [[-.21,-.65],[.12,-.94],[.34,-.7]])circle(x+s*dx,y+s*dy,s*.065,'#ba553e');
}
function landmark(x:number,y:number,theme:string){
 const colors=palette();
 if(theme==='lighthouse'){
  polygon([[x-42,y],[x-32,y-88],[x-11,y-88],[x,y]],'#fae1b9');
  polygon([[x-38,y-30],[x-35,y-53],[x-8,y-53],[x-5,y-30]],'#ad644f');
  rounded(x-36,y-104,27,19,3,'#5d627e','#5d627e');
  rounded(x-31,y-101,17,11,3,'#fff0b0');
  polygon([[x-42,y-104],[x-22,y-122],[x-3,y-104]],'#6e5777');
  return;
 }
 if(theme==='harbor'||theme==='canal'){
  rounded(x-76,y-24,111,17,4,'#c5dcda');
  polygon([[x-68,y-28],[x+14,y-28],[x+4,y-13],[x-57,y-13]],theme==='canal'?'#799c87':'#809eac');
  line(x-38,y-27,x-38,y-78,'#716d63',3);
  polygon([[x-33,y-74],[x-33,y-32],[x-3,y-32]],'#fff4d7');
  return;
 }
 if(theme==='alpine'){
  polygon([[x-89,y],[x-30,y-116],[x+41,y]],'#a0b9bb');
  polygon([[x-51,y-76],[x-30,y-116],[x-4,y-75],[x-24,y-83],[x-36,y-72]],'#f8f4e8');
  return;
 }
 if(theme==='orchard'){
  for(let i=0;i<3;i++)tree(x-61+i*34,y,36+(i%2)*15,i===1?'#b88259':'#c18b55',true);
  return;
 }
 rounded(x-79,y-62,68,60,4,theme==='garden'?'#c7d9b3':'#e7ca9e');
 polygon([[x-86,y-59],[x-47,y-95],[x-5,y-59]],theme==='garden'?'#92b296':'#ac7662');
 for(let i=0;i<2;i++)rounded(x-70+i*36,y-48,16,18,2,theme==='night'?'#ffdf91':'#fcf1d0');
 rounded(x-52,y-30,17,30,3,colors.tree);
 line(x-86,y-1,x-4,y-1,'#8b8266',2);
}
function scenery(time:number){
 const colors=palette(),road=roadY(),theme=game.level.theme;
 const portraitGround=stage.wide?H:Math.min(H,road+82);
 const sky=ctx.createLinearGradient(0,0,0,road+16);
 sky.addColorStop(0,colors.sky);sky.addColorStop(1,colors.horizon);
 ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 const night=theme==='night'||theme==='lighthouse';
 const sunX=W*(stage.wide?.53:.84),sunY=Math.min(69,road*.25);
 circle(sunX,sunY,night?22:30,night?'#fff0c773':'#f9d99e80');
 circle(sunX,sunY,night?14:21,night?'#fff5cc':'#ffe8ae');
 if(night)for(let i=0;i<20;i++)circle((i*73+39)%W,13+i%5*17,i%4===0?1.7:1,'#fff4ccbb');
 for(let i=0;i<4;i++){
  const x=(i*W*.28+(reducedMotion?0:time/190))%(W+120)-45,y=38+i%2*44;
  rounded(x,y,80,12,6,'#fffaf081');circle(x+25,y,13,'#fffaf083');circle(x+48,y-4,17,'#fffaf085');
 }
 ctx.beginPath();ctx.moveTo(0,road-55);
 ctx.bezierCurveTo(W*.18,road-155,W*.34,road-23,W*.53,road-81);
 ctx.bezierCurveTo(W*.7,road-139,W*.86,road-61,W,road-116);
 ctx.lineTo(W,road);ctx.lineTo(0,road);ctx.closePath();
 const hill=ctx.createLinearGradient(0,road-130,0,road);
 hill.addColorStop(0,colors.horizon);hill.addColorStop(1,colors.hill);
 ctx.fillStyle=hill;ctx.fill();
 ctx.beginPath();ctx.moveTo(0,road-31);ctx.quadraticCurveTo(W*.22,road-100,W*.49,road-33);
 ctx.quadraticCurveTo(W*.76,road-70,W,road-31);ctx.lineTo(W,road+7);ctx.lineTo(0,road+7);ctx.closePath();ctx.fillStyle=colors.grass;ctx.fill();
 const markX=stage.wide?stage.bay.x-17:W-14;
 landmark(markX,road-10,theme);
 for(const [x,z] of [[19,43],[61,29],[markX-101,32]]){
  if(x>12)tree(x,road-7,z,colors.tree,theme==='orchard');
 }
 for(let i=0;i<9;i++){
  const x=14+i*(W-28)/8,y=road-5-(i%4)*5;
  line(x,y,x+3,y-6,'#778b67',1);
  if(i%3===0)circle(x+3,y-7,2.4,i%2?'#ffebad':'#f3c5a5');
 }
 const roadHeight=stage.wide?32:25;
 const asphalt=ctx.createLinearGradient(0,road,0,road+roadHeight);
 asphalt.addColorStop(0,'#626f62');asphalt.addColorStop(1,'#48564c');
 ctx.fillStyle=asphalt;ctx.fillRect(0,road,W,roadHeight);
 ctx.fillStyle='#f7e9bc';ctx.fillRect(0,road+1,W,2);
 for(let x=-48;x<W+48;x+=76)rounded(x,road+13,29,3,2,'#e5dcac');
 if(!stage.wide){
  const ground=ctx.createLinearGradient(0,road+25,0,portraitGround);
  ground.addColorStop(0,'#d8d9b5');ground.addColorStop(1,'#ecebd6');
  ctx.fillStyle=ground;ctx.fillRect(0,road+25,W,H-road-25);
 }
}
function drawDriver(x:number,y:number,scale:number,time:number){
 ctx.save();
 ctx.translate(x,y);
 ctx.scale(scale,scale);
 // The courier sits behind the wheel, with a scarf and a small uniform cap.
 rounded(-18,12,35,26,10,'#306b61','#254e48');
 rounded(-12,12,24,7,3,'#b4483c');
 polygon([[5,16],[14,18],[10,30],[4,24]],'#b4483c');
 polygon([[-19,-5],[-18,-25],[-5,-14],[9,-14],[19,-25],[20,-3]],'#ac542e');
 polygon([[-15,-9],[-15,-19],[-8,-12]],'#f3a173');
 polygon([[11,-12],[17,-19],[17,-8]],'#f3a173');
 ctx.beginPath();
 ctx.ellipse(0,0,21,17,0,0,Math.PI*2);
 ctx.fillStyle='#dc7842';ctx.fill();
 ctx.strokeStyle='#8e472c';ctx.lineWidth=1.4;ctx.stroke();
 polygon([[-19,3],[-10,4],[0,9],[8,5],[20,1],[17,10],[8,16],[-5,15],[-14,12]],'#ffebcc');
 rounded(-10,-21,22,9,4,'#2e6259','#203f38');
 rounded(-8,-14,29,4,2,'#2a5047');
 const wave=reducedMotion?0:game.complete?waveLift(time-completedAt-125,920):
  Math.max(waveLift(time-arrivedAt-truckArrivalMs+45,710),waveLift(time-honkedAt,660));
 const blinking=!reducedMotion&&(time+game.index*470)%4800>4670;
 if(blinking){line(-6,-6,-2,-6,'#352821',1.3);line(6,-5,10,-5,'#352821',1.3);}
 else{circle(-4,-6,1.7,'#352821');circle(8,-5,1.7,'#352821');}
 circle(14,5,2.8,'#4b3328');
 ctx.beginPath();ctx.moveTo(6,9);ctx.quadraticCurveTo(10,13+wave*2,15,9);
 ctx.strokeStyle='#643925';ctx.lineWidth=1.5;ctx.stroke();
 circle(20,25,8,'#36584f','#253b36');
 line(9,26,16,23,'#dc7842',5);
 if(wave>0){
  const handX=-19+wave*(Math.sin(time/59)*3.5-4),handY=19-wave*24;
  line(-13,23,-20,20-8*wave,'#315b53',7);
  line(-20,20-8*wave,handX,handY+3,'#315b53',6);
  ctx.save();ctx.translate(handX,handY);ctx.rotate(Math.sin(time/59)*.45*wave);
  rounded(-3.8,-5,7.6,10,3.6,'#e5915e','#9e5331');
  circle(3.1,1.8,1.65,'#e5915e');ctx.restore();
 }
 ctx.restore();
}
let headlightsOn=false;
let honkedAt=-Infinity;

function cabBounds(){
 const b=board();
 const height=game.level.h*b.s;
 const bottom=b.y+height+17;
 return {
  right:b.x+game.level.w*b.s+12,
  bottom,
  top:bottom-Math.max(112,Math.min(165,height+26)),
  hood:bottom-45,
 };
}

function toggleHeadlights(){
 headlightsOn=!headlightsOn;
 notify(headlightsOn?'Headlights on':'Headlights off');
}

function honk(){
 const now=performance.now();
 if(now-honkedAt<300)return;
 honkedAt=now;
 notify('Honk!');
 sound.play('horn');
}

function tapCab(event:PointerEvent){
 if(game.complete)return;
 const {right,top,hood,bottom}=cabBounds();
 const {x,y}=point(event);
 const now=performance.now(),cabX=x-right-driveOffset(now),cabY=y-truckBodyOffset(now);
 if(cabX<0||cabX>stage.cab+10||cabY<top||cabY>bottom)return;
 if(cabY<hood&&cabX<stage.cab*.78)honk();
 else if(cabY>=hood)toggleHeadlights();
}
function drawTruckDust(time:number){
 if(reducedMotion||lowEndDevice)return;
 const start=game.complete?completedAt+truckDepartureDelayMs+240:arrivedAt+120;
 const duration=game.complete?truckDepartureMs-260:truckArrivalMs-130;
 if(time<=start||time>start+duration+490)return;
 const ground=cabBounds().bottom+35,rear=board().x-11;
 for(let delay=0;delay<duration;delay+=90){
  const age=time-start-delay,life=490,t=age/life;
  if(t<=0||t>=1)continue;
  const x=rear+driveOffset(start+delay)-t*38,y=ground-t*16;
  ctx.save();ctx.globalAlpha=sparkleAlpha(age,life)*(1-t)*.58;
  circle(x,y,3+t*9,'#dfd2aa');circle(x+7,y-2,2+t*6,'#f3e5b8');ctx.restore();
 }
}
function truck(time:number,offset:number,rise:number){
 const colors=palette(),b=board(),w=game.level.w*b.s,h=game.level.h*b.s,cab=stage.cab;
 const {bottom,right,top,hood}=cabBounds();
 ctx.save();ctx.shadowColor='#3d59424a';ctx.shadowBlur=lowEndDevice?4:12;ctx.beginPath();ctx.ellipse(b.x+(w+cab)/2,bottom+37,(w+cab+25)/2,10,0,0,Math.PI*2);ctx.fillStyle='#657b5e44';ctx.fill();ctx.restore();
 ctx.save();ctx.translate(0,rise);
 if(headlightsOn){
  const lampX=right+cab+4,lampY=hood+18;
  const glow=ctx.createLinearGradient(lampX,lampY,lampX+120,lampY);
  glow.addColorStop(0,'#fff3a9b8');glow.addColorStop(1,'#fff3a900');
  ctx.beginPath();ctx.moveTo(lampX,lampY-4);ctx.lineTo(lampX+120,lampY-23);
  ctx.lineTo(lampX+120,lampY+24);ctx.lineTo(lampX,lampY+4);ctx.closePath();
  ctx.fillStyle=glow;ctx.fill();
 }
 // Painted panels and dark inner trim frame the lighter cargo floor.
 const enamel=ctx.createLinearGradient(0,b.y-18,0,bottom+10);
 enamel.addColorStop(0,colors.roof);
 enamel.addColorStop(.24,colors.frame);
 enamel.addColorStop(1,'#315b4c');
 rounded(b.x-16,b.y-18,w+32,h+44,13,enamel,'#243f36');
 rounded(b.x-11,b.y-13,w+22,5,2,'#fff8d38c');
 rounded(b.x-8,b.y-7,w+16,h+14,6,'#3e5949');
 rounded(b.x-5,b.y-4,w+10,h+8,4,'#a59371');
 for(let y=0;y<game.level.h;y++)for(let x=0;x<game.level.w;x++){
  const tileX=b.x+x*b.s,tileY=b.y+y*b.s,isDarker=(x+y)%2;
  const tile=ctx.createLinearGradient(0,tileY,0,tileY+b.s);
  tile.addColorStop(0,isDarker?'#ece1c6':'#f8efd8');
  tile.addColorStop(1,isDarker?'#ddd0b1':'#eee1c3');
  rounded(tileX+1,tileY+1,b.s-2,b.s-2,2,tile);
  line(tileX+3,tileY+2,tileX+b.s-4,tileY+2,'#fffaf093');
 }
 line(b.x-10,b.y+h+13,b.x+w+10,b.y+h+13,'#f3dca1',2);
 drawFixedCargo();
 for(let x=b.x;x<b.x+w;x+=45)circle(x,b.y-12,2,'#d2e4b9');
 rounded(b.x-20,bottom-1,w+cab+33,14,4,'#346955','#255140');
 const brake=reducedMotion?0:game.complete?sparkleAlpha(time-completedAt-795,300):
  sparkleAlpha(time-arrivedAt-truckArrivalMs+255,325);
 ctx.save();
 if(brake>0){ctx.shadowBlur=4+brake*11;ctx.shadowColor='#ff704c';}
 rounded(b.x-22,bottom-18,9,15,3,brake>.22?'#ff7757':'#c06d4e','#85533e');
 if(brake>.22)rounded(b.x-20,bottom-16,5,3,1,'#ffe1ae');
 ctx.restore();
 // A taller cab keeps the courier visible beside short and tall loads.
 const cabPaint=ctx.createLinearGradient(right,top,right+cab,bottom);
 cabPaint.addColorStop(0,colors.roof);
 cabPaint.addColorStop(.36,colors.cab);
 cabPaint.addColorStop(1,colors.frame);
 ctx.beginPath();
 ctx.moveTo(right,bottom);ctx.lineTo(right,top+13);
 ctx.quadraticCurveTo(right,top,right+14,top);
 ctx.lineTo(right+cab*.54,top);
 ctx.quadraticCurveTo(right+cab*.72,top,right+cab*.76,top+17);
 ctx.lineTo(right+cab*.88,hood);
 ctx.quadraticCurveTo(right+cab+7,hood+4,right+cab+7,hood+20);
 ctx.lineTo(right+cab+7,bottom);ctx.closePath();
 ctx.fillStyle=cabPaint;ctx.fill();ctx.strokeStyle='#28473e';ctx.lineWidth=3;ctx.stroke();
 const glass=ctx.createLinearGradient(0,top,0,hood);
 glass.addColorStop(0,'#d8e9df');glass.addColorStop(1,'#79b3aa');
 ctx.beginPath();
 ctx.moveTo(right+9,top+17);
 ctx.quadraticCurveTo(right+9,top+9,right+16,top+9);
 ctx.lineTo(right+cab*.53,top+9);
 ctx.quadraticCurveTo(right+cab*.64,top+9,right+cab*.67,top+19);
 ctx.lineTo(right+cab*.78,hood-3);ctx.lineTo(right+9,hood-3);
 ctx.closePath();
 ctx.fillStyle=glass;ctx.fill();
 ctx.strokeStyle='#2a5048';ctx.lineWidth=3;ctx.stroke();
 ctx.save();ctx.clip();
 const driverScale=Math.min(cab/96,(hood-top-12)/56,1.2);
 drawDriver(right+cab*.41,hood-29*driverScale,driverScale,time);
 ctx.restore();
 line(right+13,top+14,right+cab*.49,top+14,'#fff8dfb0',2);
 rounded(right+11,hood+4,cab*.57,33,5,'#f4dcaa','#8d7049');
 rounded(right+15,hood+9,12,4,2,'#8c714b');
 // A simple parcel emblem on the door.
 const badgeX=right+cab*.42;
 rounded(badgeX-8,hood+16,17,14,3,'#c38a56','#946132');
 line(badgeX,hood+17,badgeX,hood+29,'#f4d194',3);
 rounded(right+cab-3,hood+11,11,14,4,headlightsOn?'#ffffdf':'#ffe8a8','#b18d59');
 rounded(right+cab-2,bottom-5,17,9,3,'#b5c2a5','#456e56');
 const honkAge=(time-honkedAt)/480;
 if(honkAge>=0&&honkAge<1&&!reducedMotion){
  ctx.save();ctx.globalAlpha=1-honkAge;
  for(let i=0;i<3;i++){
   const startX=right+cab*.69+honkAge*11,startY=top+7+(i-1)*7;
   line(startX,startY,startX+8,startY+(i-1)*4,'#fff1b8',2.5);
  }
  ctx.restore();
 }
 ctx.restore();
 // Solid wheels and rotating cream hub spokes.
 const spinning=offset/25;
 for(const x of [b.x+42,right+cab*.57]){circle(x,bottom+16,25,'#2f4841','#263e36',3);circle(x,bottom+16,20,'#40514a','#192d28',1.5);circle(x,bottom+16,15,'#9aa589','#516956',2);ctx.save();ctx.translate(x,bottom+16);ctx.rotate(spinning);for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);line(4,0,12,0,'#dbe3bc',3);}circle(0,0,5,'#dce5c1');ctx.restore();}
}
function render(time:number){
 if(!playing||adOpen)return;
 if(frameInterval&&time-lastRenderedAt<frameInterval){requestGameFrame();return;}
 lastRenderedAt=time;
 ctx.clearRect(0,0,W,H);hits=[];const l=game.level,b=board(),n=l.parcels.length;
 const offset=driveOffset(time),rise=truckBodyOffset(time);
 if(game.complete&&!deliveryDone){
  const deliveryAge=time-completedAt;
  if(!stampPlayed&&deliveryAge>350){stampPlayed=true;sound.play('stamp');}
  if(!departedSound&&deliveryAge>truckDepartureDelayMs){departedSound=true;sound.play('drive');}
  if(offset>=W+20&&!['help-dialog','levels-dialog','world-map-dialog','album-dialog','achievements-dialog','settings-dialog'].some(id=>($(id) as HTMLDialogElement).open)){
   deliveryDone=true;
   update();
  }
 }
 scenery(time);
 drawTruckDust(time);
 ctx.save();ctx.translate(offset,0);truck(time,offset,rise);ctx.translate(0,rise);
 if(guidedTarget&&guide==='drag'&&!drag){const q=guidedTarget;parcel(q.id,cells(q.id,q.p.r),{x:b.x+q.p.x*b.s,y:b.y+q.p.y*b.s,s:b.s},{ghost:true,ok:true});}
 if(drag?.moved&&intersectsVan()){const p=preview(),ok=valid(l,game.state,drag.id,p);parcel(drag.id,cells(drag.id,p.r),{x:b.x+p.x*b.s,y:b.y+p.y*b.s,s:b.s},{ghost:true,ok});}
 game.state.forEach((p,id)=>{if(!p||drag?.id===id&&drag.moved||motion?.id===id)return;const rect=target(id),shape=cells(id,p.r);drawParcel(id,shape,rect,time);if(!game.complete)hits.push({id,...rect,cells:shape});});
 rowWaves=rowWaves.filter(w=>time-w.start<750);
 for(const wave of rowWaves){const t=(time-wave.start)/750;if(t<0)continue;ctx.save();ctx.globalAlpha=reducedMotion?0:(1-t)*.22;rounded(b.x,b.y+wave.row*b.s,l.w*b.s,b.s,2,'#fff3b3');ctx.globalAlpha=reducedMotion?0:(1-t)*.6;line(b.x,b.y+(wave.row+.5)*b.s,b.x+l.w*b.s*Math.min(1,t*2),b.y+(wave.row+.5)*b.s,'#fff5b9',2);ctx.restore();}
 drawLandingRings(time);
 if(cursor&&!game.complete){
  const [x,y]=cursor;
  if(selected>=0){
   const p=placementAt(x,y),ok=valid(l,game.state,selected,p);
   parcel(selected,cells(selected,p.r),{x:b.x+p.x*b.s,y:b.y+p.y*b.s,s:b.s},{ghost:true,ok});
  }
  ctx.save();ctx.strokeStyle='#fff2ae';ctx.lineWidth=3;ctx.strokeRect(b.x+x*b.s+2,b.y+y*b.s+2,b.s-4,b.s-4);ctx.restore();
 }
 // The last snapping parcel travels with the truck too.
 if(motion&&game.state[motion.id]&&motion.kind==='snap')drawMotion(time);
 drawShutter(time);
 ctx.restore();
 const bay=stage.bay;
 
 rounded(bay.x,bay.y+3,bay.w,bay.h,16,'#5f54322b');
 rounded(bay.x,bay.y,bay.w,bay.h,16,'#c9b790','#9d8961');
 rounded(bay.x+4,bay.y+4,bay.w-8,bay.h-8,12,'#eae0c7');
 for(let id=0;id<n;id++){
 const slot=stage.slots[id],cx=slot.x+slot.w/2;
 rounded(slot.x,slot.y,slot.w,slot.h,10,id===selected?'#fcf3d8':'#e4dbc1',id===selected?'#94632d':'#d9cdb1');
 if(game.state[id]){text('✓',cx,slot.y+slot.h*.5+uiFont(6),uiFont(19),'#627c57','center',true);continue;}
 const rect=tray(id),shape=cells(id,id===selected?rotation:0);if(!(drag?.id===id&&drag.moved)&&motion?.id!==id)drawParcel(id,shape,rect,time);if(!game.complete)hits.push({id,...rect,cells:shape});
 }
 drawTutorial(time);
 if(motion&&!(game.state[motion.id]&&motion.kind==='snap'))drawMotion(time);
 if(drag?.moved){
  parcel(drag.id,cells(drag.id,drag.r),floating(),{lifted:true,selected:true,
   scale:reducedMotion?1:1+.06*Math.min(1,(time-drag.liftAt)/150),angle:reducedMotion?0:drag.tilt});
 }
 if(sparks&&!reducedMotion&&!lowEndDevice){const t=(time-sparks.start)/500;if(t>=0&&t<1){for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.save();ctx.globalAlpha=1-t;circle(sparks.x+Math.cos(a)*(12+t*45)+offset,sparks.y+Math.sin(a)*(12+t*45),3*(1-t),'#e9ba55');ctx.restore();}}else sparks=null;}
 drawDelight(time,offset);
 if(!feedbackPersistent&&time>feedbackUntil)$('feedback').classList.remove('show');
 requestGameFrame();
}
function requestGameFrame(){
 if(!playing||adOpen||gameFrameQueued)return;
 gameFrameQueued=true;
 requestAnimationFrame(time=>{gameFrameQueued=false;render(time);});
}
function drawMotion(time:number){
 if(!motion)return;const m=motion,elapsed=time-m.start,pose=landingPose(elapsed,reducedMotion),t=reducedMotion?1:Math.min(1,elapsed/landingDurationMs),ease=m.kind==='snap'?pose.progress:1-Math.pow(1-t,3);
 const r={x:m.from.x+(m.to.x-m.from.x)*ease,y:m.from.y+(m.to.y-m.from.y)*ease-(m.kind==='snap'?pose.lift:0),s:m.from.s+(m.to.s-m.from.s)*ease};
 if(m.kind==='reject'&&!reducedMotion)r.x+=Math.sin(t*5*Math.PI)*7*(1-t);
 parcel(m.id,cells(m.id,m.r),r,{scaleX:m.kind==='snap'?pose.scaleX:1,scaleY:m.kind==='snap'?pose.scaleY:1});if(m.kind==='snap'?pose.done:t>=1)motion=null;
}
function drawLandingRings(time:number){
 landingRings=landingRings.filter(r=>time-r.start<600);if(reducedMotion||lowEndDevice)return;
 for(const ring of landingRings){const p=game.state[ring.id],age=time-ring.start;if(age<0||!p||p.x!==ring.p.x||p.y!==ring.p.y||p.r!==ring.p.r)continue;
 const b=board(),shape=cells(ring.id,p.r),occupied=new Set(shape.map(c=>c.join(','))),alpha=sparkleAlpha(age,600);
 ctx.save();ctx.globalAlpha=alpha*.85;ctx.strokeStyle='#fff2ae';ctx.lineWidth=3;ctx.shadowColor='#f5d978';ctx.shadowBlur=6;
 for(const [x,y]of shape){const px=b.x+(p.x+x)*b.s+2,py=b.y+(p.y+y)*b.s+2,s=b.s-4;
 for(const [dx,dy,ax,ay,bx,by]of [[0,-1,0,0,1,0],[1,0,1,0,1,1],[0,1,0,1,1,1],[-1,0,0,0,0,1]])if(!occupied.has(`${x+dx},${y+dy}`)){ctx.beginPath();ctx.moveTo(px+ax*s,py+ay*s);ctx.lineTo(px+bx*s,py+by*s);ctx.stroke();}}
 ctx.restore();}
}
function drawShutter(time:number){
 if(!game.complete||reducedMotion)return;
 const age=time-completedAt,t=Math.max(0,Math.min(1,(age-610)/390));
 if(t<=0)return;
 const b=board(),w=game.level.w*b.s,h=game.level.h*b.s,drop=h*t*t*(3-2*t),colors=palette();
 ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,w,drop);ctx.clip();
 const paint=ctx.createLinearGradient(0,b.y,0,b.y+h);
 paint.addColorStop(0,colors.roof);paint.addColorStop(.25,colors.frame);paint.addColorStop(1,'#305c4e');
 rounded(b.x,b.y,w,h,3,paint);
 for(let y=b.y+10;y<b.y+h;y+=13){
  line(b.x+3,y,b.x+w-3,y,'#21423755',2);line(b.x+3,y+2,b.x+w-3,y+2,'#fff5d741');
 }
 const emblem=Math.min(h*.36,w*.26,62),midX=b.x+w/2,midY=b.y+h*.47;
 circle(midX,midY,emblem*.69,'#f2e3b9','#415a48',3);
 rounded(midX-emblem*.37,midY-emblem*.32,emblem*.74,emblem*.64,4,'#c68f56','#855b38');
 line(midX,midY-emblem*.31,midX,midY+emblem*.29,'#fae2a7',Math.max(2,emblem*.13));
 ctx.restore();
 const lip=b.y+drop;
 line(b.x+1,lip-1,b.x+w-1,lip-1,'#264c3d',Math.min(4,drop));
 if(drop>=9)rounded(midX-17,lip-8,34,5,2,'#e6d9a6','#6f7456');
}
function drawParcel(id:number,shape:Cell[],r:Rect,time:number){let angle=0,scale=1;if(spin?.id===id){const t=reducedMotion?1:Math.min(1,(time-spin.start)/220);angle=-(1-t)*Math.PI/2;scale=1+Math.sin(t*Math.PI)*.04;if(t===1)spin=null;}parcel(id,shape,r,{selected:id===selected,angle,scale});}
function notify(message:string,kind:'normal'|'error'|'success'='normal',persistent=false){$('feedback').textContent=message;$('feedback').className=`feedback show ${kind}`;feedbackUntil=performance.now()+2600;feedbackPersistent=persistent;}
function resetAttempt(){activeAttempt=emptyAttempt();bonusHints=0;rewardedHintUsed=false;attempts[game.index]=structuredClone(activeAttempt);lastRunStars=0;newBest=false;}
function persist(){packings[game.index]=structuredClone(game.state);attempts[game.index]=structuredClone(activeAttempt);writeProgress({version:saveVersion,index:game.index,state:game.state,completed,guide,packings,legacyPostcards,hintedAttempts,hintFreeClears,bestStars,attempts});}
function finishGuide(){guide='done';guideKey='';update();}
function openDialog(id:string){drag=null;const dialog=$(id) as HTMLDialogElement;if(!dialog.open)dialog.showModal();}
function closeDialog(id:string){($(id) as HTMLDialogElement).close();}
function levelThumbnail(index:number){
 const level=levels[index];
 const fixed=new Set(level.blocked.map(([x,y])=>`${x},${y}`));
 const slots=Array.from({length:level.h},(_,y)=>Array.from({length:level.w},(_,x)=>{
  const color=fixed.has(`${x},${y}`)?'#687366':'#cfbb92';
  return `<rect x="${x*8+1}" y="${y*8+1}" width="7" height="7" rx="1.4" fill="${color}"/>`;
 }).join('')).join('');
 return `<svg class="level-thumbnail" aria-hidden="true" viewBox="0 0 ${level.w*8+1} ${level.h*8+1}">${slots}</svg>`;
}
const levelsPerPostcard=6;
function postcardMilestone(index:number){return (index+1)*levelsPerPostcard;}
function earnedPostcards(){
 const firstPending=firstUnsolved(completed);
 const levelsCleared=firstPending===undefined?levels.length:deliveryNumber(firstPending)-1;
 return routes.map((_,index)=>levelsCleared>=postcardMilestone(index)||legacyPostcards[index]===true);
}

const postcardLandmarks:Record<string,string>={
 depot:'<path d="M11 38L34 19L58 38Z" fill="#ad7767"/><path d="M15 38H54V64H15Z" fill="#efe0bb"/><path d="M26 45H37V64H26Z" fill="#87a088"/>',
 garden:'<path d="M10 62V38L34 20L58 38V62Z" fill="#abc390" stroke="#648368" stroke-width="2"/><path d="M10 39H58M23 63V29M45 63V29" stroke="#f0e7bb" stroke-width="2"/>',
 harbor:'<path d="M76 51H126L115 62H87Z" fill="#739faa"/><path d="M100 17V49H124Z" fill="#faf1d6"/>',
 sunset:'<path d="M7 58L29 35H65L83 58H7Z" fill="#b57860"/><path d="M25 59V45H64V59Z" fill="#856656"/>',
 alpine:'<path d="M3 66L43 12L86 67Z M69 67L102 22L143 67Z" fill="#8faeb0"/><path d="M31 29L43 12L57 31L45 26Z" fill="#fff6df"/>',
 night:'<path d="M89 64V43A22 22 0 0 1 133 43V64Z" fill="#7e8ba5"/><path d="M108 64V47H116V64Z" fill="#f4cf90"/><circle cx="126" cy="18" r="2" fill="#fff5d8"/>',
 orchard:'<path d="M22 46V67M52 46V67" stroke="#8a6651" stroke-width="4"/><circle cx="22" cy="37" r="15" fill="#be8152"/><circle cx="52" cy="43" r="13" fill="#b48757"/><path d="M14 39h5m11-6h4m13 13h5m5-9h4" stroke="#9f4d39" stroke-width="4" stroke-linecap="round"/>',
 canal:'<path d="M0 63Q70 35 150 57V70H0Z" fill="#a8c8c8"/><path d="M80 54H129L119 62H91Z" fill="#738d77"/><path d="M98 40H116V54H98Z" fill="#f9e3ac"/>',
 lighthouse:'<path d="M102 65L107 24H119L126 65Z" fill="#f9dea8"/><path d="M105 40H121L124 51H104Z" fill="#b36d57"/><path d="M104 16H122V25H104Z" fill="#6c667c"/><path d="M102 16L113 7L125 16Z" fill="#7b6278"/><path d="M121 19L147 11V32L121 23Z" fill="#f6e7b28c"/>',
 aurora:'<path d="M0 55Q35 19 70 47T150 35V76H0Z" fill="#6d9c9e"/><path d="M8 28Q34 5 60 25T116 19" fill="none" stroke="#d5f3cb" stroke-width="5" opacity=".75"/><path d="M96 63V39L113 27L132 40V63Z" fill="#8fc6b6"/><path d="M106 47H114V63H106Z" fill="#496b80"/>',
};
function postcardArt(index:number){
 const route=routes[index],night=route.theme==='night'||route.theme==='lighthouse'||route.theme==='aurora';
 return `<svg viewBox="0 0 150 76" aria-hidden="true"><rect width="150" height="76" fill="${route.sky}"/><circle cx="116" cy="17" r="11" fill="${night?'#fff0c5':'#f3cd90'}"/><path d="M0 55Q44 26 79 56Q116 34 150 51V76H0Z" fill="${route.hill}"/>${postcardLandmarks[route.theme]}<path d="M0 65H150V76H0Z" fill="${route.grass}"/><rect x="46" y="43" width="39" height="22" rx="3" fill="${route.frame}"/><path d="M85 50H96L103 58V65H85Z" fill="${route.cab}"/><rect x="49" y="47" width="30" height="13" rx="1" fill="#efdfb4"/><circle cx="55" cy="66" r="5" fill="#465b50"/><circle cx="94" cy="66" r="5" fill="#465b50"/></svg>`;
}
function openAlbum(){
 const earned=earnedPostcards();
 const next=earned.indexOf(false);
 const goal=$('next-postcard');
 goal.hidden=next<0;
 goal.innerHTML=next<0?'':`${postcardArt(next)}<div><small>Next postcard</small><strong>Finish Level ${postcardMilestone(next)}</strong></div>`;
 $('postcards').innerHTML=routes.flatMap((route,index)=>earned[index]?
  [`<figure class="postcard delivered">
   ${postcardArt(index)}
   <figcaption class="postcard-title">${route.name}</figcaption>
  </figure>`]:[]).join('');
 openDialog('album-dialog');
}

function achievementMedal(achievement:AchievementStatus){
 return `<span class="achievement-medal ${achievement.color}" aria-hidden="true">${achievement.symbol}</span>`;
}

function openAchievements(opener:HTMLElement){
 achievementsOpener=opener;
 const achievements=achievementProgress(completed,hintFreeClears);
 const earned=achievements.filter(achievement=>achievement.earned).length;
 $('achievements-summary').textContent=`${earned} of ${achievements.length} earned`;
 const meter=$('achievements-meter') as HTMLProgressElement;
 meter.max=achievements.length;
 meter.value=earned;
 $('achievement-list').innerHTML=achievements.map(achievement=>`<li class="achievement-tile${achievement.earned?' earned':''}">
  ${achievementMedal(achievement)}
  <div><strong>${achievement.title}</strong><p>${achievement.requirement}</p>
   <small class="achievement-status">${achievement.earned?'✓ Earned':`${achievement.progress} / ${achievement.goal}`}</small>
  </div>
 </li>`).join('');
 $('achievements-dialog').scrollTop=0;
 openDialog('achievements-dialog');
}

function renderFinishRating(){
 const rating=Math.max(0,Math.min(3,lastRunStars||bestStars[game.index]||0)) as StarRating;
 const stars=$('finish-stars');
 stars.innerHTML=Array.from({length:3},(_,index)=>`<span${index<rating?' class="earned"':''}></span>`).join('');
 stars.setAttribute('aria-label',`${rating} of 3 stars`);
 const summary=$('finish-performance');
 summary.hidden=!game.complete;
 if(!game.complete)return;
 const best=bestStars[game.index]||rating;
 const bestLabel=newBest?' · New best!':best>rating?` · Best ${best}/3`:'';
 const hintLabel=activeAttempt.hints?` · ${activeAttempt.hints} hint${activeAttempt.hints===1?'':'s'}`:'';
 summary.textContent=`${rating}/3 stars · ${actionCount(activeAttempt)} actions${hintLabel}${bestLabel}`;
}

function showNewAchievements(){
 const award=$('finish-achievements');
 award.hidden=!newAchievements.length;
 if(award.hidden)return;
 const names=newAchievements.map(achievement=>achievement.title).join(' · ');
 award.innerHTML=`${achievementMedal(newAchievements[0])}<span><small>${newAchievements.length>1?'Achievements earned':'Achievement earned'}</small><strong>${names}</strong></span>`;
}
function pickerLevel(index:number){
 const current=index===game.index,finished=completed[index],locked=!canPlayLevel(index,completed);
 const available=!locked&&!finished&&!current;
 const status=locked?'Locked':finished?'Complete':current?'Current level':'Ready to play';
 return {current,finished,locked,status,classes:`${current?' current':''}${finished?' completed':''}${locked?' locked':''}${available?' available':''}`};
}

function deliveryCard(index:number){
 const level=levels[index];
 const {current,finished,locked,status,classes}=pickerLevel(index);
 const rating=Math.max(0,Math.min(3,bestStars[index]||0)) as StarRating;
 const ratingMarkup=finished&&rating?`<span class="level-stars" aria-label="${rating} of 3 stars">${starText(rating)}</span>`:'';
 return `<button class="level-choice${classes}" data-level="${index}" ${locked?'disabled':''} ${current?'aria-current="true"':''}>
   <span class="level-card-art">
    <b>${deliveryNumber(index)}</b>
    ${levelThumbnail(index)}
    <span class="level-check"><span aria-hidden="true">${locked?'🔒':finished?'✓':current?'●':'▶'}</span><span class="sr-only">${status}</span></span>
   </span>
   <strong>${level.name}</strong>
   <small>${pickerRoute<0?`${level.chapter} · `:''}${difficultyOf(index)}</small>
   ${ratingMarkup}
  </button>`;
}

function drawLevelPicker(){
 ($('route-filter') as HTMLSelectElement).value=pickerRoute<0?'':String(pickerRoute);
 ($('difficulty-filter') as HTMLSelectElement).value=pickerDifficulty;
 const entries=difficultyOrder.filter(index=>
  (pickerRoute<0||levels[index].chapter===routes[pickerRoute].name)&&
  (!pickerDifficulty||difficultyOf(index)===pickerDifficulty));
 const done=entries.filter(index=>completed[index]).length;
 $('route-summary').textContent=`${done} / ${entries.length} complete`;
 const list=$('level-list');
 list.innerHTML=entries.length?entries.map(deliveryCard).join(''):'<p class="level-empty">No levels match these filters.</p>';
 list.scrollTop=0;
}

function openLevels(){
 pickerRoute=-1;pickerDifficulty='';
 drawLevelPicker();
 openDialog('levels-dialog');
}

function homeDestination(){
 return game.complete?firstUnsolved(completed)??difficultyOrder[0]:game.index;
}

function updateHome(){
 const index=homeDestination();
 const packing=packings[index];
 $('home-play-title').textContent=packing.some(Boolean)&&!packing.every(Boolean)?'Resume':'Play';
 $('home-level-label').textContent=`Level ${deliveryNumber(index)}`;
}

function showHome(){
 playing=false;adOpen=false;adTransitioning=false;drag=null;cursor=null;motion=null;spin=null;
 closeDialog('finish');
 gameElement.hidden=true;
 homeElement.hidden=false;
 updateHome();
 $('home-play').focus({preventScroll:true});
}

function beginGame(index:number,replay=false){
 if(!canPlayLevel(index,completed))return;
 playing=true;adOpen=false;
 gameElement.hidden=false;
 homeElement.hidden=true;
 if(index!==game.index||replay&&game.complete)switchLevel(index,replay);
 else{update();entrance();}
 if(!game.complete)canvas.focus({preventScroll:true});
 requestGameFrame();
}

function switchLevel(index:number,replay=false){
 if(!canPlayLevel(index,completed))return;
 unlockedLevel=undefined;newPostcard=null;cursor=null;persist();
 game.index=index;activeAttempt=structuredClone(attempts[index]??emptyAttempt());bonusHints=0;rewardedHintUsed=false;lastRunStars=0;newBest=false;
 game.state=structuredClone(packings[index]);game.history=[];
 if(replay&&game.complete){game.restart();resetAttempt();hintedAttempts[index]=false;}
 drag=null;motion=null;spin=null;selected=-1;rotation=0;assessedState='';guideKey='';
 newAchievements=[];showNewAchievements();
 lastComplete=game.complete;deliveryDone=game.complete;completedAt=game.complete?performance.now()-3000:0;update();entrance();
}

const worldMapDialog=$('world-map-dialog') as HTMLDialogElement;
const worldMap=new WorldMap($('world-map-sheet'),ordinal=>{
 const level=difficultyOrder[ordinal];
 if(level!==undefined)void travelTo(level,$('home-map'));
},reducedMotion);
let mapOpener:HTMLElement|null=null;
let pendingTrip:number|null=null;

function showWorldMap(opener:HTMLElement,destination:number,driving=false){
 mapOpener=opener;
 const number=deliveryNumber(destination);
 const completedCount=completed.filter(Boolean).length;
 $('world-map-title').textContent=driving?`Driving to Level ${number}`:'Delivery map';
 $('world-map-status').textContent=driving?levels[destination].name:`Current Level ${number} · ${levels[destination].name}`;
 $('world-map-progress-label').textContent=`${completedCount} / ${levels.length} deliveries complete`;
 $('world-map-progress-fill').style.width=`${completedCount/levels.length*100}%`;
 $('map-skip').hidden=!driving;
 $('map-recenter').hidden=driving;
 openDialog('world-map-dialog');
 worldMap.show({
  current:deliveryNumber(driving?game.index:destination)-1,
  destination:number-1,
  stops:difficultyOrder.map(index=>({name:levels[index].name,completed:completed[index],locked:!canPlayLevel(index,completed),stars:bestStars[index]||0})),
 });
 if(driving)$('map-skip').focus({preventScroll:true});
}

async function travelTo(index:number,opener:HTMLElement){
 if(pendingTrip!==null||!canPlayLevel(index,completed))return;
 if(!reducedMotion&&index!==game.index){
  pendingTrip=index;
  showWorldMap(opener,index,true);
  const result=await worldMap.drive(deliveryNumber(game.index)-1,deliveryNumber(index)-1);
  if(pendingTrip!==index)return;
  pendingTrip=null;
  if(result==='cancelled')return;
 }
 closeDialog('world-map-dialog');
 beginGame(index,true);
}
function update(){
 resize();const done=game.state.filter(Boolean).length,total=game.state.length,complete=game.complete;
 if(complete&&!lastComplete){
  const previousAchievements=achievementProgress(completed,hintFreeClears);
  const previousPostcards=earnedPostcards();
  const wasNext=firstUnsolved(completed)===game.index;
  guide='done';
  lastRunStars=starsFor(game.level,activeAttempt);
  const previousBest=bestStars[game.index]||0;
  newBest=lastRunStars>previousBest;
  bestStars[game.index]=Math.max(previousBest,lastRunStars);
  completed[game.index]=true;
  if(!hintedAttempts[game.index])hintFreeClears[game.index]=true;
  newAchievements=achievementProgress(completed,hintFreeClears).filter((achievement,index)=>achievement.earned&&!previousAchievements[index].earned);
  showNewAchievements();
  unlockedLevel=wasNext?firstUnsolved(completed):undefined;
  const earned=earnedPostcards().findIndex((value,index)=>value&&!previousPostcards[index]);
  newPostcard=earned<0?null:earned;stampPlayed=false;completedAt=performance.now();deliveryDone=false;departedSound=false;sound.play('complete');
  const b=board();burst(b.x+game.level.w*b.s/2,b.y+game.level.h*b.s*.4,36,true,landingImpactMs);
 }
 if(!complete&&lastComplete){unlockedLevel=undefined;newPostcard=null;newAchievements=[];showNewAchievements();completedAt=0;deliveryDone=false;feedbackPersistent=false;$('feedback').classList.remove('show');}lastComplete=complete;
 const key=game.index+JSON.stringify(game.state);if(key!==assessedState){assessedState=key;deadEnd=!complete&&!solve(game.level,game.state);}
 gameElement.classList.toggle('complete',complete);gameElement.classList.toggle('has-selection',selected>=0);
 $('levelnum').textContent=`Level ${deliveryNumber(game.index)}`;
 $('levelnum').title=game.level.name;
 gameElement.setAttribute('data-route',game.level.theme);
 $('count').textContent=`${done} / ${total} loaded`;
 $('meter-fill').style.width=`${done/total*100}%`;$('meter').setAttribute('aria-valuenow',String(Math.round(done/total*100)));
 if(previousCount!==done){for(const id of ['count','meter']){$(id).classList.remove('pulse');void $(id).offsetWidth;$(id).classList.add('pulse');}previousCount=done;}
 refreshGuide();
 const instruction=$('instruction');
 const firstTurn=game.index===30&&selected===0&&!game.state[0]&&rotation%2===0;
 const teaching=guide!=='done'&&!complete&&!deadEnd;
 const rotateGuideMessage=selected>=0?`Try Rotate to turn Box ${String.fromCharCode(65+selected)}.`:'Select a parcel, then try Rotate.';
 const message=deadEnd?'Try Undo or Hint.':!complete&&firstTurn?'Rotate the long parcel.':
  teaching?(guide==='rotate'?rotateGuideMessage:
   guidedTarget?'Move the highlighted parcel into the truck.':'Rotate the parcel to fit.'):'';
 $('message').textContent=message;
 instruction.hidden=!message;
 $('guide-dismiss').hidden=!teaching;
 $('rotate').classList.toggle('teach',!complete&&(firstTurn||teaching&&((guide==='rotate'&&selected>=0)||(!guidedTarget&&selected>=0&&!game.state[selected]))));
 $('selection').textContent=selected<0?'':`Box ${String.fromCharCode(65+selected)}`;
 const freeHints=freeHintsFor(game.level);
 const rewardUsed=rewardedHintUsed||activeAttempt.hints>freeHints;
 const availableBonus=rewardUsed?1:bonusHints;
 const hintsLeft=Math.max(0,freeHints+availableBonus-activeAttempt.hints);
 const canWatchReward=ads.canReward&&!rewardUsed&&shouldOfferRewardedHint(game.level,activeAttempt);
 $('hint-label').textContent=hintsLeft?`Hint ${hintsLeft}`:canWatchReward?'Watch ad · +1':'No hints';
 const hintButton=$('hint-button') as HTMLButtonElement;
 hintButton.title=hintsLeft?`${hintsLeft} hint${hintsLeft===1?'':'s'} left for this delivery`:canWatchReward?'Watch a short ad for one bonus hint':'No hints left for this delivery';
 hintButton.setAttribute('aria-label',hintButton.title);
 for(const [id,disabled]of [['rotate',selected<0||complete],['return',selected<0||!game.state[selected]||complete],['hint-button',complete||(hintsLeft===0&&!canWatchReward)],['undo',!game.history.length],['continue',!complete||!deliveryDone]] as const)($(id) as HTMLButtonElement).disabled=disabled;
 $('finish-postcard').innerHTML=newPostcard===null?'':postcardArt(newPostcard);
 $('finish-postcard').hidden=newPostcard===null;
 const finishRating=lastRunStars||bestStars[game.index]||0;
 const allComplete=completed.every(Boolean);
 $('finish-kicker').textContent=allComplete?'FLEET COMPLETE':`LEVEL ${deliveryNumber(game.index)} COMPLETE`;
 $('finish-title').textContent=allComplete?'All deliveries complete!':finishRating===3?'Perfect fit!':finishRating===2?'Nicely packed!':'Delivery complete!';
 $('finish-message').textContent=newPostcard!==null?`Postcard earned · ${routes[newPostcard].name}` :'';if(unlockedLevel!==undefined){
  const unlocked=`Level ${deliveryNumber(unlockedLevel)} unlocked!`;
  $('finish-message').textContent=[ $('finish-message').textContent, unlocked ].filter(Boolean).join(' ');
 }
 $('finish-message').hidden=newPostcard===null&&unlockedLevel===undefined;
 $('continue').textContent=completed.every(Boolean)?'Keep packing →':'Next delivery →';
 renderFinishRating();
 const finish=$('finish') as HTMLDialogElement;
 if(playing&&complete&&deliveryDone&&!finish.open)finish.showModal();
 if((!playing||!complete||!deliveryDone)&&finish.open)finish.close();
 persist();
}
function point(e:PointerEvent){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
function select(id:number){
 // Let an immediate input bring the loading bay into reach during the opening animation.
 arrivedAt=Math.min(arrivedAt,performance.now()-truckArrivalMs);
 if(selected!==id){rotation=game.state[id]?.r??0;selected=id;}else rotation=game.state[id]?.r??rotation;
 spin=null;update();
}
function animate(id:number,from:Rect,kind:Motion['kind']){motion={id,from,to:target(id),start:performance.now(),r:game.state[id]?.r??(id===selected?rotation:0),kind};}
function place(id:number,p:Exclude<Placement,null>,from:Rect){
 const before=packedRows();
 if(game.set(id,p)){
 activeAttempt.placements++;
 if(guide==='drag'){guide='rotate';guideKey='';}rotation=p.r;animate(id,from,'snap');loadedPulse=performance.now();const b=board(),shape=bounds(cells(id,p.r));
 sparks={x:b.x+(p.x+.5)*b.s,y:b.y+(p.y+.5)*b.s,start:loadedPulse+landingImpactMs};burst(b.x+(p.x+shape.w/2)*b.s,b.y+(p.y+shape.h/2)*b.s,9,false,landingImpactMs);landingRings.push({id,p:{...p},start:loadedPulse+landingImpactMs});
 const newRows=packedRows().filter(row=>!before.includes(row));rowWaves.push(...newRows.map(row=>({row,start:loadedPulse+landingImpactMs})));
 sound.play('snap',game.state.filter(Boolean).length-1);if(newRows.length)sound.play('row');update();
 if(deadEnd)notify('That fits, but blocks the rest. Try rearranging or ✦ Hint.','error');
 return true;
 }
 activeAttempt.invalidDrops++;
 sound.play('reject');animate(id,from,'reject');notify('That spot is blocked or outside the truck. Try the green squares.','error');return false;
}
function placementAt(x:number,y:number):Exclude<Placement,null>{
 const guidePlacement=guidedTarget?.id===selected?guidedTarget.p:null;
 if(guidePlacement&&cells(selected,guidePlacement.r).some(([dx,dy])=>x===dx+guidePlacement.x&&y===dy+guidePlacement.y))return guidePlacement;
 const [anchorX,anchorY]=cells(selected,rotation)[0];
 return {x:x-anchorX,y:y-anchorY,r:rotation};
}
canvas.addEventListener('blur',()=>{cursor=null;});

canvas.addEventListener('pointerdown',e=>{
 if(drag||game.complete)return;cursor=null;const p=point(e),b=board();if(game.level.blocked.some(([x,y])=>p.x>=b.x+x*b.s&&p.x<b.x+(x+1)*b.s&&p.y>=b.y+y*b.s&&p.y<b.y+(y+1)*b.s)){notify('Bolted cargo stays here. Pack your boxes around it.');return;}
 let hit=[...hits].reverse().find(h=>h.cells.some(([x,y])=>p.x>=h.x+x*h.s&&p.x<h.x+(x+1)*h.s&&p.y>=h.y+y*h.s&&p.y<h.y+(y+1)*h.s));
 if(!hit){const id=stage.slots.findIndex(slot=>p.x>=slot.x&&p.x<slot.x+slot.w&&p.y>=slot.y&&p.y<slot.y+slot.h);if(id>=0&&!game.state[id]){const rect=tray(id);hit={id,...rect,cells:cells(id,id===selected?rotation:0)};}}
 if(!hit){
  const x=Math.floor((p.x-b.x)/b.s),y=Math.floor((p.y-b.y)/b.s);
  if(selected>=0&&x>=0&&x<game.level.w&&y>=0&&y<game.level.h)place(selected,placementAt(x,y),target(selected));
  return;
 }
 e.preventDefault();motion=null;sound.play('pick');select(hit.id);
 const size=bounds(hit.cells),ox=Math.max(.5,Math.min(size.w-.5,Math.floor((p.x-hit.x)/hit.s)+.5)),oy=Math.max(.5,Math.min(size.h-.5,Math.floor((p.y-hit.y)/hit.s)+.5));
 drag={id:hit.id,...p,startX:p.x,startY:p.y,touch:e.pointerType==='touch',r:rotation,ox,oy,moved:false,pointer:e.pointerId,tilt:0,liftAt:performance.now()};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.pointer!==e.pointerId)return;const p=point(e);if(Math.hypot(p.x-drag.startX,p.y-drag.startY)>uiFont(7)&&!drag.moved){drag.moved=true;drag.liftAt=performance.now();}drag.tilt=Math.max(-.1,Math.min(.1,(p.x-drag.x)*.002));Object.assign(drag,p);});
canvas.addEventListener('pointerup',e=>{
 if(!drag){tapCab(e);return;}
 if(drag.pointer!==e.pointerId)return;
 Object.assign(drag,point(e));const d=drag;
 if(!d.moved){drag=null;update();return;}
 const from=floating(),p=preview();
 if(d.x>=stage.bay.x&&d.x<=stage.bay.x+stage.bay.w&&d.y>=stage.bay.y&&d.y<=stage.bay.y+stage.bay.h&&(!intersectsVan()||!valid(game.level,game.state,d.id,p))){
 if(game.state[d.id]){if(game.set(d.id,null)){activeAttempt.returns++;rotation=d.r;animate(d.id,from,'return');notify('Parcel returned to the tray.');}}else animate(d.id,from,'return');
 }else{const placed=place(d.id,p,from);if(placed&&d.touch&&!reducedMotion&&typeof navigator!=='undefined')navigator.vibrate?.(game.complete?[10,25,15]:8);}
 drag=null;update();
});
canvas.addEventListener('pointercancel',()=>{drag=null;update();});
function turn(){
 if(selected<0||game.complete)return;const r=((drag?.r??game.state[selected]?.r??rotation)+1)%4;
 activeAttempt.rotations++;
 if(drag){drag.r=r;rotation=r;notify('Turned 90°. Find a green spot.');}
 else if(game.state[selected]){const p=game.state[selected]!;if(!game.set(selected,{...p,r})){notify('No room to turn here. Use TRAY first.','error');return;}rotation=r;}
 else rotation=r;
 if(guide==='rotate'){guide='done';guideKey='';}sound.play('turn');spin={id:selected,start:performance.now()};update();
}
function entrance(){arrivedAt=performance.now();lastRenderedAt=-Infinity;particles=[];rowWaves=[];landingRings=[];sparks=null;loadedPulse=0;departedSound=false;stampPlayed=false;}
$('rotate').onclick=turn;
function useHint(label='Hint'){
 const before=game.state.map((_,id)=>target(id));
 const hint=help(game);
 if(!hint){notify('No useful hint is available yet. Try Undo or rearrange a parcel.','error');return false;}
 activeAttempt.hints++;
 hintedAttempts[game.index]=true;
 guide='done';guideKey='';selected=hint.placed;rotation=game.state[selected]!.r;animate(selected,before[selected],'snap');update();
 notify(hint.returned?`${label}: made room, returned ${hint.returned} box${hint.returned>1?'es':''}, and placed a parcel. Undo restores your layout.`:`${label}: a parcel is in a good spot.`);
 return true;
}
$('hint-button').onclick=()=>{
 drag=null;motion=null;spin=null;
 const freeLimit=freeHintsFor(game.level),rewardUsed=rewardedHintUsed||activeAttempt.hints>freeLimit;
 const hintLimit=freeLimit+(rewardUsed?1:bonusHints);
 if(activeAttempt.hints<hintLimit){useHint();return;}
 if(rewardUsed||!ads.canReward){notify('No hints left for this delivery. Solve the remaining boxes yourself.','error');return;}
 ads.showRewarded(()=>{
  rewardedHintUsed=true;bonusHints=1;
  useHint('Bonus hint');
 });
};
 $('return').onclick=()=>{if(selected>=0&&game.state[selected]){const from=target(selected);if(game.set(selected,null)){activeAttempt.returns++;animate(selected,from,'return');notify('Parcel returned to the tray.');}}drag=null;update();};
$('undo').onclick=()=>{
 drag=null;motion=null;rowWaves=[];landingRings=[];particles=[];sparks=null;
 const hadHistory=game.history.length>0;game.undo();
 if(hadHistory)activeAttempt.undos++;
 if(assistedResets.has(game.state))hintedAttempts[game.index]=true;
 if(selected>=0)rotation=game.state[selected]?.r??rotation;
 update();notify('Last move undone.');
};
$('restart').onclick=()=>{
 drag=null;motion=null;spin=null;selected=-1;rotation=0;
 const hadPacking=game.state.some(Boolean);
 const usedHint=hintedAttempts[game.index];
 if(game.complete){
  // Replay starts a new attempt. Keeping the completed board in undo history
  // would let Undo trigger a false completion with empty performance stats.
  game.restart();resetAttempt();hintedAttempts[game.index]=false;
 }else if(hadPacking||usedHint){
  activeAttempt.restarts++;
  const before=structuredClone(game.state);
  game.restart();
  if(hadPacking){
   if(usedHint)assistedResets.add(before);
   game.history.push(before);
  }
  // A restart does not erase hint use from the current attempt.
 }
 cursor=null;update();entrance();notify('Fresh truck. Undo restores your packing.');
};
function nextLevel(){
 if(!deliveryDone)return;
 const next=firstUnsolved(completed);
 if(next===undefined)void travelTo(nextDelivery(game.index),$('continue'));
 else void travelTo(next,$('continue'));
}
let adTransitioning=false;
function continueFromFinish(){
 if(adTransitioning||!deliveryDone)return;
 adTransitioning=true;($('continue') as HTMLButtonElement).disabled=true;
 const continueGame=()=>{adTransitioning=false;nextLevel();};
 ads.showNext(continueGame,{firstClear:unlockedLevel!==undefined,allComplete:completed.every(Boolean),completedCount:completed.filter(Boolean).length});
}
$('continue').onclick=continueFromFinish;$('replay').onclick=()=>$('restart').click();
$('game-home').onclick=showHome;$('finish-home').onclick=showHome;
function handleBoardKey(e:KeyboardEvent){
 const key=e.key.toLowerCase();
 if(!game.complete&&!e.repeat&&(key==='h'||key==='l')){
  e.preventDefault();
  if(key==='h')honk();else toggleHeadlights();
  return;
 }
 if(game.complete||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key)&&!/^[1-6]$/.test(e.key))return;
 e.preventDefault();
 if(/^[1-6]$/.test(e.key)){
  const id=Number(e.key)-1;
  if(id>=game.state.length)return;
  select(id);
  const placed=game.state[id],first=cells(id,rotation)[0];
  cursor=placed?[placed.x+first[0],placed.y+first[1]]:[first[0],first[1]];
  return;
 }
 if(!cursor)cursor=[0,0];
 if(e.key==='Enter'||e.key===' '){
  if(selected>=0)place(selected,placementAt(...cursor),target(selected));
  else notify('Press a number key to pick a box first.');
  return;
 }
 const x=cursor[0]+Number(e.key==='ArrowRight')-Number(e.key==='ArrowLeft');
 const y=cursor[1]+Number(e.key==='ArrowDown')-Number(e.key==='ArrowUp');
 cursor=[Math.min(game.level.w-1,Math.max(0,x)),Math.min(game.level.h-1,Math.max(0,y))];
}
canvas.addEventListener('keydown',handleBoardKey);
window.addEventListener('keydown',e=>{
 if(!playing||['finish','help-dialog','levels-dialog','world-map-dialog','album-dialog','achievements-dialog','settings-dialog'].some(id=>($(id) as HTMLDialogElement).open))return;
 if(e.key.toLowerCase()==='r'&&!e.repeat)turn();
 if(e.key==='Escape'){drag=null;cursor=null;update();}
});
function resize(){
 const rect=canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;cssWidth=rect.width;
 const next=fitStage(rect.width,rect.height,game.level);const changed=W!==next.w||Math.abs(H-next.h)>.5;stage=next;W=stage.w;H=stage.h;
 if(changed){drag=null;motion=null;}const dpr=Math.min(devicePixelRatio||1,lowEndDevice?1.25:2);
 const pixelsWide=Math.round(rect.width*dpr),pixelsHigh=Math.round(rect.height*dpr);if(canvas.width!==pixelsWide||canvas.height!==pixelsHigh){canvas.width=pixelsWide;canvas.height=pixelsHigh;}ctx.setTransform(pixelsWide/W,0,0,pixelsHigh/H,0,0);
}
$('help-button').onclick=()=>openDialog('help-dialog');$('help-close').onclick=()=>closeDialog('help-dialog');
$('show-guide').onclick=()=>{
 closeDialog('help-dialog');beginGame(homeDestination(),true);
 guide='drag';guideKey='';selected=-1;rotation=0;arrivedAt=performance.now()-1000;update();
};
$('guide-dismiss').onclick=finishGuide;
$('route-filter').innerHTML='<option value="">All routes</option>'+routes.map((route,i)=>`<option value="${i}">${route.name}</option>`).join('');
$('route-filter').addEventListener('change',()=>{
 const value=($('route-filter') as HTMLSelectElement).value;pickerRoute=value===''?-1:Number(value);drawLevelPicker();
});
$('difficulty-filter').innerHTML='<option value="">All difficulties</option>'+difficultyBands.map(band=>`<option value="${band}">${band}</option>`).join('');
$('difficulty-filter').addEventListener('change',()=>{
 pickerDifficulty=($('difficulty-filter') as HTMLSelectElement).value;
 drawLevelPicker();
});
$('open-album').onclick=openAlbum;$('album-close').onclick=()=>closeDialog('album-dialog');
$('open-achievements').onclick=()=>openAchievements($('open-achievements'));
const achievementDialog=$('achievements-dialog');
$('achievements-close').onclick=()=>closeDialog('achievements-dialog');
achievementDialog.addEventListener('click',event=>{if(event.target===achievementDialog)closeDialog('achievements-dialog');});
achievementDialog.addEventListener('close',()=>achievementsOpener?.focus());
$('home-play').onclick=()=>{
 const index=homeDestination();
 if(game.complete&&firstUnsolved(completed)!==undefined)void travelTo(index,$('home-play'));
 else beginGame(index,game.complete);
};
$('home-map').onclick=()=>showWorldMap($('home-map'),homeDestination());
$('map-close').onclick=()=>closeDialog('world-map-dialog');
$('map-skip').onclick=()=>worldMap.skipTrip();
$('map-recenter').onclick=()=>worldMap.focusTruck();
worldMapDialog.addEventListener('click',e=>{if(e.target===worldMapDialog)worldMapDialog.close();});
worldMapDialog.addEventListener('close',()=>{
 if(worldMapDialog.open)return;
 pendingTrip=null;worldMap.cancelTrip();
 mapOpener?.focus({preventScroll:true});
});
const openSettings=installSettings(sound);
$('home-settings').onclick=()=>openSettings($('home-settings'));
$('home-levels').onclick=openLevels;$('levels-close').onclick=()=>closeDialog('levels-dialog');
$('level-list').addEventListener('click',e=>{
 const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-level]');
 const index=Number(button?.dataset.level);
 if(!canPlayLevel(index,completed))return;
 closeDialog('levels-dialog');void travelTo(index,$('home-levels'));
});
for(const [id,opener] of [['help-dialog','help-button'],['levels-dialog','home-levels'],['album-dialog','open-album']]){
 $(id).addEventListener('click',e=>{if(e.target===$(id))closeDialog(id);});
 $(id).addEventListener('close',()=>$(opener).focus());
}
$('finish').addEventListener('cancel',event=>event.preventDefault());
canvas.addEventListener('lostpointercapture',()=>{drag=null;});
window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{resize();guideKey='';refreshGuide();}).observe(document.querySelector('.canvaswrap')!);
update();updateHome();
