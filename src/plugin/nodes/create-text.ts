import { parsePaints, resolveVariable } from '../utils/color';
import {
  mapFontWeight,
  mapTextAlign,
  mapTextAlignVertical,
  parseDimension
} from '../utils/layout';
import { applyNodePosition } from './shared.js';
import type { NodeElement, NodeFactoryDeps, ParentNodeLike, VariableMap } from './types.js';
import type { PenTextSegment } from '../../shared/pen';

export async function createText(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: ParentNodeLike = null
): Promise<TextNode> {
  void deps;
  const text = figma.createText();

  const segments = normalizeTextSegments(element);
  const defaultStyle = getDefaultTextStyle(element, segments);
  const defaultFont = await loadFontOrFallback(defaultStyle, variables, element);
  text.fontName = defaultFont;
  text.characters = getTextContent(element, segments);

  if (defaultStyle.fontSize) {
    text.fontSize = defaultStyle.fontSize;
  }

  if (defaultStyle.lineHeight) {
    text.lineHeight = { unit: 'PERCENT', value: defaultStyle.lineHeight * 100 };
  }

  if (typeof defaultStyle.letterSpacing === 'number') {
    text.letterSpacing = { unit: 'PIXELS', value: defaultStyle.letterSpacing };
  }

  if (element.textAlign) {
    text.textAlignHorizontal = mapTextAlign(element.textAlign);
  }

  if (element.textAlignVertical) {
    text.textAlignVertical = mapTextAlignVertical(element.textAlignVertical);
  }

  if (element.fill) {
    const fills = parsePaints(element.fill, variables, element.name || element.id);
    if (fills.length > 0) {
      text.fills = fills;
    }
  }

  if (segments.length > 0) {
    await applyTextSegments(text, segments, element, variables);
  }

  applyNodePosition(text, element, parentNode);

  applyTextSizing(text, element);

  return text;
}

type TextStyleInput = Pick<NodeElement, 'fontFamily' | 'fontWeight' | 'fontStyle' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'fill'>;
type RangeTextNode = TextNode & {
  setRangeFontName?: (start: number, end: number, value: FontName) => void;
  setRangeFontSize?: (start: number, end: number, value: number) => void;
  setRangeFills?: (start: number, end: number, value: Paint[]) => void;
  setRangeLineHeight?: (start: number, end: number, value: LineHeight) => void;
  setRangeLetterSpacing?: (start: number, end: number, value: LetterSpacing) => void;
};

function normalizeTextSegments(element: NodeElement): PenTextSegment[] {
  if (!Array.isArray(element.segments)) {
    return [];
  }

  return element.segments.filter((segment): segment is PenTextSegment => {
    return Boolean(segment && typeof segment.content === 'string' && segment.content.length > 0);
  });
}

function getTextContent(element: NodeElement, segments: PenTextSegment[]): string {
  if (segments.length > 0) {
    return segments.map((segment) => segment.content).join('');
  }

  return element.content || '';
}

function getDefaultTextStyle(element: NodeElement, segments: PenTextSegment[]): TextStyleInput {
  const firstSegment = segments[0];
  return {
    fontFamily: element.fontFamily ?? firstSegment?.fontFamily,
    fontWeight: element.fontWeight ?? firstSegment?.fontWeight,
    fontStyle: element.fontStyle ?? firstSegment?.fontStyle,
    fontSize: element.fontSize ?? firstSegment?.fontSize,
    lineHeight: element.lineHeight ?? firstSegment?.lineHeight,
    letterSpacing: element.letterSpacing ?? firstSegment?.letterSpacing,
    fill: element.fill ?? firstSegment?.fill
  };
}

async function loadFontOrFallback(
  style: Pick<TextStyleInput, 'fontFamily' | 'fontWeight' | 'fontStyle'>,
  variables: VariableMap,
  element: Pick<NodeElement, 'name' | 'content' | 'id'>
): Promise<FontName> {
  const fontFamily = style.fontFamily ? String(resolveVariable(style.fontFamily, variables)) : 'Inter';
  const fontWeight = style.fontWeight || 'Regular';
  const baseStyle = mapFontWeight(fontWeight);
  const italicStyle = style.fontStyle === 'italic'
    ? (baseStyle.includes('Italic') ? baseStyle : `${baseStyle} Italic`.trim())
    : baseStyle;

  const candidates: FontName[] = [{ family: fontFamily, style: italicStyle }];
  if (italicStyle !== baseStyle) {
    candidates.push({ family: fontFamily, style: baseStyle });
  }
  candidates.push({ family: 'Inter', style: 'Regular' });

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      await figma.loadFontAsync(candidate);
      return candidate;
    } catch (error) {
      lastError = error;
    }
  }

  console.error('Failed to load any font:', lastError);
  throw new Error('Cannot load font for text: ' + (element.name || element.content || element.id || 'Unnamed text'));
}

async function applyTextSegments(
  text: RangeTextNode,
  segments: PenTextSegment[],
  element: NodeElement,
  variables: VariableMap
): Promise<void> {
  let start = 0;

  for (const segment of segments) {
    const end = start + segment.content.length;
    const rangeStyle = {
      fontFamily: segment.fontFamily ?? element.fontFamily,
      fontWeight: segment.fontWeight ?? element.fontWeight,
      fontStyle: segment.fontStyle ?? element.fontStyle
    };

    if (text.setRangeFontName) {
      const fontName = await loadFontOrFallback(rangeStyle, variables, element);
      text.setRangeFontName(start, end, fontName);
    }

    if (typeof segment.fontSize === 'number' && text.setRangeFontSize) {
      text.setRangeFontSize(start, end, segment.fontSize);
    }

    if (typeof segment.lineHeight === 'number' && text.setRangeLineHeight) {
      text.setRangeLineHeight(start, end, {
        unit: 'PERCENT',
        value: segment.lineHeight * 100
      });
    }

    if (typeof segment.letterSpacing === 'number' && text.setRangeLetterSpacing) {
      text.setRangeLetterSpacing(start, end, {
        unit: 'PIXELS',
        value: segment.letterSpacing
      });
    }

    if (segment.fill !== undefined && text.setRangeFills) {
      const fills = parsePaints(segment.fill, variables, element.name || element.id);
      if (fills.length > 0) {
        text.setRangeFills(start, end, fills as Paint[]);
      }
    }

    start = end;
  }
}

function applyTextSizing(text: TextNode, element: NodeElement): void {
  if (element.textGrowth === 'auto') {
    text.textAutoResize = 'WIDTH_AND_HEIGHT';
    return;
  }

  if (element.textGrowth === 'fixed-width') {
    text.textAutoResize = 'HEIGHT';
    if (element.width) {
      const width = parseDimension(element.width, text.width);
      text.resize(width, text.height);
    }
    return;
  }

  if (element.textGrowth === 'fixed-width-height') {
    text.textAutoResize = 'NONE';
    const width = element.width ? parseDimension(element.width, text.width) : text.width;
    const height = element.height ? parseDimension(element.height, text.height) : text.height;
    text.resize(width, height);
    return;
  }

  if (element.width) {
    const width = parseDimension(element.width, text.width);
    text.resize(width, text.height);
  }
}
