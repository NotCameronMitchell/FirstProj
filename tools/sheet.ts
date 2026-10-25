// Dev-only page that renders every sprite at 6x for visual review.
import { SPRITE_IDS, getSprite } from '../src/render/sprites';

for (const id of SPRITE_IDS) {
  const s = getSprite(id);
  const box = document.createElement('div');
  const c = document.createElement('canvas');
  const scale = s.w > 16 ? 5 : 6;
  c.width = s.w * scale;
  c.height = s.h * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.normal, 0, 0, c.width, c.height);
  box.append(c, id);
  document.body.append(box);
}
