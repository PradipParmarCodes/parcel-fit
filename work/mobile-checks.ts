import assert from 'node:assert/strict';
import {fitStage} from '../src/layout';
import {decodeProgress,readProgress,saveVersion,writeProgress,type Progress} from '../src/progress';
import {Game,levels} from '../src/engine';
import {difficultyOrder,firstUnsolved} from '../src/difficulty';
import {achievementProgress} from '../src/achievements';
const sizes=[[300,180],[260,180],[300,220],[300,308],[370,520],[410,620],[824,220],[650,210],[1058,520],[748,700]];
let checked=0;
for(const [width,height]of sizes)for(const level of levels){
 const s=fitStage(width,height,level),b=s.board;
 assert(b.x>=0&&b.y>=0);assert(b.s>0);
 assert(b.x+level.w*b.s+s.cab+24<=s.w,'Truck must remain horizontally inside the play area');
 assert(s.road+24<=s.h,`Wheels and road must fit ${width}x${height} ${level.name}: ${s.road+24}>${s.h}`);
 for(const slot of s.slots){
  assert(slot.x>=0&&slot.y>=0&&slot.w>0&&slot.h>0);
  assert(slot.x+slot.w<=s.w+.01&&slot.y+slot.h<=s.h+.01,'Every parcel slot must be visible');
  assert(slot.w*width/s.w>=44&&slot.h*height/s.h>=44,'Whole parcel slots remain large touch targets');
  const overlaps=slot.x<b.x+level.w*b.s+s.cab+22&&slot.x+slot.w>b.x-22&&slot.y<b.y+level.h*b.s+56&&slot.y+slot.h>b.y-20;
  assert(!overlaps,'The tray must never cover the truck');
 }
 for(let a=0;a<s.slots.length;a++)for(let b=a+1;b<s.slots.length;b++){const x=s.slots[a],y=s.slots[b];assert(!(x.x<y.x+y.w&&x.x+x.w>y.x&&x.y<y.y+y.h&&x.y+x.h>y.y),'Parcel slots must not overlap');}
 checked++;
}
const g=new Game();g.set(0,g.level.solution[0]);
const progress:Progress={version:saveVersion,index:0,state:g.state,completed:levels.map(()=>false),guide:'rotate',packings:levels.map(l=>l.parcels.map(()=>null))};
const json=JSON.stringify(progress);const decoded=decodeProgress(json);assert(decoded);assert.deepEqual(decoded.state,g.state);assert.equal(decoded.guide,'rotate');
// Both released save formats expand without discarding old packing state or route stamps.
for(const oldCount of [5,15,30]){
 const active=oldCount-2,legacyPackings=levels.slice(0,oldCount).map(l=>l.parcels.map(()=>null) as typeof g.state);
 legacyPackings[0]=structuredClone(g.state);legacyPackings[active]=structuredClone(levels[active].solution);
 const completed=Array.from({length:oldCount},(_,i)=>i%3===0||i===active);
 const legacy=decodeProgress(JSON.stringify({...progress,version:1,index:active,state:legacyPackings[active],completed,packings:legacyPackings}));
 assert(legacy,`A ${oldCount}-level save must still load`);assert.equal(legacy.index,active);assert.deepEqual(legacy.state,levels[active].solution);assert.equal(legacy.packings.length,levels.length);assert.deepEqual(legacy.packings[0],g.state);assert.deepEqual(legacy.completed.slice(0,oldCount),completed);assert(legacy.completed.slice(oldCount).every(v=>v===false));
 legacy.packings.slice(oldCount).forEach((state,i)=>{assert.equal(state.length,levels[i+oldCount].parcels.length);assert(state.every(p=>p===null));});
}

// Revised levels keep their completion and unlocks, but cannot load old coordinates into new shapes.
const cleared=difficultyOrder[3],revised=difficultyOrder[4];
const oldPackings=structuredClone(progress.packings);
oldPackings[0]=g.state;
oldPackings[cleared]=[{x:0,y:0,r:1},{x:0,y:1,r:0},{x:2,y:1,r:3}];
const oldCompleted=levels.map((_,index)=>difficultyOrder.slice(0,4).some(level=>level===index));
const oldState=[{x:0,y:0,r:1},null,null,null];
const legacyPostcards=[true,false];
const revisedSave=decodeProgress(JSON.stringify({
 ...progress,version:1,index:revised,state:oldState,packings:oldPackings,completed:oldCompleted,legacyPostcards,
}));
assert(revisedSave);
assert.equal(revisedSave.index,revised);
assert.equal(firstUnsolved(revisedSave.completed),revised);
assert.deepEqual(revisedSave.completed,oldCompleted);
assert.deepEqual(revisedSave.legacyPostcards,legacyPostcards);
assert.deepEqual(revisedSave.packings[0],g.state);
assert.deepEqual(revisedSave.packings[cleared],levels[cleared].solution);
assert.deepEqual(revisedSave.state,levels[revised].parcels.map(()=>null));
const currentState=revisedSave.state.map((_,index)=>index===0?levels[revised].solution[0]:null);
assert.deepEqual(decodeProgress(JSON.stringify({...revisedSave,state:currentState}))?.state,currentState);

assert(revisedSave.hintedAttempts?.[0],'Old placements have no verified hint history');
assert(!revisedSave.hintedAttempts?.[revised],'The new empty layout starts a fresh attempt');
assert(revisedSave.hintFreeClears?.every(value=>!value));
const hintSave=decodeProgress(JSON.stringify({
 ...revisedSave,hintedAttempts:levels.map((_,index)=>index===revised),hintFreeClears:levels.map((_,index)=>index===cleared||index===revised),
}));
assert(hintSave?.hintedAttempts?.[revised]);
assert(hintSave?.hintFreeClears?.[cleared]);
assert(!hintSave?.hintFreeClears?.[revised],'An unfinished delivery cannot count as a hint-free clear');
const retroactive=achievementProgress(oldCompleted,[]);
assert(retroactive.find(item=>item.title==='First Delivery')?.earned);
assert(retroactive.find(item=>item.title==='Wheels Rolling')?.earned);
assert.equal(retroactive.find(item=>item.title==='Independent Courier')?.progress,0);
const allCleared=levels.map(()=>true);
assert(achievementProgress(allCleared,allCleared).every(item=>item.earned));

for(const raw of [null,'','null','[]','{bad','{}',JSON.stringify({...progress,index:levels.length}),JSON.stringify({...progress,state:[{x:-1,y:0,r:0},null,null,null]}),JSON.stringify({...progress,state:[{x:0,y:0,r:8},null,null,null]}),JSON.stringify({...progress,state:[g.state[0],g.state[0],null,null]})])assert.equal(decodeProgress(raw),null);
const store=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)}});writeProgress(progress);assert.deepEqual(readProgress()?.state,g.state);
Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Storage denied');}});assert.equal(readProgress(),null);assert.doesNotThrow(()=>writeProgress(progress));
console.log(`PASS ${checked} fitted layouts: portrait, short phones, landscape, tablets, all sixty levels, visible nonoverlapping 44px tray targets`);
console.log('PASS progress: legacy and revised-puzzle migration, completion and postcards preserved, round trip, invalid saves rejected, storage-disabled fallback');
