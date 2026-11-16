/** Shared timing keeps the landing sound, squash and sparkle burst together. */
export const landingImpactMs=110;
export const landingDurationMs=280;
export type LandingPose={progress:number;scaleX:number;scaleY:number;lift:number;done:boolean};

/** lift is a small, nonnegative number of Canvas units to subtract from y. */
export function landingPose(elapsedMs:number,reduced=false):LandingPose{
 if(reduced||elapsedMs>=landingDurationMs)return {progress:1,scaleX:1,scaleY:1,lift:0,done:true};
 const elapsed=Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):0;
 if(elapsed<landingImpactMs){
  const t=elapsed/landingImpactMs,compression=.085*Math.pow(t,8);
  return {progress:1-Math.pow(1-t,3),scaleX:1+compression,scaleY:1-compression,lift:Math.sin(t*Math.PI)*3,done:false};
 }
 const t=(elapsed-landingImpactMs)/(landingDurationMs-landingImpactMs);
 const compression=.085*Math.cos(t*Math.PI*3)*Math.pow(1-t,2);
 return {progress:1,scaleX:1+compression,scaleY:1-compression,lift:Math.sin(t*Math.PI)*Math.exp(-5*t)*2,done:false};
}

/** A scheduled particle remains invisible before its start and after its end. */
export function sparkleAlpha(ageMs:number,durationMs:number):number{
 if(!Number.isFinite(ageMs)||!Number.isFinite(durationMs)||durationMs<=0||ageMs<=0||ageMs>=durationMs)return 0;
 const attack=Math.min(40,durationMs*.12),release=Math.min(200,durationMs*.5);
 return Math.max(0,Math.min(1,ageMs/attack,(durationMs-ageMs)/release));
}

export const truckArrivalMs=640;
export const truckDepartureDelayMs=1080;
export const truckDepartureMs=1460;

/** Ease into the loading bay, then accelerate down the road after the shutter latches. */
export function truckTravelOffset(age:number,distance:number,departing:boolean,reduced=false):number{
 if(reduced)return departing&&age>=200?distance:0;
 if(departing){
  const t=Math.max(0,Math.min(1,(age-truckDepartureDelayMs)/truckDepartureMs));
  return distance*Math.pow(t,2.3);
 }
 const t=Math.max(0,Math.min(1,age/truckArrivalMs));
 return t===1?0:-distance*Math.pow(1-t,2.7);
}

export function suspensionBounce(age:number,strength:number):number{
 if(age<=0||age>=360)return 0;
 return strength*Math.sin(age/33)*Math.pow(1-age/360,2);
}

export function waveLift(age:number,duration:number):number{
 if(age<=0||age>=duration)return 0;
 return Math.min(1,age/120,(duration-age)/160);
}
