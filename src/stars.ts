import type {Level} from './engine';

export type StarRating=0|1|2|3;

/** The actions that affect a delivery's performance rating. */
export type AttemptStats={
 placements:number;
 returns:number;
 rotations:number;
 invalidDrops:number;
 undos:number;
 hints:number;
 restarts:number;
};

export function emptyAttempt():AttemptStats{
 return {placements:0,returns:0,rotations:0,invalidDrops:0,undos:0,hints:0,restarts:0};
}

function count(value:unknown):number{return Number.isInteger(value)&&Number(value)>=0?Number(value):0;}

/** Keep save data harmless and forward-compatible when a field is absent. */
export function normalizeAttempt(value:unknown):AttemptStats{
 const data=value&&typeof value==='object'?value as Record<string,unknown>:{ };
 return {
  placements:count(data.placements),returns:count(data.returns),rotations:count(data.rotations),
  invalidDrops:count(data.invalidDrops),undos:count(data.undos),hints:count(data.hints),restarts:count(data.restarts),
 };
}

export function actionCount(stats:AttemptStats):number{
 return stats.placements+stats.returns+stats.rotations+stats.invalidDrops+stats.undos;
}

/**
 * Score only player-controlled inefficiency. Rotations are tracked for the
 * result summary, but are not penalized because turning is part of the puzzle.
 */
export function performancePenalty(level:Pick<Level,'parcels'>,stats:AttemptStats):number{
 const extraPlacements=Math.max(0,stats.placements-level.parcels.length);
 return extraPlacements*2+stats.returns*2+stats.invalidDrops*2+stats.undos*2+stats.restarts*6+stats.hints*12;
}

export function starsFor(level:Pick<Level,'parcels'>,stats:AttemptStats):StarRating{
 if(stats.placements<level.parcels.length)return 0;
 if(stats.hints>0)return 1;
 const penalty=performancePenalty(level,stats);
 if(penalty===0)return 3;
 return penalty<=6?2:1;
}

export function starText(stars:StarRating):string{
 return `${'★'.repeat(stars)}${'☆'.repeat(3-stars)}`;
}
