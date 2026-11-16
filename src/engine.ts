import {levelSpecs,type LevelSpec} from './levels';
import {deliveryNumber,difficultyOrder} from './difficulty';

export type Cell=[number,number];
export type Placement={x:number;y:number;r:number}|null;
export type Parcel={cells:Cell[];color:string};
export type Level={name:string;w:number;h:number;parcels:Parcel[];solution:Exclude<Placement,null>[];blocked:Cell[];description:string;theme:LevelSpec['theme'];chapter:string};
const colors=['#c99460','#d9b77d','#b88663','#c7ae78','#d29c7c','#b8aa7a'];

export function rotate(cells:Cell[],r:number):Cell[]{
 let out=cells.map(c=>[...c] as Cell);
 for(let i=0;i<((r%4)+4)%4;i++){
  out=out.map(([x,y])=>[-y,x]);
  const mx=Math.min(...out.map(c=>c[0])),my=Math.min(...out.map(c=>c[1]));
  out=out.map(([x,y])=>[x-mx,y-my]);
 }
 return out;
}

// Each letter is one connected parcel in the stored solution; # is fixed cargo.
function makeLevel(spec:LevelSpec):Level{
 const {name,rows,turns}=spec,w=rows[0]?.length??0,h=rows.length;
 if(!w||!h||rows.some(row=>row.length!==w||!/^[A-F#]+$/.test(row)))throw new Error(`Invalid level map: ${name}`);
 const ids=[...new Set(rows.join(''))].filter(id=>id!=='#');
 if(!ids.length||ids.length>6)throw new Error(`Invalid parcel count: ${name}`);
 const parcels:Parcel[]=[],solution:Exclude<Placement,null>[]=[],blocked:Cell[]=[];
 rows.forEach((row,y)=>[...row].forEach((c,x)=>{if(c==='#')blocked.push([x,y]);}));
 ids.forEach((id,i)=>{
  const global:Cell[]=[];rows.forEach((row,y)=>[...row].forEach((c,x)=>{if(c===id)global.push([x,y]);}));
  const occupied=new Set(global.map(c=>c.join(','))),visited=new Set<string>();
  const pending:Cell[]=[global[0]];
  while(pending.length){const [x,y]=pending.pop()!,key=`${x},${y}`;if(visited.has(key)||!occupied.has(key))continue;visited.add(key);pending.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);}
  if(visited.size!==global.length)throw new Error(`Disconnected parcel ${id}: ${name}`);
  const x=Math.min(...global.map(c=>c[0])),y=Math.min(...global.map(c=>c[1])),r=turns[i]??0;
  if(!Number.isInteger(r)||r<0||r>3)throw new Error(`Invalid tray orientation: ${name}`);
  const local:Cell[]=global.map(([cx,cy])=>[cx-x,cy-y]);
  parcels.push({cells:rotate(local,r),color:colors[i%colors.length]});solution.push({x,y,r:(4-r)%4});
 });
 return {name,w,h,parcels,solution,blocked,description:spec.description,theme:spec.theme,chapter:spec.chapter};
}
export const levels=levelSpecs.map(makeLevel);

function isPlacement(p:Exclude<Placement,null>):boolean{return !!p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&Number.isInteger(p.r)&&p.r>=0&&p.r<4;}
export function valid(l:Level,state:Placement[],id:number,p:Exclude<Placement,null>):boolean{
 if(!Number.isInteger(id)||id<0||id>=l.parcels.length||!isPlacement(p))return false;
 const occupied=new Set(l.blocked.map(c=>c.join(',')));
 state.forEach((q,i)=>{if(q&&i!==id&&l.parcels[i])rotate(l.parcels[i].cells,q.r).forEach(([x,y])=>occupied.add(`${x+q.x},${y+q.y}`));});
 return rotate(l.parcels[id].cells,p.r).every(([x,y])=>x+p.x>=0&&y+p.y>=0&&x+p.x<l.w&&y+p.y<l.h&&!occupied.has(`${x+p.x},${y+p.y}`));
}
export class Game{
 index=0;state:Placement[]=[];history:Placement[][]=[];
 constructor(){this.restart();}
 get level(){return levels[this.index];}
 get complete(){return this.state.length===this.level.parcels.length&&this.state.every(Boolean);}
 restart(){this.state=this.level.parcels.map(()=>null);this.history=[];}
 set(id:number,p:Placement){if(id<0||id>=this.state.length||!Number.isInteger(id)||p&&!valid(this.level,this.state,id,p))return false;this.history.push(structuredClone(this.state));this.state[id]=p;return true;}
 undo(){const previous=this.history.pop();if(previous)this.state=previous;}
 next(){const next=difficultyOrder[deliveryNumber(this.index)];if(this.complete&&next!==undefined){this.index=next;this.restart();return true;}return false;}
}

type Option={id:number;p:Exclude<Placement,null>;mask:bigint};
type SearchData={full:bigint;blocked:bigint;bits:bigint[];byCell:Option[][];canonicalMasks:bigint[];answers:Map<string,Placement[]|null>};
const searchCache=new WeakMap<Level,SearchData>();
function placementMask(l:Level,id:number,p:Exclude<Placement,null>):bigint{return rotate(l.parcels[id].cells,p.r).reduce((m,[x,y])=>m|(1n<<BigInt((y+p.y)*l.w+x+p.x)),0n);}
function searchData(l:Level):SearchData{
 const cached=searchCache.get(l);if(cached)return cached;
 const bits=Array.from({length:l.w*l.h},(_,i)=>1n<<BigInt(i));
 const blocked=l.blocked.reduce((m,[x,y])=>m|bits[y*l.w+x],0n),byCell:Option[][]=bits.map(()=>[]);
 l.parcels.forEach((parcel,id)=>{
  const seen=new Set<string>();
  for(let r=0;r<4;r++){
   const shape=rotate(parcel.cells,r),key=shape.map(c=>c.join(',')).sort().join(';');if(seen.has(key))continue;seen.add(key);
   const w=Math.max(...shape.map(c=>c[0]))+1,h=Math.max(...shape.map(c=>c[1]))+1;
   for(let y=0;y<=l.h-h;y++)for(let x=0;x<=l.w-w;x++){
    const p={x,y,r},mask=placementMask(l,id,p);if(mask&blocked)continue;
    const option={id,p,mask};for(let cell=0;cell<bits.length;cell++)if(mask&bits[cell])byCell[cell].push(option);
   }
  }
 });
 const data={full:(1n<<BigInt(bits.length))-1n,blocked,bits,byCell,canonicalMasks:l.solution.map((p,id)=>placementMask(l,id,p)),answers:new Map<string,Placement[]|null>()};
 searchCache.set(l,data);return data;
}

/** Complete this packing exactly, preserving every placed parcel. No search timeout can mislabel a solvable packing. */
export function solve(l:Level,state:Placement[]):Placement[]|null{
 if(state.length!==l.parcels.length)return null;
 const data=searchData(l),result=structuredClone(state);
 let used=data.blocked,remaining=0,canonical=true;
 for(let id=0;id<state.length;id++){
  const p=state[id];if(!p){remaining|=1<<id;continue;}
  if(!valid(l,state,id,p))return null;
  const mask=placementMask(l,id,p);if(mask&used)return null;used|=mask;if(mask!==data.canonicalMasks[id])canonical=false;
 }
 if(canonical)return result.map((p,id)=>p??{...l.solution[id]});
 const rootKey=`${used}:${remaining}`;
 if(data.answers.has(rootKey)){const saved=data.answers.get(rootKey);return saved?result.map((p,id)=>p??(saved[id]?{...saved[id]!}:null)):null;}
 const failed=new Set<string>();
 function search(occupied:bigint,left:number):boolean{
  if(!left)return occupied===data.full;
  const key=`${occupied}:${left}`;if(failed.has(key))return false;
  let choices:Option[]|null=null;
  // Choose the empty cell with the fewest possible pieces (exact-cover MRV).
  for(let cell=0;cell<data.bits.length;cell++){
   if(occupied&data.bits[cell])continue;
   const options=data.byCell[cell].filter(option=>(left&(1<<option.id))&&!(occupied&option.mask));
   if(!options.length){failed.add(key);return false;}
   if(!choices||options.length<choices.length)choices=options;if(choices.length===1)break;
  }
  for(const option of choices??[]){result[option.id]=option.p;if(search(occupied|option.mask,left&~(1<<option.id)))return true;result[option.id]=null;}
  failed.add(key);return false;
 }
 const answer=search(used,remaining)?result:null;
 // Keep the cache bounded. Cached answers only supply unplaced parcels so fixed pieces never move.
 if(data.answers.size>=512)data.answers.clear();data.answers.set(rootKey,answer?structuredClone(answer):null);
 return answer?structuredClone(answer):null;
}

/** One undoable hint: preserve the maximum number of loaded parcels, then load one parcel. */
export function help(game:Game):{returned:number;placed:number}|null{
 if(game.complete)return null;
 const original=structuredClone(game.state),placedIds=original.map((p,id)=>p?id:-1).filter(id=>id>=0);
 let base=structuredClone(original),solution=solve(game.level,base),returned=0;
 if(!solution){
  outer:for(let count=1;count<=placedIds.length;count++)for(let bits=1;bits<(1<<placedIds.length);bits++){
   let bitCount=0;for(let n=bits;n;n&=n-1)bitCount++;if(bitCount!==count)continue;
   const candidate=structuredClone(original);placedIds.forEach((id,i)=>{if(bits&(1<<i))candidate[id]=null;});
   const answer=solve(game.level,candidate);if(answer){base=candidate;solution=answer;returned=count;break outer;}
  }
 }
 if(!solution)return null;
 const id=base.findIndex(p=>!p);if(id<0)return null;
 base[id]=solution[id];game.history.push(original);game.state=base;
 return {returned,placed:id};
}
