import type {
  BridgeDesignContextResult,
  BridgeDesignContextNode,
  BridgeDownloadImageResult,
  BridgeExportNodePngResult,
  BridgeMetadataNode,
  BridgeMetadataResult,
  BridgeRuntimeInfo,
  BridgeSerializedEffect,
  BridgeSerializedExportSetting,
  BridgeSerializedPaint,
  BridgeScreenshotResult,
  BridgeVariableDef,
  BridgeVariableDefsResult,
  PluginCapability
} from '../shared/bridge';
import type { ExportAsset, ExportContext } from './export/types.js';
import {
  exportNodeToPngAsset,
  getExportImageAsset,
  makePostMessageSafe,
  shouldRasterizeNodeForImageTransform
} from './utils/image';

const PLUGIN_CAPABILITIES: PluginCapability[] = [
  'read.metadata',
  'read.designContext',
  'read.screenshot',
  'read.variableDefs',
  'read.downloadImage',
  'read.exportNodePng'
];

type VariablesApi = {
  getVariableById?: (id: string) => Variable | null;
  getVariableByIdAsync?: (id: string) => Promise<Variable | null>;
  getVariableCollectionById?: (id: string) => VariableCollection | null;
  getVariableCollectionByIdAsync?: (id: string) => Promise<VariableCollection | null>;
};

type VariableAliasRef = {
  id?: string;
};

type BoundVariablesLike = Record<string, unknown> | null | undefined;
type DesignContextText = NonNullable<BridgeDesignContextNode['text']>;
type DesignContextTextSegment = NonNullable<DesignContextText['segments']>[number];

type PluginApiWithAsyncNodeLookup = PluginAPI & {
  getNodeByIdAsync?: (id: string) => Promise<BaseNode | null>;
};

export function isSceneNode(node: BaseNode | null): node is SceneNode {
  return !!node && node.type !== 'DOCUMENT' && node.type !== 'PAGE';
}

function getCurrentFileKey(): string | undefined {
  const pluginApi = figma as PluginAPI & { fileKey?: string };
  return pluginApi.fileKey;
}

function createExportContext(): ExportContext {
  return {
    assets: new Map(),
    inferredCornerRadiusByNodeId: new Map()
  };
}

async function getSceneNodeByIdOrThrow(nodeId: string): Promise<SceneNode> {
  const pluginApi = figma as PluginApiWithAsyncNodeLookup;
  const node = typeof pluginApi.getNodeByIdAsync === 'function'
    ? await pluginApi.getNodeByIdAsync(nodeId)
    : figma.getNodeById(nodeId);
  if (!isSceneNode(node)) {
    throw new Error('Node not found or not accessible');
  }

  return node;
}

function getNodeBounds(node: SceneNode): BridgeMetadataNode['bounds'] {
  const maybeWidth = 'width' in node ? node.width : undefined;
  const maybeHeight = 'height' in node ? node.height : undefined;

  return {
    x: 'x' in node ? node.x : undefined,
    y: 'y' in node ? node.y : undefined,
    width: typeof maybeWidth === 'number' ? maybeWidth : undefined,
    height: typeof maybeHeight === 'number' ? maybeHeight : undefined
  };
}

function getRect(value: unknown): BridgeMetadataNode['bounds'] | null | undefined {
  if (value === null) {
    return null;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const rect = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  if (
    typeof rect.x !== 'number' ||
    typeof rect.y !== 'number' ||
    typeof rect.width !== 'number' ||
    typeof rect.height !== 'number'
  ) {
    return undefined;
  }

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}

function createMetadataNode(node: SceneNode): BridgeMetadataNode {
  const metadataNode: BridgeMetadataNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: 'visible' in node ? node.visible : undefined,
    bounds: getNodeBounds(node)
  };

  if ('children' in node && Array.isArray(node.children) && node.children.length > 0) {
    metadataNode.children = node.children.filter(isSceneNode).map(createMetadataNode);
  }

  return metadataNode;
}

function serializeMatrix(value: unknown): number[][] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const rows = value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.filter((cell): cell is number => typeof cell === 'number'));

  return rows.length > 0 ? rows : undefined;
}

function serializePaints(value: unknown): BridgeSerializedPaint[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const paints = value
    .filter((paint): paint is Record<string, unknown> => !!paint && typeof paint === 'object')
    .map((paint) => {
      const serialized: BridgeSerializedPaint = {
        type: String(paint.type || 'UNKNOWN'),
        visible: typeof paint.visible === 'boolean' ? paint.visible : undefined,
        opacity: typeof paint.opacity === 'number' ? paint.opacity : undefined,
        blendMode: typeof paint.blendMode === 'string' ? paint.blendMode : undefined,
        color: makePostMessageSafe(paint.color),
        gradientStops: Array.isArray(paint.gradientStops)
          ? paint.gradientStops.map((stop) => makePostMessageSafe(stop)).filter(Boolean) as unknown[]
          : undefined,
        gradientTransform: serializeMatrix(paint.gradientTransform),
        scaleMode: typeof paint.scaleMode === 'string' ? paint.scaleMode : undefined,
        imageHash: typeof paint.imageHash === 'string' ? paint.imageHash : undefined,
        imageTransform: serializeMatrix(paint.imageTransform),
        rotation: typeof paint.rotation === 'number' ? paint.rotation : undefined,
        filters: makePostMessageSafe(paint.filters) as Record<string, unknown> | undefined,
        gifRef: typeof paint.gifRef === 'string' ? paint.gifRef : undefined,
        isMask: typeof paint.isMask === 'boolean' ? paint.isMask : undefined,
        boundVariables: makePostMessageSafe(paint.boundVariables)
      };

      return serialized;
    });

  return paints.length > 0 ? paints : undefined;
}

function serializeEffects(value: unknown): BridgeSerializedEffect[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const effects = value
    .filter((effect): effect is Record<string, unknown> => !!effect && typeof effect === 'object')
    .map((effect) => ({
      type: String(effect.type || 'UNKNOWN'),
      visible: typeof effect.visible === 'boolean' ? effect.visible : undefined,
      radius: typeof effect.radius === 'number' ? effect.radius : undefined,
      spread: typeof effect.spread === 'number' ? effect.spread : undefined,
      blendMode: typeof effect.blendMode === 'string' ? effect.blendMode : undefined,
      color: makePostMessageSafe(effect.color),
      offset:
        effect.offset &&
        typeof effect.offset === 'object' &&
        typeof (effect.offset as { x?: unknown }).x === 'number' &&
        typeof (effect.offset as { y?: unknown }).y === 'number'
          ? {
              x: (effect.offset as { x: number }).x,
              y: (effect.offset as { y: number }).y
            }
          : undefined,
      boundVariables: makePostMessageSafe(effect.boundVariables)
    }));

  return effects.length > 0 ? effects : undefined;
}

function serializeExportSettings(value: unknown): BridgeSerializedExportSetting[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const settings = value
    .filter((setting): setting is Record<string, unknown> => !!setting && typeof setting === 'object')
    .map((setting) => ({
      format: String(setting.format || 'UNKNOWN'),
      suffix: typeof setting.suffix === 'string' ? setting.suffix : undefined,
      constraint: makePostMessageSafe(setting.constraint)
    }));

  return settings.length > 0 ? settings : undefined;
}

function serializeTextSegments(node: SceneNode): DesignContextTextSegment[] | undefined {
  if (node.type !== 'TEXT' || typeof node.getStyledTextSegments !== 'function') {
    return undefined;
  }

  const segments = node.getStyledTextSegments([
    'fontSize',
    'fontName',
    'fills',
    'lineHeight',
    'letterSpacing',
    'textDecoration',
    'textCase'
  ]);

  if (!Array.isArray(segments) || segments.length === 0) {
    return undefined;
  }

  return segments
    .filter((segment) => typeof segment.characters === 'string' && segment.characters.length > 0)
    .map((segment): DesignContextTextSegment => ({
      characters: segment.characters,
      start: typeof segment.start === 'number' ? segment.start : 0,
      end: typeof segment.end === 'number' ? segment.end : segment.characters.length,
      fontSize: typeof segment.fontSize === 'number' ? segment.fontSize : undefined,
      fontName: makePostMessageSafe(segment.fontName),
      fills: serializePaints(segment.fills),
      lineHeight: makePostMessageSafe(segment.lineHeight),
      letterSpacing: makePostMessageSafe(segment.letterSpacing),
      textDecoration: typeof segment.textDecoration === 'string' ? segment.textDecoration : undefined,
      textCase: typeof segment.textCase === 'string' ? segment.textCase : undefined
    }));
}

function collectVariableUsagesFromNode(node: SceneNode, usages: Map<string, Set<string>>): void {
  const nodeLabel = `${node.id}:${node.name}`;
  const seen = new WeakSet<object>();

  collectVariableAliasIds(
    (node as SceneNode & { boundVariables?: BoundVariablesLike }).boundVariables,
    `${nodeLabel}.boundVariables`,
    usages,
    seen
  );
  collectVariableAliasIds('fills' in node ? node.fills : undefined, `${nodeLabel}.fills`, usages, seen);
  collectVariableAliasIds('strokes' in node ? node.strokes : undefined, `${nodeLabel}.strokes`, usages, seen);
  collectVariableAliasIds('effects' in node ? node.effects : undefined, `${nodeLabel}.effects`, usages, seen);

  if (node.type === 'TEXT') {
    collectVariableAliasIds(
      (node as TextNode & { boundVariables?: BoundVariablesLike }).boundVariables,
      `${nodeLabel}.text.boundVariables`,
      usages,
      seen
    );

    if (typeof node.getStyledTextSegments === 'function') {
      const segments = node.getStyledTextSegments(['fills', 'fontSize', 'fontName', 'lineHeight', 'letterSpacing']);
      collectVariableAliasIds(segments, `${nodeLabel}.text.segments`, usages, seen);
    }
  }

  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      if (isSceneNode(child)) {
        collectVariableUsagesFromNode(child, usages);
      }
    }
  }
}

function createDesignContextNode(node: SceneNode): BridgeDesignContextNode {
  const designNode: BridgeDesignContextNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: 'visible' in node ? node.visible : undefined,
    locked: 'locked' in node ? node.locked : undefined,
    opacity: 'opacity' in node && typeof node.opacity === 'number' ? node.opacity : undefined,
    blendMode: 'blendMode' in node && typeof node.blendMode === 'string' ? node.blendMode : undefined,
    x: 'x' in node && typeof node.x === 'number' ? node.x : undefined,
    y: 'y' in node && typeof node.y === 'number' ? node.y : undefined,
    width: 'width' in node && typeof node.width === 'number' ? node.width : undefined,
    height: 'height' in node && typeof node.height === 'number' ? node.height : undefined,
    absoluteBoundingBox: getRect('absoluteBoundingBox' in node ? node.absoluteBoundingBox : undefined),
    absoluteRenderBounds: getRect('absoluteRenderBounds' in node ? node.absoluteRenderBounds : undefined),
    relativeTransform: serializeMatrix('relativeTransform' in node ? node.relativeTransform : undefined),
    rotation: 'rotation' in node && typeof node.rotation === 'number' ? node.rotation : undefined,
    isMask: 'isMask' in node && typeof node.isMask === 'boolean' ? node.isMask : undefined,
    clipsContent:
      'clipsContent' in node && typeof node.clipsContent === 'boolean'
        ? node.clipsContent
        : undefined,
    constraints: makePostMessageSafe('constraints' in node ? node.constraints : undefined),
    layout: {
      layoutMode: 'layoutMode' in node && typeof node.layoutMode === 'string' ? node.layoutMode : undefined,
      primaryAxisSizingMode:
        'primaryAxisSizingMode' in node && typeof node.primaryAxisSizingMode === 'string'
          ? node.primaryAxisSizingMode
          : undefined,
      counterAxisSizingMode:
        'counterAxisSizingMode' in node && typeof node.counterAxisSizingMode === 'string'
          ? node.counterAxisSizingMode
          : undefined,
      primaryAxisAlignItems:
        'primaryAxisAlignItems' in node && typeof node.primaryAxisAlignItems === 'string'
          ? node.primaryAxisAlignItems
          : undefined,
      counterAxisAlignItems:
        'counterAxisAlignItems' in node && typeof node.counterAxisAlignItems === 'string'
          ? node.counterAxisAlignItems
          : undefined,
      layoutWrap: 'layoutWrap' in node && typeof node.layoutWrap === 'string' ? node.layoutWrap : undefined,
      itemSpacing: 'itemSpacing' in node && typeof node.itemSpacing === 'number' ? node.itemSpacing : undefined,
      counterAxisSpacing:
        'counterAxisSpacing' in node && typeof node.counterAxisSpacing === 'number'
          ? node.counterAxisSpacing
          : undefined,
      paddingTop: 'paddingTop' in node && typeof node.paddingTop === 'number' ? node.paddingTop : undefined,
      paddingRight:
        'paddingRight' in node && typeof node.paddingRight === 'number' ? node.paddingRight : undefined,
      paddingBottom:
        'paddingBottom' in node && typeof node.paddingBottom === 'number' ? node.paddingBottom : undefined,
      paddingLeft:
        'paddingLeft' in node && typeof node.paddingLeft === 'number' ? node.paddingLeft : undefined,
      layoutAlign: 'layoutAlign' in node && typeof node.layoutAlign === 'string' ? node.layoutAlign : undefined,
      layoutGrow: 'layoutGrow' in node && typeof node.layoutGrow === 'number' ? node.layoutGrow : undefined,
      layoutPositioning:
        'layoutPositioning' in node && typeof node.layoutPositioning === 'string'
          ? node.layoutPositioning
          : undefined
    },
    fills: serializePaints('fills' in node ? node.fills : undefined),
    strokes: serializePaints('strokes' in node ? node.strokes : undefined),
    strokeWeight:
      'strokeWeight' in node && typeof node.strokeWeight === 'number' ? node.strokeWeight : undefined,
    strokeJoin: 'strokeJoin' in node && typeof node.strokeJoin === 'string' ? node.strokeJoin : undefined,
    strokeCap: 'strokeCap' in node && typeof node.strokeCap === 'string' ? node.strokeCap : undefined,
    dashPattern:
      'dashPattern' in node && Array.isArray(node.dashPattern)
        ? node.dashPattern.filter((value): value is number => typeof value === 'number')
        : undefined,
    effects: serializeEffects('effects' in node ? node.effects : undefined),
    cornerRadius:
      'cornerRadius' in node &&
      (typeof node.cornerRadius === 'number' || node.cornerRadius === figma.mixed)
        ? node.cornerRadius
        : undefined,
    rectangleCornerRadii:
      'rectangleCornerRadii' in node && Array.isArray(node.rectangleCornerRadii)
        ? node.rectangleCornerRadii
        : undefined,
    individualStrokeWeights:
      'strokeTopWeight' in node ||
      'strokeRightWeight' in node ||
      'strokeBottomWeight' in node ||
      'strokeLeftWeight' in node
        ? {
            top: 'strokeTopWeight' in node && typeof node.strokeTopWeight === 'number' ? node.strokeTopWeight : undefined,
            right: 'strokeRightWeight' in node && typeof node.strokeRightWeight === 'number' ? node.strokeRightWeight : undefined,
            bottom: 'strokeBottomWeight' in node && typeof node.strokeBottomWeight === 'number' ? node.strokeBottomWeight : undefined,
            left: 'strokeLeftWeight' in node && typeof node.strokeLeftWeight === 'number' ? node.strokeLeftWeight : undefined
          }
        : undefined,
    text:
      node.type === 'TEXT'
        ? ({
            characters: node.characters,
            fontSize: typeof node.fontSize === 'number' ? node.fontSize : undefined,
            fontName: makePostMessageSafe(node.fontName),
            textAlignHorizontal: node.textAlignHorizontal,
            textAlignVertical: node.textAlignVertical,
            textAutoResize: node.textAutoResize,
            paragraphIndent: node.paragraphIndent,
            paragraphSpacing: node.paragraphSpacing,
            lineHeight: makePostMessageSafe(node.lineHeight),
            letterSpacing: makePostMessageSafe(node.letterSpacing),
            textCase: typeof node.textCase === 'string' ? node.textCase : undefined,
            textDecoration: typeof node.textDecoration === 'string' ? node.textDecoration : undefined,
            textStyleId: typeof node.textStyleId === 'string' ? node.textStyleId : undefined,
            fills: serializePaints(node.fills),
            boundVariables: makePostMessageSafe((node as TextNode & { boundVariables?: unknown }).boundVariables),
            segments: serializeTextSegments(node)
          } satisfies DesignContextText)
        : undefined,
    component: {
      componentId:
        'mainComponent' in node &&
        node.mainComponent &&
        typeof node.mainComponent.id === 'string'
          ? node.mainComponent.id
          : undefined,
      componentSetId:
        'componentSetId' in node && typeof node.componentSetId === 'string'
          ? node.componentSetId
          : undefined,
      key: 'key' in node && typeof node.key === 'string' ? node.key : undefined,
      description:
        'description' in node && typeof node.description === 'string' ? node.description : undefined,
      variantProperties:
        'variantProperties' in node && node.variantProperties && typeof node.variantProperties === 'object'
          ? { ...(node.variantProperties as Record<string, string>) }
          : undefined,
      componentProperties: makePostMessageSafe(
        'componentProperties' in node ? node.componentProperties : undefined
      )
    },
    variables: {
      boundVariables: makePostMessageSafe(
        (node as SceneNode & { boundVariables?: unknown }).boundVariables
      ),
      explicitVariableModes: makePostMessageSafe(
        (node as SceneNode & { explicitVariableModes?: unknown }).explicitVariableModes
      ) as Record<string, string> | undefined,
      resolvedVariableModes: makePostMessageSafe(
        (node as SceneNode & { resolvedVariableModes?: unknown }).resolvedVariableModes
      ) as Record<string, string> | undefined
    },
    exportSettings: serializeExportSettings('exportSettings' in node ? node.exportSettings : undefined)
  };

  if ('children' in node && Array.isArray(node.children) && node.children.length > 0) {
    designNode.children = node.children.filter(isSceneNode).map(createDesignContextNode);
  }

  return makePostMessageSafe(designNode) as unknown as BridgeDesignContextNode;
}

function collectTextContentFromDesignNode(node: BridgeDesignContextNode | undefined, chunks: string[]): void {
  if (!node) {
    return;
  }

  if (typeof node.text?.characters === 'string' && node.text.characters.trim()) {
    chunks.push(node.text.characters.trim());
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectTextContentFromDesignNode(child, chunks);
    }
  }
}

function summarizeDesignTree(node: BridgeDesignContextNode): { nodeCount: number; textNodeCount: number; maxDepth: number } {
  let nodeCount = 0;
  let textNodeCount = 0;
  let maxDepth = 0;

  function visit(current: BridgeDesignContextNode, depth: number): void {
    nodeCount += 1;
    if (current.type === 'TEXT') {
      textNodeCount += 1;
    }
    if (depth > maxDepth) {
      maxDepth = depth;
    }

    if (Array.isArray(current.children)) {
      for (const child of current.children) {
        visit(child, depth + 1);
      }
    }
  }

  visit(node, 1);
  return { nodeCount, textNodeCount, maxDepth };
}

function collectVariableAliasIds(
  value: unknown,
  path: string,
  usages: Map<string, Set<string>>,
  seen: WeakSet<object>
): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  const maybeAlias = value as VariableAliasRef & { type?: string };
  if ((maybeAlias.type === 'VARIABLE_ALIAS' || maybeAlias.id) && typeof maybeAlias.id === 'string') {
    const usageSet = usages.get(maybeAlias.id) ?? new Set<string>();
    usageSet.add(path || 'boundVariables');
    usages.set(maybeAlias.id, usageSet);
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    collectVariableAliasIds(nested, path ? `${path}.${key}` : key, usages, seen);
  }
}

function getVariablesApi(): VariablesApi | null {
  const pluginApi = figma as PluginAPI & { variables?: VariablesApi };
  return pluginApi.variables ?? null;
}

async function getVariableById(id: string): Promise<Variable | null> {
  const variablesApi = getVariablesApi();
  if (!variablesApi) {
    return null;
  }

  if (typeof variablesApi.getVariableByIdAsync === 'function') {
    return variablesApi.getVariableByIdAsync(id);
  }

  if (typeof variablesApi.getVariableById === 'function') {
    return variablesApi.getVariableById(id);
  }

  return null;
}

async function getVariableCollectionById(id: string): Promise<VariableCollection | null> {
  const variablesApi = getVariablesApi();
  if (!variablesApi) {
    return null;
  }

  if (typeof variablesApi.getVariableCollectionByIdAsync === 'function') {
    return variablesApi.getVariableCollectionByIdAsync(id);
  }

  if (typeof variablesApi.getVariableCollectionById === 'function') {
    return variablesApi.getVariableCollectionById(id);
  }

  return null;
}

function resolveVariableModeValue(variable: Variable, collection: VariableCollection | null): { modeName?: string; value?: unknown } {
  const defaultModeId = collection?.defaultModeId;
  const modeId = defaultModeId || Object.keys(variable.valuesByMode || {})[0];
  if (!modeId) {
    return {};
  }

  const modeName = collection?.modes?.find((mode) => mode.modeId === modeId)?.name;
  return {
    modeName,
    value: variable.valuesByMode?.[modeId]
  };
}

function getImagePaint(node: SceneNode): ImagePaint | null {
  if (!('fills' in node) || !Array.isArray(node.fills)) {
    return null;
  }

  const imageFill = node.fills.find((fill): fill is ImagePaint => fill.type === 'IMAGE' && fill.visible !== false);
  return imageFill ?? null;
}

function toBinaryAssetResult(nodeId: string, asset: ExportAsset): BridgeScreenshotResult {
  return {
    fileKey: getCurrentFileKey(),
    nodeId,
    mimeType: asset.mimeType,
    filename: asset.fileName,
    data: asset.dataUrl
  };
}

export function getPluginRuntimeInfo(): BridgeRuntimeInfo {
  return {
    fileKey: getCurrentFileKey(),
    fileName: figma.root.name,
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
    capabilities: [...PLUGIN_CAPABILITIES]
  };
}

export async function getNodeMetadata(nodeId: string): Promise<BridgeMetadataResult> {
  const node = await getSceneNodeByIdOrThrow(nodeId);
  return {
    fileKey: getCurrentFileKey(),
    nodeId,
    node: createMetadataNode(node)
  };
}

export async function getNodeDesignContext(nodeId: string): Promise<BridgeDesignContextResult> {
  const node = await getSceneNodeByIdOrThrow(nodeId);
  const designNode = createDesignContextNode(node);

  const textChunks: string[] = [];
  collectTextContentFromDesignNode(designNode, textChunks);
  const summary = summarizeDesignTree(designNode);

  return makePostMessageSafe({
    fileKey: getCurrentFileKey(),
    nodeId,
    node: designNode,
    textContent: textChunks.join('\n'),
    summary
  }) as unknown as BridgeDesignContextResult;
}

export async function getNodeScreenshot(nodeId: string): Promise<BridgeScreenshotResult> {
  const node = await getSceneNodeByIdOrThrow(nodeId);
  const exportContext = createExportContext();
  const asset = await exportNodeToPngAsset(node as SceneNode & ExportMixin, exportContext);

  if (!asset) {
    throw new Error('Node not found or not accessible');
  }

  return toBinaryAssetResult(nodeId, asset);
}

export async function getNodeVariableDefs(nodeId: string): Promise<BridgeVariableDefsResult> {
  const node = await getSceneNodeByIdOrThrow(nodeId);
  const usages = new Map<string, Set<string>>();

  collectVariableUsagesFromNode(node, usages);

  const variables: BridgeVariableDef[] = [];
  for (const [variableId, usagePaths] of usages.entries()) {
    const variable = await getVariableById(variableId);
    if (!variable) {
      continue;
    }

    const collection = variable.variableCollectionId
      ? await getVariableCollectionById(variable.variableCollectionId)
      : null;
    const resolved = resolveVariableModeValue(variable, collection);

    variables.push({
      id: variable.id,
      name: variable.name,
      collectionName: collection?.name,
      modeName: resolved.modeName,
      resolvedType: variable.resolvedType,
      value: resolved.value,
      scopes: [...variable.scopes],
      usage: [...usagePaths]
    });
  }

  return makePostMessageSafe({
    fileKey: getCurrentFileKey(),
    nodeId,
    variables
  }) as unknown as BridgeVariableDefsResult;
}

export async function downloadNodeImage(nodeId: string): Promise<BridgeDownloadImageResult> {
  const node = await getSceneNodeByIdOrThrow(nodeId);
  const exportContext = createExportContext();

  if (shouldRasterizeNodeForImageTransform(node)) {
    const rasterAsset = await exportNodeToPngAsset(node, exportContext);
    if (rasterAsset) {
      return {
        ...toBinaryAssetResult(nodeId, rasterAsset),
        source: 'node-export'
      };
    }
  }

  const imageFill = getImagePaint(node);
  if (imageFill) {
    const originalAsset = await getExportImageAsset(imageFill, node as SceneNode & ExportMixin, exportContext);
    if (originalAsset) {
      return {
        ...toBinaryAssetResult(nodeId, originalAsset),
        source: 'image-fill'
      };
    }
  }

  throw new Error('No image fill found on node');
}

export async function exportNodePng(nodeId: string): Promise<BridgeExportNodePngResult> {
  const node = await getSceneNodeByIdOrThrow(nodeId);
  const exportContext = createExportContext();
  const rasterAsset = await exportNodeToPngAsset(node as SceneNode & ExportMixin, exportContext);
  if (!rasterAsset) {
    throw new Error('Node not found or not accessible');
  }

  return {
    ...toBinaryAssetResult(nodeId, rasterAsset),
    source: 'node-export'
  };
}
