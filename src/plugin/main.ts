import { makePostMessageSafe } from './utils/image';
import {
  analyzePenFile as analyzePenFileImpl,
  createNodesFromPenData as createNodesFromPenDataImpl,
  importPenFile as importPenFileImpl
} from './import/pipeline';
import {
  exportToPen as exportToPenImpl,
  nodeToElement as nodeToElementImplWrapper
} from './export/pipeline';
import { nodeToElementImpl } from './export/node-to-element';
import {
  createInstances as createInstancesImpl,
  createNode as createNodeImpl
} from './nodes/factory';
import type { UiToPluginMessage } from '../shared/messages';
import type { PenAnalysis, PenDocument, PenElement } from '../shared/pen';
import type { NodeContainer, VariableMap } from './nodes/types.js';
import type { ExportBundle, ExportContext, ExportedPenElement } from './export/types.js';

console.log('Pencil Sync Plugin v2.5 loaded');

if (figma.command === 'import') {
  figma.showUI(__html__, { width: 400, height: 600 });
} else if (figma.command === 'export-selection') {
  void exportSelectionToPen();
} else if (figma.command === 'export-page') {
  void exportPageToPen();
} else {
  figma.showUI(__html__, { width: 400, height: 600 });
}

const componentMap = new Map<string, ComponentNode>();
const imageCache = new Map<string, string>();

async function exportSelectionToPen(): Promise<void> {
  try {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      figma.notify('❌ Please select at least one element to export');
      figma.closePlugin();
      return;
    }

    figma.notify('⏳ Exporting selection to .pen file...');

    const exportBundle = await convertNodesToPenBundle(selection);

    figma.showUI(__html__, { width: 1, height: 1, visible: false });

    setTimeout(() => {
      figma.ui.postMessage({
        type: 'download-pen',
        data: exportBundle.penData,
        assets: exportBundle.assets,
        filename: 'figma-export-selection.pen'
      });
    }, 300);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    figma.notify('❌ Export failed: ' + message);
    figma.closePlugin();
  }
}

async function exportPageToPen(): Promise<void> {
  try {
    figma.notify('⏳ Exporting page to .pen file...');

    const exportBundle = await convertNodesToPenBundle(figma.currentPage.children);

    if (exportBundle.penData.children.length === 0) {
      figma.notify('❌ No elements found on page to export');
      figma.closePlugin();
      return;
    }

    figma.showUI(__html__, { width: 1, height: 1, visible: false });

    setTimeout(() => {
      figma.ui.postMessage({
        type: 'download-pen',
        data: exportBundle.penData,
        assets: exportBundle.assets,
        filename: `figma-export-${figma.currentPage.name}.pen`
      });
    }, 300);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    figma.notify('❌ Export failed: ' + message);
    figma.closePlugin();
  }
}

async function convertNodesToPenBundle(nodes: readonly SceneNode[]): Promise<ExportBundle> {
  console.log('[EXPORT] convertNodesToPenBundle start', { count: nodes.length });
  const exportContext: ExportContext = { assets: new Map() };
  const penData: PenDocument = {
    version: '2.7',
    variables: {},
    children: []
  };

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    console.log('[EXPORT] top-level node', i, { id: node.id, type: node.type, name: node.name });
    const element = await nodeToElement(node, exportContext);
    if (element) {
      penData.children.push(element);
    }
  }

  return {
    penData: makePostMessageSafe(penData) as unknown as PenDocument,
    assets: makePostMessageSafe(Array.from(exportContext.assets.values())) as unknown as ExportBundle['assets']
  };
}

figma.ui.onmessage = async (msg: UiToPluginMessage): Promise<void> => {
  if (msg.type === 'import-pen') {
    try {
      await importPenFile(msg.data, msg.images);
      figma.ui.postMessage({ type: 'import-success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      figma.ui.postMessage({ type: 'import-error', error: message });
    }
  } else if (msg.type === 'place-import') {
    try {
      const nodes = await createNodesFromPenData(msg.data, msg.images);

      figma.currentPage.selection = nodes;
      figma.viewport.scrollAndZoomIntoView(nodes);

      figma.notify('✅ Pen file imported successfully!');
      figma.ui.postMessage({ type: 'placement-complete' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      figma.notify('❌ Error importing: ' + message);
      figma.ui.postMessage({ type: 'import-error', error: message });
    }
  } else if (msg.type === 'export-pen') {
    try {
      console.log('[EXPORT] export-pen message', { mode: 'selection' });
      const exportBundle = await exportToPen();
      const penChildren = exportBundle && exportBundle.penData && exportBundle.penData.children;
      console.log('[EXPORT] export bundle ready', {
        topLevelChildren: penChildren ? penChildren.length : 0,
        assets: exportBundle && Array.isArray(exportBundle.assets) ? exportBundle.assets.length : 'n/a'
      });
      figma.ui.postMessage({ type: 'export-data', data: exportBundle.penData, assets: exportBundle.assets });
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error));
      console.error('[EXPORT] export-pen failed', typedError.message, typedError.stack);
      figma.ui.postMessage({ type: 'export-error', error: typedError.message });
    }
  } else if (msg.type === 'icon-svg-fetched') {
    try {
      if (msg.svgPath && msg.nodeId) {
        console.log('[ICON] Received SVG for icon:', msg.iconName);

        const node = figma.getNodeById(msg.nodeId);

        if (node && node.type === 'VECTOR') {
          try {
            node.vectorPaths = [{
              windingRule: 'NONZERO',
              data: msg.svgPath
            }];

            node.setPluginData('isIconPlaceholder', 'false');
            node.setPluginData('pendingIconFetch', 'false');

            console.log('[ICON] Successfully updated vector with icon SVG:', msg.iconName);
          } catch (pathError) {
            console.error('[ICON] Failed to set vector path:', pathError);
          }
        } else {
          console.warn('[ICON] Node not found or not a vector:', msg.nodeId);
        }
      } else {
        console.warn('[ICON] Failed to fetch icon:', msg.error);
      }
    } catch (error) {
      console.error('[ICON] Error processing fetched icon:', error);
    }
  } else if (msg.type === 'close-after-download') {
    figma.notify('✅ .pen file exported successfully!');
    setTimeout(() => {
      figma.closePlugin();
    }, 500);
  } else if (msg.type === 'close') {
    figma.closePlugin();
  }
};

async function importPenFile(penData: PenDocument, images: Record<string, string> | null | undefined): Promise<void> {
  componentMap.clear();
  return importPenFileImpl(penData, images, {
    imageCache,
    analyzePenFile
  });
}

function analyzePenFile(penData: PenDocument): PenAnalysis {
  return analyzePenFileImpl(penData);
}

async function createNodesFromPenData(penData: PenDocument, images: Record<string, string> | null | undefined): Promise<SceneNode[]> {
  return createNodesFromPenDataImpl(penData, images, {
    createNode,
    createInstances
  });
}

async function createNode(element: PenElement, variables: VariableMap, parentNode: NodeContainer | null = null): Promise<SceneNode | null> {
  return createNodeImpl(element, variables, {
    imageCache,
    componentMap
  }, parentNode);
}

async function createInstances(children: PenElement[], variables: VariableMap): Promise<void> {
  return createInstancesImpl(children, variables, {
    componentMap,
    imageCache
  });
}

async function exportToPen(): Promise<ExportBundle> {
  return exportToPenImpl({
    convertNodesToPenBundle
  });
}

async function nodeToElement(
  node: SceneNode,
  exportContext: ExportContext | null = null,
  parentNode: BaseNode | null = null
): Promise<ExportedPenElement | null> {
  return nodeToElementImplWrapper(node, exportContext, parentNode, {
    nodeToElementImpl
  });
}
