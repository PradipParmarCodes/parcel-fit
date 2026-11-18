import assert from 'node:assert/strict';
import {compareVersions,parseUpdateManifest,requiresUpdate,fetchUpdateManifest} from '../src/update';

assert.equal(compareVersions('1.0','1.0.0'),0);
assert.equal(compareVersions('1.2.0','1.1.9'),1);
assert.equal(compareVersions('v1.1.0','1.2.0'),-1);
assert(requiresUpdate('1.0.0','1.0.1'));
assert(!requiresUpdate('1.2.0','1.0.1'));
assert.deepEqual(parseUpdateManifest({latestVersion:'1.2.0',minimumVersion:'1.1.0',storeUrl:'https://play.google.com/store/apps/details?id=com.parcelbox.game'}),{
 latestVersion:'1.2.0',minimumVersion:'1.1.0',storeUrl:'https://play.google.com/store/apps/details?id=com.parcelbox.game',message:undefined,
});
assert.equal(parseUpdateManifest({latestVersion:'1.2.0',minimumVersion:'1.1.0',storeUrl:'not-a-url'}),null);
const fetched=await fetchUpdateManifest(async()=>new Response(JSON.stringify({latestVersion:'2.0.0',minimumVersion:'1.5.0',storeUrl:'https://example.com/update'})), 'https://example.com/app-version.json');
assert.equal(fetched?.minimumVersion,'1.5.0');
console.log('PASS update gate: version comparison, manifest validation, and remote fetch fallback');
