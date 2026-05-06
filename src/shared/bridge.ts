export type PluginCapability =
  | 'read.metadata'
  | 'read.designContext'
  | 'read.screenshot'
  | 'read.variableDefs'
  | 'read.downloadImage'
  | 'read.exportNodePng';

export type BridgeRuntimeInfo = {
  fileKey?: string;
  fileName?: string;
  pageId?: string;
  pageName?: string;
  capabilities: PluginCapability[];
};

export type BridgeNodeBounds = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type BridgeMetadataNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  bounds?: BridgeNodeBounds;
  children?: BridgeMetadataNode[];
};

export type BridgeMetadataResult = {
  fileKey?: string;
  nodeId: string;
  node: BridgeMetadataNode;
};

export type BridgeSerializedPaint = {
  type: string;
  visible?: boolean;
  opacity?: number;
  blendMode?: string;
  color?: unknown;
  gradientStops?: unknown[];
  gradientTransform?: number[][];
  scaleMode?: string;
  imageHash?: string | null;
  imageTransform?: number[][];
  rotation?: number;
  filters?: Record<string, unknown>;
  gifRef?: string | null;
  isMask?: boolean;
  boundVariables?: unknown;
};

export type BridgeSerializedEffect = {
  type: string;
  visible?: boolean;
  radius?: number;
  spread?: number;
  blendMode?: string;
  color?: unknown;
  offset?: { x: number; y: number };
  boundVariables?: unknown;
};

export type BridgeSerializedExportSetting = {
  format: string;
  suffix?: string;
  constraint?: unknown;
};

export type BridgeDesignContextNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blendMode?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  absoluteBoundingBox?: BridgeNodeBounds | null;
  absoluteRenderBounds?: BridgeNodeBounds | null;
  relativeTransform?: number[][];
  rotation?: number;
  isMask?: boolean;
  clipsContent?: boolean;
  constraints?: unknown;
  layout?: {
    layoutMode?: string;
    primaryAxisSizingMode?: string;
    counterAxisSizingMode?: string;
    primaryAxisAlignItems?: string;
    counterAxisAlignItems?: string;
    layoutWrap?: string;
    itemSpacing?: number;
    counterAxisSpacing?: number;
    paddingTop?: number;
    paddingRight?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    layoutAlign?: string;
    layoutGrow?: number;
    layoutPositioning?: string;
  };
  fills?: BridgeSerializedPaint[];
  strokes?: BridgeSerializedPaint[];
  strokeWeight?: number;
  strokeJoin?: string;
  strokeCap?: string;
  dashPattern?: number[];
  effects?: BridgeSerializedEffect[];
  cornerRadius?: number | typeof figma.mixed | unknown;
  rectangleCornerRadii?: readonly number[];
  individualStrokeWeights?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  text?: {
    characters?: string;
    fontSize?: number;
    fontName?: unknown;
    textAlignHorizontal?: string;
    textAlignVertical?: string;
    textAutoResize?: string;
    paragraphIndent?: number;
    paragraphSpacing?: number;
    lineHeight?: unknown;
    letterSpacing?: unknown;
    textCase?: string;
    textDecoration?: string;
    textStyleId?: string;
    fills?: BridgeSerializedPaint[];
    boundVariables?: unknown;
    segments?: Array<{
      characters: string;
      start: number;
      end: number;
      fontSize?: number;
      fontName?: unknown;
      fills?: BridgeSerializedPaint[];
      lineHeight?: unknown;
      letterSpacing?: unknown;
      textDecoration?: string;
      textCase?: string;
    }>;
  };
  component?: {
    componentId?: string;
    componentSetId?: string;
    key?: string;
    description?: string;
    variantProperties?: Record<string, string>;
    componentProperties?: unknown;
  };
  variables?: {
    boundVariables?: unknown;
    explicitVariableModes?: Record<string, string>;
    resolvedVariableModes?: Record<string, string>;
  };
  exportSettings?: BridgeSerializedExportSetting[];
  children?: BridgeDesignContextNode[];
};

export type BridgeDesignContextResult = {
  fileKey?: string;
  nodeId: string;
  node: BridgeDesignContextNode;
  textContent?: string;
  summary?: {
    nodeCount: number;
    textNodeCount: number;
    maxDepth: number;
  };
};

export type BridgeBinaryAssetResult = {
  fileKey?: string;
  nodeId: string;
  mimeType: string;
  filename: string;
  data: string;
};

export type BridgeScreenshotResult = BridgeBinaryAssetResult;

export type BridgeDownloadImageResult = BridgeBinaryAssetResult & {
  source: 'image-fill' | 'node-export';
};

export type BridgeExportNodePngResult = BridgeBinaryAssetResult & {
  source: 'node-export';
};

export type BridgeVariableDef = {
  id?: string;
  name: string;
  collectionName?: string;
  modeName?: string;
  resolvedType?: string;
  value?: unknown;
  scopes?: string[];
  usage?: string[];
};

export type BridgeVariableDefsResult = {
  fileKey?: string;
  nodeId: string;
  variables: BridgeVariableDef[];
};

export type BridgeSuccessPayload =
  | { kind: 'read.metadata'; result: BridgeMetadataResult }
  | { kind: 'read.designContext'; result: BridgeDesignContextResult }
  | { kind: 'read.screenshot'; result: BridgeScreenshotResult }
  | { kind: 'read.variableDefs'; result: BridgeVariableDefsResult }
  | { kind: 'read.downloadImage'; result: BridgeDownloadImageResult }
  | { kind: 'read.exportNodePng'; result: BridgeExportNodePngResult }
  | { kind: 'bridge.runtimeInfo'; result: BridgeRuntimeInfo };

export type BridgeCommand =
  | {
      kind: 'bridge.getRuntimeInfo';
      requestId: string;
      timestamp: number;
    }
  | {
      kind: 'bridge.read.metadata';
      requestId: string;
      timestamp: number;
      payload: { nodeId: string };
    }
  | {
      kind: 'bridge.read.designContext';
      requestId: string;
      timestamp: number;
      payload: { nodeId: string };
    }
  | {
      kind: 'bridge.read.screenshot';
      requestId: string;
      timestamp: number;
      payload: { nodeId: string };
    }
  | {
      kind: 'bridge.read.variableDefs';
      requestId: string;
      timestamp: number;
      payload: { nodeId: string };
    }
  | {
      kind: 'bridge.read.downloadImage';
      requestId: string;
      timestamp: number;
      payload: { nodeId: string };
    }
  | {
      kind: 'bridge.read.exportNodePng';
      requestId: string;
      timestamp: number;
      payload: { nodeId: string };
    }
  | {
      kind: 'bridge.ping';
      requestId: string;
      timestamp: number;
    };

export type PluginEvent =
  | {
      kind: 'plugin.hello';
      pluginSessionId: string;
      timestamp: number;
      payload: BridgeRuntimeInfo;
    }
  | {
      kind: 'plugin.result';
      pluginSessionId: string;
      requestId: string;
      timestamp: number;
      payload: BridgeSuccessPayload;
    }
  | {
      kind: 'plugin.error';
      pluginSessionId: string;
      requestId: string;
      timestamp: number;
      payload: { error: string };
    }
  | {
      kind: 'plugin.pong';
      pluginSessionId: string;
      requestId: string;
      timestamp: number;
    };
