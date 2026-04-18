import { createFrame, createGroup } from './create-frame.js';
import { createImage } from './create-image.js';
import { copyNodeProperties, createInstances } from './instances.js';
import { createEllipse, createLine, createRectangle } from './create-shape.js';
import { createText } from './create-text.js';
import { createIconFont, createVector } from './create-vector.js';
import type {
  LayoutChildNode,
  NodeContainer,
  NodeElement,
  NodeFactoryDeps,
  NodeWithPluginData,
  VariableMap
} from './types.js';

export async function createNode(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: NodeContainer | null = null
): Promise<NodeWithPluginData | null> {
  const { componentMap } = deps;
  if (!element || element.enabled === false) return null;
  if (element.type === 'ref') return null;

  let node: NodeWithPluginData | null = null;

  try {
    switch (element.type) {
      case 'frame':
        node = await createFrame(element, variables, deps, parentNode);
        break;
      case 'rectangle':
        node = await createRectangle(element, variables, deps, parentNode);
        break;
      case 'ellipse':
      case 'circle':
        node = await createEllipse(element, variables, deps, parentNode);
        break;
      case 'text':
        node = await createText(element, variables, deps, parentNode);
        break;
      case 'image':
        node = await createImage(element, variables, deps, parentNode);
        break;
      case 'line':
        node = createLine(element, variables, deps, parentNode);
        break;
      case 'path':
      case 'vector':
      case 'svg':
        node = await createVector(element, variables, deps, parentNode);
        break;
      case 'group':
        node = await createGroup(element, variables, deps, parentNode);
        break;
      case 'icon_font':
        if (element.geometry) {
          console.log(`[ICON] Converting icon_font "${element.name}" with geometry to vector`);
          node = await createVector(element, variables, deps, parentNode);
        } else {
          console.log(`[ICON] Icon "${element.name}" (${element.iconFontName}) needs SVG data`);
          node = await createIconFont(element, variables, deps, parentNode);
        }
        break;
      case 'prompt':
        console.warn('Prompt element type not yet supported, skipping:', element.name);
        return null;
      default:
        console.warn('Unknown element type:', element.type, element);
        return null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating node:', element.type, element.name, error);
    figma.notify('⚠️ Error creating ' + element.name + ': ' + message);
    return null;
  }

  if (!node) {
    return null;
  }

  if (element.name) node.name = element.name;
  if (element.id) {
    node.setPluginData('pencilId', element.id);
  }

  if (element.reusable && node.type === 'FRAME') {
    const component = figma.createComponent();
    component.name = element.name || 'Component';
    component.resize(node.width, node.height);

    copyNodeProperties(node, component);

    const children = [...node.children];
    for (const child of children) {
      component.appendChild(child);
    }

    component.setPluginData('pencilId', element.id || '');

    if (element.id) {
      componentMap.set(element.id, component);
    }
    node.remove();
    node = component;
  }

  if (element.children && Array.isArray(element.children) && 'appendChild' in node) {
    await appendChildNodes(node as NodeContainer, element.children, variables, deps);
  }

  return node;
}

async function appendChildNodes(
  parentNode: NodeContainer,
  children: NodeElement[],
  variables: VariableMap,
  deps: NodeFactoryDeps
): Promise<void> {
  console.log(`[FRAME] Creating ${children.length} children for ${parentNode.name}`);
  let createdCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < children.length; i++) {
    const childElement = children[i];
    console.log(`[FRAME] Creating child ${i}: ${childElement.type} - ${childElement.name || childElement.id}`);
    const childNode = await createNode(childElement, variables, deps, parentNode);

    if (childNode) {
      createdCount++;
      parentNode.appendChild(childNode);
      console.log(`[FRAME] Child added: ${childNode.name}`);
      applyDeferredLayoutSizing(parentNode, childNode as LayoutChildNode, childElement);
    } else {
      skippedCount++;
      if (childElement.type !== 'ref') {
        console.log('⚠️ Skipped child:', childElement.name || childElement.id, 'type:', childElement.type, 'enabled:', childElement.enabled);
      }
    }

    if (i > 0 && i % 5 === 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
    }
  }

  if (skippedCount > 0) {
    console.log(`[FRAME] Created ${createdCount} children, skipped ${skippedCount} (refs will be created in second pass)`);
  }
}

function applyDeferredLayoutSizing(
  parentNode: NodeContainer,
  childNode: LayoutChildNode,
  childElement: NodeElement
): void {
  if (!parentNode.layoutMode || parentNode.layoutMode === 'NONE') {
    return;
  }

  try {
    let hSizing = childNode.getPluginData('deferredLayoutSizingH') as '' | 'FILL' | 'HUG' | 'FIXED';
    let vSizing = childNode.getPluginData('deferredLayoutSizingV') as '' | 'FILL' | 'HUG' | 'FIXED';

    if (!hSizing && childElement.width) {
      if (childElement.width === 'fill_container' || (typeof childElement.width === 'string' && childElement.width.startsWith('fill_container'))) {
        hSizing = 'FILL';
      } else if (childElement.width === 'hug_contents') {
        hSizing = 'HUG';
      }
    }

    if (!vSizing && childElement.height) {
      if (childElement.height === 'fill_container' || (typeof childElement.height === 'string' && childElement.height.startsWith('fill_container'))) {
        vSizing = 'FILL';
      } else if (
        childElement.height === 'hug_contents' ||
        childElement.height === 'fit_content' ||
        (typeof childElement.height === 'string' &&
          (childElement.height.startsWith('fit_content') || childElement.height.startsWith('hug_contents')))
      ) {
        vSizing = 'HUG';
      }
    }

    if (hSizing === 'FILL' && 'layoutSizingHorizontal' in childNode) {
      childNode.layoutSizingHorizontal = 'FILL';
    } else if (hSizing === 'HUG' && 'layoutSizingHorizontal' in childNode) {
      childNode.layoutSizingHorizontal = 'HUG';
    } else if (hSizing === 'FIXED' && 'layoutSizingHorizontal' in childNode) {
      childNode.layoutSizingHorizontal = 'FIXED';
    }

    if (vSizing === 'FILL' && 'layoutSizingVertical' in childNode) {
      childNode.layoutSizingVertical = 'FILL';
    } else if (vSizing === 'HUG' && 'layoutSizingVertical' in childNode) {
      childNode.layoutSizingVertical = 'HUG';
    } else if (vSizing === 'FIXED' && 'layoutSizingVertical' in childNode) {
      childNode.layoutSizingVertical = 'FIXED';
    }

    childNode.setPluginData('deferredLayoutSizingH', '');
    childNode.setPluginData('deferredLayoutSizingV', '');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('Could not apply layout sizing to', childElement.name, message);
  }
}

export { createInstances };
