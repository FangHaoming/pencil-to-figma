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
  mapFigmaImageModeToPen
} from '../utils/image';
import {
  mapFigmaAlignItems,
  mapFigmaFontWeight,
  mapFigmaJustifyContent,
  mapFigmaTextAlign,
  mapFigmaTextAlignVertical
} from '../utils/layout';
import type { ExportContext, ExportedPenElement } from './types.js';
import type { PenFill, PenStroke } from '../../shared/pen';

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

  if (node.type === 'GROUP' && node.locked === true && isExportableImageNode(node)) {
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
    const fill = node.fills[0];
    if (fill.visible === false) {
      // skip invisible top fill
    } else if (fill.type === 'SOLID') {
      const penColor = figmaSolidPaintToPenColor(fill);
      if (penColor) {
        element.fill = penColor;
      }
    } else if (
      fill.type === 'GRADIENT_LINEAR' ||
      fill.type === 'GRADIENT_RADIAL' ||
      fill.type === 'GRADIENT_ANGULAR' ||
      fill.type === 'GRADIENT_DIAMOND'
    ) {
      const penGrad = figmaGradientPaintToPenGradient(fill);
      if (penGrad) {
        element.fill = penGrad as PenFill;
      }
    } else if (fill.type === 'IMAGE' && isExportableImageNode(node)) {
      const asset = await getExportImageAsset(fill, node, exportContext);
      if (asset) {
        element.fill = {
          type: 'image',
          url: `./${asset.fileName}`,
          mode: mapFigmaImageModeToPen(fill.scaleMode)
        };
      }
    }
  }

  if ('strokes' in node && node.strokes && node.strokes.length > 0) {
    const geometryNode = node as ExportableGeometryNode;
    const stroke = node.strokes[0];
    const strokeWeight = geometryNode.strokeWeight;
    if (!strokeWeight || strokeWeight <= 0) {
      // no stroke
    } else if (stroke.visible === false) {
      // no stroke
    } else if (stroke.type === 'SOLID') {
      const exportedStroke: PenStroke = {
        align: geometryNode.strokeAlign ? toPenStrokeAlign(geometryNode.strokeAlign) : 'inside',
        thickness: strokeWeight,
        fill: figmaSolidPaintToPenColor(stroke) || rgbToHex(stroke.color)
      };

      if (geometryNode.strokeCap) {
        exportedStroke.cap = toPenStrokeCap(geometryNode.strokeCap);
      }
      if (geometryNode.strokeJoin) {
        exportedStroke.join = toPenStrokeJoin(geometryNode.strokeJoin);
      }
      element.stroke = exportedStroke;
    } else if (
      stroke.type === 'GRADIENT_LINEAR' ||
      stroke.type === 'GRADIENT_RADIAL' ||
      stroke.type === 'GRADIENT_ANGULAR' ||
      stroke.type === 'GRADIENT_DIAMOND'
    ) {
      const penGrad = figmaGradientPaintToPenGradient(stroke);
      if (penGrad) {
        const exportedStroke: PenStroke = {
          align: geometryNode.strokeAlign ? toPenStrokeAlign(geometryNode.strokeAlign) : 'inside',
          thickness: strokeWeight,
          fill: penGrad as PenFill
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

  if ('effects' in node) {
    const geometryNode = node as ExportableGeometryNode;
    if (geometryNode.effects && geometryNode.effects.length > 0) {
      const effect = geometryNode.effects[0];
      if (effect.visible && (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW')) {
        element.effect = {
          type: 'shadow',
          shadowType: effect.type === 'INNER_SHADOW' ? 'inner' : 'outer',
          color: rgbaToHex(effect.color),
          offset: {
            x: effect.offset.x,
            y: effect.offset.y
          },
          blur: effect.radius,
          spread: effect.spread || 0
        };
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
    if (typeof textNode.fontSize === 'number') {
      element.fontSize = textNode.fontSize;
    }
    if (textNode.fontName !== figma.mixed) {
      element.fontFamily = textNode.fontName.family;
      element.fontWeight = mapFigmaFontWeight(textNode.fontName.style);
    }

    if (textNode.textAlignHorizontal) {
      element.textAlign = mapFigmaTextAlign(textNode.textAlignHorizontal) as ExportedPenElement['textAlign'];
    }
    if (textNode.textAlignVertical) {
      element.textAlignVertical = mapFigmaTextAlignVertical(textNode.textAlignVertical) as ExportedPenElement['textAlignVertical'];
    }

    if (textNode.lineHeight && textNode.lineHeight !== figma.mixed) {
      if (textNode.lineHeight.unit === 'PERCENT') {
        element.lineHeight = textNode.lineHeight.value / 100;
      } else if (textNode.lineHeight.unit === 'PIXELS' && typeof textNode.fontSize === 'number' && textNode.fontSize > 0) {
        element.lineHeight = textNode.lineHeight.value / textNode.fontSize;
      }
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

  return element;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 7);
}

function isExportableImageNode(node: SceneNode): node is ExportableImageNode {
  return typeof (node as Partial<ExportMixin>).exportAsync === 'function';
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
