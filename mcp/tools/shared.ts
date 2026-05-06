import type { ParsedFigmaSelectionLink } from '../../src/shared/figma-link';
import { parseFigmaSelectionLink } from '../../src/shared/figma-link';

export function requireParsedSelectionLink(link: string): ParsedFigmaSelectionLink {
  const parsed = parseFigmaSelectionLink(link);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return parsed.value;
}
