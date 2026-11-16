import assert from 'node:assert/strict';
import {Game,levels,valid,rotate,solve,help,type Cell,type Level,type Placement} from '../src/engine';
import {levelSpecs} from '../src/levels';
import {difficultyOrder,deliveryNumber,nextDelivery,difficultyOf,firstUnsolved,canPlayLevel} from '../src/difficulty';
import {routes} from '../src/routes';

assert.equal(levels.length,60);
assert.equal(new Set(difficultyOrder).size,levels.length);
assert.deepEqual([...difficultyOrder].sort((a,b)=>a-b),levels.map((_,index)=>index));
assert.equal(difficultyOrder[0],0);
assert.equal(levels[difficultyOrder[1]].name,'Turn the long box');
assert.equal(difficultyOf(difficultyOrder[0]),'Warm-up');
assert.equal(difficultyOf(difficultyOrder.at(-1)!),'Expert');
assert.equal(nextDelivery(difficultyOrder[5]),difficultyOrder[6]);
assert.equal(nextDelivery(difficultyOrder.at(-1)!),difficultyOrder[0]);
const started = levels.map((_,index)=>index===difficultyOrder[1]);
assert.equal(firstUnsolved(started),difficultyOrder[0]);
assert(!canPlayLevel(difficultyOrder[1],started));
assert(!canPlayLevel(difficultyOrder[2],started));
started[difficultyOrder[0]]=true;
assert(canPlayLevel(difficultyOrder[1],started));
assert(canPlayLevel(difficultyOrder[2],started));
const toKey=([x,y]:Cell)=>`${x},${y}`;
const normalizedShape=(shape:Cell[])=>Array.from({length:4},(_,r)=>rotate(shape,r).map(toKey).sort().join(';')).sort()[0];
const puzzleKeys=new Set<string>();
// Saved placements use parcel IDs and tray orientations, so keep the released fifteen exact.
const legacySpecs=[
 {rows:['AABB','CCDD'],turns:[1,0,1,0]},
 {rows:['AABB','ACCB','DDCC'],turns:[1,2,1,0]},
 {rows:['AAABB','ACCBB','DDCEE','DDCEE'],turns:[1,1,2,0,1]},
 {rows:['AABBB','ACCCB','ADCEE','DDDEE'],turns:[1,2,1,1,0]},
 {rows:['AAABBC','DAEBCC','DDEECC','DFFFFF'],turns:[1,1,2,1,3,1]},
 {rows:['AAABBCC','A#BBBCC','DDDEEFF'],turns:[2,1,1,3,1,1]},
 {rows:['AABBB','AAB#C','DDBCC','DEECC','DEEFF'],turns:[0,1,2,1,3,1]},
 {rows:['AA#BBB','ACCBBD','AC#EED','FFFFED'],turns:[1,3,1,1,2,1]},
 {rows:['AAABB','A#ABB','CCDDE','CCDEE'],turns:[1,1,0,2,3]},
 {rows:['AABBCC','AAB#CC','DDBBEC','D#BEEE','DDFFFF'],turns:[1,3,1,2,1,1]},
 {rows:['AAA#BBB','ACCDBBB','ACDDDEE','FFFF#EE'],turns:[1,1,3,2,1,1]},
 {rows:['AABBCC','DAABCC','DDBBEC','DD#EEE'],turns:[1,1,2,3,1]},
 {rows:['AAABB','AC#BB','ACDDB','ECDFF','EE#FF'],turns:[3,1,1,2,3,1]},
 {rows:['AA#BBB','AACCBB','DDCCEB','DF#EEE','DFFFFE'],turns:[0,2,1,1,3,1]},
 {rows:['AABBBB','AACDDB','ECCCDD','EECFFD','EEEFFF'],turns:[1,1,2,3,1,2]},
];
const legacyRows=legacySpecs.map(spec=>spec.rows);
levelSpecs.slice(0,legacySpecs.length).forEach((spec,index)=>{assert.deepEqual(spec.rows,legacySpecs[index].rows,`Legacy level ${index+1} map changed`);assert.deepEqual(spec.turns,legacySpecs[index].turns,`Legacy level ${index+1} tray orientations changed`);});
const timings:number[]=[];
function timedSolve(l:Level,state:Placement[]){const start=performance.now(),answer=solve(l,state);timings.push(performance.now()-start);if(answer){assert(answer.every(Boolean));answer.forEach((p,id)=>assert(p&&valid(l,answer,id,p),'Solver must return a valid complete arrangement'));}return answer;}
function assertConnected(cells:Cell[],label:string){
 const all=new Set(cells.map(toKey));assert.equal(all.size,cells.length,`${label} repeats a cell`);
 const reached=new Set<string>(),pending=[cells[0]];
 while(pending.length){const cell=pending.pop()!,key=toKey(cell);if(!all.has(key)||reached.has(key))continue;reached.add(key);const [x,y]=cell;pending.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
 assert.equal(reached.size,all.size,`${label} must be connected`);
}
function puzzleKey(l:Level){
 const shapes=l.parcels.map(p=>normalizedShape(p.cells)).sort().join('|');
 let w=l.w,h=l.h,blocked=l.blocked.map(c=>[...c] as Cell);const boards=[];
 for(let r=0;r<4;r++){boards.push(`${w}x${h}:${blocked.map(toKey).sort().join(';')}`);blocked=blocked.map(([x,y])=>[h-1-y,x]);[w,h]=[h,w];}
 return `${boards.sort()[0]}:${shapes}`;
}
for(const [index,l]of levels.entries()){
 assert(l.name&&l.description&&l.chapter);assert(l.w<=7&&l.h<=5&&l.w*l.h<=30,'Cargo dimensions must remain within the mobile design bounds');assert(routes.some(route=>route.name===l.chapter));
 assert.equal(l.solution.length,l.parcels.length);assert(l.parcels.length>=2&&l.parcels.length<=6);
 const blockedCells=new Set(l.blocked.map(toKey));assert.equal(blockedCells.size,l.blocked.length);
 l.blocked.forEach(([x,y])=>assert(x>=0&&x<l.w&&y>=0&&y<l.h));
 l.parcels.forEach((p,id)=>{assertConnected(p.cells,`Level ${index+1} parcel ${id}`);assert(p.cells.length>=2&&p.cells.length<=6,'Parcel size must remain readable in the tray');});
 const challenge=puzzleKey(l);assert(!puzzleKeys.has(challenge),`Level ${index+1} duplicates an existing packing challenge`);puzzleKeys.add(challenge);
 const g=new Game();g.index=index;g.restart();
 for(const [id,p]of l.solution.entries()){assert(valid(l,g.state,id,p),`Level ${index+1} parcel ${id} invalid`);assert(g.set(id,p));}
 assert(g.complete);assert.equal(l.parcels.flatMap(p=>p.cells).length+l.blocked.length,l.w*l.h,'Parcels must cover every usable cargo cell');
 const covered=new Set(blockedCells);g.state.forEach((p,id)=>{assert(p);rotate(l.parcels[id].cells,p.r).forEach(([x,y])=>{const key=toKey([x+p.x,y+p.y]);assert(!covered.has(key));covered.add(key);});});assert.equal(covered.size,l.w*l.h);
 if(index<legacyRows.length){const rows=Array.from({length:l.h},()=>Array(l.w).fill('#'));l.solution.forEach((p,id)=>rotate(l.parcels[id].cells,p.r).forEach(([x,y])=>rows[y+p.y][x+p.x]=String.fromCharCode(65+id)));assert.deepEqual(rows.map(row=>row.join('')),legacyRows[index],'The original fifteen parcel maps must stay compatible with saved games');}
 assert(!valid(l,g.state,0,{x:-1,y:0,r:0}));assert(!valid(l,g.state,0,{x:l.w,y:0,r:0}));
 // Move one real cell over every fixed cargo cell. No parcel may occupy fixed cargo.
 for(const [bx,by]of l.blocked){const [sx,sy]=l.parcels[0].cells[0];assert(!valid(l,l.parcels.map(()=>null),0,{x:bx-sx,y:by-sy,r:0}));}
 g.undo();assert(!g.complete);assert(g.set(l.parcels.length-1,l.solution.at(-1)!));assert(g.complete);
 if(deliveryNumber(index)<levels.length){assert(g.next());assert.equal(g.index,difficultyOrder[deliveryNumber(index)]);assert(g.state.every(p=>p===null));}else assert(!g.next());
 g.index=index;g.restart();assert.equal(g.history.length,0);assert(g.state.every(p=>p===null));
 for(const p of l.parcels)assert.deepEqual(rotate(p.cells,4),p.cells);
 assert(timedSolve(l,g.state),`Empty level ${index+1} must be solvable`);
 let hints=0;while(!g.complete&&hints++<l.parcels.length+1){assert(help(g));assert(timedSolve(l,g.state));}
 assert(g.complete,`Hints must complete level ${index+1}`);
 console.log(`PASS level ${index+1}: unique connected shapes, stored solution, usable-cell coverage, fixed cargo, rotation, undo, restart, completion and hints`);
}
assert.deepEqual(new Set(levels.map(l=>l.chapter)),new Set(routes.map(route=>route.name)));
for(const route of routes)assert(levels.filter(level=>level.chapter===route.name).length>=5);
assert(levels.slice(5).some(l=>l.blocked.length>0),'New routes must introduce fixed cargo');

const g=new Game();assert(g.set(0,{x:0,y:0,r:0}));assert(!g.set(1,{x:0,y:0,r:0}));assert.equal(g.history.length,1);assert(g.set(0,null));g.undo();assert(g.state[0]);
console.log('PASS overlap rejection, rejected-move history, return-to-tray and undo');

// Preserve the first-five-level regression from the original release.
const blocked=new Game();blocked.index=3;blocked.restart();
assert(blocked.set(3,{x:0,y:0,r:0}));assert(blocked.set(2,{x:0,y:2,r:1}));assert(blocked.set(4,{x:3,y:2,r:0}));
assert.equal(timedSolve(blocked.level,blocked.state),null,'Legacy level 4 layout must still be recognized as blocked');
const snapshot=structuredClone(blocked.state),rescued=help(blocked);assert(rescued);assert(rescued.returned>0);assert(timedSolve(blocked.level,blocked.state));
blocked.undo();assert.deepEqual(blocked.state,snapshot);
let steps=0;while(!blocked.complete&&steps++<10){assert(help(blocked));assert(timedSolve(blocked.level,blocked.state));}assert(blocked.complete);
console.log('PASS legacy level 4 dead-end detection, rescue and hint undo');

// Seeded legal placements sample both extendable layouts and dead ends without flaky randomness.
let seed=0x50415243;
const random=(max:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
let samples=0,deadEnds=0,maxHint=0;
for(let index=0;index<levels.length;index++)for(let sample=0;sample<5;sample++){
 const game=new Game();game.index=index;game.restart();const wanted=1+random(Math.min(4,game.state.length));
 for(let placed=0;placed<wanted;placed++){
  const remaining=game.state.map((p,id)=>p?-1:id).filter(id=>id>=0);if(!remaining.length)break;
  const id=remaining[random(remaining.length)],legal:Exclude<Placement,null>[]=[];
  for(let r=0;r<4;r++)for(let y=0;y<game.level.h;y++)for(let x=0;x<game.level.w;x++){const p={x,y,r};if(valid(game.level,game.state,id,p))legal.push(p);}
  if(!legal.length)break;assert(game.set(id,legal[random(legal.length)]));
 }
 const answer=timedSolve(game.level,game.state);samples++;
 if(!answer){
  deadEnds++;const original=structuredClone(game.state),start=performance.now(),hint=help(game);maxHint=Math.max(maxHint,performance.now()-start);
  assert(hint&&hint.returned>0);assert(timedSolve(game.level,game.state));
  // Verify the returned-box count is minimal, not simply a reset of the truck.
  const placed=original.map((p,id)=>p?id:-1).filter(id=>id>=0);
  for(let bits=1;bits<(1<<placed.length);bits++){
   const count=bits.toString(2).replace(/0/g,'').length;if(count>=hint.returned)continue;
   const candidate=structuredClone(original);placed.forEach((id,i)=>{if(bits&(1<<i))candidate[id]=null;});assert.equal(timedSolve(game.level,candidate),null,'A hint must preserve the maximum number of loaded boxes');
  }
  game.undo();assert.deepEqual(game.state,original,'One undo must restore the full pre-hint layout');
 }
}
const slowest=Math.max(...timings);assert(slowest<750,`Solver call took ${slowest.toFixed(1)} ms`);assert(maxHint<1500,`Hint recovery took ${maxHint.toFixed(1)} ms`);
console.log(`PASS ${samples} deterministic partial packings (${deadEnds} dead ends): valid solver results, minimal-removal hints and undo`);
console.log(`Solver timing: ${timings.length} calls, worst ${slowest.toFixed(1)} ms; sampled hint recovery worst ${maxHint.toFixed(1)} ms`);
