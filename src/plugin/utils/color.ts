import type { PenColor, PenEffect, PenFill, PenGradientStop, PenStroke } from '../../shared/pen';

type VariableMap = Record<string, unknown> | undefined;
type PenGradientFill = Extract<PenFill, { type: 'gradient' }>;
type ColorObjectFill = Extract<PenColor, { type: 'color' }>;
type GradientStopInput = PenGradientStop | PenColor;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function figmaEnumToLower(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.toLowerCase();
  return String(value).toLowerCase();
}

export function extractGradientFallbackColor(gradientObject: Record<string, unknown> | null | undefined): unknown {
  if (!gradientObject || typeof gradientObject !== 'object') {
    return null;
  }

  const possibleStopProperties = ['stops', 'colors', 'colorStops', 'gradientStops'];

  for (const propName of possibleStopProperties) {
    const stops = gradientObject[propName];
    if (stops && Array.isArray(stops) && stops.length > 0) {
      const firstStop = stops[0] as Record<string, unknown> | undefined;
      if (firstStop && typeof firstStop === 'object') {
        if (firstStop.color !== undefined) {
          return firstStop.color;
        }
        return firstStop;
      } else if (firstStop !== undefined && firstStop !== null) {
        return firstStop;
      }
    }
  }

  return null;
}

export function convertToFigmaGradient(
  gradientObject: PenGradientFill | null | undefined,
  variables: VariableMap,
  context?: string
): GradientPaint | null {
  if (!gradientObject || typeof gradientObject !== 'object') {
    return null;
  }

  const gradientType = gradientObject.gradientType || 'linear';
  const possibleStopProperties: Array<'stops' | 'colors' | 'colorStops' | 'gradientStops'> = ['stops', 'colors', 'colorStops', 'gradientStops'];
  let stops: GradientStopInput[] | null = null;

  for (const propName of possibleStopProperties) {
    const stopList = gradientObject[propName];
    if (stopList && Array.isArray(stopList)) {
      stops = stopList as GradientStopInput[];
      break;
    }
  }

  if (!stops || stops.length === 0) {
    return null;
  }

  const figmaStops: ColorStop[] = [];
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    let colorValue: unknown = isRecord(stop) && 'color' in stop ? stop.color : stop;
    const position = isRecord(stop) && 'position' in stop && typeof stop.position === 'number'
      ? stop.position
      : (i / (stops.length - 1));
    let rgb: RGB | null = null;

    if (isRecord(colorValue) && colorValue.type === 'color' && 'color' in colorValue) {
      colorValue = colorValue.color;
    }

    if (typeof colorValue === 'string') {
      const resolved = resolveVariable(colorValue, variables);
      if (typeof resolved === 'string' && resolved.startsWith('#')) {
        rgb = hexToRgb(resolved);
      } else if (typeof resolved === 'string' && resolved.startsWith('rgb')) {
        rgb = parseRgb(resolved);
      }
    }

    if (!rgb) {
      console.warn('[convertToFigmaGradient] Could not parse color stop:', colorValue);
      continue;
    }

    figmaStops.push({ position, color: { ...rgb, a: 1 } });
  }

  if (figmaStops.length === 0) {
    return null;
  }

  const gradientTransform: Transform = gradientType === 'linear'
    ? (() => {
        const rotation = typeof gradientObject.rotation === 'number' ? gradientObject.rotation : 0;
        const angleRad = (rotation * Math.PI) / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        return [
          [cos, -sin, 0.5 - 0.5 * cos + 0.5 * sin],
          [sin, cos, 0.5 - 0.5 * sin - 0.5 * cos]
        ];
      })()
    : [
        [1, 0, 0],
        [0, 1, 0]
      ];

  const figmaGradient: GradientPaint = {
    type: gradientType === 'radial' ? 'GRADIENT_RADIAL' : 'GRADIENT_LINEAR',
    gradientStops: figmaStops,
    gradientTransform
  };

  console.log(
    '[convertToFigmaGradient] Converted ' +
      gradientType +
      ' gradient with ' +
      figmaStops.length +
      ' stops' +
      (context ? " for element '" + context + "'" : '')
  );

  return figmaGradient;
}

export function formatColorForLogging(colorValue: unknown): string {
  if (colorValue === null) return 'null';
  if (colorValue === undefined) return 'undefined';

  if (typeof colorValue === 'object') {
    try {
      const jsonStr = JSON.stringify(colorValue);
      if (jsonStr.length > 100) {
        return jsonStr.substring(0, 100) + '... (truncated)';
      }
      return jsonStr;
    } catch {
      return '[object (unstringifiable)]';
    }
  }

  if (typeof colorValue === 'string') {
    return colorValue;
  }

  return `${String(colorValue)} (${typeof colorValue})`;
}

export function parseColor(
  colorValue: unknown,
  variables: VariableMap,
  context?: string
): SolidPaint | GradientPaint | null {
  if (!colorValue) return null;

  if (isRecord(colorValue) && colorValue.enabled === false) {
    return null;
  }

  if (isRecord(colorValue) && colorValue.type === 'color' && 'color' in colorValue) {
    colorValue = (colorValue as ColorObjectFill).color;
  }

  if (isRecord(colorValue) && colorValue.type === 'gradient') {
    const gradientFill = colorValue as PenGradientFill;
    if (gradientFill.enabled === false) {
      const msg = '[parseColor] Gradient with enabled=false, returning null' + (context ? " for element '" + context + "'" : '');
      console.log(msg);
      return null;
    }

    const gradientType = gradientFill.gradientType || 'linear';
    const detectMsg = '[parseColor] Detected gradient object (type: ' + gradientType + ')' + (context ? " for element '" + context + "'" : '');
    console.log(detectMsg);

    const figmaGradient = convertToFigmaGradient(gradientFill, variables, context);
    if (figmaGradient === null) {
      const noStopsMsg = '[parseColor] Warning: Gradient has no color stops, returning null' + (context ? " for element '" + context + "'" : '');
      console.warn(noStopsMsg);
      return null;
    }

    return figmaGradient;
  }

  if (isRecord(colorValue) && colorValue.type === 'image') {
    console.log('[parseColor] Image fill detected, returning null (images handled separately)' + (context ? " for element '" + context + "'" : ''));
    return null;
  }

  if (isRecord(colorValue)) {
    const objectType = 'type' in colorValue ? colorValue.type : undefined;
    const typeInfo = objectType ? " with type '" + objectType + "'" : '';
    const formattedValue = formatColorForLogging(colorValue);
    const invalidMsg = '[parseColor] Warning: Invalid color value (object' + typeInfo + '): ' + formattedValue + (context ? " for element '" + context + "'" : '');
    console.warn(invalidMsg);
    return null;
  }

  const resolved = resolveVariable(colorValue, variables);

  if (typeof resolved !== 'string') {
    const resolveMsg = '[parseColor] Warning: Color resolution failed, not a string' + (context ? " for element '" + context + "'" : '');
    console.warn(resolveMsg, resolved);
    return null;
  }

  if (resolved === 'transparent') {
    return null;
  }

  if (resolved.startsWith('#')) {
    return { type: 'SOLID', color: hexToRgb(resolved) };
  }

  if (resolved.startsWith('rgb')) {
    return { type: 'SOLID', color: parseRgb(resolved) };
  }

  console.warn('[parseColor] Warning: Unrecognized color format: ' + resolved + (context ? " for element '" + context + "'" : ''));
  return null;
}

export function resolveVariable(value: unknown, variables: VariableMap): unknown {
  if (typeof value !== 'string') return value;

  if (value.startsWith('$')) {
    const varName = value.substring(1).replace(/^--/, '');
    if (variables && variables[varName]) {
      const variable = variables[varName];
      if (isRecord(variable) && 'value' in variable) {
        return variable.value || variable;
      }
      return variable;
    }
  }

  return value;
}

export function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  return result
    ? {
        r: Number.parseInt(result[1], 16) / 255,
        g: Number.parseInt(result[2], 16) / 255,
        b: Number.parseInt(result[3], 16) / 255
      }
    : { r: 0, g: 0, b: 0 };
}

export function parseRgb(rgb: string): RGB {
  const values = rgb.match(/\d+/g);
  if (values) {
    return {
      r: Number.parseInt(values[0], 10) / 255,
      g: Number.parseInt(values[1], 10) / 255,
      b: Number.parseInt(values[2], 10) / 255
    };
  }
  return { r: 0, g: 0, b: 0 };
}

export function applyStroke(
  node: GeometryMixin & MinimalStrokesMixin,
  stroke: PenStroke | undefined,
  variables: VariableMap,
  context?: string
): void {
  if (!stroke) return;

  const thickness = stroke.thickness || 1;
  const fill = stroke.fill || '#000000';

  const color = parseColor(fill, variables, context);
  if (color) {
    node.strokes = [color];

    if (typeof thickness === 'object') {
      node.strokeWeight = thickness.top || 1;
    } else {
      node.strokeWeight = thickness;
    }

    node.strokeAlign = stroke.align === 'inside' ? 'INSIDE' : stroke.align === 'outside' ? 'OUTSIDE' : 'CENTER';

    if ('strokeCap' in node && stroke.cap) {
      node.strokeCap = String(stroke.cap).toUpperCase() as StrokeCap;
    }

    if ('strokeJoin' in node && stroke.join) {
      node.strokeJoin = String(stroke.join).toUpperCase() as StrokeJoin;
    }
  }
}

export function applyEffect(
  node: SceneNode & BlendMixin,
  effect: PenEffect | PenEffect[] | undefined,
  variables: VariableMap
): void {
  void variables;
  if (!effect) return;

  const resolvedEffect = Array.isArray(effect) ? effect[0] : effect;
  if (!resolvedEffect) return;

  if (resolvedEffect.type === 'shadow') {
    const supportsClipsContent = 'clipsContent' in node;
    const hasClipsEnabled = supportsClipsContent && Boolean((node as FrameNode).clipsContent);

    const shadowEffect: DropShadowEffect | InnerShadowEffect = {
      type: resolvedEffect.shadowType === 'inner' ? 'INNER_SHADOW' : 'DROP_SHADOW',
      color: hexToRgba(resolvedEffect.color || '#00000026'),
      offset: {
        x: resolvedEffect.offset && resolvedEffect.offset.x !== undefined ? resolvedEffect.offset.x : 0,
        y: resolvedEffect.offset && resolvedEffect.offset.y !== undefined ? resolvedEffect.offset.y : 0
      },
      radius: resolvedEffect.blur || 0,
      spread: hasClipsEnabled ? (resolvedEffect.spread || 0) : 0,
      visible: true,
      blendMode: 'NORMAL'
    };
    (node as SceneNode & { effects: ReadonlyArray<Effect> }).effects = [shadowEffect];
  }
}

export function hexToRgba(hex: string): RGBA {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  if (result) {
    return {
      r: Number.parseInt(result[1], 16) / 255,
      g: Number.parseInt(result[2], 16) / 255,
      b: Number.parseInt(result[3], 16) / 255,
      a: result[4] ? Number.parseInt(result[4], 16) / 255 : 1
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

export function rgbToHex(rgb: RGB): string {
  const r = Math.round(rgb.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgb.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgb.b * 255).toString(16).padStart(2, '0');
  return '#' + r + g + b;
}

export function rgbaToHex(rgba: RGBA): string {
  const r = Math.round(rgba.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgba.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgba.b * 255).toString(16).padStart(2, '0');
  const a = Math.round(rgba.a * 255).toString(16).padStart(2, '0');
  return '#' + r + g + b + a;
}

export function figmaGradientPaintToPenGradient(paint: GradientPaint): Record<string, unknown> | null {
  if (!paint || !paint.gradientStops || paint.gradientStops.length === 0) {
    return null;
  }
  const gt = paint.gradientTransform;
  if (!gt || gt.length < 2 || !gt[0] || !gt[1]) {
    return null;
  }

  const paintOpacity = paint.opacity !== undefined && paint.opacity !== null ? paint.opacity : 1;
  const stops: Array<{ position: number; color: string }> = [];
  for (let i = 0; i < paint.gradientStops.length; i++) {
    const stop = paint.gradientStops[i];
    if (!stop || stop.color === undefined) continue;
    const c = stop.color as RGBA;
    const baseA = c.a !== undefined && c.a !== null ? c.a : 1;
    const rgba = {
      r: c.r,
      g: c.g,
      b: c.b,
      a: baseA * paintOpacity
    };
    stops.push({
      position: stop.position,
      color: rgbaToHex(rgba)
    });
  }
  if (stops.length === 0) {
    return null;
  }

  const a00 = gt[0][0];
  const a10 = gt[1][0];
  let gradientType = 'linear';
  let rotation = 0;

  if (paint.type === 'GRADIENT_RADIAL') {
    gradientType = 'radial';
  } else {
    gradientType = 'linear';
    rotation = (Math.atan2(a10, a00) * 180) / Math.PI;
  }

  const out: Record<string, unknown> = {
    type: 'gradient',
    gradientType,
    stops
  };
  if (gradientType === 'linear') {
    out.rotation = rotation;
  }
  return out;
}

export function figmaSolidPaintToPenColor(paint: SolidPaint): string | null {
  if (!paint || paint.type !== 'SOLID' || !paint.color) return null;
  const c = paint.color as RGBA;
  const baseA = c.a !== undefined && c.a !== null ? c.a : 1;
  const po = paint.opacity !== undefined && paint.opacity !== null ? paint.opacity : 1;
  const a = baseA * po;
  if (a < 0.999) {
    return rgbaToHex({ r: c.r, g: c.g, b: c.b, a });
  }
  return rgbToHex(c);
}
