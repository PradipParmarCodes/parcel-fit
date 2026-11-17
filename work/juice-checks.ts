import assert from 'node:assert/strict';
import {landingPose,landingImpactMs,landingDurationMs,sparkleAlpha,truckArrivalMs,truckDepartureDelayMs,truckDepartureMs,truckTravelOffset,suspensionBounce,waveLift} from '../src/juice';
import {mapHeight,mapRegions,mapRoad,mapRoadLength,mapRoadPose,mapStops,mapWidth} from '../src/map-route';
assert.equal(landingImpactMs,110);assert.equal(landingDurationMs,280);
const start=landingPose(0);assert.equal(start.progress,0);assert.equal(start.lift,0);assert(!start.done);
let previous=0,compressed=false,stretched=false;
for(let elapsed=-10;elapsed<landingDurationMs;elapsed++){
 const pose=landingPose(elapsed);
 assert(pose.progress>=0&&pose.progress<=1);assert(pose.progress>=previous);previous=pose.progress;
 assert(Number.isFinite(pose.scaleX)&&Number.isFinite(pose.scaleY)&&Number.isFinite(pose.lift));
 assert(pose.scaleX>=.9&&pose.scaleX<=1.1);assert(pose.scaleY>=.9&&pose.scaleY<=1.1);assert(pose.lift>=0&&pose.lift<=3.01);
 if(elapsed>=landingImpactMs){assert.equal(pose.progress,1);if(pose.scaleY<.99)compressed=true;if(pose.scaleY>1.01)stretched=true;}
}
assert(compressed&&stretched,'The settle should contain one clear compression and rebound');
const justBefore=landingPose(landingImpactMs-.001),impact=landingPose(landingImpactMs);
assert(Math.abs(justBefore.scaleX-impact.scaleX)<.0001,'Approach and landing must join without a scale jump');
for(const time of [landingDurationMs,10000,Infinity])assert.deepEqual(landingPose(time),{progress:1,scaleX:1,scaleY:1,lift:0,done:true});
for(const time of [-100,0,30,110,250,NaN])assert.deepEqual(landingPose(time,true),{progress:1,scaleX:1,scaleY:1,lift:0,done:true});
assert.equal(landingPose(NaN).progress,0);
for(const duration of [100,650,2100]){
 assert.equal(sparkleAlpha(-1,duration),0);assert.equal(sparkleAlpha(0,duration),0);assert.equal(sparkleAlpha(duration,duration),0);assert.equal(sparkleAlpha(duration+1,duration),0);
 let visible=false;for(let age=0;age<=duration;age++){const alpha=sparkleAlpha(age,duration);assert(alpha>=0&&alpha<=1);visible ||= alpha>.9;}assert(visible);
}
assert.equal(sparkleAlpha(100,0),0);assert.equal(sparkleAlpha(NaN,600),0);assert.equal(sparkleAlpha(100,Infinity),0);
console.log('PASS landing feedback: synchronized 110ms impact, smooth approach/settle, bounded squash and rebound, exact final pose, reduced motion and scheduled sparkle lifetime');

const travel=800;
assert.equal(truckTravelOffset(-50,travel,false),-travel);
assert.equal(truckTravelOffset(truckArrivalMs,travel,false),0);
const approach=truckTravelOffset(100,travel,false)-truckTravelOffset(0,travel,false);
const braking=truckTravelOffset(truckArrivalMs,travel,false)-truckTravelOffset(truckArrivalMs-100,travel,false);
assert(approach>braking&&braking>0,'The truck should slow before reaching the loading bay');
assert.equal(truckTravelOffset(truckDepartureDelayMs,travel,true),0,'The truck stays parked until the shutter latches');
const leaving=truckTravelOffset(1800,travel,true);
assert(leaving>0&&leaving<travel,'The truck should be visibly moving before completion');
assert.equal(truckTravelOffset(truckDepartureDelayMs+truckDepartureMs,travel,true),travel);
assert.equal(truckTravelOffset(0,travel,false,true),0);
assert.equal(truckTravelOffset(199,travel,true,true),0);
assert.equal(truckTravelOffset(200,travel,true,true),travel);
assert.equal(suspensionBounce(0,4),0);
assert(suspensionBounce(45,4)>0&&suspensionBounce(140,4)<0);
assert.equal(suspensionBounce(360,4),0);
assert.equal(waveLift(-1,660),0);
assert.equal(waveLift(60,660),.5);
assert.equal(waveLift(240,660),1);
assert.equal(waveLift(580,660),.5);
assert.equal(waveLift(660,660),0);
console.log('PASS truck feedback: deceleration, shutter delay, drive-off, reduced motion, suspension settle, and wave timing');

const mapStart=mapRoadPose(0),mapEnd=mapRoadPose(mapRoadLength);
assert.deepEqual(mapRoadPose(-1),mapStart);
assert.deepEqual(mapRoadPose(NaN),mapStart);
assert.deepEqual(mapRoadPose(Infinity),mapEnd);
assert.equal(mapRoad.match(/M/g)?.length,1,'The visible road must be one continuous path');
assert.equal(mapStops.length,70);
assert.equal(new Set(mapRegions.map(region=>region.name)).size,11);
assert.equal(mapRegions[0].y,0);
let previousStopY=0,previousStopDistance=0;
const regionStopCounts=[6,6,6,6,6,6,6,6,6,10,6];
let stopCursor=0;
for (const [regionIndex, region] of mapRegions.entries()) {
  const nextBoundary=mapRegions[regionIndex+1]?.y??mapHeight;
  assert.equal(region.y+region.height,nextBoundary,'Village regions must cover the world without skipped stretches');
  assert(region.labelX>0&&region.labelX<mapWidth&&region.labelY>region.y&&region.labelY<nextBoundary);
  for (const stop of mapStops.slice(stopCursor,stopCursor+regionStopCounts[regionIndex])) {
    const { x, y, distance }=stop;
    assert(distance>previousStopDistance&&y-previousStopY>=60.99);
    assert(x>0&&x<mapWidth&&y>region.y&&y<nextBoundary);
    assert.equal(mapRoadPose(distance).x,x);
    assert.equal(mapRoadPose(distance).y,y);
    previousStopDistance=distance;
    previousStopY=y;
  }
  stopCursor+=regionStopCounts[regionIndex];
}
assert.equal(stopCursor,mapStops.length);

let lastPose=mapStart,minAngle=180,maxAngle=0;
for (let distance=1;distance<=mapRoadLength;distance++) {
  const pose=mapRoadPose(distance);
  assert(pose.x>0&&pose.x<mapWidth&&pose.y>lastPose.y&&pose.y<=mapEnd.y);
  assert(pose.angle>0&&pose.angle<180);
  assert(Math.abs(pose.angle-lastPose.angle)<3,'Truck heading must turn smoothly between Bézier curves');
  assert(Math.hypot(pose.x-lastPose.x,pose.y-lastPose.y)<1.01,'The truck must stay at a steady speed along the drawn road');
  minAngle=Math.min(minAngle,pose.angle);
  maxAngle=Math.max(maxAngle,pose.angle);
  lastPose=pose;
}
assert(minAngle<45&&maxAngle>135,'The road must wind in both directions');
console.log('PASS world road: 70 ordered stops across 11 contiguous villages, smooth truck motion, and clamped endpoints');
