export function loadPaymentImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "Could not decode the QR image. Choose a valid PNG, JPG or WebP image.",
        ),
      );
    image.src = source;
  });
}

export async function readQrImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPG or WebP QR image.");
  if (!file.size || file.size > 3 * 1024 * 1024)
    throw new Error("Choose a non-empty QR image no larger than 3 MB.");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("Could not read the selected QR image."));
    reader.readAsDataURL(file);
  });
  await loadPaymentImage(source);
  return source;
}

export function containImage(width: number, height: number, box: number) {
  const scale = box / Math.max(width, height);
  return { width: width * scale, height: height * scale };
}
