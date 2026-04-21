export type PenSizing =
  | number
  | 'fill_container'
  | 'hug_contents'
  | 'fit_content'
  | `fill_container(${number})`
  | `fit_content(${number})`;

export type PenColor = string | { type: 'color'; color: string; enabled?: boolean };

export type PenGradientStop = {
  color: string;
  position: number;
};

export type PenFill =
  | PenColor
  | {
      type: 'gradient';
      enabled?: boolean;
      gradientType?: 'linear' | 'radial' | 'angular';
      rotation?: number;
      stops?: PenGradientStop[];
      colors?: PenGradientStop[];
      colorStops?: PenGradientStop[];
      gradientStops?: PenGradientStop[];
    }
  | {
      type: 'image';
      enabled?: boolean;
      url: string;
      mode?: 'stretch' | 'fill' | 'fit';
    };

export type PenStroke = {
  align?: 'inside' | 'center' | 'outside';
  thickness?: number | { top?: number; right?: number; bottom?: number; left?: number };
  cap?: 'none' | 'round' | 'square';
  join?: 'miter' | 'bevel' | 'round';
  fill?: PenFill | PenFill[];
};

export type PenEffect =
  | {
      type: 'shadow';
      shadowType?: 'inner' | 'outer';
      color?: string;
      offset?: { x: number; y: number };
      blur?: number;
      spread?: number;
    }
  | {
      type: 'blur' | 'background_blur';
      radius?: number;
    };

export interface PenBaseElement {
  id?: string;
  name?: string;
  type: string;
  x?: number;
  y?: number;
  width?: PenSizing;
  height?: PenSizing;
  fill?: PenFill | PenFill[];
  stroke?: PenStroke;
  effect?: PenEffect | PenEffect[];
  opacity?: number;
  enabled?: boolean;
  children?: PenElement[];
  reusable?: boolean;
}

export interface PenTextElement extends PenBaseElement {
  type: 'text';
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textAlignVertical?: 'top' | 'middle' | 'bottom';
  textGrowth?: 'auto' | 'fixed-width' | 'fixed-width-height';
  segments?: PenTextSegment[];
}

export interface PenTextSegment {
  content: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  lineHeight?: number;
  letterSpacing?: number;
  fill?: PenFill | PenFill[];
}

export interface PenFrameElement extends PenBaseElement {
  type: 'frame';
  layout?: 'none' | 'horizontal' | 'vertical';
  gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  justifyContent?: 'start' | 'center' | 'end' | 'space_between';
  alignItems?: 'start' | 'center' | 'end';
  clip?: boolean;
  cornerRadius?: number | [number, number, number, number];
}

export interface PenRefElement extends PenBaseElement {
  type: 'ref';
  ref: string;
  descendants?: Record<string, Record<string, unknown>>;
}

export type PenElement =
  | PenBaseElement
  | PenTextElement
  | PenFrameElement
  | PenRefElement;

export interface PenAsset {
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

export interface PenDocument {
  version?: string;
  variables?: Record<string, unknown>;
  children: PenElement[];
  theme?: unknown;
}

export interface PenAnalysis {
  version: string;
  totalElements: number;
  elementTypes: Record<string, number>;
  components: number;
  instances: number;
  autoLayoutFrames: number;
  absoluteFrames: number;
  images: number;
  textNodes: number;
  variables: number;
  maxDepth: number;
  hasTheme: boolean;
}
