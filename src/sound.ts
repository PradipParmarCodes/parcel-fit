import {landingImpactMs} from './juice';
export type SoundKind='pick'|'turn'|'snap'|'reject'|'complete'|'drive'|'row'|'stamp'|'horn';
type Voice={oscillator:OscillatorNode;gain:GainNode;end:number};

/** Synthesized effects and the Web Audio context shared with music. */
export class GameSound {
 private effectsWanted=false;
 private volume=1;
 private context:AudioContext|null=null;
 private effectsGain:GainNode|null=null;
 private voices=new Set<Voice>();
 private static readonly maxVoices=24;
 constructor(private createContext:()=>AudioContext=()=>new AudioContext()){}
 private starting:Promise<AudioContext|null>|null=null;

 get enabled(){return this.effectsWanted&&this.context?.state==='running';}

 async toggle():Promise<boolean>{
  if(this.effectsWanted){this.disable();return false;}
  return this.enable();
 }

 async enable():Promise<boolean>{
  this.effectsWanted=true;
  await this.unlock();
  return this.enabled;
 }

 disable(){this.effectsWanted=false;this.silence();}

 setVolume(volume:number){
  this.volume=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):1;
  if(this.context&&this.effectsGain)this.effectsGain.gain.setTargetAtTime(this.volume,this.context.currentTime,.018);
 }

 unlock():Promise<AudioContext|null>{
  if(this.context?.state==='running')return Promise.resolve(this.context);
  if(this.starting)return this.starting;
  this.starting=this.startAudio().finally(()=>{this.starting=null;});
  return this.starting;
 }

 private async startAudio():Promise<AudioContext|null>{
  try{
   if(!this.context||this.context.state==='closed'){
    this.context=this.createContext();
    this.effectsGain=null;
   }
   if(this.context.state!=='running')await this.context.resume();
   return this.context.state==='running'?this.context:null;
  }catch{return null;}
 }
 private stopVoice(voice:Voice){
  this.voices.delete(voice);const c=this.context;if(!c)return;
  try{
   const now=c.currentTime;
   voice.gain.gain.cancelScheduledValues(now);
   voice.gain.gain.setValueAtTime(Math.max(.0001,voice.gain.gain.value),now);
   voice.gain.gain.exponentialRampToValueAtTime(.0001,now+.015);
   voice.oscillator.stop(now+.02);
  }catch{/* An already ended voice is harmless. */}
 }
 private silence(){for(const voice of [...this.voices])this.stopVoice(voice);}
 play(kind:SoundKind,step=0){
  const c=this.context;if(!this.enabled||!c||this.volume===0)return;
  if(!this.effectsGain){
   this.effectsGain=c.createGain();this.effectsGain.gain.value=this.volume;this.effectsGain.connect(c.destination);
  }
  const output=this.effectsGain;
  // Old voices normally clean themselves up through onended. Prune by time as
  // well, and keep a hard cap when a user taps controls very rapidly.
  for(const voice of this.voices)if(voice.end<=c.currentTime)this.voices.delete(voice);
  const note=(hz:number,end:number,delay:number,length:number,volume=.035,type:OscillatorType='sine')=>{
   if(this.voices.size>=GameSound.maxVoices)this.stopVoice(this.voices.values().next().value!);
   const t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=type;
   o.frequency.setValueAtTime(Math.max(20,hz),t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+length);
   g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume*2.2,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+length);
   o.connect(g);g.connect(output);
   const voice={oscillator:o,gain:g,end:t+length+.02};this.voices.add(voice);
   o.onended=()=>{this.voices.delete(voice);o.disconnect();g.disconnect();};o.start(t);o.stop(voice.end);
  };
  const impact=landingImpactMs/1000;
  if(kind==='pick')note(420,590,0,.10,.034,'triangle');
  if(kind==='turn'){note(460,720,0,.07,.024,'triangle');note(720,900,.045,.075,.02);}
  if(kind==='snap'){
   // A soft cardboard thud, short wooden click and pitched bell meet the box
   // at its landing frame, rather than sounding as soon as it is released.
   const tones=[523.25,587.33,659.25,783.99,880,1046.5];
   const index=Number.isFinite(step)?Math.max(0,Math.min(5,Math.floor(step))):0,hz=tones[index];
   note(185,58,impact,.105,.065);note(660,220,impact+.004,.038,.022,'triangle');
   note(hz*.985,hz,impact+.016,.235,.033);note(hz*2,hz*2,impact+.035,.1,.008);
  }
  if(kind==='reject')note(185,125,0,.1,.022,'triangle');
  if(kind==='row'){
   note(659.25,659.25,impact,.15,.024);note(987.77,987.77,impact+.055,.2,.021);note(1318.5,1318.5,impact+.1,.15,.01);
  }
  if(kind==='complete'){
   // A warm chord supports the small ascending delivery melody. The full
   // flourish ends in under one second and does not turn into background music.
   [261.63,329.63,392].forEach(hz=>note(hz,hz,.15,.52,.012,'triangle'));
   [523.25,659.25,783.99,1046.5].forEach((hz,i)=>note(hz,hz,.15+i*.105,.29,.032));
   note(1567.98,1567.98,.46,.26,.009);
  }
  if(kind==='drive'){
   note(62,120,0,.43,.025,'triangle');note(93,160,.035,.42,.016,'triangle');
   note(466.16,466.16,.095,.095,.012);note(554.37,554.37,.095,.095,.009);
  }
  if(kind==='horn'){note(349,330,0,.16,.045,'triangle');note(440,415,0,.14,.03,'triangle');}
  if(kind==='stamp'){note(112,48,0,.12,.045);note(820,340,.012,.047,.012,'triangle');}
 }
}
