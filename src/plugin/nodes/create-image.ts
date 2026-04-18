import { parseColor } from '../utils/color';
import { base64ToUint8Array, getImageDataFromCache } from '../utils/image';
import { parseDimension } from '../utils/layout';
import { applyNodeFill, applyNodePosition } from './shared.js';
import type { NodeElement, NodeFactoryDeps, ParentNodeLike, VariableMap } from './types.js';

export async function createImage(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: ParentNodeLike = null
): Promise<FrameNode> {
  const { imageCache } = deps;
  const frame = figma.createFrame();
  frame.name = element.name || 'Image';

  const width = parseDimension(element.width, 100);
  const height = parseDimension(element.height, 100);
  frame.resize(width, height);

  applyNodePosition(frame, element, parentNode);

  let appliedImageFill = false;

  if (element.fill) {
    appliedImageFill = await applyNodeFill(frame, element.fill, variables, imageCache, element.name || element.id || 'image');
  }

  if (!appliedImageFill) {
    if (element.src) {
      console.log(`[IMAGE] Looking for image: ${element.src}`);
      const imageData = getImageDataFromCache(imageCache, element.src);
      if (imageData) {
        try {
          console.log(`[IMAGE] Found image data for: ${element.src}, loading...`);
          const imageBytes = base64ToUint8Array(imageData.split(',')[1] || '');
          const image = figma.createImage(imageBytes);
          frame.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
          console.log(`[IMAGE] ✅ Successfully loaded image: ${element.src}`);
        } catch (e) {
          console.error(`[IMAGE] ❌ Failed to load image ${element.src}:`, e);
        }
      } else {
        console.warn(`[IMAGE] ⚠️ Image not found in cache: ${element.src}. Make sure to select the images folder.`);
      }
    } else {
      console.warn('[IMAGE] ⚠️ Image element has no src property');
    }
  }

  if (element.fill && !appliedImageFill) {
    const fill = parseColor(element.fill, variables, element.name || element.id);
    if (fill) {
      frame.fills = [fill];
    }
  }

  return frame;
}
