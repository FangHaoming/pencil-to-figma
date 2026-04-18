import type { NodeElement, NodeFactoryDeps } from './types.js';

type CopySourceNode = {
  fills?: ReadonlyArray<Paint> | PluginAPI['mixed'];
  strokes?: ReadonlyArray<Paint> | PluginAPI['mixed'];
  strokeWeight?: number | PluginAPI['mixed'];
  strokeAlign?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
  cornerRadius?: number | PluginAPI['mixed'];
  opacity?: number;
  clipsContent?: boolean;
  effects?: ReadonlyArray<Effect>;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
};

type CopyTargetNode = {
  fills?: ReadonlyArray<Paint> | PluginAPI['mixed'];
  strokes?: ReadonlyArray<Paint> | PluginAPI['mixed'];
  strokeWeight?: number | PluginAPI['mixed'];
  strokeAlign?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
  cornerRadius?: number | PluginAPI['mixed'];
  opacity?: number;
  clipsContent?: boolean;
  effects?: ReadonlyArray<Effect>;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
};

export async function createInstances(
  children: NodeElement[] | undefined,
  variables: Record<string, unknown> | undefined,
  deps: NodeFactoryDeps
): Promise<void> {
  const { componentMap } = deps;
  if (!children || !Array.isArray(children)) return;

  let instanceCount = 0;
  for (const element of children) {
    if (element.type === 'ref' && element.enabled !== false && element.ref) {
      const component = componentMap.get(element.ref);
      if (component) {
        const instance = component.createInstance();
        instance.name = element.name || 'Instance';

        if (element.x !== undefined && !isNaN(element.x)) instance.x = element.x;
        if (element.y !== undefined && !isNaN(element.y)) instance.y = element.y;

        if (element.id) {
          instance.setPluginData('pencilId', element.id);
        }

        if (element.descendants) {
          applyOverrides(instance, element.descendants);
        }

        figma.currentPage.appendChild(instance);
        instanceCount++;

        if (instanceCount % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    }

    if (element.children) {
      await createInstances(element.children, variables, deps);
    }
  }
}

function applyOverrides(instance: InstanceNode, descendants: Record<string, Record<string, unknown>>): void {
  for (const [id, overrides] of Object.entries(descendants)) {
    const child = findChildByPencilId(instance, id);
    if (child) {
      if (overrides.content !== undefined && child.type === 'TEXT') {
        child.characters = String(overrides.content);
      }
      if (overrides.enabled !== undefined) {
        child.visible = Boolean(overrides.enabled);
      }
    }
  }
}

function findChildByPencilId(node: BaseNode & PluginDataMixin, pencilId: string): SceneNode | null {
  if (node.getPluginData('pencilId') === pencilId) {
    return node as SceneNode;
  }

  if ('children' in node) {
    for (const child of node.children) {
      const found = findChildByPencilId(child, pencilId);
      if (found) return found;
    }
  }

  return null;
}

export function copyNodeProperties(from: CopySourceNode, to: CopyTargetNode): void {
  if (from.fills !== undefined && from.fills !== figma.mixed) to.fills = from.fills;
  if (from.strokes !== undefined && from.strokes !== figma.mixed) to.strokes = from.strokes;
  if (typeof from.strokeWeight === 'number') to.strokeWeight = from.strokeWeight;
  if (from.strokeAlign !== undefined) to.strokeAlign = from.strokeAlign;
  if (typeof from.cornerRadius === 'number') to.cornerRadius = from.cornerRadius;
  if (from.opacity !== undefined) to.opacity = from.opacity;

  if (from.clipsContent !== undefined) to.clipsContent = from.clipsContent;

  if (from.effects && from.effects.length > 0) {
    const hasClipsEnabled = Boolean(to.clipsContent);

    const adjustedEffects = from.effects.map((effect) => {
      if ((effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && !hasClipsEnabled && effect.spread) {
        return {
          ...effect,
          spread: 0
        };
      }
      return effect;
    });

    to.effects = adjustedEffects;
  }

  if (from.layoutMode && from.layoutMode !== 'NONE') {
    to.layoutMode = from.layoutMode;
    to.itemSpacing = from.itemSpacing;
    to.paddingTop = from.paddingTop;
    to.paddingRight = from.paddingRight;
    to.paddingBottom = from.paddingBottom;
    to.paddingLeft = from.paddingLeft;
    to.primaryAxisAlignItems = from.primaryAxisAlignItems;
    to.counterAxisAlignItems = from.counterAxisAlignItems;
  }
}
