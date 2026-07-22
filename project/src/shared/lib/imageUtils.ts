/**
 * Generates a unique image filename from a MIME type and the current timestamp.
 * Example: blob.type "image/jpeg" → "img_1721234567890.jpg"
 */
export function generateImageFileName(mimeType: string): string {
  const ext = (mimeType.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
  return `img_${Date.now()}.${ext}`;
}

/**
 * Converts a local absolute filesystem path to an `asset://` URL that Tauri 2's
 * webview can load as an image source.
 *
 * Tauri 2 blocks direct `file://` access from the webview for security reasons.
 * The `asset://` protocol (enabled via `assetProtocol` in tauri.conf.json) is the
 * recommended workaround. In a regular browser (non-Tauri), falls back to the raw path.
 *
 * Usage:
 *   const src = await toAssetUrl('/Users/wyattkim/workspace/assets/images/foo.png');
 *   // → "asset://localhost/Users/wyattkim/workspace/assets/images/foo.png"
 */
export async function toAssetUrl(absolutePath: string): Promise<string> {
  const isTauri =
    typeof window !== 'undefined' &&
    ((window as any).__TAURI__ !== undefined ||
      (window as any).__TAURI_INTERNALS__ !== undefined);

  if (isTauri) {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    return convertFileSrc(absolutePath);
  }
  return absolutePath;
}
