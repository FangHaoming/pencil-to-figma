import { parseColor, resolveVariable } from '../utils/color';
import {
  mapFontWeight,
  mapTextAlign,
  mapTextAlignVertical,
  parseDimension
} from '../utils/layout';
import { applyNodePosition } from './shared.js';
import type { NodeElement, NodeFactoryDeps, ParentNodeLike, VariableMap } from './types.js';

export async function createText(
  element: NodeElement,
  variables: VariableMap,
  deps: NodeFactoryDeps,
  parentNode: ParentNodeLike = null
): Promise<TextNode> {
  const text = figma.createText();

  const fontFamily = element.fontFamily ? String(resolveVariable(element.fontFamily, variables)) : 'Inter';
  const fontWeight = element.fontWeight || 'Regular';

  let fontStyle = mapFontWeight(fontWeight);
  if (element.fontStyle === 'italic') {
    fontStyle = fontStyle.includes('Italic') ? fontStyle : `${fontStyle} Italic`.trim();
  }

  try {
    await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
    text.fontName = { family: fontFamily, style: fontStyle };
  } catch (e) {
    if (element.fontStyle === 'italic') {
      try {
        const baseStyle = mapFontWeight(fontWeight);
        await figma.loadFontAsync({ family: fontFamily, style: baseStyle });
        text.fontName = { family: fontFamily, style: baseStyle };
      } catch (e2) {
        try {
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          text.fontName = { family: 'Inter', style: 'Regular' };
        } catch (e3) {
          console.error('Failed to load any font:', e3);
          throw new Error('Cannot load font for text: ' + (element.name || element.content));
        }
      }
    } else {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        text.fontName = { family: 'Inter', style: 'Regular' };
      } catch (e2) {
        console.error('Failed to load fallback font:', e2);
        throw new Error('Cannot load font for text: ' + (element.name || element.content));
      }
    }
  }

  text.characters = element.content || '';

  if (element.fontSize) {
    text.fontSize = element.fontSize;
  }

  if (element.lineHeight) {
    text.lineHeight = { unit: 'PERCENT', value: element.lineHeight * 100 };
  }

  if (element.textAlign) {
    text.textAlignHorizontal = mapTextAlign(element.textAlign);
  }

  if (element.textAlignVertical) {
    text.textAlignVertical = mapTextAlignVertical(element.textAlignVertical);
  }

  if (element.fill) {
    const fill = parseColor(element.fill, variables, element.name || element.id);
    if (fill) {
      text.fills = [fill];
    }
  }

  applyNodePosition(text, element, parentNode);

  if (element.width) {
    const width = parseDimension(element.width, text.width);
    if (element.textGrowth === 'fixed-width') {
      text.textAutoResize = 'HEIGHT';
      text.resize(width, text.height);
    }
  }

  return text;
}
