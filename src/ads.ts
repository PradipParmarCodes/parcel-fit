export type AdPlacement = 'next' | 'reward';

export type AdBreakConfig = {
 type: AdPlacement;
 name: string;
 beforeAd?: () => void;
 afterAd?: () => void;
 beforeReward?: (showAd: () => void) => void;
 adDismissed?: () => void;
 adViewed?: () => void;
 adBreakDone?: () => void;
};

export type AdHost = {adBreak?: (config: AdBreakConfig) => void};
export type AdMode = 'auto' | 'off' | 'test' | 'google';
export type NextAdContext = {firstClear: boolean;allComplete: boolean;completedCount?: number;now?: number;force?: boolean};

/** Keep interruptions predictable: only milestone clears can open an interstitial. */
export const firstInterstitialLevel=5;
export const interstitialEveryLevels=5;

type AdDocument = Pick<Document, 'getElementById'>;
type AdLocation = {hostname?: string;search?: string};

export type AdsOptions = {
 document?: AdDocument;
 host?: AdHost;
 location?: AdLocation;
 mode?: AdMode;
 onPause?: () => void;
 onResume?: () => void;
};

export function resolveAdMode(options: Pick<AdsOptions, 'host'|'location'|'mode'>={}): Exclude<AdMode, 'auto'> {
 const requested=options.mode??'auto';
 if(requested!=='auto')return requested==='google'&&typeof options.host?.adBreak!=='function'?'off':requested;
 if(options.location?.search?.includes('ads=off'))return 'off';
 if(typeof options.host?.adBreak==='function')return 'google';
 return options.location?.search?.includes('ads=test')?'test':'off';
}

/**
 * Keeps ad provider details out of the game loop. Test ads are deliberately
 * local-only; real Google placements are used only when an adBreak function
 * has been loaded by the host page.
 */
export class GameAds {
 readonly mode: Exclude<AdMode, 'auto'>;
 readonly canReward: boolean;
 private active=false;
 private lastNextAt=-Infinity;

 constructor(private options: AdsOptions={}) {
  this.mode=resolveAdMode(options);
  this.canReward=this.mode==='test'||this.mode==='google';
 }

 shouldShowNext(context:NextAdContext): boolean {
  if(this.mode==='off'||!context.firstClear||context.allComplete)return false;
  if(context.force)return true;
  if(this.mode==='test')return true;
  const completedCount=context.completedCount??0;
  if(completedCount<firstInterstitialLevel||completedCount%interstitialEveryLevels!==0)return false;
  const now=context.now??Date.now();
  if(now-this.lastNextAt<90_000)return false;
  this.lastNextAt=now;
  return true;
 }

 showNext(done: () => void,context:NextAdContext={firstClear:true,allComplete:false}): void {
  if(!this.shouldShowNext(context)){done();return;}
  this.show('next',()=>{},done);
 }

 showRewarded(onViewed: () => void,done: () => void=()=>{}): void {
  this.show('reward',onViewed,done);
 }

 private show(type:AdPlacement,onViewed:()=>void,done:()=>void): void {
  if(this.active)return;
  if(this.mode==='google'&&this.options.host?.adBreak){
   this.showGoogle(type,onViewed,done);
   return;
  }
  if(this.mode==='test'){
   this.showMock(type,onViewed,done);
   return;
  }
  done();
 }

 private showGoogle(type:AdPlacement,onViewed:()=>void,done:()=>void): void {
  const adBreak=this.options.host?.adBreak;
  if(!adBreak){done();return;}
  this.active=true;
  let finished=false;
  let fallbackTimer:ReturnType<typeof setTimeout>|undefined;
  const finish=()=>{
   if(finished)return;
   finished=true;
   if(fallbackTimer!==undefined)clearTimeout(fallbackTimer);
   this.active=false;done();
  };
  const config:AdBreakConfig={
   type,
   name:type==='next'?'level_complete':'extra_hint',
   beforeAd:()=>this.options.onPause?.(),
   afterAd:()=>this.options.onResume?.(),
   adBreakDone:finish,
  };
  if(type==='reward'){
   config.beforeReward=showAd=>this.showRewardPrompt(showAd,finish);
   config.adDismissed=()=>{};
   config.adViewed=onViewed;
  }
  // A blocked provider must never trap the player behind a disabled Continue button.
  fallbackTimer=setTimeout(finish,12_000);
  try{adBreak(config);}catch{finish();}
 }

 private showRewardPrompt(showAd:()=>void,finish:()=>void): void {
  const dialog=this.dialog();
  if(!dialog){showAd();return;}
  this.fillDialog(dialog,'reward-prompt');
  const action=this.action(dialog);
  if(!action){showAd();return;}
  const close=()=>{dialog.close();action.onclick=null;dialog.oncancel=null;showAd();};
  const cancel=(event:Event)=>{event.preventDefault();dialog.close();action.onclick=null;dialog.oncancel=null;finish();};
  action.onclick=close;dialog.oncancel=cancel;dialog.showModal();
 }

 private showMock(type:AdPlacement,onViewed:()=>void,done:()=>void): void {
  const dialog=this.dialog();
  if(!dialog){done();return;}
  const action=this.action(dialog);
  if(!action){done();return;}
  this.active=true;this.options.onPause?.();this.fillDialog(dialog,type==='reward'?'reward-ad':'interstitial');
  const close=(viewed:boolean)=>{
   if(!this.active)return;
   this.active=false;action.onclick=null;dialog.oncancel=null;dialog.close();
   if(viewed&&type==='reward')onViewed();
   this.options.onResume?.();done();
  };
  action.onclick=()=>close(true);
  dialog.oncancel=(event:Event)=>{event.preventDefault();close(false);};
  dialog.showModal();
 }

 private dialog(): HTMLDialogElement|null {
  return this.options.document?.getElementById('ad-test-dialog') as HTMLDialogElement|null??null;
 }

 private action(dialog:HTMLDialogElement): HTMLButtonElement|null {
  return dialog.querySelector<HTMLButtonElement>('[data-ad-action]');
 }

 private fillDialog(dialog:HTMLDialogElement,kind:'interstitial'|'reward-prompt'|'reward-ad'): void {
  const title=dialog.querySelector<HTMLElement>('[data-ad-title]');
  const message=dialog.querySelector<HTMLElement>('[data-ad-message]');
  const action=this.action(dialog);
  if(kind==='interstitial'){
   if(title)title.textContent='Test advertisement';
   if(message)message.textContent='This simulates an ad between deliveries. Your progress is safe.';
   if(action)action.textContent='Continue to next delivery';
  }else if(kind==='reward-prompt'){
   if(title)title.textContent='Need one more hint?';
   if(message)message.textContent='Watch a short ad to unlock one bonus hint.';
   if(action)action.textContent='Watch test ad';
  }else{
   if(title)title.textContent='Test rewarded advertisement';
   if(message)message.textContent='Thanks for watching. Completing this ad grants one bonus hint.';
   if(action)action.textContent='Finish test ad';
  }
  dialog.dataset.adKind=kind;
 }
}

export function createAds(options:AdsOptions={}): GameAds {
 return new GameAds(options);
}
