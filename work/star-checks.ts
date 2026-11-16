import assert from 'node:assert/strict';
import {levels} from '../src/engine';
import {actionCount,emptyAttempt,normalizeAttempt,starsFor,starText} from '../src/stars';

const level=levels[0];
const clean={...emptyAttempt(),placements:level.parcels.length};
assert.equal(starsFor(level,emptyAttempt()),0,'An unfinished delivery cannot earn stars');
assert.equal(starsFor(level,clean),3,'A clean solve earns three stars');
assert.equal(starsFor(level,{...clean,invalidDrops:1}),2,'A small mistake lowers a clean solve to two stars');
assert.equal(starsFor(level,{...clean,hints:1}),1,'Using a hint caps the attempt at one star');
assert.equal(starsFor(level,{...clean,restarts:2}),1,'Repeated resets lose the one-star threshold');
assert.equal(actionCount({...clean,rotations:2,invalidDrops:1}),level.parcels.length+3);
assert.deepEqual(normalizeAttempt({placements:3,hints:-1,undos:2.5}),{...emptyAttempt(),placements:3,undos:0});
assert.equal(starText(2),'★★☆');
console.log('PASS stars: performance tiers, assistance penalty, action summary, and save normalization');
