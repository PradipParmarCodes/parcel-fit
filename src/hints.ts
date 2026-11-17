import type {Level} from './engine';
import type {AttemptStats} from './stars';

/** Short puzzles stay self-solveable; larger bays get one extra safety net. */
export function freeHintsFor(level:Pick<Level,'parcels'>):number{
 return level.parcels.length<=5?1:2;
}

/** Make the optional rewarded hint discoverable after the free hints are gone. */
export function shouldOfferRewardedHint(level:Pick<Level,'parcels'>,stats:AttemptStats):boolean{
 return stats.hints>=freeHintsFor(level);
}
