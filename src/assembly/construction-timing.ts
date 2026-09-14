const EASE_SECONDS=1.5,END_SPEED=.5;
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};

/** Ease the shared animation clock, including the spacing between pickups.
 * Individual carries already stop at their endpoints, so keep this subtle. */
export function createConstructionTiming(){
 let elapsed=0,endingAt:number|undefined,factor=END_SPEED;
 return {
  inspect:()=>({elapsed,factor,endingAt}),
  advance(dt:number,speed:number,remaining:number){
   // The area under a smooth 1 -> END_SPEED ramp is its average speed
   // times its duration. Start braking with that much animation left.
   if(endingAt===undefined&&remaining<=speed*EASE_SECONDS*(1+END_SPEED)/2)endingAt=elapsed;
   const midpoint=elapsed+dt/2;
   const start=END_SPEED+(1-END_SPEED)*smooth(midpoint/EASE_SECONDS);
   const end=endingAt===undefined?1:1-(1-END_SPEED)*smooth((midpoint-endingAt)/EASE_SECONDS);
   factor=Math.min(start,end);elapsed+=dt;
   return dt*speed*factor;
  },
 };
}
