import { applyEffect, applyStroke } from '../utils/color';
import {
  mapAlignItems,
  mapJustifyContent,
  parseCornerRadius,
  parseDimension
} from '../utils/layout';
import { applyNodeFill, applyNodePosition } from './shared.js';
import type { NodeElement, NodeFactoryDeps, ParentNodeLike, VariableMap } from './types.js';

export async function createFrame(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: ParentNodeLike = null
): Promise<FrameNode> {
  const { imageCache } = deps;
  const frame = figma.createFrame();

  if (element.justifyContent || element.alignItems || element.gap !== undefined) {
    console.log('Creating frame:', element.name, 'layout:', element.layout, 'justifyContent:', element.justifyContent, 'alignItems:', element.alignItems, 'gap:', element.gap);
  }

  let layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' = 'NONE';
  if (element.layout === 'horizontal') {
    layoutMode = 'HORIZONTAL';
  } else if (element.layout === 'vertical') {
    layoutMode = 'VERTICAL';
  } else if (element.layout === 'none') {
    layoutMode = 'NONE';
  } else if (element.layout === undefined) {
    console.warn('⚠️ Frame missing layout property after conversion:', element.name);
    const hasLayoutProps = element.justifyContent || element.alignItems || element.gap !== undefined || element.padding !== undefined;

    if (hasLayoutProps) {
      if (element.flexDirection === 'column') {
        layoutMode = 'VERTICAL';
      } else if (element.flexDirection === 'row') {
        layoutMode = 'HORIZONTAL';
      } else {
        layoutMode = 'HORIZONTAL';
        console.log('  → Defaulting to HORIZONTAL layout');
      }
    }
  }

  frame.layoutMode = layoutMode;

  let width = 100;
  let height = 100;

  if (layoutMode !== 'NONE') {
    if (element.width === 'fill_container' || (typeof element.width === 'string' && element.width.startsWith('fill_container'))) {
      frame.setPluginData('deferredLayoutSizingH', 'FILL');
      width = parseDimension(element.width, 100);
    } else if (element.width === 'hug_contents') {
      frame.setPluginData('deferredLayoutSizingH', 'HUG');
      width = 100;
    } else if (element.width !== undefined) {
      width = parseDimension(element.width, 100);
      frame.setPluginData('deferredLayoutSizingH', 'FIXED');
    } else {
      frame.setPluginData('deferredLayoutSizingH', 'HUG');
      width = 100;
    }

    if (element.height === 'fill_container' || (typeof element.height === 'string' && element.height.startsWith('fill_container'))) {
      frame.setPluginData('deferredLayoutSizingV', 'FILL');
      height = parseDimension(element.height, 100);
    } else if (element.height === 'hug_contents' || element.height === 'fit_content' || (typeof element.height === 'string' && element.height.startsWith('fit_content'))) {
      frame.setPluginData('deferredLayoutSizingV', 'HUG');
      height = 100;
    } else if (element.height !== undefined) {
      height = parseDimension(element.height, 100);
      frame.setPluginData('deferredLayoutSizingV', 'FIXED');
    } else {
      frame.setPluginData('deferredLayoutSizingV', 'HUG');
      height = 100;
    }
  } else {
    if (element.width !== undefined) width = parseDimension(element.width, 100);
    if (element.height !== undefined) height = parseDimension(element.height, 100);
  }

  if (width > 0 && height > 0) {
    frame.resize(width, height);
  }

  applyNodePosition(frame, element, parentNode, { logApplied: true, logSkipped: true });

  if (element.clip !== undefined) frame.clipsContent = element.clip;

  if (frame.layoutMode !== 'NONE') {
    if (element.gap !== undefined) frame.itemSpacing = element.gap;
    if (element.padding !== undefined) {
      const padding = Array.isArray(element.padding) ? element.padding : [element.padding];
      if (padding.length === 1) {
        frame.paddingTop = frame.paddingRight = frame.paddingBottom = frame.paddingLeft = padding[0];
      } else if (padding.length === 2) {
        frame.paddingTop = frame.paddingBottom = padding[0];
        frame.paddingLeft = frame.paddingRight = padding[1];
      } else if (padding.length === 4) {
        frame.paddingTop = padding[0];
        frame.paddingRight = padding[1];
        frame.paddingBottom = padding[2];
        frame.paddingLeft = padding[3];
      }
    }

    if (element.justifyContent) {
      frame.primaryAxisAlignItems = mapJustifyContent(element.justifyContent);
    } else {
      frame.primaryAxisAlignItems = 'MIN';
      if (element.name) {
        console.log('  → Applied default primaryAxisAlignItems=MIN for:', element.name);
      }
    }

    if (element.alignItems) {
      frame.counterAxisAlignItems = mapAlignItems(element.alignItems);
    } else {
      frame.counterAxisAlignItems = 'MIN';
      if (element.name) {
        console.log('  → Applied default counterAxisAlignItems=MIN for:', element.name);
      }
    }
  }

  if (element.fill) {
    await applyNodeFill(frame, element.fill, variables, imageCache, element.name || element.id || 'frame');
  }

  if (element.stroke) {
    applyStroke(frame, element.stroke, variables, element.name || element.id);
  }

  if (element.cornerRadius !== undefined) {
    const radius = parseCornerRadius(element.cornerRadius, variables);
    if (Array.isArray(radius)) {
      frame.topLeftRadius = radius[0];
      frame.topRightRadius = radius[1];
      frame.bottomRightRadius = radius[2];
      frame.bottomLeftRadius = radius[3];
    } else {
      frame.cornerRadius = radius;
    }
  }

  if (element.effect) {
    applyEffect(frame, element.effect, variables);
  }

  if (element.opacity !== undefined) {
    frame.opacity = element.opacity;
  }

  return frame;
}

export async function createGroup(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: ParentNodeLike = null
): Promise<FrameNode> {
  const { imageCache } = deps;
  const frame = figma.createFrame();
  frame.name = element.name || 'Group';
  frame.layoutMode = 'NONE';

  const width = parseDimension(element.width, 100);
  const height = parseDimension(element.height, 100);
  frame.resize(width, height);

  applyNodePosition(frame, element, parentNode);

  if (element.fill) {
    await applyNodeFill(frame, element.fill, variables, imageCache, element.name || element.id || 'group');
  }

  return frame;
}
