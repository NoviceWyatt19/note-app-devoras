/**
 * Generates a unique image filename from a MIME type and the current timestamp.
 * Example: blob.type "image/jpeg" → "img_1721234567890.jpg"
 */
export function generateImageFileName(mimeType: string): string {
  const ext = (mimeType.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
  return `img_${Date.now()}.${ext}`;
}

