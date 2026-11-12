import sharp from 'sharp';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const input = path.join(root, 'artwork/betterfilms-logo-rounded.png');
for (const size of [16, 32, 48, 128]) {
  await sharp(input).resize({ width: size, height: size }).png().toFile(path.join(root, `extension/icons/${size}.png`));
}
console.log('Exported rounded BetterFilms icons: 16, 32, 48, 128px.');
