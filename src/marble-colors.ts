/** Shuffle a contrasting palette so a filled starting gate is easy to follow. */
export function shuffledMarbleColors(){
 const colors=[0xe44d2e,0x2785df,0xf5c52b,0x34ae72,0xa354d5,0xf078b0];
 for(let i=colors.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[colors[i],colors[j]]=[colors[j],colors[i]];}
 return colors;
}
