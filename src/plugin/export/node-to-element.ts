import {
  figmaEnumToLower,
  figmaGradientPaintToPenGradient,
  figmaSolidPaintToPenColor,
  rgbToHex,
  rgbaToHex
} from '../utils/color';
import {
  exportNodeToPngAsset,
  getExportImageAsset,
  isExportableImageNode,
  mapFigmaImageModeToPen,
  shouldRasterizeNodeForImageTransform
} from '../utils/image';
import {
  mapFigmaAlignItems,
  mapFontWeight,
  mapFigmaFontWeight,
  mapFigmaJustifyContent,
  mapFigmaTextAlign,
  mapFigmaTextAlignVertical
} from '../utils/layout';
import type { ExportContext, ExportedPenElement } from './types.js';
import type { PenEffect, PenFill, PenStroke, PenTextSegment } from '../../shared/pen';

type ExportableNode = SceneNode & PluginDataMixin;
type ExportableParentNode = BaseNode | null;
type ExportableFrameNode = (FrameNode | ComponentNode) & SceneNode;
type ExportableTextNode = TextNode & SceneNode;
type ExportableVectorNode = VectorNode & SceneNode;
type ExportableGeometryNode = SceneNode &
  GeometryMixin & {
    strokeWeight?: number;
    strokeAlign?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
    strokeCap?: 'NONE' | 'ROUND' | 'SQUARE' | 'LINE_ARROW' | 'TRIANGLE_ARROW' | 'CIRCLE_FILLED' | 'DIAMOND_FILLED';
    strokeJoin?: 'MITER' | 'BEVEL' | 'ROUND';
    cornerRadius?: number | PluginAPI['mixed'];
    topLeftRadius?: number;
    topRightRadius?: number;
    bottomRightRadius?: number;
    bottomLeftRadius?: number;
    effects?: ReadonlyArray<Effect>;
    opacity: number;
  };
type ExportableChildrenNode = SceneNode & ChildrenMixin;
type ExportableImageNode = SceneNode & ExportMixin;
type StyledExportTextSegment = PenTextSegment & {
  start: number;
  end: number;
  lineHeightPx?: number;
};

function mapFigmaLineHeightToPenValue(
  lineHeight: LineHeight | PluginAPI['mixed'] | undefined,
  fontSize: number | PluginAPI['mixed'] | undefined
): number | undefined {
  if (!lineHeight || lineHeight === figma.mixed) {
    return undefined;
  }

  const unit = String(lineHeight.unit);

  if (!('value' in lineHeight)) {
    return undefined;
  }

  if (unit === 'PERCENT' || unit === 'PERCENT_FONT_SIZE') {
    return lineHeight.value / 100;
  }

  if (unit === 'PIXELS' && typeof fontSize === 'number' && fontSize > 0) {
    return lineHeight.value / fontSize;
  }

  return undefined;
}

function mapFigmaLetterSpacingToPenValue(
  letterSpacing:
    | {
        value: number;
        unit: string;
      }
    | PluginAPI['mixed']
    | undefined,
  fontSize: number | PluginAPI['mixed'] | undefined
): number | undefined {
  if (!letterSpacing || letterSpacing === figma.mixed) {
    return undefined;
  }

  const unit = String(letterSpacing.unit);

  if (unit === 'PIXELS') {
    return letterSpacing.value;
  }

  if ((unit === 'PERCENT' || unit === 'PERCENT_FONT_SIZE') && typeof fontSize === 'number') {
    return (fontSize * letterSpacing.value) / 100;
  }

  return undefined;
}

export async function nodeToElementImpl(
  node: ExportableNode,
  exportContext: ExportContext | null = null,
  parentNode: ExportableParentNode = null
): Promise<ExportedPenElement | null> {
  let type = 'frame';

  if (node.type === 'RECTANGLE') type = 'rectangle';
  else if (node.type === 'ELLIPSE') type = 'ellipse';
  else if (node.type === 'TEXT') type = 'text';
  else if (node.type === 'LINE') type = 'line';
  else if (node.type === 'VECTOR') type = 'path';
  else if (node.type === 'GROUP') type = 'group';
  else if (node.type === 'COMPONENT') type = 'frame';
  else if (node.type === 'INSTANCE') type = 'ref';
  else if (node.type === 'FRAME') type = 'frame';

  const element: ExportedPenElement = {
    type,
    id: node.getPluginData('pencilId') || generateId(),
    name: node.name
  };

  if (node.x !== undefined) {
    const relativeX = parentNode && parentNode.type === 'GROUP'
      ? node.x - parentNode.x
      : node.x;
    element.x = Math.round(relativeX * 100) / 100;
  }
  if (node.y !== undefined) {
    const relativeY = parentNode && parentNode.type === 'GROUP'
      ? node.y - parentNode.y
      : node.y;
    element.y = Math.round(relativeY * 100) / 100;
  }

  if ('width' in node && node.width !== undefined) {
    element.width = Math.round(node.width * 100) / 100;
  }
  if ('height' in node && node.height !== undefined) {
    element.height = Math.round(node.height * 100) / 100;
  }

  if (shouldRasterizeNodeForImageTransform(node)) {
    const rasterAsset = await exportNodeToPngAsset(node, exportContext);
    if (rasterAsset) {
      element.type = 'frame';
      element.layout = 'none';
      element.fill = {
        type: 'image',
        url: `./${rasterAsset.fileName}`,
        mode: 'fill'
      };
      return element;
    }
  }

  if (node.type === 'FRAME' || node.type === 'COMPONENT') {
    const frameNode = node as ExportableFrameNode;
    if (frameNode.clipsContent) element.clip = true;

    if (frameNode.layoutMode === 'HORIZONTAL') {
      element.layout = 'horizontal';
    } else if (frameNode.layoutMode === 'VERTICAL') {
      element.layout = 'vertical';
    } else {
      element.layout = 'none';
    }

    if (frameNode.layoutMode !== 'NONE') {
      if (frameNode.itemSpacing) element.gap = frameNode.itemSpacing;

      if (frameNode.paddingTop || frameNode.paddingRight || frameNode.paddingBottom || frameNode.paddingLeft) {
        const pt = frameNode.paddingTop || 0;
        const pr = frameNode.paddingRight || 0;
        const pb = frameNode.paddingBottom || 0;
        const pl = frameNode.paddingLeft || 0;

        if (pt === pr && pr === pb && pb === pl) {
          element.padding = pt;
        } else if (pt === pb && pl === pr) {
          element.padding = [pt, pr];
        } else {
          element.padding = [pt, pr, pb, pl];
        }
      }

      if (frameNode.primaryAxisAlignItems) {
        element.justifyContent = mapFigmaJustifyContent(frameNode.primaryAxisAlignItems) as ExportedPenElement['justifyContent'];
      }
      if (frameNode.counterAxisAlignItems) {
        element.alignItems = mapFigmaAlignItems(frameNode.counterAxisAlignItems) as ExportedPenElement['alignItems'];
      }
    }

    if (frameNode.type === 'COMPONENT') {
      element.reusable = true;
    }
  }

  if (node.type === 'INSTANCE') {
    const mainComponent = node.mainComponent;
    if (mainComponent) {
      element.ref = mainComponent.getPluginData('pencilId') || mainComponent.id;
    }
  }

  if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const exportedFills = await mapFigmaPaintsToPenFills(node.fills, node, exportContext);
    if (exportedFills) {
      element.fill = exportedFills;
    }
  }

  if ('strokes' in node && node.strokes && node.strokes.length > 0) {
    const geometryNode = node as ExportableGeometryNode;
    const strokeWeight = geometryNode.strokeWeight;
    if (!strokeWeight || strokeWeight <= 0) {
      // no stroke
    } else {
      const exportedStrokeFills = await mapFigmaPaintsToPenFills(node.strokes, node, exportContext);
      if (exportedStrokeFills) {
        const exportedStroke: PenStroke = {
          align: geometryNode.strokeAlign ? toPenStrokeAlign(geometryNode.strokeAlign) : 'inside',
          thickness: strokeWeight,
          fill: exportedStrokeFills
        };
        if (geometryNode.strokeCap) {
          exportedStroke.cap = toPenStrokeCap(geometryNode.strokeCap);
        }
        if (geometryNode.strokeJoin) {
          exportedStroke.join = toPenStrokeJoin(geometryNode.strokeJoin);
        }
        element.stroke = exportedStroke;
      }
    }
  }

  if ('cornerRadius' in node && node.cornerRadius !== undefined) {
    const geometryNode = node as ExportableGeometryNode;
    if ('topLeftRadius' in geometryNode) {
      const tl = geometryNode.topLeftRadius || 0;
      const tr = geometryNode.topRightRadius || 0;
      const br = geometryNode.bottomRightRadius || 0;
      const bl = geometryNode.bottomLeftRadius || 0;

      if (tl === tr && tr === br && br === bl) {
        element.cornerRadius = tl;
      } else {
        element.cornerRadius = [tl, tr, br, bl];
      }
    } else {
      const radius = geometryNode.cornerRadius;
      if (typeof radius === 'number') {
        element.cornerRadius = radius;
      }
    }
  }

  const inferredCornerRadius = exportContext?.inferredCornerRadiusByNodeId.get(node.id);
  if (inferredCornerRadius !== undefined && shouldOverrideCornerRadius(element.cornerRadius, inferredCornerRadius)) {
    element.cornerRadius = Array.isArray(inferredCornerRadius)
      ? [...inferredCornerRadius] as ExportedPenElement['cornerRadius']
      : inferredCornerRadius;
  }

  if ('effects' in node) {
    const geometryNode = node as ExportableGeometryNode;
    if (geometryNode.effects && geometryNode.effects.length > 0) {
      const exportedEffects = mapFigmaEffectsToPenEffects(geometryNode.effects);
      if (exportedEffects) {
        element.effect = exportedEffects;
      }
    }
  }

  const geometryNode = node as ExportableGeometryNode;
  if (geometryNode.opacity !== undefined && geometryNode.opacity !== 1) {
    element.opacity = Math.round(geometryNode.opacity * 100) / 100;
  }

  if (node.type === 'TEXT') {
    const textNode = node as ExportableTextNode;
    element.content = textNode.characters;
    const styledTextSegments = await getStyledTextSegmentsForExport(textNode, exportContext);
    const exportedTextSegments = styledTextSegments?.map(stripSegmentMetadata);
    if (exportedTextSegments && exportedTextSegments.length > 0) {
      element.segments = exportedTextSegments;
    }
    if (typeof textNode.fontSize === 'number') {
      element.fontSize = textNode.fontSize;
    } else {
      const uniformFontSize = getUniformSegmentValue(exportedTextSegments, 'fontSize');
      if (typeof uniformFontSize === 'number') {
        element.fontSize = uniformFontSize;
      }
    }
    if (textNode.fontName !== figma.mixed) {
      element.fontFamily = textNode.fontName.family;
      element.fontWeight = mapFigmaFontWeight(textNode.fontName.style);
      if (textNode.fontName.style.toLowerCase().includes('italic')) {
        element.fontStyle = 'italic';
      }
    } else {
      const uniformFontFamily = getUniformSegmentValue(exportedTextSegments, 'fontFamily');
      const uniformFontWeight = getUniformSegmentValue(exportedTextSegments, 'fontWeight');
      const uniformFontStyle = getUniformSegmentValue(exportedTextSegments, 'fontStyle');
      if (typeof uniformFontFamily === 'string') {
        element.fontFamily = uniformFontFamily;
      }
      if (uniformFontWeight !== undefined) {
        element.fontWeight = uniformFontWeight;
      }
      if (typeof uniformFontStyle === 'string') {
        element.fontStyle = uniformFontStyle;
      }
    }

    if (textNode.textAlignHorizontal) {
      element.textAlign = mapFigmaTextAlign(textNode.textAlignHorizontal) as ExportedPenElement['textAlign'];
    }
    if (textNode.textAlignVertical) {
      element.textAlignVertical = mapFigmaTextAlignVertical(textNode.textAlignVertical) as ExportedPenElement['textAlignVertical'];
    }

    if (textNode.lineHeight && textNode.lineHeight !== figma.mixed) {
      const lineHeight = mapFigmaLineHeightToPenValue(textNode.lineHeight, textNode.fontSize);
      if (typeof lineHeight === 'number') {
        element.lineHeight = lineHeight;
      }
    } else {
      const uniformLineHeight = getUniformSegmentValue(exportedTextSegments, 'lineHeight');
      if (typeof uniformLineHeight === 'number') {
        element.lineHeight = uniformLineHeight;
      }
    }

    const letterSpacing = mapFigmaLetterSpacingToPenValue(
      (textNode as ExportableTextNode & { letterSpacing?: { value: number; unit: string } | PluginAPI['mixed'] })
        .letterSpacing,
      textNode.fontSize
    );
    if (typeof letterSpacing === 'number') {
      element.letterSpacing = letterSpacing;
    } else {
      const uniformLetterSpacing = getUniformSegmentValue(exportedTextSegments, 'letterSpacing');
      if (typeof uniformLetterSpacing === 'number') {
        element.letterSpacing = uniformLetterSpacing;
      }
    }

    if (element.fill === undefined) {
      const uniformFill = getUniformSegmentValue(exportedTextSegments, 'fill');
      if (uniformFill !== undefined) {
        element.fill = clonePenFill(uniformFill);
      }
    }

    const textGrowth = mapTextAutoResizeToPen((textNode as ExportableTextNode & { textAutoResize?: string }).textAutoResize);
    if (textGrowth) {
      element.textGrowth = textGrowth;
    }

    if (styledTextSegments && shouldExplodeMixedText(styledTextSegments)) {
      return await explodeTextSegmentsToGroup(element, textNode, styledTextSegments);
    }
  }

  if (node.type === 'VECTOR' && node.vectorPaths && node.vectorPaths.length > 0) {
    const vectorNode = node as ExportableVectorNode;
    element.geometry = vectorNode.vectorPaths[0]?.data;
  }

  if ('children' in node && node.children.length > 0) {
    const childrenNode = node as ExportableChildrenNode;
    element.children = [];
    for (const child of childrenNode.children) {
      const childElement = await nodeToElementImpl(child, exportContext, node);
      if (childElement) {
        element.children.push(childElement);
      }
    }
  }

  applyBonusBadgeCornerRadiusFallback(element, exportContext);

  return promoteContainerStyles(element);
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 7);
}

function applyBonusBadgeCornerRadiusFallback(
  element: ExportedPenElement,
  exportContext: ExportContext | null
): void {
  if (applyPathBadgeCornerRadiusFallback(element, exportContext)) {
    return;
  }

  if (!shouldOverrideCornerRadius(element.cornerRadius, [0, 4, 0, 4])) {
    return;
  }

  if (
    (element.type !== 'frame' && element.type !== 'group') ||
    typeof element.width !== 'number' ||
    typeof element.height !== 'number' ||
    element.width < 48 ||
    element.width > 96 ||
    element.height < 18 ||
    element.height > 28 ||
    element.stroke !== undefined ||
    element.effect !== undefined ||
    !isSolidPenFill(element.fill) ||
    !element.children ||
    element.children.length !== 1
  ) {
    return;
  }

  const textChild = element.children[0];
  if (
    !textChild ||
    textChild.type !== 'text' ||
    typeof textChild.content !== 'string' ||
    !/^加赠\s*\d+%$/.test(textChild.content.trim())
  ) {
    return;
  }

  element.cornerRadius = [0, 4, 0, 4];
}

function applyPathBadgeCornerRadiusFallback(
  element: ExportedPenElement,
  exportContext: ExportContext | null
): boolean {
  if (
    !shouldOverrideCornerRadius(element.cornerRadius, [0, 4, 0, 4]) ||
    (element.type !== 'frame' && element.type !== 'group') ||
    typeof element.width !== 'number' ||
    typeof element.height !== 'number' ||
    element.width < 48 ||
    element.width > 96 ||
    element.height < 18 ||
    element.height > 28 ||
    element.fill !== undefined ||
    element.stroke !== undefined ||
    element.effect !== undefined ||
    !element.children ||
    element.children.length !== 2
  ) {
    return false;
  }

  const pathChild = element.children.find((child) => child.type === 'path');
  const textChild = element.children.find((child): child is Extract<ExportedPenElement, { type: 'text' }> => child.type === 'text');

  if (
    !pathChild ||
    !textChild ||
    typeof textChild.content !== 'string' ||
    !/^加赠\s*\d+%$/.test(textChild.content.trim())
  ) {
    return false;
  }

  element.cornerRadius = [0, 4, 0, 4];
  return true;
}

function isSolidPenFill(fill: ExportedPenElement['fill']): boolean {
  if (!fill) {
    return false;
  }

  if (Array.isArray(fill)) {
    return fill.length === 1 && isSolidPenFill(fill[0]);
  }

  return typeof fill === 'string' || fill.type === 'color';
}

function toPenStrokeAlign(value: NonNullable<ExportableGeometryNode['strokeAlign']>): NonNullable<PenStroke['align']> {
  return figmaEnumToLower(value) as NonNullable<PenStroke['align']>;
}

function toPenStrokeCap(value: NonNullable<ExportableGeometryNode['strokeCap']>): NonNullable<PenStroke['cap']> {
  return figmaEnumToLower(value) as NonNullable<PenStroke['cap']>;
}

function toPenStrokeJoin(value: NonNullable<ExportableGeometryNode['strokeJoin']>): NonNullable<PenStroke['join']> {
  return figmaEnumToLower(value) as NonNullable<PenStroke['join']>;
}

async function mapFigmaPaintsToPenFills(
  paints: ReadonlyArray<Paint>,
  node: ExportableNode,
  exportContext: ExportContext | null
): Promise<PenFill | PenFill[] | undefined> {
  const exportedFills: PenFill[] = [];

  for (const paint of paints) {
    const exportedFill = await mapFigmaPaintToPenFill(paint, node, exportContext);
    if (exportedFill) {
      exportedFills.push(exportedFill);
    }
  }

  if (exportedFills.length === 0) {
    return undefined;
  }

  return exportedFills.length === 1 ? exportedFills[0] : exportedFills;
}

async function mapFigmaPaintToPenFill(
  paint: Paint,
  node: ExportableNode,
  exportContext: ExportContext | null
): Promise<PenFill | null> {
  if (!paint || paint.visible === false) {
    return null;
  }

  if (paint.type === 'SOLID') {
    return figmaSolidPaintToPenColor(paint) || rgbToHex(paint.color);
  }

  if (
    paint.type === 'GRADIENT_LINEAR' ||
    paint.type === 'GRADIENT_RADIAL' ||
    paint.type === 'GRADIENT_ANGULAR' ||
    paint.type === 'GRADIENT_DIAMOND'
  ) {
    return figmaGradientPaintToPenGradient(paint) as PenFill | null;
  }

  if (paint.type === 'IMAGE' && isExportableImageNode(node)) {
    const asset = await getExportImageAsset(paint, node, exportContext);
    if (asset) {
      return {
        type: 'image',
        url: `./${asset.fileName}`,
        mode: mapFigmaImageModeToPen(paint.scaleMode)
      };
    }
  }

  return null;
}

async function getStyledTextSegmentsForExport(
  textNode: ExportableTextNode,
  exportContext: ExportContext | null
): Promise<StyledExportTextSegment[] | undefined> {
  const getStyledTextSegments = (
    textNode as ExportableTextNode & {
      getStyledTextSegments?: (fields: string[]) => Array<{
        characters: string;
        start?: number;
        end?: number;
        fontSize?: number | PluginAPI['mixed'];
        fontName?: FontName | PluginAPI['mixed'];
        fills?: ReadonlyArray<Paint> | PluginAPI['mixed'];
        lineHeight?: LineHeight | PluginAPI['mixed'];
        letterSpacing?: { value: number; unit: string } | PluginAPI['mixed'];
      }>;
    }
  ).getStyledTextSegments;

  if (typeof getStyledTextSegments !== 'function') {
    return undefined;
  }

  const hasMixedStyle =
    textNode.fontSize === figma.mixed ||
    textNode.fontName === figma.mixed ||
    textNode.fills === figma.mixed ||
    textNode.lineHeight === figma.mixed;

  const rawSegments = getStyledTextSegments.call(textNode, ['fontSize', 'fontName', 'fills', 'lineHeight', 'letterSpacing']);
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    return undefined;
  }

  if (!hasMixedStyle && rawSegments.length === 1) {
    return undefined;
  }

  const segments: StyledExportTextSegment[] = [];
  let cursor = 0;

  for (const rawSegment of rawSegments) {
    if (!rawSegment || typeof rawSegment.characters !== 'string' || rawSegment.characters.length === 0) {
      continue;
    }

    const start = typeof rawSegment.start === 'number' ? rawSegment.start : cursor;
    const end = typeof rawSegment.end === 'number' ? rawSegment.end : start + rawSegment.characters.length;
    cursor = end;

    const segment: StyledExportTextSegment = {
      content: rawSegment.characters,
      start,
      end
    };

    if (typeof rawSegment.fontSize === 'number') {
      segment.fontSize = rawSegment.fontSize;
    }

    if (rawSegment.fontName && rawSegment.fontName !== figma.mixed) {
      segment.fontFamily = rawSegment.fontName.family;
      segment.fontWeight = mapFigmaFontWeight(rawSegment.fontName.style);
      if (rawSegment.fontName.style.toLowerCase().includes('italic')) {
        segment.fontStyle = 'italic';
      }
    }

    if (rawSegment.lineHeight && rawSegment.lineHeight !== figma.mixed) {
      const lineHeight = mapFigmaLineHeightToPenValue(rawSegment.lineHeight, rawSegment.fontSize);
      const lineHeightUnit = String(rawSegment.lineHeight.unit);
      if (typeof lineHeight === 'number') {
        segment.lineHeight = lineHeight;
        if ((lineHeightUnit === 'PERCENT' || lineHeightUnit === 'PERCENT_FONT_SIZE') && typeof rawSegment.fontSize === 'number') {
          segment.lineHeightPx = rawSegment.fontSize * segment.lineHeight;
        } else if (lineHeightUnit === 'PIXELS' && 'value' in rawSegment.lineHeight) {
          segment.lineHeightPx = rawSegment.lineHeight.value;
        }
      }
    }

    const letterSpacing = mapFigmaLetterSpacingToPenValue(rawSegment.letterSpacing, rawSegment.fontSize);
    if (typeof letterSpacing === 'number') {
      segment.letterSpacing = letterSpacing;
    }

    if (Array.isArray(rawSegment.fills) && rawSegment.fills.length > 0) {
      const fill = await mapFigmaPaintsToPenFills(rawSegment.fills, textNode, exportContext);
      if (fill !== undefined) {
        segment.fill = fill;
      }
    }

    segments.push(segment);
  }

  return segments.length > 0 ? segments : undefined;
}

function stripSegmentMetadata(segment: StyledExportTextSegment): PenTextSegment {
  const { start, end, lineHeightPx, ...penSegment } = segment;
  void start;
  void end;
  void lineHeightPx;
  return penSegment;
}

function shouldExplodeMixedText(segments: StyledExportTextSegment[] | undefined): boolean {
  if (!segments || segments.length <= 1) {
    return false;
  }

  const trackedKeys: Array<keyof PenTextSegment> = ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'fill', 'letterSpacing'];
  return trackedKeys.some((key) => getUniformSegmentValue(segments, key) === undefined);
}

async function explodeTextSegmentsToGroup(
  element: ExportedPenElement,
  textNode: ExportableTextNode,
  segments: StyledExportTextSegment[]
): Promise<ExportedPenElement> {
  const container: ExportedPenElement = {
    type: 'group',
    id: element.id,
    name: element.name,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    opacity: element.opacity,
    children: []
  };

  const measuredLines = await measureExplodedTextLines(textNode, segments);
  if (measuredLines.length === 0) {
    return element;
  }

  let currentY = 0;
  const containerWidth = typeof element.width === 'number' ? element.width : undefined;

  for (const line of measuredLines) {
    const lineWidth = line.reduce((sum, piece) => sum + piece.width, 0);
    const lineHeight = line.reduce((max, piece) => Math.max(max, piece.height), 0);
    const alignmentOffset = getLineAlignmentOffset(element.textAlign, containerWidth, lineWidth);
    let currentX = alignmentOffset;

    for (const piece of line) {
      const pieceY = currentY + Math.max(lineHeight - piece.height, 0);
      const child: ExportedPenElement = {
        type: 'text',
        id: generateId(),
        name: piece.content,
        x: Math.round(currentX * 100) / 100,
        y: Math.round(pieceY * 100) / 100,
        width: Math.round(piece.width * 100) / 100,
        height: Math.round(piece.height * 100) / 100,
        content: piece.content,
        fontFamily: piece.fontFamily,
        fontSize: piece.fontSize,
        fontWeight: piece.fontWeight,
        fontStyle: piece.fontStyle,
        lineHeight: piece.lineHeight,
        textAlign: 'left',
        textAlignVertical: 'top',
        textGrowth: 'auto'
      };
      if (piece.fill !== undefined) {
        child.fill = clonePenFill(piece.fill);
      }
      container.children?.push(child);
      currentX += piece.width;
    }

    currentY += lineHeight;
  }

  if (container.children && container.children.length === 1) {
    const onlyChild = container.children[0];
    if (onlyChild) {
      onlyChild.id = container.id;
      onlyChild.name = container.name;
      onlyChild.x = container.x;
      onlyChild.y = container.y;
      return onlyChild;
    }
  }

  return container;
}

type MeasuredTextPiece = PenTextSegment & {
  width: number;
  height: number;
};

async function measureExplodedTextLines(
  textNode: ExportableTextNode,
  segments: StyledExportTextSegment[]
): Promise<MeasuredTextPiece[][]> {
  const lines: MeasuredTextPiece[][] = [[]];

  for (const segment of segments) {
    const parts = segment.content.split('\n');

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index] || '';
      if (part.length > 0) {
        const measuredPiece = await measureTextPiece(part, segment, textNode);
        lines[lines.length - 1]?.push(measuredPiece);
      }

      if (index < parts.length - 1) {
        lines.push([]);
      }
    }
  }

  return lines.filter((line, index) => line.length > 0 || index === 0);
}

async function measureTextPiece(
  content: string,
  segment: StyledExportTextSegment,
  textNode: ExportableTextNode
): Promise<MeasuredTextPiece> {
  const fallbackFontFamily =
    textNode.fontName !== figma.mixed ? textNode.fontName.family : segment.fontFamily || 'Inter';
  const fallbackFontStyle =
    textNode.fontName !== figma.mixed ? textNode.fontName.style : resolveFigmaFontStyle(segment.fontWeight, segment.fontStyle);
  let resolvedFontName: FontName = {
    family: segment.fontFamily || fallbackFontFamily,
    style: resolveFigmaFontStyle(segment.fontWeight, segment.fontStyle, fallbackFontStyle)
  };

  try {
    await figma.loadFontAsync(resolvedFontName);
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    resolvedFontName = { family: 'Inter', style: 'Regular' };
  }

  const temp = figma.createText();
  temp.fontName = resolvedFontName;
  temp.characters = content;
  if (typeof segment.fontSize === 'number') {
    temp.fontSize = segment.fontSize;
  }
  if (typeof segment.lineHeight === 'number') {
    temp.lineHeight = { unit: 'PERCENT', value: segment.lineHeight * 100 };
  }

  const width = temp.width;
  const height = typeof segment.lineHeightPx === 'number' ? segment.lineHeightPx : temp.height;
  temp.remove();

  return {
    content,
    fontFamily: segment.fontFamily,
    fontSize: segment.fontSize,
    fontWeight: segment.fontWeight,
    fontStyle: segment.fontStyle,
    lineHeight: segment.lineHeight,
    fill: segment.fill,
    width,
    height
  };
}

function resolveFigmaFontStyle(
  fontWeight: PenTextSegment['fontWeight'],
  fontStyle: PenTextSegment['fontStyle'],
  fallback = 'Regular'
): string {
  const baseStyle = fontWeight ? mapFontWeight(fontWeight) : fallback;
  if (fontStyle === 'italic' && !baseStyle.toLowerCase().includes('italic')) {
    return `${baseStyle} Italic`.trim();
  }
  return baseStyle;
}

function getLineAlignmentOffset(
  textAlign: ExportedPenElement['textAlign'],
  containerWidth: number | undefined,
  lineWidth: number
): number {
  if (containerWidth === undefined) {
    return 0;
  }

  if (textAlign === 'center') {
    return Math.max((containerWidth - lineWidth) / 2, 0);
  }

  if (textAlign === 'right') {
    return Math.max(containerWidth - lineWidth, 0);
  }

  return 0;
}

function mapTextAutoResizeToPen(value: string | undefined): ExportedPenElement['textGrowth'] | undefined {
  if (value === 'WIDTH_AND_HEIGHT') {
    return 'auto';
  }
  if (value === 'HEIGHT' || value === 'TRUNCATE') {
    return 'fixed-width';
  }
  if (value === 'NONE') {
    return 'fixed-width-height';
  }
  return undefined;
}

function getUniformSegmentValue<K extends keyof PenTextSegment>(
  segments: PenTextSegment[] | undefined,
  key: K
): PenTextSegment[K] | undefined {
  if (!segments || segments.length === 0) {
    return undefined;
  }

  const firstValue = segments[0]?.[key];
  if (firstValue === undefined) {
    return undefined;
  }

  for (let index = 1; index < segments.length; index++) {
    const candidate = segments[index]?.[key];
    if (JSON.stringify(candidate) !== JSON.stringify(firstValue)) {
      return undefined;
    }
  }

  return firstValue;
}

function clonePenFill(fill: PenFill | PenFill[]): PenFill | PenFill[] {
  return JSON.parse(JSON.stringify(fill)) as PenFill | PenFill[];
}

function mapFigmaEffectsToPenEffects(effects: ReadonlyArray<Effect>): PenEffect | PenEffect[] | undefined {
  const exportedEffects: PenEffect[] = [];

  for (const effect of effects) {
    if (!effect.visible) continue;

    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
      exportedEffects.push({
        type: 'shadow',
        shadowType: effect.type === 'INNER_SHADOW' ? 'inner' : 'outer',
        color: rgbaToHex(effect.color),
        offset: {
          x: effect.offset.x,
          y: effect.offset.y
        },
        blur: effect.radius,
        spread: effect.spread || 0
      });
    } else if (effect.type === 'LAYER_BLUR') {
      exportedEffects.push({
        type: 'blur',
        radius: effect.radius
      });
    } else if (effect.type === 'BACKGROUND_BLUR') {
      exportedEffects.push({
        type: 'background_blur',
        radius: effect.radius
      });
    }
  }

  if (exportedEffects.length === 0) {
    return undefined;
  }

  return exportedEffects.length === 1 ? exportedEffects[0] : exportedEffects;
}

function promoteContainerStyles(element: ExportedPenElement): ExportedPenElement {
  if (!element.children || element.children.length === 0) {
    normalizeGraphicContainerType(element);
    return element;
  }

  let changed = true;
  while (changed) {
    changed = promoteStructuralChild(element);
  }

  if (!element.stroke) {
    const previewStroke = createDecorativeStrokePreview(element);
    if (previewStroke) {
      element.stroke = previewStroke;
    }
  }

  if (element.children.length === 0) {
    delete element.children;
  }

  normalizeGraphicContainerType(element);
  return element;
}

function promoteStructuralChild(parent: ExportedPenElement): boolean {
  if (!parent.children) return false;

  for (let index = 0; index < parent.children.length; index++) {
    const child = parent.children[index];
    if (!isFullSizeAtOrigin(parent, child)) {
      continue;
    }

    if ((child.type === 'group' || child.type === 'frame') && hasHoistableStyles(child)) {
      hoistChildStyles(parent, child);
      clearHoistedStyles(child);
      return true;
    }

    if (child.type === 'rectangle' || isRectLikePath(child)) {
      hoistChildStyles(parent, child);
      parent.children.splice(index, 1);
      return true;
    }

    if ((child.type === 'group' || child.type === 'frame') && isStructuralWrapper(child)) {
      hoistChildStyles(parent, child);
      const flattenedChildren = (child.children || []).map((grandChild) => offsetChild(grandChild, child.x, child.y));
      parent.children.splice(index, 1, ...flattenedChildren);
      return true;
    }
  }

  return false;
}

function isFullSizeAtOrigin(parent: ExportedPenElement, child: ExportedPenElement): boolean {
  return (
    child.x === 0 &&
    child.y === 0 &&
    typeof parent.width === 'number' &&
    typeof parent.height === 'number' &&
    typeof child.width === 'number' &&
    typeof child.height === 'number' &&
    Math.abs(child.width - parent.width) < 0.01 &&
    Math.abs(child.height - parent.height) < 0.01
  );
}

function isStructuralWrapper(element: ExportedPenElement): boolean {
  return (
    (element.type === 'group' || element.type === 'frame') &&
    (element.layout === undefined || element.layout === 'none') &&
    !element.clip &&
    !element.fill &&
    !element.stroke &&
    !element.effect &&
    (element.opacity === undefined || element.opacity === 1) &&
    !element.reusable &&
    !('ref' in element)
  );
}

function hasHoistableStyles(element: ExportedPenElement): boolean {
  return (
    element.fill !== undefined ||
    element.stroke !== undefined ||
    element.effect !== undefined ||
    element.cornerRadius !== undefined
  );
}

function isRectLikePath(element: ExportedPenElement): boolean {
  if (element.type !== 'path' || typeof element.geometry !== 'string') {
    return false;
  }

  if (typeof element.width !== 'number' || typeof element.height !== 'number') {
    return false;
  }

  const match = element.geometry.match(
    /^M 0 0 L ([+-]?\d*\.?\d+) 0 L \1 ([+-]?\d*\.?\d+) L 0 \2 L 0 0 Z$/
  );

  if (!match) {
    return false;
  }

  const pathWidth = Number.parseFloat(match[1] || '0');
  const pathHeight = Number.parseFloat(match[2] || '0');

  return Math.abs(pathWidth - element.width) < 0.01 && Math.abs(pathHeight - element.height) < 0.01;
}

function hoistChildStyles(parent: ExportedPenElement, child: ExportedPenElement): void {
  if (!parent.fill && child.fill) {
    parent.fill = child.fill;
  }

  if (!parent.stroke && child.stroke) {
    parent.stroke = child.stroke;
  }

  if (!parent.effect && child.effect) {
    parent.effect = child.effect;
  }

  if (shouldOverrideCornerRadius(parent.cornerRadius, child.cornerRadius)) {
    parent.cornerRadius = child.cornerRadius;
  }
}

function clearHoistedStyles(element: ExportedPenElement): void {
  delete element.fill;
  delete element.stroke;
  delete element.effect;
  delete element.cornerRadius;
}

function normalizeGraphicContainerType(element: ExportedPenElement): void {
  if (element.type !== 'group') {
    return;
  }

  const needsGraphicContainer =
    element.fill !== undefined ||
    element.stroke !== undefined ||
    element.cornerRadius !== undefined;

  if (!needsGraphicContainer) {
    return;
  }

  element.type = 'frame';
  if (element.layout === undefined) {
    element.layout = 'none';
  }
}

function shouldOverrideCornerRadius(
  parentRadius: ExportedPenElement['cornerRadius'],
  childRadius: ExportedPenElement['cornerRadius']
): boolean {
  if (childRadius === undefined) {
    return false;
  }

  if (parentRadius === undefined) {
    return true;
  }

  if (typeof parentRadius === 'number') {
    return parentRadius === 0 && childRadius !== 0;
  }

  return Array.isArray(parentRadius) && parentRadius.every((value: number) => value === 0);
}

function offsetChild(child: ExportedPenElement, offsetX = 0, offsetY = 0): ExportedPenElement {
  const clonedChild: ExportedPenElement = {
    ...child
  };

  if (typeof clonedChild.x === 'number') {
    clonedChild.x += offsetX;
  }
  if (typeof clonedChild.y === 'number') {
    clonedChild.y += offsetY;
  }

  return clonedChild;
}

function createDecorativeStrokePreview(element: ExportedPenElement): PenStroke | null {
  if (typeof element.height !== 'number' || !element.children) {
    return null;
  }

  const containerHeight = element.height;

  const edgeLines: Array<{ y: number; stroke: PenStroke }> = [];
  collectHorizontalEdgeLines(element.children, 0, edgeLines);

  const topLine = edgeLines.find((line) => Math.abs(line.y) < 0.01);
  const bottomLine = edgeLines.find((line) => Math.abs(line.y - containerHeight) < 0.01);

  if (!topLine || !bottomLine || !areStrokesEquivalent(topLine.stroke, bottomLine.stroke)) {
    return null;
  }

  return {
    ...topLine.stroke,
    fill: disablePenFill(topLine.stroke.fill)
  };
}

function collectHorizontalEdgeLines(
  children: ExportedPenElement[],
  offsetY: number,
  result: Array<{ y: number; stroke: PenStroke }>
): void {
  for (const child of children) {
    const childY = offsetY + (typeof child.y === 'number' ? child.y : 0);

    if ((child.type === 'path' || child.type === 'line') && child.stroke && child.height === 0) {
      result.push({
        y: childY,
        stroke: child.stroke
      });
    }

    if (child.children && child.children.length > 0) {
      collectHorizontalEdgeLines(child.children, childY, result);
    }
  }
}

function areStrokesEquivalent(left: PenStroke, right: PenStroke): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function disablePenFill(fill: PenStroke['fill']): PenStroke['fill'] {
  if (!fill) {
    return fill;
  }

  if (Array.isArray(fill)) {
    return fill.map((item) => disableSingleFill(item));
  }

  return disableSingleFill(fill);
}

function disableSingleFill(fill: PenFill): PenFill {
  if (typeof fill === 'string') {
    return {
      type: 'color',
      color: fill,
      enabled: false
    };
  }

  return {
    ...fill,
    enabled: false
  };
}
