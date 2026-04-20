import { applyStroke, parsePaints } from '../utils/color';
import { parseDimension } from '../utils/layout';
import { convertSvgPathToFigma } from '../utils/svg';
import { applyNodeFill, applyNodePosition } from './shared.js';
import type { NodeElement, NodeFactoryDeps, ParentNodeLike, VariableMap } from './types.js';

export async function createVector(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: ParentNodeLike = null
): Promise<VectorNode | RectangleNode> {
  const { imageCache } = deps;
  const width = parseDimension(element.width, 100);
  const height = parseDimension(element.height, 100);
  const pathData = element.geometry || element.d || element.pathData || element.path;

  if (pathData) {
    console.log(`[VECTOR] Creating vector "${element.name}" with path data (${pathData.length} chars)`);
    try {
      const convertedPath = convertSvgPathToFigma(pathData);

      if (convertedPath) {
        const vector = figma.createVector();

        try {
          vector.vectorPaths = [{ windingRule: element.fillRule === 'evenodd' ? 'EVENODD' : 'NONZERO', data: convertedPath }];
          console.log(`[VECTOR] ✓ Successfully created vector "${element.name}"`);
        } catch (pathError) {
          const errorMessage = pathError instanceof Error ? pathError.message : String(pathError);
          console.warn(`[VECTOR] ✗ Failed to set vector path for "${element.name}":`, errorMessage);
          console.warn('[VECTOR] Path data preview:', pathData.substring(0, 100) + '...');
          vector.remove();
          throw pathError;
        }

        if (width > 0 && height > 0) {
          vector.resize(width, height);
        }

        applyNodePosition(vector, element, parentNode);

        if (element.fill) {
          await applyNodeFill(vector, element.fill, variables, imageCache, element.name || element.id || 'vector');
        }

        if (element.stroke) {
          applyStroke(vector, element.stroke, variables, element.name || element.id);
        }

        return vector;
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.warn(`[VECTOR] ✗ Failed to parse geometry for "${element.name}":`, errorMessage);
    }
  } else {
    console.warn(`[VECTOR] ✗ No path data found for "${element.name}"`);
  }

  console.log(`[VECTOR] Creating placeholder rectangle for "${element.name}"`);
  const placeholder = figma.createRectangle();
  placeholder.name = element.name || 'Vector (placeholder)';
  placeholder.resize(width > 0 ? width : 20, height > 0 ? height : 20);
  placeholder.cornerRadius = 2;

  applyNodePosition(placeholder, element, parentNode);

  if (element.fill) {
    await applyNodeFill(placeholder, element.fill, variables, imageCache, element.name || element.id || 'vector-placeholder');
  } else {
    placeholder.fills = [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 }, opacity: 0.3 }];
  }

  if (element.stroke) {
    applyStroke(placeholder, element.stroke, variables, element.name || element.id);
  }

  if (pathData) {
    placeholder.setPluginData('originalGeometry', pathData);
  }
  return placeholder;
}

export async function createIconFont(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: ParentNodeLike = null
): Promise<VectorNode> {
  const width = parseDimension(element.width, 20);
  const height = parseDimension(element.height, 20);
  const iconName = element.iconFontName || 'circle';
  const iconFamily = element.iconFontFamily || 'lucide';

  console.log(`[ICON] Creating vector for icon: ${iconName} (${iconFamily})`);

  const vector = figma.createVector();
  vector.name = element.name || `Icon: ${iconName}`;
  vector.resize(width, height);

  applyNodePosition(vector, element, parentNode);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 3;

  const circlePath = `M ${centerX} ${centerY - radius} ` +
    `A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY} ` +
    `A ${radius} ${radius} 0 0 1 ${centerX} ${centerY + radius} ` +
    `A ${radius} ${radius} 0 0 1 ${centerX - radius} ${centerY} ` +
    `A ${radius} ${radius} 0 0 1 ${centerX} ${centerY - radius} Z`;

  try {
    vector.vectorPaths = [{
      windingRule: 'NONZERO',
      data: circlePath
    }];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[ICON] Failed to set vector path:', errorMessage);
  }

  if (element.fill) {
    const fills = parsePaints(element.fill, variables, element.name || element.id);
    if (fills.length > 0) {
      vector.fills = fills;
    } else {
      vector.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    }
  } else {
    vector.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
  }

  vector.setPluginData('iconFontName', iconName);
  vector.setPluginData('iconFontFamily', iconFamily);
  vector.setPluginData('isIconPlaceholder', 'true');
  vector.setPluginData('pendingIconFetch', 'true');

  console.log(`[ICON] Requesting icon fetch from UI: ${iconName}`);
  figma.ui.postMessage({
    type: 'fetch-icon',
    iconName,
    iconFamily,
    nodeId: vector.id
  });

  return vector;
}
