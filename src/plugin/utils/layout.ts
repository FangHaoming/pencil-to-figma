export function parseDimension(value: unknown, defaultValue: number): number {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.startsWith('fill_container')) {
      const match = value.match(/fill_container\((\d+)\)/);
      return match ? Number.parseInt(match[1], 10) : defaultValue;
    }
    if (value.startsWith('fit_content')) {
      const match = value.match(/fit_content\((\d+)\)/);
      return match ? Number.parseInt(match[1], 10) : defaultValue;
    }
    if (value === 'hug_contents' || value === 'fit_content') return defaultValue;
  }
  return defaultValue;
}

export function parseCornerRadius(radius: unknown, variables: Record<string, unknown> | undefined): number | number[] {
  if (typeof radius === 'number') return radius;
  if (typeof radius === 'string') {
    const resolved = resolveVariable(radius, variables);
    if (resolved === '$--radius-pill') return 9999;
    if (typeof resolved === 'string' && resolved.startsWith('$--radius-')) {
      const size = resolved.replace('$--radius-', '');
      if (size === 's') return 4;
      if (size === 'm') return 6;
      if (size === 'l') return 8;
    }
    return Number.parseFloat(String(resolved)) || 0;
  }
  if (Array.isArray(radius)) {
    return radius.map((item) => Number(parseCornerRadius(item, variables)) || 0);
  }
  return 0;
}

export function mapJustifyContent(value: unknown): 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' {
  const map: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'> = {
    start: 'MIN',
    center: 'CENTER',
    end: 'MAX',
    space_between: 'SPACE_BETWEEN'
  };
  return map[String(value)] || 'MIN';
}

export function mapAlignItems(value: unknown): 'MIN' | 'CENTER' | 'MAX' {
  const map: Record<string, 'MIN' | 'CENTER' | 'MAX'> = {
    start: 'MIN',
    center: 'CENTER',
    end: 'MAX'
  };
  return map[String(value)] || 'MIN';
}

export function mapTextAlign(value: unknown): 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' {
  const map: Record<string, 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'> = {
    left: 'LEFT',
    center: 'CENTER',
    right: 'RIGHT',
    justify: 'JUSTIFIED'
  };
  return map[String(value)] || 'LEFT';
}

export function mapTextAlignVertical(value: unknown): 'TOP' | 'CENTER' | 'BOTTOM' {
  const map: Record<string, 'TOP' | 'CENTER' | 'BOTTOM'> = {
    top: 'TOP',
    middle: 'CENTER',
    bottom: 'BOTTOM'
  };
  return map[String(value)] || 'TOP';
}

export function mapFontWeight(weight: unknown): string {
  const weightStr = String(weight);

  const map: Record<string, string> = {
    normal: 'Regular',
    '400': 'Regular',
    '500': 'Medium',
    '600': 'SemiBold',
    '700': 'Bold',
    '800': 'ExtraBold',
    '900': 'Black',
    bold: 'Bold',
    semibold: 'SemiBold',
    medium: 'Medium'
  };

  return map[weightStr.toLowerCase()] || 'Regular';
}

export function mapFigmaJustifyContent(value: unknown): string {
  const map: Record<string, string> = {
    MIN: 'start',
    CENTER: 'center',
    MAX: 'end',
    SPACE_BETWEEN: 'space_between'
  };
  return map[String(value)] || 'start';
}

export function mapFigmaAlignItems(value: unknown): string {
  const map: Record<string, string> = {
    MIN: 'start',
    CENTER: 'center',
    MAX: 'end'
  };
  return map[String(value)] || 'start';
}

export function mapFigmaTextAlign(value: unknown): string {
  const map: Record<string, string> = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right',
    JUSTIFIED: 'justify'
  };
  return map[String(value)] || 'left';
}

export function mapFigmaTextAlignVertical(value: unknown): string {
  const map: Record<string, string> = {
    TOP: 'top',
    CENTER: 'middle',
    BOTTOM: 'bottom'
  };
  return map[String(value)] || 'top';
}

export function mapFigmaFontWeight(style: unknown): string {
  const map: Record<string, string> = {
    Regular: 'normal',
    Medium: '500',
    SemiBold: '600',
    'Semi Bold': '600',
    Bold: '700',
    Black: '900'
  };
  return map[String(style)] || 'normal';
}

function resolveVariable(value: unknown, variables: Record<string, unknown> | undefined): unknown {
  if (typeof value !== 'string') return value;

  if (value.startsWith('$')) {
    const varName = value.substring(1).replace(/^--/, '');
    const variable = variables?.[varName] as { value?: unknown } | undefined;
    if (variable) {
      return variable.value ?? variable;
    }
  }

  return value;
}
