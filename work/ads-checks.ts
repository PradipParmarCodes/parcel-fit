import assert from 'node:assert/strict';
import {GameAds,resolveAdMode,type AdBreakConfig} from '../src/ads';

assert.equal(resolveAdMode({location:{hostname:'example.com'}}),'off');
assert.equal(resolveAdMode({location:{hostname:'localhost'}}),'off');
assert.equal(resolveAdMode({location:{hostname:'example.com',search:'?ads=test'}}),'test');
assert.equal(resolveAdMode({location:{hostname:'localhost',search:'?ads=off'}}),'off');
assert.equal(resolveAdMode({host:{adBreak(){}} ,location:{hostname:'example.com'}}),'google');
assert.equal(resolveAdMode({mode:'google',location:{hostname:'example.com'}}),'off');

let mockOpen=false;
let mockAction:(()=>void)|null=null;
const mockButton:any={textContent:'',onclick:null};
const mockDialog:any={
 open:false,
 dataset:{},
 querySelector(selector:string){
  if(selector==='[data-ad-action]')return mockButton;
  return {textContent:''};
 },
 showModal(){this.open=true;mockOpen=true;mockAction=()=>mockButton.onclick?.();},
 close(){this.open=false;mockOpen=false;},
};
const mockDocument:any={getElementById:(id:string)=>id==='ad-test-dialog'?mockDialog:null};
let paused=0,resumed=0,nextDone=0;
const testAds=new GameAds({mode:'test',document:mockDocument,onPause:()=>paused++,onResume:()=>resumed++});
testAds.showNext(()=>nextDone++);
assert.equal(testAds.mode,'test');
assert(mockOpen,'Test ad should open its visible dialog');
assert.equal(paused,1);
mockAction!();
assert.equal(nextDone,1);
assert.equal(resumed,1);

let viewed=0,rewardDone=0;
testAds.showRewarded(()=>viewed++,()=>rewardDone++);
assert(mockOpen,'Rewarded test ad should open its visible dialog');
mockAction!();
assert.equal(viewed,1);
assert.equal(rewardDone,1);

let config:AdBreakConfig|undefined;
let googleDone=0,googlePaused=0,googleResumed=0;
const googleAds=new GameAds({
 host:{adBreak(next){config=next;}},
 onPause:()=>googlePaused++,
 onResume:()=>googleResumed++,
});
googleAds.showNext(()=>googleDone++,{firstClear:true,allComplete:false,force:true});
assert.equal(googleAds.mode,'google');
assert.equal(config?.type,'next');
assert.equal(config?.name,'level_complete');
config?.beforeAd?.();config?.afterAd?.();config?.adBreakDone?.();
assert.equal(googlePaused,1);
assert.equal(googleResumed,1);
assert.equal(googleDone,1);

const smartAds=new GameAds({mode:'google',host:{adBreak(){}}});
assert(!smartAds.shouldShowNext({firstClear:false,allComplete:false}));
assert(!smartAds.shouldShowNext({firstClear:true,allComplete:true}));
assert(!smartAds.shouldShowNext({firstClear:true,allComplete:false}));
assert(!smartAds.shouldShowNext({firstClear:true,allComplete:false}));
assert(smartAds.shouldShowNext({firstClear:true,allComplete:false,now:100_000}));
assert(!smartAds.shouldShowNext({firstClear:true,allComplete:false,now:100_001}),'Interstitials need a cooldown');

let fallbackDone=0;
new GameAds({mode:'off'}).showNext(()=>fallbackDone++);
assert.equal(fallbackDone,1,'Ads must never block the game when disabled');
console.log('PASS ads: local test interstitial/rewarded flow, Google callbacks, and safe production fallback');
