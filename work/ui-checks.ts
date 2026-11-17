// Simulate the actual Canvas event handlers without requiring a browser.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {writeFileSync,readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
const declaredIds=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const native=process.env.RENDER_CANVAS?createRequire(import.meta.url)('./render-tools/node_modules/@napi-rs/canvas'):null;
import {build} from 'esbuild';
import {freeHintsFor} from '../src/hints';
const result=await build({entryPoints:['src/main.ts'],bundle:true,write:false,format:'cjs',loader:{'.css':'empty'}});
async function run(width:number,touch=false,reduced=false,height=width<761?780:820){
 let areaWidth=Math.min(1058,width-20),areaHeight=height-(height<540&&width/height>1.2?170:height<=520?233:width<761?260:300);
 const storage=new Map<string,string>();
 const elements=new Map<string,any>(),listeners=new Map<string,Function>();
 const classes=()=>({add(){},remove(){},toggle(){}});
 const nativeCanvas=native?native.createCanvas(width<761?560:820,width<761?825:650):null;
 const context2d=nativeCanvas?.getContext('2d')??new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get(target,key){return (target as any)[key]??(()=>{});},set(target,key,value){(target as any)[key]=value;return true;}});
 const element=(id:string)=>{assert(declaredIds.has(id),`Missing actual HTML element: ${id}`);if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',value:'',get valueAsNumber(){return Number(this.value);},disabled:false,style:{},classList:classes(),onclick:null,offsetWidth:width,setAttribute(){},querySelector(){return null;},addEventListener(name:string,fn:Function){listeners.set(id+':'+name,fn);},open:false,showModal(){this.open=true;},close(){if(!this.open)return;this.open=false;listeners.get(id+':close')?.();},focus(){},click(){this.onclick?.();}});return elements.get(id);};
 const canvas=Object.assign(element('board'),{getContext:()=>context2d,addEventListener:(name:string,fn:Function)=>listeners.set(name,fn),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:areaWidth,height:areaHeight})});
 if(nativeCanvas){for(const key of ['width','height'])Object.defineProperty(canvas,key,{get:()=>nativeCanvas[key],set:value=>{nativeCanvas[key]=value;}});}
 let now=1000;
 let lastFrame:FrameRequestCallback;
 const mapSheet=element('world-map-sheet'),mapTruck={style:{transform:''}};
 const mapHeight=4160;
 const mapNodes:Record<string,unknown>={'.world-map':{clientWidth:width,clientHeight:mapHeight},'.world-map-truck':mapTruck,'.world-main-road-travelled':{setAttribute(){}}};
 mapSheet.clientHeight=Math.min(height-90,680);
 const mapStyles=new Map<string,string>();
 mapSheet.style.setProperty=(name:string,value:string)=>mapStyles.set(name,value);
 const mapPadding=(edge:'top'|'bottom')=>parseFloat(mapStyles.get(`--map-pad-${edge}`)??'0');
 Object.defineProperty(mapSheet,'scrollHeight',{
  get:()=>mapHeight+mapPadding('top')+mapPadding('bottom'),
 });
 let mapScrollTop=0;
 Object.defineProperty(mapSheet,'scrollTop',{
  get:()=>mapScrollTop,
  set:(value:number)=>{mapScrollTop=Math.max(0,Math.min(value,mapSheet.scrollHeight-mapSheet.clientHeight));},
 });
 mapSheet.querySelector=(selector:string)=>mapNodes[selector]??null;
 const env={localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)},console,structuredClone,Math,Set,Map,JSON,performance:{now:()=>now},innerWidth:width,devicePixelRatio:1,matchMedia:()=>({matches:reduced}),requestAnimationFrame:(frame:FrameRequestCallback)=>{lastFrame=frame;return 0;},cancelAnimationFrame(){},Path2D:native?.Path2D??class{rect(){}},document:{getElementById:element,querySelector:(selector:string)=>selector==='#board'?canvas:element('game-screen'),body:{classList:classes()},addEventListener(){}},window:{innerWidth:width,addEventListener(){}},setTimeout,clearTimeout};
 const c=vm.createContext(env);vm.runInContext(result.outputFiles[0].text,c);
 const read=(s:string)=>vm.runInContext(s,c);
 const render=()=>{now+=300;read(`render(${now})`);};
 function truckY(){
  const y=parseFloat(mapTruck.style.transform.split(',')[1]??'');
  assert(Number.isFinite(y),'The truck must have a map position');
  return y;
 }
 function stopY(ordinal:number){
  const match=mapSheet.innerHTML.match(new RegExp(`data-world-stop="${ordinal}"[^>]*--map-y:\\s*([\\d.]+)%`));
  assert(match,`Level ${ordinal+1} must have a vertical position`);
  return Number(match[1]);
 }
 function assertTruckCentered(){
  const visibleY=mapPadding('top')+truckY()-mapSheet.scrollTop;
  assert(Math.abs(visibleY-mapSheet.clientHeight/2)<1.5,'The camera must center the truck in the visible map');
 }
 function assertMapFocus(ordinal:number){
  assert(element('world-map-dialog').open);
  assert.match(mapSheet.innerHTML,new RegExp(`data-world-stop="${ordinal}"[^>]*aria-current="step"`));
  const name=read(`levels[difficultyOrder[${ordinal}]].name`);
  assert.equal(element('world-map-status').textContent,`Current Level ${ordinal+1} · ${name}`);
  assert.equal(element('map-recenter').hidden,false);
  assert(Math.abs(truckY()-stopY(ordinal)*mapHeight/100)<.01,`The truck must be parked at Level ${ordinal+1}`);
  assertTruckCentered();
 }
 async function finishDrive(direction?:'up'|'down',checkCamera=false){
  if(element('world-map-dialog').open){
   const startingPose=mapTruck.style.transform;
   const startingY=truckY(),startingScroll=mapSheet.scrollTop;
   lastFrame!(now);
   lastFrame!(now+=350);
   assert.notEqual(mapTruck.style.transform,startingPose);
   if(direction==='up')assert(truckY()<startingY,'Forward travel must move up the map');
   if(direction==='down')assert(truckY()>startingY,'Travel back to earlier stops must move down the map');
   if(checkCamera)assert(mapSheet.scrollTop<startingScroll,'The camera must follow the truck up the route');
   assertTruckCentered();
   lastFrame!(now+=1500);
  }
  await Promise.resolve();
  assert(!element('world-map-dialog').open);
 }
 function pointer(name:string,x:number,y:number){listeners.get(name)!({clientX:x/read('W')*areaWidth,clientY:y/read('H')*areaHeight,pointerId:1,pointerType:touch?'touch':'mouse',preventDefault(){}});}
 function select(id:number){render();const r=read(`tray(${id})`);pointer('pointerdown',r.x+r.s/2,r.y+r.s/2);pointer('pointerup',r.x+r.s/2,r.y+r.s/2);}
 assert(!read('playing'));
 assert.equal(element('home-play-title').textContent,'Play');
 assert.equal(element('home-level-label').textContent,'Level 1');
 element('home-settings').click();assert(element('settings-dialog').open);
 assert.equal(element('settings-effects-volume').value,'100');
 element('settings-close').click();assert(!element('settings-dialog').open);
 // Level 1 is centered near the route's bottom, and every later stop is uphill.
 element('home-map').click();assertMapFocus(0);
 const stopPositions=Array.from({length:60},(_,ordinal)=>stopY(ordinal));
 assert(stopPositions[0]>90&&stopPositions[59]<10);
 assert(stopPositions.slice(1).every((y,index)=>y<stopPositions[index]));
 assert(mapPadding('bottom')>0,'Level 1 needs map below the route to center the truck');
 mapSheet.scrollTop=0;
 element('map-recenter').click();assertTruckCentered();
 element('map-close').click();
 element('home-play').click();assert(read('playing'));assert(element('home-screen').hidden);
 now+=1000;render();if(nativeCanvas)writeFileSync(`work/board-${width}.png`,nativeCanvas.toBuffer('image/png'));
 const cab=read('cabBounds()'),cabSize=read('stage.cab');
 pointer('pointerup',cab.right+cabSize*.45,(cab.top+cab.hood)/2);
 assert.equal(element('feedback').textContent,'Honk!');
 pointer('pointerup',cab.right+cabSize,cab.hood+11);
 assert(read('headlightsOn'));
 listeners.get('keydown')!({key:'l',preventDefault(){}});
 assert(!read('headlightsOn'));
 select(0);assert.equal(element('selection').textContent,'Box A');assert.equal(element('rotate').disabled,false);
 assert(read('guide==="drag"'));const beforeDemo=read('JSON.stringify(game.state)');render();assert.equal(read('JSON.stringify(game.state)'),beforeDemo,'Demo must never place the player’s boxes');assert(read('guidedTarget!==null'));
 element('game-home').click();element('help-button').click();assert(element('help-dialog').open);element('help-close').click();assert(!element('help-dialog').open);element('help-button').click();element('show-guide').click();assert(!element('help-dialog').open);assert.equal(read('guide'),'drag');select(0);
 const before=read('rotation');element('rotate').click();assert.equal(read('rotation'),(before+1)%4);
 element('restart').click();select(0);
 // Drag parcel A to its stored solution using either mouse or raised touch preview.
 const sol=read('game.level.solution[0]');while(read('rotation')!==sol.r)element('rotate').click();render();
 const r=read('tray(0)'),b=read('board()');pointer('pointerdown',r.x+r.s/2,r.y+r.s/2);
 const dx=b.x+(sol.x+.5)*b.s,dy=b.y+(sol.y+.5)*b.s+read('lift()');
 pointer('pointermove',dx,dy);pointer('pointerup',dx,dy);assert(read('game.state[0]!==null'));assert.equal(element('count').textContent,`1 / ${read('game.state.length')} loaded`);assert.equal(element('meter-fill').style.width,`${100/read('game.state.length')}%`);assert.equal(read('guide'),'rotate');assert.equal(read('particles.length>0'),!reduced);
 const unfinishedPacking=read('JSON.stringify(game.state)');
 element('game-home').click();assert.equal(element('home-play-title').textContent,'Resume');
 element('home-map').click();assertMapFocus(0);element('map-close').click();
 element('home-play').click();assert.equal(read('JSON.stringify(game.state)'),unfinishedPacking);
 // Reject a real overlapping drag without changing either parcel or undo history.
 select(1);render();const bad=read('tray(1)'),base=read('board()'),history=read('game.history.length');
 pointer('pointerdown',bad.x+bad.s/2,bad.y+bad.s/2);pointer('pointermove',base.x+base.s/2,base.y+base.s/2+read('lift()'));pointer('pointerup',base.x+base.s/2,base.y+base.s/2+read('lift()'));
 assert(read('game.state[1]===null'));assert.equal(read('game.history.length'),history);assert(element('feedback').textContent.includes('blocked'));
 render();const loaded=read('target(0)');pointer('pointerdown',loaded.x+loaded.s/2,loaded.y+loaded.s/2);pointer('pointerup',loaded.x+loaded.s/2,loaded.y+loaded.s/2);
 element('return').click();assert(read('game.state[0]===null'));element('undo').click();assert(read('game.state[0]!==null'));
 element('restart').click();assert(read('game.state.every(p=>p===null)'));assert.equal(element('undo').disabled,false);element('undo').click();assert(read('game.state[0]!==null'));element('restart').click();
 // First, check tap-to-place on an empty van.
 select(0);const first=read('game.level.solution[0]');while(read('rotation')!==first.r)element('rotate').click();
 {const b=read('board()');pointer('pointerdown',b.x+.1*b.s,b.y+.1*b.s);pointer('pointerup',b.x+.1*b.s,b.y+.1*b.s);assert(read('game.state[0]!==null'));}
 element('restart').click();
 // Complete every level through the real select / rotate / drag handlers.
 const totalLevels=read('levels.length');
 for(let level=0;level<totalLevels;level++){
 if(level===totalLevels-1){
  element('game-home').click();assert.equal(element('home-level-label').textContent,'Level 60');
  element('home-map').click();assertMapFocus(level);
  assert(mapPadding('top')>0,'Level 60 needs map above the route to center the truck');
  mapSheet.scrollTop=mapSheet.scrollHeight;
  element('map-recenter').click();assertTruckCentered();
  element('map-close').click();element('home-play').click();
 }
 if(nativeCanvas&&!reduced&&[5,10,15,20,25,29].includes(level)){now+=900;render();writeFileSync(`work/new-level-${level+1}-${width}.png`,nativeCanvas.toBuffer('image/png'));}
 const n=read('game.state.length');
 for(let id=0;id<n;id++){
 select(id);const p=read(`game.level.solution[${id}]`);let attempts=0;while(read('rotation')!==p.r&&attempts++<4)element('rotate').click();
 render();const r=read(`tray(${id})`),grab=read(`cells(${id},rotation)[0]`),b=read('board()');
 pointer('pointerdown',r.x+(grab[0]+.5)*r.s,r.y+(grab[1]+.5)*r.s);
 const tx=b.x+(p.x+grab[0]+.5)*b.s,ty=b.y+(p.y+grab[1]+.5)*b.s+read('lift()');pointer('pointermove',tx,ty);pointer('pointerup',tx,ty);
 assert(read(`game.state[${id}]!==null`),`Level ${level+1} parcel ${id} failed`);
 }
 assert(read('game.complete'));assert.equal(element('continue').disabled,true);
 assert.equal(read('newAchievements.some(a=>a.title==="First Delivery")'),level===0);
 assert.equal(read('newAchievements.some(a=>a.title==="Independent Courier")'),level===2);
 assert.equal(read('newPostcard!==null'),(level+1)%6===0,'Postcards should be awarded every six levels');if(!reduced)assert(read('particles.some(p=>p.shape==="ribbon")'));
 const origin=read('driveOffset(performance.now())');now+=350;read(`render(${now})`);assert.equal(element('finish').open,reduced);now+=1450;read(`render(${now})`);if(nativeCanvas&&level===0&&!reduced)writeFileSync(`work/drive-${width}-moving.png`,nativeCanvas.toBuffer('image/png'));assert(read(`driveOffset(${now})`)>origin||reduced);assert.equal(element('finish').open,reduced);
 now+=1300;read(`render(${now})`);if(nativeCanvas&&level===0&&!reduced)writeFileSync(`work/drive-${width}-gone.png`,nativeCanvas.toBuffer('image/png'));assert(read('deliveryDone'));assert(element('finish').open);assert(read(`driveOffset(${now})>W`));
 if(level===0)assert.match(element('finish-achievements').innerHTML,/First Delivery/);
 if(level===0){
  // Replaying must start a genuinely fresh attempt; Undo must not restore the
  // old completed board and trigger a zero-star completion.
  element('replay').click();assert(!read('game.complete'));assert.equal(read('game.history.length'),0);
  read('activeAttempt.placements=game.state.length;game.state=structuredClone(game.level.solution);lastComplete=false;update();deliveryDone=true;update()');
  assert(read('lastRunStars')===3);assert(element('finish').open);
 }
 if(level<totalLevels-1){
  assert.equal(element('continue').disabled,false);
  element('continue').click();
  assert.equal(element('world-map-dialog').open,!reduced);
  if(!reduced){
   assert.equal(read('game.index'),read(`difficultyOrder[${level}]`));
   assert.equal(element('world-map-title').textContent,`Driving to Level ${level+2}`);
   assert.equal(element('world-map-status').textContent,read(`levels[difficultyOrder[${level+1}]].name`));
   assert.equal(element('map-recenter').hidden,true);
   if(level===0){
    element('map-close').click();await Promise.resolve();
    assert.equal(read('game.index'),0);assert(element('finish').open);
    element('continue').click();
   }else if(level===1){element('map-skip').click();await Promise.resolve();}
  }
  await finishDrive('up',level===11);
  assert.equal(read('game.index'),read(`difficultyOrder[${level+1}]`));assert.equal(read('particles.length'),0);
 }else assert.equal(element('continue').disabled,false);
 }
 // Postcards remain collected on replay.
 assert.equal(read('earnedPostcards().filter(Boolean).length'),10);
 element('continue').click();if(!reduced)await finishDrive('down');assert.equal(read('game.index'),0);assert(read('game.state.every(p=>p===null)'));assert.equal(read('completed.filter(Boolean).length'),totalLevels);
 element('game-home').click();element('open-album').click();
 assert(element('album-dialog').open);assert(element('next-postcard').hidden);assert.equal((element('postcards').innerHTML.match(/postcard delivered/g)||[]).length,10);element('album-close').click();
 element('open-achievements').click();assert(element('achievements-dialog').open);assert.equal(element('achievements-summary').textContent,'8 of 8 earned');element('achievements-close').click();
 element('home-play').click();
 // Fixed cargo responds with an explanation and cannot become a dragged box.
 read('switchLevel(5)');element('restart').click();render();const fixed=read('game.level.blocked[0]'),fb=read('board()'),unchanged=read('JSON.stringify(game.state)');pointer('pointerdown',fb.x+(fixed[0]+.5)*fb.s,fb.y+(fixed[1]+.5)*fb.s);assert(read('drag===null'));assert.equal(read('JSON.stringify(game.state)'),unchanged);assert(element('feedback').textContent.includes('Bolted cargo'));
 // A selected hollow parcel can straddle a fixed square through its label cell.
 select(1);
 for(let turns=0;turns<4&&read('rotation')!==3;turns++)element('rotate').click();
 const anchor=read('cells(1,rotation)[0]');
 const tx=fb.x+(1+anchor[0]+.5)*fb.s,ty=fb.y+(1+anchor[1]+.5)*fb.s;
 pointer('pointerdown',tx,ty);pointer('pointerup',tx,ty);
 assert.deepEqual(JSON.parse(read('JSON.stringify(game.state[1])')),{x:1,y:1,r:3});
 // The keyboard picks and places a parcel without pointer input.
 read("switchLevel(0);game.restart();guide='done';update()");
 const key=(key:string)=>listeners.get('keydown')!({key,preventDefault(){}});
 key('2');key('ArrowRight');key('Enter');
 assert.deepEqual(JSON.parse(read('JSON.stringify(game.state[1])')),{x:1,y:0,r:0});

 // Home has one continuous map of all stops and a separate filterable level list.
 element('game-home').click();element('home-map').click();
 assert(element('world-map-dialog').open);
 assert.equal((mapSheet.innerHTML.match(/data-world-stop=/g)||[]).length,60);
 assert.match(mapSheet.innerHTML,/Maple Depot/);
 assert.match(mapSheet.innerHTML,/Beacon Bay/);
 assert.match(mapSheet.innerHTML,/data-world-stop="0"[^>]*aria-current="step"/);
 element('map-close').click();
 element('home-levels').click();
 assert.deepEqual([...element('level-list').innerHTML.matchAll(/data-level="(\d+)"/g)].map(match=>Number(match[1])),Array.from(read('difficultyOrder')));
 element('difficulty-filter').value='Expert';listeners.get('difficulty-filter:change')!();
 assert(element('level-list').innerHTML.includes('The final beacon'));
 assert(!element('level-list').innerHTML.includes('First-class fit'));
 element('difficulty-filter').value='';listeners.get('difficulty-filter:change')!();
 element('route-filter').value='2';listeners.get('route-filter:change')!();
 assert(element('level-list').innerHTML.includes('Dockside shuffle'));
 assert(!element('level-list').innerHTML.includes('First-class fit'));
 element('levels-close').click();element('home-play').click();
 // The actual Hint button must also recover the screenshot's dead end.
 read('game.index=3;game.restart();motion=null;drag=null;game.set(3,{x:0,y:0,r:0});game.set(2,{x:0,y:2,r:1});game.set(4,{x:3,y:2,r:0});selected=-1;update()');
 assert(read('deadEnd'));render();if(nativeCanvas)writeFileSync(`work/board-${width}-level4.png`,nativeCanvas.toBuffer('image/png'));element('hint-button').click();assert(!read('deadEnd'));assert(read('solve(game.level,game.state)!==null'));
 element('undo').click();assert(read('deadEnd'));
 // All level packings survive selecting another delivery and coming back.

 const beforeSwitch=read('JSON.stringify(game.state)');
 element('game-home').click();element('home-levels').click();assert(element('levels-dialog').open);
 listeners.get('level-list:click')!({target:{closest:()=>({dataset:{level:'1'}})}});
 await finishDrive('down');assert.equal(read('game.index'),1);assert(!element('levels-dialog').open);
 element('game-home').click();element('home-map').click();
 listeners.get('world-map-sheet:click')!({target:{closest:()=>({dataset:{worldStop:String(read('deliveryNumber(3)-1'))},disabled:false})}});
 await finishDrive('up',true);assert.equal(read('JSON.stringify(game.state)'),beforeSwitch);
 const rawSave=storage.get('parcel-fit-progress-v1');assert(rawSave);assert.equal(JSON.parse(rawSave).index,3);
 const beforeResize=read('JSON.stringify(game.state)');render();{const r=read('tray(0)');pointer('pointerdown',r.x+r.s/2,r.y+r.s/2);pointer('pointermove',r.x+r.s/2+20,r.y+r.s/2-20);assert(read('drag!==null'));}[areaWidth,areaHeight]=[areaHeight+120,areaWidth/2];read('resize();refreshGuide()');assert.equal(read('JSON.stringify(game.state)'),beforeResize);assert(read('drag===null'));render();
 // An old completion record cannot bypass the first unsolved delivery.
 read('completed=levels.map(()=>false);packings=levels.map(l=>l.parcels.map(()=>null));completed[59]=true;hintFreeClears.fill(false);hintedAttempts.fill(false);game.restart();switchLevel(0)');

 element('game-home').click();element('home-map').click();
 assert.match(mapSheet.innerHTML,/data-world-stop="59" disabled/);
 listeners.get('world-map-sheet:click')!({target:{closest:()=>({dataset:{worldStop:'59'},disabled:false})}});
 assert.equal(read('game.index'),0);assert(element('world-map-dialog').open);
 element('map-close').click();element('home-play').click();
 element('hint-button').click();assert(read('hintedAttempts[game.index]'));
 element('restart').click();assert(read('hintedAttempts[game.index]'),'Restart must not erase hint usage');
 element('undo').click();assert(read('hintedAttempts[game.index]'));
 let hints=0;while(!read('game.complete')&&hints++<10)element('hint-button').click();
 assert.equal(read('activeAttempt.hints'),freeHintsFor(read('game.level')),'A delivery must have a finite hint budget');assert(element('hint-button').disabled);
 if(!read('game.complete'))read('game.state=structuredClone(game.level.solution);activeAttempt.placements=game.level.parcels.length;lastComplete=false;update()');
 assert(read('game.complete'));assert.match(element('finish-message').textContent,/Level 2 unlocked/);
 assert(!read('hintFreeClears[game.index]'));
 now+=3000;read(`render(${now})`);

 element('finish-home').click();
 assert.equal(element('home-level-label').textContent,'Level 2');
 element('home-map').click();assertMapFocus(1);
 assert.equal(read('game.index'),0,'Browsing the next delivery must not leave the completed puzzle');
 element('map-close').click();element('home-play').click();
 if(!reduced)assert.match(mapSheet.innerHTML,/aria-label="Level 2, [^"]+, Destination"/);
 await finishDrive('up');assert.equal(read('game.index'),read('difficultyOrder[1]'));
 read('switchLevel(0)');element('restart').click();
 // Any highlighted cell accepts the tutorial drop, not just its top-left corner.
 element('game-home').click();element('help-button').click();element('show-guide').click();const teaching=read('guidedTarget');select(teaching.id);render();const taught=read('guidedTarget'),lastCell=read(`cells(${taught.id},${taught.p.r}).at(-1)`),tb=read('board()');
 pointer('pointerdown',tb.x+(taught.p.x+lastCell[0]+.5)*tb.s,tb.y+(taught.p.y+lastCell[1]+.5)*tb.s);pointer('pointerup',tb.x+(taught.p.x+lastCell[0]+.5)*tb.s,tb.y+(taught.p.y+lastCell[1]+.5)*tb.s);assert(read(`game.state[${taught.id}]!==null`));assert.equal(read('game.state.filter(Boolean).length'),1);
 // A reload restores the final active level and its unfinished packing.
 const lastIndex=read('game.index'),lastState=read('JSON.stringify(game.state)');const reload=vm.createContext({...env});vm.runInContext(result.outputFiles[0].text,reload);assert.equal(vm.runInContext('game.index',reload),lastIndex);assert.equal(vm.runInContext('JSON.stringify(game.state)',reload),lastState);
 console.log(`PASS ${touch?'touch':'mouse'} UI (${width}×${height}${reduced?', reduced motion':''}): home, settings, centered bottom-to-top map travel, resume and recenter, selection, rotation, drag, overlap rejection, tray return, undo, restart, tap-to-place, all sixty completions, rightward drive-off, next delivery, blocked-layout hint and undo, guide, help, postcard milestones, replay without lost stamps, autosave, reload and resize`);
}
await run(1200);await run(390,true);await run(320,true,false,568);await run(320,true,false,420);await run(844,true,false,390);await run(390,true,true);
