import type {Level} from './engine';
import {actionCount,type AttemptStats} from './stars';

/** Short puzzles stay self-solveable; larger bays get one extra safety net. */
export function freeHintsFor(level:Pick<Level,'parcels'>):number{
 return level.parcels.length<=5?1:2;
}

/** Only offer a rewarded hint once the player is genuinely struggling. */
export function shouldOfferRewardedHint(level:Pick<Level,'parcels'>,stats:AttemptStats,deadEnd:boolean):boolean{
 if(stats.hints<freeHintsFor(level))return false;
 return deadEnd||actionCount(stats)>=Math.max(4,level.parcels.length+2);
}
