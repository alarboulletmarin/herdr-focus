export const imageFile = name => /\.(png|jpe?g|webp|gif)$/i.test(name);

export function validateImage(bytes) {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Choose an image smaller than 8 MB.");
  const starts = values => values.every((v, i) => bytes[i] === v);
  const png = starts([137, 80, 78, 71, 13, 10, 26, 10]);
  const jpeg = starts([255, 216, 255]);
  const gif = starts([71, 73, 70, 56]);
  const webp = starts([82, 73, 70, 70]) && [87, 69, 66, 80].every((v, i) => bytes[i + 8] === v);
  if (!(png || jpeg || gif || webp)) throw new Error("Use a PNG, JPEG, WebP or GIF image.");
}
