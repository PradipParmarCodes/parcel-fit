import assert from 'node:assert/strict';
import {GameSound,type SoundKind} from '../src/sound';
import {GameMusic} from '../src/music';
import {installSettings} from '../src/settings';
import {landingImpactMs} from '../src/juice';
let constructed=0,resumed=0;
const nodes:{start:number;stop:number;ended:(()=>void)|null;gains:number[];cancelled:number}[]=[];
const makeParam=(values:number[])=>({value:.0001,cancelScheduledValues(){},setValueAtTime(value:number){assert(value>0&&Number.isFinite(value));values.push(value);},exponentialRampToValueAtTime(value:number){assert(value>0&&Number.isFinite(value));values.push(value);},setTargetAtTime(value:number){assert(value>=0&&Number.isFinite(value));values.push(value);}});
let lastNode:typeof nodes[number]|null=null;
const effectVolumes:number[]=[];
const fake={state:'suspended',currentTime:2,destination:{},async resume(){resumed++;this.state='running';},createOscillator(){
 const node={start:0,stop:0,ended:null as (()=>void)|null,gains:[] as number[],cancelled:0};nodes.push(node);lastNode=node;
 return {type:'sine',frequency:makeParam([]),connect(){},disconnect(){},start(t:number){node.start=t;},stop(t:number){node.stop=t;node.cancelled++;},set onended(fn:()=>void){node.ended=fn;}};
},createGain(){const values=lastNode?.gains??effectVolumes;lastNode=null;return {gain:makeParam(values),connect(){},disconnect(){}};}};
const sound=new GameSound(()=>{constructed++;return fake as unknown as AudioContext;});
sound.play('snap');assert.equal(constructed,0);assert.equal(nodes.length,0,'No audio should be created before opting in');
assert(await sound.toggle());assert.equal(constructed,1);assert.equal(resumed,1);
const kinds:SoundKind[]=['pick','turn','snap','reject','complete','drive','row','stamp','horn'];
for(const kind of kinds){
 const first=nodes.length;sound.play(kind,99);const made=nodes.slice(first);assert(made.length>0&&made.length<=8,`${kind} uses a small, bounded voice count`);
 for(const node of made){assert(node.start>=fake.currentTime);assert(node.stop>node.start);assert(node.stop-fake.currentTime<1);assert(node.gains.every(v=>v>0&&v<=.15));}
 if(kind==='snap')assert(made.every(n=>n.start>=fake.currentTime+landingImpactMs/1000),'Snap audio must wait for the visual impact');
 made.forEach(n=>n.ended?.());
}
fake.state='suspended';
const previousResumes=resumed;
const resumedAudio=await Promise.all([sound.enable(),sound.enable()]);
assert.deepEqual(resumedAudio,[true,true]);
assert.equal(resumed,previousResumes+1,'Only one resume should run at a time');
const active=nodes.length;sound.play('complete');const scheduled=nodes.slice(active);assert(scheduled.some(n=>n.start>fake.currentTime));
assert.equal(await sound.toggle(),false);assert(scheduled.every(n=>n.cancelled===2&&n.stop<=fake.currentTime+.021),'Muting must stop pending completion notes too');
const muted=nodes.length;sound.play('snap');assert.equal(nodes.length,muted);
assert(await sound.toggle());assert.equal(constructed,1);
const rapidStart=nodes.length;for(let i=0;i<100;i++)sound.play('snap',i);
const stillScheduled=nodes.slice(rapidStart).filter(n=>n.cancelled===1);assert(stillScheduled.length<=24,'Rapid tapping cannot leave unbounded active voices');
assert.equal(await sound.toggle(),false);
const unsupported=new GameSound(()=>{throw new Error('Audio unavailable');});assert.equal(await unsupported.toggle(),false);unsupported.play('snap');assert.equal(unsupported.enabled,false);
assert(await sound.unlock());
assert.equal(sound.enabled,false,'Unlocking the context for music must leave muted effects off');
assert(await sound.enable());
sound.setVolume(.62);assert.equal(effectVolumes.at(-1),.62);
sound.setVolume(0);const zeroVolume=nodes.length;sound.play('horn');assert.equal(nodes.length,zeroVolume);
console.log('PASS sound: opt-in, nine effects, synchronized landing, short quiet envelopes, mute cancels queued notes, 24-voice cap, context reuse and unavailable-device fallback');

const sources:{start:number;offset:number;stop:number;loop:boolean}[]=[];
const gains:number[]=[];
let synthesisCount=0;
const musicContext={currentTime:5,destination:{},createBuffer(_channels:number,frames:number,rate:number){
 synthesisCount++;
 assert(frames/rate>40&&frames/rate<46);
 const samples=new Float32Array(frames);
 return {duration:frames/rate,getChannelData:()=>samples};
},createGain(){return {gain:makeParam(gains),connect(){},disconnect(){}};},createBufferSource(){
 const source={start:0,offset:0,stop:0,loop:false};sources.push(source);
 return {connect(){},disconnect(){},set loop(value:boolean){source.loop=value;},set buffer(buffer:{getChannelData:()=>Float32Array}){
  const samples=buffer.getChannelData();let peak=0,sum=0;
  for(const amplitude of samples){assert(Number.isFinite(amplitude));peak=Math.max(peak,Math.abs(amplitude));sum+=amplitude*amplitude;}
  assert(peak>.12&&peak<1,'Instrumental loop should be audible without clipping');
  assert(Math.sqrt(sum/samples.length)>.035,'The full track should contain a sustained audible mix');
  assert(Math.abs(samples[0]-samples.at(-1)!)<.004,'Loop endpoints should join without a click');
 },start(time:number,offset:number){source.start=time;source.offset=offset;},stop(time:number){source.stop=time;}};
}};
const routeTrack=new GameMusic();
const audioContext=musicContext as unknown as AudioContext;
assert.equal(synthesisCount,0);
routeTrack.setVolume(.5);assert(routeTrack.play(audioContext));assert(routeTrack.play(audioContext));
assert.equal(sources.length,1);assert.equal(sources[0].loop,true);assert.equal(gains.at(-1),.24);
musicContext.currentTime=9;routeTrack.pause();assert.equal(gains.at(-1),0);assert.equal(sources[0].stop,9.06);
musicContext.currentTime=15;assert(routeTrack.play(audioContext));assert.equal(synthesisCount,1);assert.equal(sources[1].offset,4);
routeTrack.setVolume(.25);assert.equal(gains.at(-1),.12);routeTrack.pause();
console.log('PASS music: lazy synthesis, seamless unclipped loop, independent volume, no duplicate playback and pause/resume at the same position');

const preferences=new Map([['parcel-fit-sound','off']]);
const settingsElements=new Map<string,ReturnType<typeof settingsElement>>();
const documentEvents=new Map<string,()=>void>();
const windowEvents=new Map<string,()=>void>();
function settingsElement(){
 const events=new Map<string,()=>void>();
 return {checked:false,value:'',textContent:'',hidden:false,open:false,get valueAsNumber(){return Number(this.value);},
  onchange:null as ((event?: unknown)=>void)|null,oninput:null as (()=>void)|null,onclick:null as (()=>void)|null,
  addEventListener(name:string,listener:()=>void){events.set(name,listener);},
  showModal(){this.open=true;},close(){this.open=false;events.get('close')?.();},focus(){},
 };
}
function settingsControl(id:string){
 if(!settingsElements.has(id))settingsElements.set(id,settingsElement());
 return settingsElements.get(id)!;
}
const settingsDocument={hidden:false,getElementById:settingsControl,addEventListener:documentEvents.set.bind(documentEvents)};
Object.defineProperties(globalThis,{
 document:{value:settingsDocument},window:{value:{addEventListener:windowEvents.set.bind(windowEvents)}},
 localStorage:{value:{getItem:(key:string)=>preferences.get(key)??null,setItem:preferences.set.bind(preferences)}},
});
let audioStarts=0;
const makeSound=()=>new GameSound(()=>{audioStarts++;return {...musicContext,state:'running'} as unknown as AudioContext;});
const menuSound=makeSound();
const settingsDialog=installSettings(menuSound);
const musicToggle=settingsControl('settings-music'),effectsToggle=settingsControl('settings-effects');
assert.equal(musicToggle.checked,false);assert.equal(effectsToggle.checked,false,'Existing mute preference must carry over');
let focusReturned=false;
settingsDialog({focus(){focusReturned=true;}} as HTMLElement);
assert(settingsControl('settings-dialog').open);
windowEvents.get('pointerup')!();
assert.equal(audioStarts,0,'Opening Settings with both audio channels off must remain silent');
musicToggle.checked=true;musicToggle.onchange!({currentTarget:musicToggle});
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
await settle();assert.equal(audioStarts,1);assert.equal(menuSound.enabled,false);
settingsDocument.hidden=true;documentEvents.get('visibilitychange')!();
assert(sources.at(-1)!.stop>0,'Background music should pause when the tab is hidden');
settingsDocument.hidden=false;const pausedSource=sources.at(-1);documentEvents.get('visibilitychange')!();
await settle();assert.notEqual(sources.at(-1),pausedSource);
const musicSlider=settingsControl('settings-music-volume');musicSlider.value='20';musicSlider.oninput!();musicSlider.onchange!();
assert.equal(settingsControl('settings-music-value').textContent,'20%');
settingsControl('settings-close').onclick!();assert(focusReturned);
installSettings(makeSound());assert(musicToggle.checked);assert(!effectsToggle.checked);assert.equal(musicSlider.value,'20');
assert.equal(audioStarts,1,'Reloaded settings wait for a gesture before starting audio');
console.log('PASS settings: legacy mute, opt-in, separate music and effects, tab visibility, persisted levels, and modal focus return');
