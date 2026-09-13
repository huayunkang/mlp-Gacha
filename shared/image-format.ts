export const imageMimes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export function validImage(data: Uint8Array, mime: string) {
  const ascii = (a: number, b: number) =>
    String.fromCharCode(...data.subarray(a, b));
  return mime === "image/jpeg"
    ? data[0] === 255 && data[1] === 216 && data[2] === 255
    : mime === "image/png"
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => data[i] === n)
      : mime === "image/webp"
        ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
        : mime === "image/gif"
          ? /^GIF8[79]a$/.test(ascii(0, 6))
          : false;
}
