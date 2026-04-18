import { applyStroke } from '../utils/color';
import { parseCornerRadius, parseDimension } from '../utils/layout';
import { applyNodeFill, applyNodePosition } from './shared.js';
import type { NodeElement, NodeFactoryDeps, ParentNodeLike, VariableMap } from './types.js';

export async function createRectangle(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: ParentNodeLike = null
): Promise<RectangleNode> {
  const { imageCache } = deps;
  const rect = figma.createRectangle();

  const width = parseDimension(element.width, 100);
  const height = parseDimension(element.height, 100);
  rect.resize(width, height);

  applyNodePosition(rect, element, parentNode);

  if (element.fill) {
    await applyNodeFill(rect, element.fill, variables, imageCache, element.name || element.id || 'rectangle', {
      emptyOnColorMiss: true
    });
  } else {
    rect.fills = [];
  }

  if (element.stroke) {
    applyStroke(rect, element.stroke, variables, element.name || element.id);
  }

  if (element.cornerRadius !== undefined) {
    const radius = parseCornerRadius(element.cornerRadius, variables);
    if (Array.isArray(radius)) {
      rect.topLeftRadius = radius[0];
      rect.topRightRadius = radius[1];
      rect.bottomRightRadius = radius[2];
      rect.bottomLeftRadius = radius[3];
    } else {
      rect.cornerRadius = radius;
    }
  }

  return rect;
}

export async function createEllipse(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: ParentNodeLike = null
): Promise<EllipseNode> {
  const { imageCache } = deps;
  const ellipse = figma.createEllipse();

  const width = parseDimension(element.width, 100);
  const height = parseDimension(element.height, element.type === 'circle' ? width : 100);
  ellipse.resize(width, height);

  applyNodePosition(ellipse, element, parentNode);

  if (element.fill) {
    await applyNodeFill(ellipse, element.fill, variables, imageCache, element.name || element.id || 'ellipse');
  }

  if (element.stroke) {
    applyStroke(ellipse, element.stroke, variables, element.name || element.id);
  }

  return ellipse;
}

export function createLine(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: ParentNodeLike = null
): LineNode {
  const line = figma.createLine();

  const width = parseDimension(element.width, 100);
  line.resize(width, 0);

  applyNodePosition(line, element, parentNode);

  if (element.stroke) {
    applyStroke(line, element.stroke, variables, element.name || element.id);
  }

  return line;
}
