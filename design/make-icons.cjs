const opentype = require('opentype.js'); const fs = require('fs');
const b = fs.readFileSync('node_modules/@fontsource/newsreader/files/newsreader-latin-800-normal.woff'); const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
// Build an SVG mark: a lowercase serif "c" centered in a square of size S.
function mark(S, bg, fg, glyphH, dot) {
  const g = font.getPath('c', 0, 0, 100);
  const bb = g.getBoundingBox();
  const scale = glyphH / (bb.y2 - bb.y1);
  const w = (bb.x2 - bb.x1) * scale, h = glyphH;
  const dotR = dot ? h * 0.13 : 0, gap = dot ? h * 0.08 : 0;
  const total = w + (dot ? gap + dotR * 2 : 0);
  const x0 = (S - total) / 2 - bb.x1 * scale, y0 = (S - h) / 2 - bb.y1 * scale + S * 0.005;
  const p = font.getPath('c', x0, y0, 100 * scale);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${bg}"/><path d="${p.toPathData(2)}" fill="${fg}"/>`;
  if (dot) svg += `<circle cx="${((S - total) / 2 + w + gap + dotR).toFixed(2)}" cy="${((S - h) / 2 + h - dotR + S * 0.005).toFixed(2)}" r="${dotR.toFixed(2)}" fill="${dot}"/>`;
  return svg + '</svg>';
}
fs.writeFileSync('site.svg', mark(180, '#141414', '#FFFFFF', 74, '#E0403A'));
fs.writeFileSync('site-plain.svg', mark(180, '#141414', '#FFFFFF', 80, null));
fs.writeFileSync('desk.svg', mark(180, '#B3261E', '#FFFFFF', 74, '#FFFFFF'));
// favicon: rounded square, as before, at 64
const fav = mark(64, '#141414', '#FFFFFF', 30, '#E0403A').replace('<rect width="64" height="64"', '<rect width="64" height="64" rx="14"');
fs.writeFileSync('favicon.svg', fav);
console.log(fav.length, 'bytes favicon');
