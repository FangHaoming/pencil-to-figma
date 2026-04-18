import { parseColor } from '../utils/color';
import { applyImageFillToNode } from '../utils/image';
import type { NodeElement, ParentNodeLike, VariableMap } from './types.js';

type PositionOptions = {
  logApplied?: boolean;
  logSkipped?: boolean;
};

type FillOptions = {
  emptyOnColorMiss?: boolean;
};

export function getElementLabel(element: Pick<NodeElement, 'name' | 'id'>): string {
  return element.name || element.id || 'Unnamed';
}

export function isInAutoLayout(parentNode: ParentNodeLike): boolean {
  return Boolean(parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE');
}

export function applyNodePosition<T extends SceneNode>(
  node: T,
  element: Pick<NodeElement, 'x' | 'y' | 'name' | 'id'>,
  parentNode: ParentNodeLike,
  options: PositionOptions = {}
): boolean {
  const { logApplied = false, logSkipped = false } = options;
  const autoLayoutChild = isInAutoLayout(parentNode);

  if (!autoLayoutChild) {
    if (element.x !== undefined && !isNaN(element.x)) {
      node.x = element.x;
      if (logApplied) {
        console.log(`  → Set x=${element.x} for ${getElementLabel(element)}`);
      }
    }
    if (element.y !== undefined && !isNaN(element.y)) {
      node.y = element.y;
      if (logApplied) {
        console.log(`  → Set y=${element.y} for ${getElementLabel(element)}`);
      }
    }
  } else if (logSkipped) {
    console.log(`  → Skipped x,y for ${getElementLabel(element)} (in auto-layout parent)`);
  }

  return autoLayoutChild;
}

export async function applyNodeFill<T extends GeometryMixin & SceneNode>(
  node: T,
  fillValue: NodeElement['fill'],
  variables: VariableMap,
  imageCache: Map<string, string>,
  label: string,
  options: FillOptions = {}
): Promise<boolean> {
  const { emptyOnColorMiss = false } = options;

  if (!fillValue) {
    return false;
  }

  const hasImageFill = await applyImageFillToNode(node, fillValue, label, imageCache);
  if (hasImageFill) {
    return true;
  }

  const fill = parseColor(fillValue, variables, label);
  if (fill) {
    node.fills = [fill];
  } else if (emptyOnColorMiss) {
    node.fills = [];
  }

  return false;
}
