import { getImageFillSpec } from '../utils/image';
import type { PluginToUiMessage } from '../../shared/messages';
import type { PenAnalysis, PenDocument, PenElement } from '../../shared/pen';

type ImportPipelineDeps = {
  imageCache: Map<string, string>;
  analyzePenFile: (penData: PenDocument) => PenAnalysis;
};

type CreateNodesDeps = {
  createNode: (element: PenElement, variables: Record<string, unknown> | undefined) => Promise<SceneNode | null>;
  createInstances: (children: PenElement[], variables: Record<string, unknown> | undefined) => Promise<void>;
};

type ConvertiblePenElement = PenElement & {
  type?: string;
  children?: ConvertiblePenElement[];
  layout?: 'none' | 'horizontal' | 'vertical';
  justifyContent?: string;
  alignItems?: string;
  gap?: number;
  padding?: unknown;
  width?: unknown;
  height?: unknown;
  fontWeight?: string | number;
  fill?: unknown;
  cornerRadius?: unknown;
  stroke?: {
    thickness?: number | { top?: number; right?: number; bottom?: number; left?: number };
  };
};

type ConvertedPenDocument = {
  version?: string;
  variables: Record<string, unknown>;
  children: ConvertiblePenElement[];
};

export async function importPenFile(
  penData: PenDocument,
  images: Record<string, string> | null | undefined,
  { imageCache, analyzePenFile }: ImportPipelineDeps
): Promise<void> {
  imageCache.clear();

  if (images) {
    for (const [filename, dataUrl] of Object.entries(images)) {
      imageCache.set(filename, dataUrl);
    }
  }

  if (!penData || typeof penData !== 'object') {
    throw new Error('Invalid pen file: not a valid JSON object');
  }

  if (!penData.children || !Array.isArray(penData.children)) {
    throw new Error('Invalid pen file: missing or invalid children array');
  }

  const analysis = analyzePenFile(penData);

  const message: PluginToUiMessage = {
    type: 'ready-to-place',
    data: penData,
    images,
    analysis
  };

  figma.ui.postMessage(message);
}

export function analyzePenFile(penData: PenDocument): PenAnalysis {
  const stats: PenAnalysis = {
    version: penData.version || 'Unknown',
    totalElements: 0,
    elementTypes: {},
    components: 0,
    instances: 0,
    autoLayoutFrames: 0,
    absoluteFrames: 0,
    images: 0,
    textNodes: 0,
    variables: penData.variables ? Object.keys(penData.variables).length : 0,
    maxDepth: 0,
    hasTheme: !!penData.theme || false
  };

  function analyzeElement(element: PenElement | undefined, depth = 0): void {
    if (!element) return;

    stats.totalElements++;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    const type = element.type || 'unknown';
    stats.elementTypes[type] = (stats.elementTypes[type] || 0) + 1;

    if (type === 'ref') stats.instances++;
    if (type === 'text') stats.textNodes++;
    if (type === 'image' || getImageFillSpec(element.fill)) stats.images++;

    if (type === 'frame') {
      if (element.reusable) stats.components++;

      if (
        ('layout' in element && (element.layout === 'horizontal' || element.layout === 'vertical')) ||
        ('justifyContent' in element && element.justifyContent) ||
        ('alignItems' in element && element.alignItems) ||
        ('gap' in element && element.gap !== undefined)
      ) {
        stats.autoLayoutFrames++;
      } else {
        stats.absoluteFrames++;
      }
    }

    if (element.children && Array.isArray(element.children)) {
      element.children.forEach((child) => analyzeElement(child, depth + 1));
    }
  }

  if (penData.children && Array.isArray(penData.children)) {
    penData.children.forEach((child) => analyzeElement(child, 0));
  }

  return stats;
}

export function convertPenToFigmaFormat(penData: PenDocument): ConvertedPenDocument {
  console.log('🔄 Converting pen format to Figma format...');

  const figmaData: ConvertedPenDocument = {
    version: penData.version,
    variables: penData.variables || {},
    children: []
  };

  let convertedCount = 0;
  let normalizedLayoutCount = 0;
  let normalizedDimensionCount = 0;

  function convertElement(element: ConvertiblePenElement, depth: number): ConvertiblePenElement | null {
    if (!element || !element.type) return null;

    if (depth > 100) {
      console.warn('⚠️ Max recursion depth reached for:', element.name || element.id);
      return null;
    }

    convertedCount++;

    const converted = JSON.parse(JSON.stringify(element)) as ConvertiblePenElement;
    delete converted.children;

    if (element.type === 'frame') {
      if (!converted.layout) {
        const hasLayoutProps = element.justifyContent || element.alignItems || element.gap !== undefined || element.padding !== undefined;

        if (hasLayoutProps) {
          converted.layout = 'horizontal';
          normalizedLayoutCount++;
          console.log('  ✓ Inferred layout=horizontal for:', element.name || element.id);
        } else {
          converted.layout = 'none';
          normalizedLayoutCount++;
          console.log('  ✓ Set layout=none for:', element.name || element.id);
        }
      }

      if (converted.layout && converted.layout !== 'none') {
        if (converted.justifyContent === undefined) {
          converted.justifyContent = 'start';
        }
        if (converted.alignItems === undefined) {
          converted.alignItems = 'start';
        }
      }
    }

    if (converted.width === undefined && converted.layout && converted.layout !== 'none') {
      converted.width = 'hug_contents';
      normalizedDimensionCount++;
    }
    if (converted.height === undefined && converted.layout && converted.layout !== 'none') {
      converted.height = 'hug_contents';
      normalizedDimensionCount++;
    }

    if (converted.fontWeight !== undefined && typeof converted.fontWeight === 'number') {
      converted.fontWeight = String(converted.fontWeight);
    }

    if (converted.fill === 'transparent') {
      delete converted.fill;
    }

    if (converted.padding !== undefined && typeof converted.padding === 'number') {
      converted.padding = [converted.padding];
    }

    if (converted.cornerRadius !== undefined) {
      if (typeof converted.cornerRadius === 'string' && converted.cornerRadius.startsWith('$')) {
        // keep variable reference
      } else if (Array.isArray(converted.cornerRadius)) {
        converted.cornerRadius = converted.cornerRadius.map((r) => (
          typeof r === 'string' && r.startsWith('$') ? r : (parseFloat(String(r)) || 0)
        )) as ConvertiblePenElement['cornerRadius'];
      }
    }

    if (converted.stroke && typeof converted.stroke === 'object' && converted.stroke.thickness) {
      if (typeof converted.stroke.thickness === 'object') {
        const thicknesses: number[] = [];
        if (converted.stroke.thickness.top !== undefined) thicknesses.push(converted.stroke.thickness.top);
        if (converted.stroke.thickness.bottom !== undefined) thicknesses.push(converted.stroke.thickness.bottom);
        if (converted.stroke.thickness.left !== undefined) thicknesses.push(converted.stroke.thickness.left);
        if (converted.stroke.thickness.right !== undefined) thicknesses.push(converted.stroke.thickness.right);
        if (thicknesses.length > 0) {
          converted.stroke.thickness = Math.max(...thicknesses);
        }
      }
    }

    if (element.children && Array.isArray(element.children)) {
      console.log('  → Converting', element.children.length, 'children for:', element.name || element.id);
      converted.children = element.children
        .map((child) => convertElement(child, depth + 1))
        .filter((c): c is ConvertiblePenElement => c !== null);
      console.log('  → Converted', converted.children.length, 'children for:', element.name || element.id);
    }

    return converted;
  }

  if (penData.children && Array.isArray(penData.children)) {
    figmaData.children = penData.children
      .map((child) => convertElement(child as ConvertiblePenElement, 0))
      .filter((c): c is ConvertiblePenElement => c !== null);
  }

  console.log('✅ Conversion complete:');
  console.log('  - Converted', convertedCount, 'elements');
  console.log('  - Normalized', normalizedLayoutCount, 'layouts');
  console.log('  - Normalized', normalizedDimensionCount, 'dimensions');
  console.log('  - Result:', figmaData.children.length, 'top-level elements');

  return figmaData;
}

export async function createNodesFromPenData(
  penData: PenDocument,
  images: Record<string, string> | null | undefined,
  deps: CreateNodesDeps
): Promise<SceneNode[]> {
  const { createNode, createInstances } = deps;
  const nodes: SceneNode[] = [];

  console.log('Creating nodes from pen data. Top-level children count:', penData.children ? penData.children.length : 0);

  if (!penData || !penData.children || !Array.isArray(penData.children)) {
    throw new Error('Invalid pen data: missing or invalid children array');
  }

  const figmaData = convertPenToFigmaFormat(penData);

  if (figmaData.children && Array.isArray(figmaData.children)) {
    console.log(`[IMPORT] Creating ${figmaData.children.length} top-level nodes...`);
    for (let i = 0; i < figmaData.children.length; i++) {
      const child = figmaData.children[i];
      console.log(`[IMPORT] Creating top-level node ${i}: ${child.name} (type: ${child.type}), has ${child.children ? child.children.length : 0} children`);

      try {
        const node = await createNode(child, figmaData.variables);
        if (node) {
          nodes.push(node);
          figma.currentPage.appendChild(node);
          console.log(`[IMPORT] Appended ${'name' in node ? node.name : child.name} to page. Node has ${'children' in node ? node.children.length : 0} children`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[IMPORT] Failed to create node ${child.name}:`, error);
        figma.notify(`⚠️ Skipped ${child.name}: ${message}`);
      }

      if (i > 0 && i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }

  await createInstances(figmaData.children, figmaData.variables);

  console.log('');
  console.log('✅ Import Summary:');
  console.log(`  - Created ${nodes.length} top-level nodes`);

  const typeCounts: Record<string, number> = {};
  function countTypes(node: BaseNode): void {
    typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
    if ('children' in node) {
      for (let i = 0; i < node.children.length; i++) {
        countTypes(node.children[i]);
      }
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    countTypes(nodes[i]);
  }
  console.log('  - Node types created:');
  for (const type in typeCounts) {
    console.log(`    • ${type}: ${typeCounts[type]}`);
  }

  return nodes;
}
