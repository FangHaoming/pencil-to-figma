import type { ExportBundle, ExportContext, ExportedPenElement } from './types.js';

type ExportPipelineDeps = {
  convertNodesToPenBundle: (nodes: readonly SceneNode[]) => Promise<ExportBundle>;
};

type NodeToElementDeps = {
  nodeToElementImpl: (
    node: SceneNode,
    exportContext: ExportContext | null,
    parentNode: BaseNode | null
  ) => Promise<ExportedPenElement | null>;
};

export async function exportToPen(
  { convertNodesToPenBundle }: ExportPipelineDeps
): Promise<ExportBundle> {
  const nodes = figma.currentPage.selection;
  console.log('[EXPORT] exportToPen', { mode: 'selection', page: figma.currentPage.name, count: nodes.length });

  if (nodes.length === 0) {
    throw new Error('No nodes to export');
  }

  return convertNodesToPenBundle(nodes);
}

export async function nodeToElement(
  node: SceneNode,
  exportContext: ExportContext | null,
  parentNode: BaseNode | null,
  { nodeToElementImpl }: NodeToElementDeps
): Promise<ExportedPenElement | null> {
  try {
    return await nodeToElementImpl(node, exportContext, parentNode);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[EXPORT] nodeToElement error', {
      id: node && node.id,
      type: node && node.type,
      name: node && node.name,
      parentType: parentNode && 'type' in parentNode ? parentNode.type : undefined,
      message: error.message,
      stack: error.stack
    });
    throw err;
  }
}
