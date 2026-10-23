// Small item pictures for the inventory, market and item picker.

import { LEGENDARY_COLOR, type ItemType } from "./items";

const WOOD = "#6b4423";
const BRASS = "#c9a227";

// Draws an item inside a square of the given size. Shapes are drawn in a 64x64 box
// centred on the origin; weapons are tilted diagonally.
export function drawItemIcon(ctx: CanvasRenderingContext2D, type: ItemType, legendary: boolean, x: number, y: number, size: number): void {
  const metal = legendary ? "#ffd27a" : "#c8c8d0";
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.scale(size / 64, size / 64);
  if (legendary) {
    ctx.shadowColor = LEGENDARY_COLOR;
    ctx.shadowBlur = 12;
  }
  const blade = (start: number, end: number, half: number, tip: number) => {
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.moveTo(start, -half); ctx.lineTo(end, -half); ctx.lineTo(end + tip, 0); ctx.lineTo(end, half); ctx.lineTo(start, half);
    ctx.closePath();
    ctx.fill();
  };
  const hilt = (guardX: number, guardHalf: number, gripLen: number) => {
    ctx.shadowBlur = 0;
    ctx.fillStyle = BRASS;
    ctx.fillRect(guardX - 4, -guardHalf, 4, guardHalf * 2);
    ctx.beginPath();
    ctx.arc(guardX - 4 - gripLen - 3, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WOOD;
    ctx.fillRect(guardX - 4 - gripLen, -2.5, gripLen, 5);
  };

  switch (type) {
    case "sword":
      ctx.rotate(-Math.PI / 4);
      blade(-10, 18, 3.5, 7);
      hilt(-9, 10, 8);
      break;
    case "dagger":
      ctx.rotate(-Math.PI / 4);
      blade(-2, 12, 3, 6);
      hilt(-1, 8, 7);
      break;
    case "greatsword":
      ctx.rotate(-Math.PI / 4);
      blade(-12, 20, 5, 8);
      hilt(-11, 12, 12);
      break;
    case "axe":
      ctx.rotate(-Math.PI / 4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = WOOD;
      ctx.fillRect(-26, -2.5, 46, 5); // handle
      if (legendary) ctx.shadowBlur = 12;
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.moveTo(10, -4); ctx.lineTo(18, -16); ctx.quadraticCurveTo(28, 0, 18, 16); ctx.lineTo(10, 4);
      ctx.closePath();
      ctx.fill();
      break;
    case "spear":
      ctx.rotate(-Math.PI / 4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = WOOD;
      ctx.fillRect(-28, -2, 42, 4); // pole
      if (legendary) ctx.shadowBlur = 12;
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.moveTo(12, 0); ctx.quadraticCurveTo(19, -8, 28, 0); ctx.quadraticCurveTo(19, 8, 12, 0);
      ctx.fill();
      break;
    case "helmet":
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.arc(0, 4, 20, Math.PI, 0); // dome
      ctx.lineTo(20, 14); ctx.lineTo(-20, 14);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#2b1d18";
      ctx.fillRect(-12, 2, 24, 4); // eye slit
      ctx.fillRect(-2, 6, 4, 8); // nose guard gap
      break;
    case "shield":
      ctx.fillStyle = WOOD;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = metal;
      ctx.stroke(); // metal rim
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2); // boss
      ctx.fill();
      break;
    case "chestplate":
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.moveTo(-22, -16); ctx.lineTo(-8, -18); ctx.quadraticCurveTo(0, -10, 8, -18); ctx.lineTo(22, -16);
      ctx.lineTo(18, 0); ctx.lineTo(14, 20); ctx.lineTo(-14, 20); ctx.lineTo(-18, 0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(43,29,24,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -10); ctx.lineTo(0, 18); // centre ridge
      ctx.stroke();
      break;
    case "horseshoe":
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.strokeStyle = metal;
      ctx.beginPath();
      ctx.arc(0, -2, 16, Math.PI * 0.1, Math.PI * 0.9, true); // a U, opening downwards
      ctx.stroke();
      break;
    case "nails":
      ctx.fillStyle = metal;
      for (const dx of [-12, 0, 12]) {
        ctx.fillRect(dx - 1.5, -12, 3, 26); // shaft
        ctx.fillRect(dx - 5, -16, 10, 4); // head
      }
      break;
  }
  ctx.restore();
}
