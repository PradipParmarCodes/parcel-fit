export type Box={x:number;y:number;w:number;h:number};
export type Stage={w:number;h:number;wide:boolean;trayBottom:boolean;cab:number;board:{x:number;y:number;s:number};road:number;bay:Box;columns:number;slots:Box[]};
/** Fit the truck and every parcel slot to the actual available play area. */
export function fitStage(cssWidth:number,cssHeight:number,level:{w:number;h:number;parcels:unknown[]}):Stage{
 const wide=cssWidth/cssHeight>1.3,w=wide?960:600,h=Math.max(160,w*cssHeight/Math.max(1,cssWidth)),n=level.parcels.length;
 // Very short landscape canvases still need the side tray. On a full desktop
 // canvas, the unused space below the road makes a much better parcel tray.
 const trayBottom=wide&&cssWidth>=800&&cssHeight>=420;
 const columns=trayBottom?n<=4?Math.max(1,n):3:!wide&&n===3?3:n<=4||wide&&cssWidth<400?2:3;
 const gap=8,pad=10,rows=Math.ceil(n/columns);
 const compactWide=wide&&h<220;
 let s:number,x:number,y:number,bay:Box,cab:number;
 if(wide){
  cab=cssWidth<400?82:96;y=compactWide?18:36;
  if(trayBottom){
   const trayHeight=Math.max(112,rows*76+20),trayTop=h-trayHeight-12,boardGap=68;
   s=Math.min(76,(w-cab-66)/level.w,(trayTop-y-boardGap)/level.h);s=Math.max(14,s);
   x=(w-level.w*s-cab)/2;
   bay={x:16,y:y+level.h*s+boardGap,w:w-32,h:h-y-level.h*s-boardGap-12};
  }else{
   const left=w*(cssWidth<285?.56:cssWidth<400?.62:.61);
   s=Math.min(76,(left-cab-58)/level.w,(h-(compactWide?108:144))/level.h);if(compactWide)s=Math.max(14,s);x=(left-level.w*s-cab-24)/2+12;
   bay={x:left+14,y:32,w:w-left-30,h:h-44};
  }
 }else{
  cab=100;y=24;const trayHeight=Math.min(310,Math.max(175,h*.43));
  s=Math.min(103,(w-cab-66)/level.w,(h-trayHeight-142)/level.h);
  s=Math.max(14,s);x=(w-level.w*s-cab-36)/2+14;
  const top=y+level.h*s+100;bay={x:16,y:top,w:w-32,h:h-top-12};
 }
 const sw=(bay.w-pad*2-gap*(columns-1))/columns,sh=(bay.h-pad*2-gap*(rows-1))/rows;
 const slots=Array.from({length:n},(_,id)=>{
  const row=Math.floor(id/columns);
  const count=Math.min(columns,n-row*columns);
  const inset=(columns-count)*(sw+gap)/2;
  return {x:bay.x+pad+inset+(id%columns)*(sw+gap),y:bay.y+pad+row*(sh+gap),w:sw,h:sh};
 });
 return {w,h,wide,trayBottom,cab,board:{x,y,s},road:y+level.h*s+(compactWide?36:54),bay,columns,slots};
}
