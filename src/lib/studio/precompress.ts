const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.85;

export async function precompressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (typeof createImageBitmap !== "function") return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
      );
      if (!blob) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
    } finally {
      bitmap.close();
    }
  } catch {
    // ponytail: unreadable image (HEIC on old Safari etc.) — upload as-is, server sharp is the fallback
    return file;
  }
}
