import {COIL} from './pieces/coil';
import {EXTENSION} from './pieces/extension';
import {START} from './pieces/start';
import {PART_UNITS,connectorLevels} from './pieces/marbleworks-spec';
export type ComponentKind='paddle'|'ramp'|'funnel'|'snake'|'intersection'|'spacer'|'maze'|'bumper'|'base'|'landing'|'jump'|'jump-run'|'split'|'finish'|'passing'|'hairpin'|'start'|'extension'|'coupler'|'starter-funnel'|'coil';
const span=PART_UNITS.portSpan,arm=span/Math.sqrt(3);
const dropY=(units=0)=>connectorLevels(units).top+20;
export const DROP_PORTS:Record<ComponentKind,number[][]>={
 coil:[[-COIL.radius,dropY(COIL.inletUnits),0]],'starter-funnel':[[25,90,0]],coupler:[[0,dropY(),0]],extension:[[0,EXTENSION.height+20,0]],start:Array.from({length:START.lanes},(_,i)=>[START.pivotX-8,START.pivotY+24,(i-2.5)*START.lanePitch]),hairpin:[[-span/2,dropY(1),0]],passing:[[-span/2,dropY(),0]],finish:[[0,dropY(),0]],split:[[arm,dropY(),0]],'jump-run':[[-69,dropY(2),0]],jump:[[-69,dropY(2),0]],landing:[[35,65,15]],base:[[-12,dropY(),0]],bumper:[[-span/2,dropY(),0]],maze:[[-span/2,dropY(),0]],paddle:[[-69,dropY(1),-24]],ramp:[[-69,dropY(),-24]],funnel:[[-Math.sqrt(span*span-33*33),dropY(1),-33]],
 snake:[[-span/2,dropY(),0]],intersection:[[-arm/2,dropY(),arm*Math.sqrt(3)/2],[-arm/2,dropY(),-arm*Math.sqrt(3)/2]],spacer:[[0,dropY(),0]],
};
