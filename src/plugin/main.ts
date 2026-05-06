import { makePostMessageSafe } from './utils/image';
import {
  exportToPen as exportToPenImpl,
  nodeToElement as nodeToElementImplWrapper
} from './export/pipeline';
import { nodeToElementImpl } from './export/node-to-element';
import type { PluginToUiMessage, UiToPluginMessage } from '../shared/messages';
import type { PenDocument } from '../shared/pen';
import type { ExportBundle, ExportContext, ExportProgressSnapshot, ExportedPenElement } from './export/types.js';

console.log('figma to pen plugin loaded');

let uiReady = false;

if (figma.command === 'export-selection') {
  void exportSelectionToPen();
} else if (figma.command === 'export-page') {
  void exportPageToPen();
} else {
  showPluginUI({ width: 400, height: 360 });
}

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

    showPluginUI({ width: 1, height: 1, visible: false });

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

    showPluginUI({ width: 1, height: 1, visible: false });

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
  const exportWork = analyzeExportWork(nodes);
  const exportContext: ExportContext = {
    assets: new Map(),
    inferredCornerRadiusByNodeId: new Map(),
    progress: {
      totalSceneNodes: exportWork.totalSceneNodes,
      processedSceneNodes: 0,
      totalAssets: exportWork.totalAssets,
      exportedAssets: 0,
      onUpdate: (snapshot) => {
        postExportProgress(snapshot);
      }
    }
  };
  const penData: PenDocument = {
    version: '2.7',
    variables: {},
    children: []
  };

  postExportProgress({
    totalSceneNodes: exportWork.totalSceneNodes,
    processedSceneNodes: 0,
    totalAssets: exportWork.totalAssets,
    exportedAssets: 0
  });

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
  if (msg.type === 'export-pen') {
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
  } else if (msg.type === 'close-after-download') {
    figma.notify('✅ .pen file exported successfully!');
    setTimeout(() => {
      figma.closePlugin();
    }, 500);
  } else if (msg.type === 'close') {
    figma.closePlugin();
  }
};

async function exportToPen(): Promise<ExportBundle> {
  return exportToPenImpl({
    convertNodesToPenBundle
  });
}

function postExportProgress(snapshot: ExportProgressSnapshot): void {
  if (!uiReady) {
    return;
  }

  const message = formatExportProgressMessage(snapshot);
  const payload: PluginToUiMessage = {
    type: 'export-progress',
    stage: 'export',
    message
  };
  figma.ui.postMessage(payload);
}

function formatExportProgressMessage(snapshot: ExportProgressSnapshot): string {
  const nodePart = `节点 ${snapshot.processedSceneNodes}/${snapshot.totalSceneNodes}`;
  if (snapshot.totalAssets > 0) {
    return `正在导出 .pen（${nodePart}，图片 ${snapshot.exportedAssets}/${snapshot.totalAssets}）`;
  }

  return `正在导出 .pen（${nodePart}）`;
}

function analyzeExportWork(nodes: readonly SceneNode[]): { totalSceneNodes: number; totalAssets: number } {
  let totalSceneNodes = 0;
  const assetKeys = new Set<string>();

  for (const node of nodes) {
    walkExportNodes(node, assetKeys, () => {
      totalSceneNodes += 1;
    });
  }

  return {
    totalSceneNodes,
    totalAssets: assetKeys.size
  };
}

function walkExportNodes(
  node: SceneNode,
  assetKeys: Set<string>,
  onVisit: () => void
): void {
  onVisit();
  collectNodeAssetKeys(node, assetKeys);

  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      walkExportNodes(child, assetKeys, onVisit);
    }
  }
}

function collectNodeAssetKeys(node: SceneNode, assetKeys: Set<string>): void {
  if (shouldRasterizeNodeForExportProgress(node) && typeof (node as Partial<ExportMixin>).exportAsync === 'function') {
    assetKeys.add(`raster:${node.id}`);
    return;
  }

  collectPaintAssetKeys((node as SceneNode & { fills?: ReadonlyArray<Paint> | PluginAPI['mixed'] }).fills, assetKeys);
  collectPaintAssetKeys((node as SceneNode & { strokes?: ReadonlyArray<Paint> | PluginAPI['mixed'] }).strokes, assetKeys);
}

function collectPaintAssetKeys(
  paints: ReadonlyArray<Paint> | PluginAPI['mixed'] | undefined,
  assetKeys: Set<string>
): void {
  if (!Array.isArray(paints)) {
    return;
  }

  for (const paint of paints) {
    if (paint?.type === 'IMAGE' && paint.visible !== false && paint.imageHash) {
      assetKeys.add(`image:${paint.imageHash}`);
    }
  }
}

function shouldRasterizeNodeForExportProgress(node: SceneNode): boolean {
  if (typeof (node as Partial<ExportMixin>).exportAsync !== 'function') {
    return false;
  }

  if (node.type === 'GROUP' && node.locked === true) {
    return true;
  }

  if (!('children' in node) || !Array.isArray(node.children) || node.children.length === 0) {
    return false;
  }

  return node.children.some((child) => {
    const candidate = child as SceneNode & {
      rotation?: number;
      fills?: ReadonlyArray<Paint> | PluginAPI['mixed'];
    };
    const rotation = typeof candidate.rotation === 'number' ? candidate.rotation : 0;
    return Math.abs(rotation) >= 0.01 && Array.isArray(candidate.fills) && candidate.fills.some((fill) => fill?.type === 'IMAGE' && fill.visible !== false);
  });
}

function showPluginUI(options: ShowUIOptions): void {
  figma.showUI(__html__, options);
  uiReady = true;
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
