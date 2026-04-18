import type { PenFill } from '../../shared/pen';
import type { ExportAsset, ExportContext } from '../export/types.js';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

type PenImageFill = Extract<PenFill, { type: 'image' }>;
type PostMessageSafeValue =
  | null
  | string
  | number
  | boolean
  | PostMessageSafeValue[]
  | { [key: string]: PostMessageSafeValue };

export function normalizeImagePath(path: unknown): string {
  if (!path || typeof path !== 'string') return '';
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function getImageDataFromCache(cache: Map<string, string>, path: unknown): string | null {
  if (!path || typeof path !== 'string') return null;
  if (path.startsWith('data:')) return path;

  const normalizedPath = normalizeImagePath(path);
  const fileName = normalizedPath.split('/').pop();

  return (
    cache.get(path) ||
    cache.get(normalizedPath) ||
    cache.get(`./${normalizedPath}`) ||
    (fileName ? cache.get(fileName) : null) ||
    null
  );
}

export function getImageFillSpec(fillValue: unknown): PenImageFill | null {
  if (!fillValue) return null;

  if (Array.isArray(fillValue)) {
    for (const fill of fillValue) {
      const imageFill = getImageFillSpec(fill);
      if (imageFill) return imageFill;
    }
    return null;
  }

  if (
    typeof fillValue === 'object' &&
    fillValue !== null &&
    'type' in fillValue &&
    fillValue.type === 'image' &&
    'url' in fillValue &&
    typeof fillValue.url === 'string'
  ) {
    return fillValue as PenImageFill;
  }

  return null;
}

export function mapPenImageModeToFigma(mode: unknown): 'FIT' | 'FILL' {
  if (mode === 'fit') return 'FIT';
  if (mode === 'fill') return 'FILL';
  return 'FILL';
}

export function mapFigmaImageModeToPen(scaleMode: 'FIT' | 'FILL' | 'STRETCH' | 'CROP' | string): 'fit' | 'fill' | 'stretch' {
  if (scaleMode === 'FIT') return 'fit';
  if (scaleMode === 'FILL' || scaleMode === 'CROP') return 'fill';
  return 'stretch';
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const byte1 = bytes[i];
    const byte2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const byte3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (byte1 << 16) | (byte2 << 8) | byte3;

    result += BASE64_CHARS[(triplet >> 18) & 63];
    result += BASE64_CHARS[(triplet >> 12) & 63];
    result += i + 1 < bytes.length ? BASE64_CHARS[(triplet >> 6) & 63] : '=';
    result += i + 2 < bytes.length ? BASE64_CHARS[triplet & 63] : '=';
  }

  return result;
}

export function base64ToBinaryString(base64: string): string {
  const cleanBase64 = String(base64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  let result = '';

  for (let i = 0; i < cleanBase64.length; i += 4) {
    const enc1 = BASE64_CHARS.indexOf(cleanBase64[i]);
    const enc2 = BASE64_CHARS.indexOf(cleanBase64[i + 1]);
    const enc3 = cleanBase64[i + 2] === '=' ? 64 : BASE64_CHARS.indexOf(cleanBase64[i + 2]);
    const enc4 = cleanBase64[i + 3] === '=' ? 64 : BASE64_CHARS.indexOf(cleanBase64[i + 3]);

    const triplet = ((enc1 & 63) << 18) | ((enc2 & 63) << 12) | ((enc3 & 63) << 6) | (enc4 & 63);

    result += String.fromCharCode((triplet >> 16) & 255);
    if (enc3 !== 64) result += String.fromCharCode((triplet >> 8) & 255);
    if (enc4 !== 64) result += String.fromCharCode(triplet & 255);
  }

  return result;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = base64ToBinaryString(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function detectImageMimeType(bytes: Uint8Array | null | undefined): string {
  if (!bytes || bytes.length < 12) return 'image/png';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/png';
}

export function mimeTypeToExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

export function sanitizeFileNamePart(value: unknown, fallback = 'image'): string {
  const sanitized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || fallback;
}

export async function applyImageFillToNode(
  node: GeometryMixin,
  fillValue: unknown,
  context: string | undefined,
  imageCache: Map<string, string>
): Promise<boolean> {
  const imageFill = getImageFillSpec(fillValue);
  if (!imageFill) return false;

  const imageData = getImageDataFromCache(imageCache, imageFill.url);
  if (!imageData) {
    console.warn(`[IMAGE] ⚠️ Image not found in cache: ${imageFill.url}` + (context ? ` for ${context}` : ''));
    return false;
  }

  try {
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
    const imageBytes = base64ToUint8Array(base64Data);
    const image = figma.createImage(imageBytes);
    node.fills = [{
      type: 'IMAGE',
      scaleMode: mapPenImageModeToFigma(imageFill.mode),
      imageHash: image.hash
    }];
    return true;
  } catch (error) {
    console.error(`[IMAGE] ❌ Failed to create image fill from ${imageFill.url}:`, error);
    return false;
  }
}

export async function getExportImageAsset(
  fill: ImagePaint | undefined,
  node: SceneNode & ExportMixin,
  exportContext: ExportContext | null
): Promise<ExportAsset | null> {
  if (!exportContext || !fill || fill.type !== 'IMAGE' || !fill.imageHash || fill.visible === false) {
    return null;
  }

  const imageAssetKey = `image:${fill.imageHash}`;
  if (exportContext.assets.has(imageAssetKey)) {
    return exportContext.assets.get(imageAssetKey) ?? null;
  }

  console.log('[EXPORT] getExportImageAsset', { nodeId: node.id, nodeType: node.type, imageHash: fill.imageHash });
  const image = figma.getImageByHash(fill.imageHash);
  if (image && typeof image.getBytesAsync === 'function') {
    try {
      const bytes = await image.getBytesAsync();
      const mimeType = detectImageMimeType(bytes);
      const extension = mimeTypeToExtension(mimeType);
      const fileName = `${sanitizeFileNamePart(node.name || node.type || 'image')}-${fill.imageHash.slice(0, 8)}.${extension}`;
      const asset = {
        fileName,
        mimeType,
        dataUrl: `data:${mimeType};base64,${uint8ArrayToBase64(bytes)}`
      };

      exportContext.assets.set(imageAssetKey, asset);
      return asset;
    } catch (error) {
      console.warn('[EXPORT] getBytesAsync failed', { nodeId: node.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (typeof node.exportAsync === 'function') {
    try {
      const bytes = await node.exportAsync({ format: 'PNG' });
      const assetKey = `node:${node.id}`;
      const asset = {
        fileName: `${sanitizeFileNamePart(node.name || node.type || 'image')}-${sanitizeFileNamePart(node.id, 'node')}.png`,
        mimeType: 'image/png',
        dataUrl: `data:image/png;base64,${uint8ArrayToBase64(bytes)}`
      };
      exportContext.assets.set(assetKey, asset);
      return asset;
    } catch (error) {
      console.warn('[EXPORT] exportAsync fallback failed', { nodeId: node.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  console.warn('[EXPORT] getExportImageAsset: no asset for node', node.id);
  return null;
}

export async function exportNodeToPngAsset(
  node: SceneNode & ExportMixin,
  exportContext: ExportContext | null
): Promise<ExportAsset | null> {
  if (!exportContext || typeof node.exportAsync !== 'function') {
    return null;
  }

  const assetKey = `raster:${node.id}`;
  if (exportContext.assets.has(assetKey)) {
    return exportContext.assets.get(assetKey) ?? null;
  }

  try {
    const bytes = await node.exportAsync({ format: 'PNG' });
    const asset = {
      fileName: `${sanitizeFileNamePart(node.name || node.type || 'image')}-${sanitizeFileNamePart(node.id, 'node')}.png`,
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${uint8ArrayToBase64(bytes)}`
    };
    exportContext.assets.set(assetKey, asset);
    return asset;
  } catch (error) {
    console.warn('[EXPORT] exportNodeToPngAsset failed', { nodeId: node.id, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export function makePostMessageSafe(value: unknown): PostMessageSafeValue | undefined {
  if (value === null) return null;

  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'symbol' || typeof value === 'function' || typeof value === 'undefined') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => makePostMessageSafe(item))
      .filter((item) => item !== undefined);
  }

  if (typeof value === 'object' && value !== null) {
    const safeObject: Record<string, PostMessageSafeValue> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const safeValue = makePostMessageSafe(nestedValue);
      if (safeValue !== undefined) {
        safeObject[key] = safeValue;
      }
    }
    return safeObject;
  }

  return undefined;
}
