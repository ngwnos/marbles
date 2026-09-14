import {TRACK,CONNECTOR} from '../src/pieces/marbleworks-spec';
import {loadSolidKernel} from '../src/pieces/solid-kernel';
import {buildPaddleBody,buildPaddleRotor,paddleBodyGeometry,paddleFloor,paddleSection,PADDLE,paddleAxleY} from '../src/pieces/paddle-wheel';
import {angleWeightedNormals} from '../src/geometry/mesh-normals';
import {solidToGeometry} from '../src/pieces/solid-geometry';
import {encodePreviewMesh} from '../src/geometry/preview-mesh';
import {auditExitBore} from '../tests/exit-bore';
import {auditRenderMesh} from '../tests/mesh-quality';

const started=performance.now(),kernel=await loadSolidKernel();
const body=buildPaddleBody(kernel),rotor=buildPaddleRotor(kernel);
try {
  for(const [name,solid] of [['body',body],['rotor',rotor]] as const){
    if(solid.status()!=='NoError')throw new Error(`${name}: ${solid.status()}`);
    const parts=solid.decompose();const count=parts.length;parts.forEach(p=>p.delete());
    if(count!==1)throw new Error(`${name}: ${count} disconnected components`);
  }
  const intersection=body.intersect(rotor),overlap=intersection.volume();intersection.delete();
  if(Math.abs(overlap)>.001)throw new Error(`Wheel intersects body by ${overlap} mm³`);
  let rotationProbes=0;
  for(const angle of [7.5,15,22.5,30]) {
    const local=rotor.translate([-PADDLE.x,-paddleAxleY,-PADDLE.z]);
    const rotated=local.rotate([0,0,angle]);local.delete();
    const placed=rotated.translate([PADDLE.x,paddleAxleY,PADDLE.z]);rotated.delete();
    const contact=body.intersect(placed);placed.delete();const volume=contact.volume();contact.delete();
    if(Math.abs(volume)>.001)throw new Error(`Wheel binds at ${angle} degrees: ${volume} mm³`);
    rotationProbes++;
  }
  console.log(auditExitBore(body,{x:69,z:0,direction:Math.PI}));
  // A deeper bed must still descend continuously into the lower run.
  for(let x=-60;x<65;x+=.1)if(paddleFloor(x+.1)>paddleFloor(x)+1e-6)
    throw new Error(`Uphill bed segment at ${x}`);
  let bedProbes=0;
  for(let x=-56;x<65;x+=2){
    const y=paddleFloor(x),hits=body.rayCast([x,y+.25,-24],[x,y-.25,-24]);
    if(hits.length!==1||Math.abs(hits[0].position[1]-y)>.04)throw new Error(`Chute bed discontinuity at ${x}`);
    bedProbes++;
  }
  // Sample both rolled crests in the swept frame, including the steep descent.
  for(const x of [-50,-45,-40,-35,-30,-25,-20])for(const side of [-1,1]){
    const p=paddleSection(x,TRACK.channelDepth+CONNECTOR.wall/2);
    const hits=body.rayCast([p.x,p.y+1,-24+side*10.75],[p.x,p.y-1,-24+side*10.75]);
    if(!hits.length||Math.abs(hits[0].position[1]-p.y)>.08)
      throw new Error(`Paddle section mismatch at ${x}, side ${side}`);
  }
  const bodyGeometry=paddleBodyGeometry(body),wheelGeometry=angleWeightedNormals(solidToGeometry(rotor));
  // At radius 28, each spoke must reach an outward point, while the adjacent
  // pocket valley must remain empty. This catches a half-pocket phase error.
  for(let i=0;i<6;i++)for(const offset of [0,Math.PI/12]) {
    const angle=i*Math.PI/3+offset;
    const x=PADDLE.x+28*Math.cos(angle),y=paddleAxleY+28*Math.sin(angle);
    const hits=rotor.rayCast([x,y,PADDLE.z-15],[x,y,PADDLE.z+15]);
    if((hits.length>0)!==(offset===0))throw new Error(`Spoke/pocket alignment mismatch at ${angle}`);
  }
  // Check the finished rotor, including spokes and hub, against every pocket.
  const vertices=wheelGeometry.getAttribute('position');
  let maxPocketProtrusion=0;
  for(let i=0;i<vertices.count;i++) {
    const x=vertices.getX(i)-PADDLE.x,y=vertices.getY(i)-paddleAxleY;
    const angle=Math.atan2(y,x),step=2*Math.PI/PADDLE.pockets;
    const pocketAngle=angle-step/2;
    const delta=pocketAngle-step*Math.round(pocketAngle/step);
    const boundary=35*Math.cos(delta)-Math.sqrt(9.5**2-(35*Math.sin(delta))**2);
    maxPocketProtrusion=Math.max(maxPocketProtrusion,Math.hypot(x,y)-boundary);
  }
  if(maxPocketProtrusion>.01)throw new Error(`Rotor protrudes through a pocket by ${maxPocketProtrusion} mm`);
  console.log({maxPocketProtrusion});
  console.log({body:auditRenderMesh(body,bodyGeometry),wheel:auditRenderMesh(rotor,wheelGeometry)});
  await Bun.write(new URL('../src/generated/paddle-body.bin',import.meta.url),encodePreviewMesh(bodyGeometry));
  await Bun.write(new URL('../src/generated/paddle-wheel.bin',import.meta.url),encodePreviewMesh(wheelGeometry));
  console.log({bedProbes,rotationProbes,overlap,axleY:paddleAxleY,pockets:PADDLE.pockets,bodyTriangles:body.numTri(),wheelTriangles:rotor.numTri(),seconds:(performance.now()-started)/1000});
  bodyGeometry.dispose();wheelGeometry.dispose();
}finally{body.delete();rotor.delete();}
