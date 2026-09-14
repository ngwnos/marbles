import assert from 'node:assert/strict';
import {decodePreviewMesh} from '../src/geometry/preview-mesh';
import {finishDeck} from '../src/pieces/finish';
import {auditHeightSurfaceSamples} from '../tests/parent-surface-normals';

const assetsIndex=process.argv.indexOf('--assets'),assets=assetsIndex<0?'src/generated':process.argv[assetsIndex+1];
const geometry=decodePreviewMesh(await Bun.file(`${assets}/finish.bin`).arrayBuffer());
const samples:[number,number][]=[];
// Stay on the broad deck, clear of its intentional edge rolls and connector.
for(let x=-20;x<=24;x+=2)for(const z of [-25,-20,20,25])samples.push([x,z]);
for(let x=32;x<=144;x+=4)for(const z of [-20,20])samples.push([x,z]);
const report=auditHeightSurfaceSamples(geometry,finishDeck,samples);geometry.dispose();
console.log('Finish top deck',report);
assert.equal(report.missing,0,'Missing top-deck surface');
assert(report.maxHeightError<.025,'Top deck deviates from its designed height');
assert(report.maxNormalAngle<1,'Top-deck shading deviates from its designed tangent');
