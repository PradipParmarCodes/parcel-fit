import {levels,valid,type Level,type Placement} from './engine';
import {levelSpecs} from './levels';
import {emptyAttempt,normalizeAttempt,type AttemptStats} from './stars';
export type Guide='drag'|'rotate'|'done';
export const saveVersion=2;
export type Progress={version:typeof saveVersion;index:number;state:Placement[];completed:boolean[];guide:Guide;packings:Placement[][];legacyPostcards?:boolean[];hintedAttempts?:boolean[];hintFreeClears?:boolean[];bestStars?:number[];attempts?:AttemptStats[]};
export const saveKey='parcel-fit-progress-v1';

function isSavedPlacement(p:Placement):boolean{
  return p===null||!!p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&Number.isInteger(p.r)&&p.r>=0&&p.r<4;
}

function decodePacking(level:Level,saved:unknown):Placement[]|null{
  if(!Array.isArray(saved)||saved.length!==level.parcels.length||!saved.every(isSavedPlacement))return null;
  return saved.every((p,id)=>!p||valid(level,saved,id,p))?saved:null;
}

function restorePacking(index:number,saved:unknown,completed:boolean,version:number):Placement[]|null{
  const level=levels[index];
  if(version>=(levelSpecs[index].layoutVersion??1))return decodePacking(level,saved);
  if(!Array.isArray(saved)||!saved.every(isSavedPlacement))return null;

  // Old coordinates refer to different parcels. Preserve the completed view if it was showing.
  return completed&&saved.length>0&&saved.every(Boolean)
   ?structuredClone(level.solution):level.parcels.map(()=>null);
}

export function decodeProgress(raw:string|null):Progress|null{
 try{
  if(!raw)return null;const data=JSON.parse(raw);
  if((data?.version!==1&&data?.version!==saveVersion)||!Number.isInteger(data.index)||data.index<0||data.index>=levels.length)return null;
  const completed=Array.from({length:levels.length},(_,i)=>data.completed?.[i]===true);
  const state=restorePacking(data.index,data.state,completed[data.index],data.version);
  if(!state)return null;
  const packings=levels.map((level,index)=>index===data.index?state:
   restorePacking(index,data.packings?.[index],completed[index],data.version)??level.parcels.map(()=>null));
  const legacyPostcards=Array.isArray(data.legacyPostcards)?data.legacyPostcards.map((value:unknown)=>value===true):undefined;
  // Older saves have no hint history. Only an empty truck is known to be unassisted.
  const hintedAttempts=packings.map((packing,index)=>Array.isArray(data.hintedAttempts)?data.hintedAttempts[index]===true:packing.some(Boolean));
  const hintFreeClears=completed.map((finished,index)=>finished&&data.hintFreeClears?.[index]===true);
  const bestStars=levels.map((_,index)=>Number.isInteger(data.bestStars?.[index])?Math.max(0,Math.min(3,data.bestStars[index])):0);
  const attempts=levels.map((_,index)=>Array.isArray(data.attempts)?normalizeAttempt(data.attempts[index]):emptyAttempt());
  return {version:saveVersion,index:data.index,state,completed,packings,legacyPostcards,hintedAttempts,hintFreeClears,bestStars,attempts,guide:['drag','rotate','done'].includes(data.guide)?data.guide:'drag'};
 }catch{return null;}
}
export function readProgress():Progress|null{try{return decodeProgress(localStorage.getItem(saveKey));}catch{return null;}}
export function writeProgress(progress:Progress){try{localStorage.setItem(saveKey,JSON.stringify(progress));}catch{/* Playing still works when browser storage is unavailable. */}}
