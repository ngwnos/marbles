// The four plastic colors are independent of the part's shape.
export const PIECE_COLORS=[0xf2bf24,0x188c65,0x0960c8,0xd94248] as const;

export function randomPieceColor(previous?:number):number{
 const choices=PIECE_COLORS.filter(color=>color!==previous);
 return choices[Math.floor(Math.random()*choices.length)];
}

export function restorePieceColor(color:unknown):number{
 return PIECE_COLORS.some(c=>c===color)?color as number:randomPieceColor();
}

// Opposite entries pair yellow with blue and green with red. Moving parts
// remain visibly separate even when the body is assigned a different color.
export function pieceAccentColor(color:number):number{
 const index=PIECE_COLORS.findIndex(c=>c===color);
 return PIECE_COLORS[(Math.max(0,index)+2)%PIECE_COLORS.length];
}
