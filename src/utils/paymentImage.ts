export function loadPaymentImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error("QR image loading timed out. Please retry."));
    }, 15000);
    image.onload = () => {
      clearTimeout(timer);
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > 16000000
      )
        reject(new Error("Choose a QR image with at most 16 million pixels."));
      else resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(
        new Error(
          "Could not decode the QR image. Choose a valid PNG, JPG or WebP image.",
        ),
      );
    };
    image.crossOrigin = "anonymous";
    image.src = source;
  });
}

export async function readQrImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPG or WebP QR image.");
  if (!file.size || file.size > 3 * 1024 * 1024)
    throw new Error("Choose a non-empty QR image no larger than 3 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const signatureMatches =
    file.type === "image/png"
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, n) => bytes[n] === byte)
      : file.type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!signatureMatches)
    throw new Error("The QR image data does not match its image format.");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onabort = () =>
      reject(new Error("QR image reading was cancelled. Please retry."));
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
