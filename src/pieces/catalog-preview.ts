import * as THREE from 'three/webgpu';
import {loadPreviewMesh} from '../geometry/preview-mesh';
import type {ComponentKind} from '../preview-physics';
import hairpinUrl from '../generated/hairpin.bin?url';
import passingUrl from '../generated/passing.bin?url';
import finishUrl from '../generated/finish.bin?url';
import splitUrl from '../generated/split.bin?url';
import jumpRunUrl from '../generated/jump-run.bin?url';
import jumpUrl from '../generated/jump.bin?url';
import landingUrl from '../generated/landing.bin?url';
type Piece={name:string;kind:ComponentKind;url:string;description:string;references:string[][]};
import startUrl from '../generated/start.bin?url';
import {START} from './start';
import extensionUrl from '../generated/extension.bin?url';
import couplerUrl from '../generated/coupler.bin?url';
import starterFunnelUrl from '../generated/starter-funnel.bin?url';
import coilUrl from '../generated/coil.bin?url';
const pieces:Record<string,Piece>={coil:{name:'Coil ramp',kind:'coil',url:coilUrl,description:'Two and a half continuous turns between an upper receiving cup and lower drop, with two support bars outside the channel.',references:[['Isolated original coil and support bars','https://www.discoverytoys.us/cdn/shop/products/3384-Marbleworks-Spiral-ramp_07ecce68-3540-4555-bc04-fcfbdf994d6d.jpg?v=1750873920&width=1200']]},'starter-funnel':{name:'Starter funnel',kind:'starter-funnel',url:starterFunnelUrl,description:'A standalone circular vortex bowl with a rolled rim and one female socket beneath.',references:[['Original starter funnel and underside','https://i.ebayimg.com/images/g/tjsAAeSwWcdqePYI/s-l1600.webp'],['Official parts catalog','https://cs.discoverytoys.com/pwsdata/dt/contentimages/Discovery%20Toys%202020-2021%20Catalog%20USA%20download.pdf']]},coupler:{name:'Double-ended connector',kind:'coupler',url:couplerUrl,description:'Two slotted male ends and a constant bore. The shoulders are one stacking unit apart.',references:[['Original double-ended connector beside the extension','https://i.ebayimg.com/images/g/3Z0AAeSwxtpqRmkN/s-l1600.webp'],['Reference listing','https://www.ebay.com/itm/178284761370']]},extension:{name:'Extension tube',kind:'extension',url:extensionUrl,description:'A plain tube with female sockets at both ends, six stacking units tall. Uses the separate double-ended connector when another female socket sits above it.',references:[['Extension with ordinary posts and double-ended adapter','https://i.ebayimg.com/images/g/uQEAAeSwAotqRmkM/s-l1600.webp'],['Original extension and connectors','https://www.ebay.com/itm/178284761370']]},start:{name:'Starting gate',kind:'start',url:startUrl,description:'Six holding lanes pivot together to release marbles into the sloping tray and funnel. The release uses a motorized, limited revolute joint.',references:[['Original pivoting starter — drawing and mechanism','https://patentimages.storage.googleapis.com/e4/7f/69/9f75d93ad2f73a/US4932917.pdf']]},hairpin:{name:'Banked U-turn',kind:'hairpin',url:hairpinUrl,description:'A high inlet descends past the outlet, climbs around the far bend, and returns along the divided lane.',references:[['Original U-turn — seven views','https://patentimages.storage.googleapis.com/f6/21/f8/d6a44e9262fb2d/USD305047.pdf']]},passing:{name:'Passing lane',kind:'passing',url:passingUrl,description:'Three rounded islands divide a broad alternating bypass lane.',references:[['Original passing lane — six views','https://patentimages.storage.googleapis.com/7d/17/1e/6e1a6a32f3c012/USD305044.pdf']]},finish:{name:'Finish lane',kind:'finish',url:finishUrl,description:'A single receiving post feeds a closed-end finishing lane. The broad outer casing rests flat while the lane descends toward the finish.',references:[['Original finishing lane — six views','https://patentimages.storage.googleapis.com/18/a5/8e/243a0a6939e640/USD305043.pdf']]},split:{name:'Split track',kind:'split',url:splitUrl,description:'One inlet divides into two end drops. The junction walls rise above the ordinary rails, following the original switch-track design.',references:[['Original switch track — six views','https://patentimages.storage.googleapis.com/78/2b/83/98bee06c71fd4c/USD305045.pdf']]},'jump-run':{name:'Jump and landing',kind:'jump-run',url:jumpRunUrl,description:'Airborne transfer between the separate chute and catch tray. Both lower posts share a grid elevation.',references:[['Original jump','https://patentimages.storage.googleapis.com/42/da/3a/01c5275a13aafd/USD305443.pdf']]},jump:{name:'Jump chute',kind:'jump',url:jumpUrl,description:'A constant U section follows the descending J-shaped chute. The inlet sits two grid units above the lower support.',references:[['Original jump — top and side views','https://patentimages.storage.googleapis.com/42/da/3a/01c5275a13aafd/USD305443.pdf']]},landing:{
 name:'Landing ramp',kind:'landing',url:landingUrl,
 description:'Open front, semicircular backstop, and a terminal C-shaped drop. The post uses the common stacking grid.',
 references:[['Original landing design — seven views','https://patentimages.storage.googleapis.com/c0/ca/16/c56a5a964f816c/USD305046.pdf']],
}};
export const catalogPiece=pieces[new URLSearchParams(location.search).get('piece')??'landing']??pieces.landing;
// Studio inspection: keep the ground shadow, but do not let hard self-shadows
// masquerade as seams in the surface being reviewed. Normals remain fully lit.
export async function createCatalogPiece(){
 if(catalogPiece.kind==='start'){
  const [bodyUrl,rotorUrl]=await Promise.all([import('../generated/start-body.bin?url'),import('../generated/start-rotor.bin?url')]);
  const [body,rotor]=await Promise.all([loadPreviewMesh(bodyUrl.default),loadPreviewMesh(rotorUrl.default)]);
  const material=new THREE.MeshPhysicalNodeMaterial({color:0x075abe,roughness:.27,clearcoat:.16});
  const mesh=new THREE.Group(),gate=new THREE.Mesh(rotor,material),base=new THREE.Mesh(body,material);
  gate.name='start gate';gate.position.set(START.pivotX,START.pivotY,0);mesh.add(base,gate);
  for(const m of [base,gate]){m.castShadow=true;m.receiveShadow=false;}
  return {mesh,dispose(){body.dispose();rotor.dispose();material.dispose();}};
 }
 const geometry=await loadPreviewMesh(catalogPiece.url);
 const material=new THREE.MeshPhysicalNodeMaterial({color:0x075abe,roughness:.27,clearcoat:.16,clearcoatRoughness:.3});
 const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=false;
 mesh.name=catalogPiece.name;
 return {mesh,dispose(){geometry.dispose();material.dispose();}};
}
