import type { PenEffect, PenElement, PenFill, PenSizing, PenStroke } from '../../shared/pen';

export type VariableMap = Record<string, unknown> | undefined;

export type AutoLayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL';
export type AutoLayoutSizing = 'FILL' | 'HUG' | 'FIXED';

export type NodeElement = PenElement & {
  type: string;
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  width?: PenSizing;
  height?: PenSizing;
  fill?: PenFill | PenFill[];
  stroke?: PenStroke;
  effect?: PenEffect | PenEffect[];
  opacity?: number;
  enabled?: boolean;
  children?: NodeElement[];
  reusable?: boolean;
  layout?: 'none' | 'horizontal' | 'vertical';
  flexDirection?: 'row' | 'column' | string;
  gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  justifyContent?: 'start' | 'center' | 'end' | 'space_between';
  alignItems?: 'start' | 'center' | 'end';
  clip?: boolean;
  cornerRadius?: number | [number, number, number, number] | string;
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  lineHeight?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textAlignVertical?: 'top' | 'middle' | 'bottom';
  textGrowth?: 'auto' | 'fixed-width' | 'fixed-width-height';
  geometry?: string;
  d?: string;
  pathData?: string;
  path?: string;
  fillRule?: 'evenodd' | string;
  src?: string;
  iconFontName?: string;
  iconFontFamily?: string;
  ref?: string;
  descendants?: Record<string, Record<string, unknown>>;
};

export interface NodeFactoryDeps {
  imageCache: Map<string, string>;
  componentMap: Map<string, ComponentNode>;
}

export type NodeWithPluginData = SceneNode & PluginDataMixin;

export type NodeContainer = NodeWithPluginData &
  ChildrenMixin & {
    layoutMode?: AutoLayoutMode;
    width: number;
    height: number;
    name: string;
    remove(): void;
  };

export type ParentNodeLike =
  | (SceneNode & {
      layoutMode?: AutoLayoutMode;
      name: string;
    })
  | null;

export type LayoutChildNode = NodeWithPluginData & {
  layoutSizingHorizontal?: AutoLayoutSizing;
  layoutSizingVertical?: AutoLayoutSizing;
};
