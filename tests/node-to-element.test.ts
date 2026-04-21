import assert from 'node:assert/strict';
import test from 'node:test';

import { nodeToElementImpl } from '../src/plugin/export/node-to-element.ts';
import type { ExportContext } from '../src/plugin/export/types.ts';

const mixed = Symbol('figma.mixed');
const mockImages = new Map<string, Uint8Array>();

type MockBaseNode = {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  opacity?: number;
  children?: MockSceneNode[];
  getPluginData(key: string): string;
};

type MockSceneNode = MockBaseNode & Record<string, unknown>;

if (!('figma' in globalThis)) {
  Object.defineProperty(globalThis, 'figma', {
    value: {
      mixed,
      loadFontAsync: async () => {},
      getImageByHash: (hash: string) => {
        const bytes = mockImages.get(hash);
        if (!bytes) {
          return null;
        }

        return {
          getBytesAsync: async () => bytes
        };
      },
      createText: () => {
        let characters = '';
        let fontSize = 16;

        return {
          fontName: { family: 'Inter', style: 'Regular' },
          set characters(value: string) {
            characters = value;
          },
          get characters() {
            return characters;
          },
          set fontSize(value: number) {
            fontSize = value;
          },
          get fontSize() {
            return fontSize;
          },
          get width() {
            return characters.length * fontSize * 0.6;
          },
          get height() {
            return fontSize * 1.2;
          },
          remove() {}
        };
      }
    },
    configurable: true
  });
}

function createPluginDataStore(data: Record<string, string> = {}): (key: string) => string {
  return (key: string) => data[key] || '';
}

function createExportContext(): ExportContext {
  return {
    assets: new Map(),
    inferredCornerRadiusByNodeId: new Map()
  };
}

function createFrameNode(overrides: Partial<MockSceneNode> = {}): MockSceneNode {
  return {
    id: 'frame-1',
    type: 'FRAME',
    name: 'Frame',
    x: 10,
    y: 20,
    width: 120,
    height: 48,
    opacity: 1,
    layoutMode: 'HORIZONTAL',
    itemSpacing: 12,
    paddingTop: 8,
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 16,
    primaryAxisAlignItems: 'CENTER',
    counterAxisAlignItems: 'MAX',
    clipsContent: true,
    fills: [],
    strokes: [],
    strokeWeight: 0,
    children: [],
    getPluginData: createPluginDataStore({ pencilId: 'frame-pencil' }),
    ...overrides
  };
}

function createTextNode(overrides: Partial<MockSceneNode> = {}): MockSceneNode {
  return {
    id: 'text-1',
    type: 'TEXT',
    name: 'Title',
    x: 12,
    y: 24,
    width: 80,
    height: 24,
    opacity: 0.85,
    characters: 'Hello',
    fontSize: 16,
    fontName: { family: 'Inter', style: 'Bold' },
    textAlignHorizontal: 'CENTER',
    textAlignVertical: 'BOTTOM',
    lineHeight: { unit: 'PERCENT', value: 150 },
    letterSpacing: { unit: 'PIXELS', value: 0 },
    textAutoResize: 'WIDTH_AND_HEIGHT',
    fills: [],
    strokes: [],
    strokeWeight: 0,
    children: [],
    getStyledTextSegments: () => [{
      characters: 'Hello',
      start: 0,
      end: 5,
      fontSize: 16,
      fontName: { family: 'Inter', style: 'Bold' },
      fills: [],
      lineHeight: { unit: 'PERCENT', value: 150 }
    }],
    getPluginData: createPluginDataStore({ pencilId: 'text-pencil' }),
    ...overrides
  };
}

function createVectorNode(overrides: Partial<MockSceneNode> = {}): MockSceneNode {
  return {
    id: 'vector-1',
    type: 'VECTOR',
    name: 'Icon',
    x: 4,
    y: 6,
    width: 20,
    height: 20,
    opacity: 1,
    vectorPaths: [{ data: 'M 0 0 L 10 10 Z' }],
    fills: [],
    strokes: [],
    strokeWeight: 0,
    children: [],
    getPluginData: createPluginDataStore({ pencilId: 'vector-pencil' }),
    ...overrides
  };
}

function createGroupNode(overrides: Partial<MockSceneNode> = {}): MockSceneNode {
  return {
    id: 'group-1',
    type: 'GROUP',
    name: 'Group',
    x: 0,
    y: 0,
    width: 120,
    height: 48,
    opacity: 1,
    children: [],
    getPluginData: createPluginDataStore({ pencilId: 'group-pencil' }),
    ...overrides
  };
}

function createRectangleNode(overrides: Partial<MockSceneNode> = {}): MockSceneNode {
  return {
    id: 'rect-1',
    type: 'RECTANGLE',
    name: 'Rectangle',
    x: 0,
    y: 0,
    width: 120,
    height: 48,
    opacity: 1,
    fills: [],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 0,
    topLeftRadius: 0,
    topRightRadius: 0,
    bottomRightRadius: 0,
    bottomLeftRadius: 0,
    effects: [],
    children: [],
    getPluginData: createPluginDataStore({ pencilId: 'rect-pencil' }),
    ...overrides
  };
}

test('nodeToElementImpl maps frame auto-layout properties and children', async () => {
  const textNode = createTextNode();
  const frameNode = createFrameNode({
    children: [textNode]
  });

  const exportContext = createExportContext();

  const result = await nodeToElementImpl(frameNode as unknown as SceneNode & PluginDataMixin, exportContext);

  assert.ok(result);
  assert.equal(result.type, 'frame');
  assert.equal(result.id, 'frame-pencil');
  assert.equal(result.layout, 'horizontal');
  assert.equal(result.clip, true);
  assert.equal(result.gap, 12);
  assert.deepEqual(result.padding, [8, 16]);
  assert.equal(result.justifyContent, 'center');
  assert.equal(result.alignItems, 'end');
  assert.equal(result.children?.length, 1);
  assert.equal(result.children?.[0]?.type, 'text');
  assert.equal(result.children?.[0]?.fontWeight, '700');
});

test('nodeToElementImpl converts text-specific properties', async () => {
  const textNode = createTextNode({
    fontSize: 18,
    lineHeight: { unit: 'PERCENT_FONT_SIZE', value: 125.3 },
    letterSpacing: { unit: 'PERCENT', value: 5 },
    fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 0, b: 0 } }]
  });

  const result = await nodeToElementImpl(textNode as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.equal(result.type, 'text');
  assert.equal(result.content, 'Hello');
  assert.equal(result.fontFamily, 'Inter');
  assert.equal(result.fontWeight, '700');
  assert.equal(result.textAlign, 'center');
  assert.equal(result.textAlignVertical, 'bottom');
  assert.equal(result.lineHeight, 1.253);
  assert.equal(result.letterSpacing, 0.9);
  assert.equal(result.fill, '#ff0000');
  assert.equal(result.opacity, 0.85);
  assert.equal(result.textGrowth, 'auto');
});

test('nodeToElementImpl exports mixed text styles as segments', async () => {
  const textNode = createTextNode({
    characters: '￥40',
    fontSize: mixed,
    fontName: mixed,
    fills: mixed,
    textAutoResize: 'HEIGHT',
    getStyledTextSegments: () => [
      {
        characters: '￥',
        start: 0,
        end: 1,
        fontSize: 20,
        fontName: { family: 'Source Han Sans CN', style: 'Medium' },
        fills: [{ type: 'SOLID', visible: true, color: { r: 0.9137, g: 1, b: 0.9725 } }],
        lineHeight: { unit: 'PERCENT', value: 100 }
      },
      {
        characters: '40',
        start: 1,
        end: 3,
        fontSize: 48,
        fontName: { family: 'Source Han Sans CN', style: 'Medium' },
        fills: [{ type: 'SOLID', visible: true, color: { r: 0.9137, g: 1, b: 0.9725 } }],
        lineHeight: { unit: 'PERCENT', value: 100 }
      }
    ]
  });

  const result = await nodeToElementImpl(textNode as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.equal(result.type, 'group');
  assert.equal(result.children?.length, 2);
  assert.deepEqual(result.children?.map((child) => ({
    type: child.type,
    content: child.content,
    fontSize: child.fontSize,
    fill: child.fill,
    y: child.y
  })), [
    {
      type: 'text',
      content: '￥',
      fontSize: 20,
      fill: '#e9fff8',
      y: 28
    },
    {
      type: 'text',
      content: '40',
      fontSize: 48,
      fill: '#e9fff8',
      y: 0
    }
  ]);
});

test('nodeToElementImpl explodes mixed-color text into aligned child texts', async () => {
  const textNode = createTextNode({
    characters: '受邀好友首充后\n双方均获赠100%等额渲染券',
    width: 177,
    height: 52,
    fontSize: 14,
    fontName: { family: 'Source Han Sans CN', style: 'Regular' },
    fills: mixed,
    textAlignHorizontal: 'CENTER',
    textAlignVertical: 'TOP',
    lineHeight: { unit: 'PIXELS', value: 26 },
    getStyledTextSegments: () => [
      {
        characters: '受邀好友首充后\n双方均',
        start: 0,
        end: 10,
        fontSize: 14,
        fontName: { family: 'Source Han Sans CN', style: 'Regular' },
        fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }],
        lineHeight: { unit: 'PIXELS', value: 26 }
      },
      {
        characters: '获赠100%',
        start: 10,
        end: 16,
        fontSize: 14,
        fontName: { family: 'Source Han Sans CN', style: 'Regular' },
        fills: [{ type: 'SOLID', visible: true, color: { r: 0x14 / 255, g: 0xcb / 255, b: 0x75 / 255 } }],
        lineHeight: { unit: 'PIXELS', value: 26 }
      },
      {
        characters: '等额渲染券',
        start: 16,
        end: 21,
        fontSize: 14,
        fontName: { family: 'Source Han Sans CN', style: 'Regular' },
        fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }],
        lineHeight: { unit: 'PIXELS', value: 26 }
      }
    ]
  });

  const result = await nodeToElementImpl(textNode as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.equal(result.type, 'group');
  assert.equal(result.children?.length, 4);
  assert.deepEqual(result.children?.map((child) => child.content), [
    '受邀好友首充后',
    '双方均',
    '获赠100%',
    '等额渲染券'
  ]);
  assert.equal(result.children?.[2]?.fill, '#14cb75');
  assert.equal(result.children?.[1]?.y, result.children?.[2]?.y);
});

test('nodeToElementImpl exports vector geometry and relative group child position', async () => {
  const parentGroup = {
    id: 'group-1',
    type: 'GROUP',
    name: 'Group',
    x: 100,
    y: 200,
    getPluginData: createPluginDataStore({ pencilId: 'group-pencil' })
  };

  const vectorNode = createVectorNode({
    x: 104,
    y: 206
  });

  const result = await nodeToElementImpl(
    vectorNode as unknown as SceneNode & PluginDataMixin,
    createExportContext(),
    parentGroup as unknown as BaseNode
  );

  assert.ok(result);
  assert.equal(result.type, 'path');
  assert.equal(result.x, 4);
  assert.equal(result.y, 6);
  assert.equal(result.geometry, 'M 0 0 L 10 10 Z');
});

test('nodeToElementImpl preserves multiple visible fills and strokes', async () => {
  const gradientPaint = {
    type: 'GRADIENT_LINEAR',
    visible: true,
    opacity: 1,
    gradientTransform: [
      [1, 0, 0],
      [0, 1, 0]
    ],
    gradientStops: [
      { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
      { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }
    ]
  };

  const vectorNode = createVectorNode({
    fills: [
      { type: 'SOLID', visible: false, color: { r: 0, g: 0, b: 0 } },
      gradientPaint,
      { type: 'SOLID', visible: true, color: { r: 0, g: 1, b: 0 } }
    ],
    strokes: [
      gradientPaint,
      { type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }
    ],
    strokeWeight: 2,
    strokeAlign: 'CENTER'
  });

  const result = await nodeToElementImpl(vectorNode as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.deepEqual(result.fill, [
    {
      type: 'gradient',
      gradientType: 'linear',
      colors: [
        { position: 0, color: '#ff0000ff' },
        { position: 1, color: '#0000ffff' }
      ],
      rotation: -90
    },
    '#00ff00'
  ]);
  assert.deepEqual(result.stroke, {
    align: 'center',
    thickness: 2,
    fill: [
      {
        type: 'gradient',
        gradientType: 'linear',
        colors: [
          { position: 0, color: '#ff0000ff' },
          { position: 1, color: '#0000ffff' }
        ],
        rotation: -90
      },
      '#ffffff'
    ]
  });
});

test('nodeToElementImpl hoists background styles and stroke preview to outer container', async () => {
  const gradientPaint = {
    type: 'GRADIENT_LINEAR',
    visible: true,
    opacity: 1,
    gradientTransform: [
      [1, 0, 0],
      [0, 1, 0]
    ],
    gradientStops: [
      { position: 0, color: { r: 0.75, g: 1, b: 0.83, a: 0.1 } },
      { position: 1, color: { r: 0, g: 0, b: 0, a: 0.1 } }
    ]
  };

  const edgeStroke = {
    type: 'GRADIENT_LINEAR',
    visible: true,
    opacity: 1,
    gradientTransform: [
      [1, 0, 0],
      [0, 1, 0]
    ],
    gradientStops: [
      { position: 0, color: { r: 0, g: 0, b: 0, a: 0 } },
      { position: 0.5, color: { r: 0.44, g: 0.99, b: 0.73, a: 0.8 } },
      { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } }
    ]
  };

  const topLine = createVectorNode({
    id: 'line-top',
    x: 0,
    y: 0,
    width: 80,
    height: 0,
    strokes: [edgeStroke],
    strokeWeight: 1,
    strokeAlign: 'CENTER',
    strokeCap: 'ROUND',
    children: []
  });

  const bottomLine = createVectorNode({
    id: 'line-bottom',
    x: 0,
    y: 48,
    width: 80,
    height: 0,
    strokes: [edgeStroke],
    strokeWeight: 1,
    strokeAlign: 'CENTER',
    strokeCap: 'ROUND',
    children: []
  });

  const glowLines = createGroupNode({
    id: 'glow-lines',
    name: 'Glow Lines',
    x: 20,
    y: 0,
    width: 80,
    height: 48,
    children: [topLine, bottomLine]
  });

  const backgroundRect = createRectangleNode({
    id: 'bg-rect',
    name: 'Background',
    width: 120,
    height: 48,
    fills: [
      { type: 'SOLID', visible: true, color: { r: 0, g: 0.46, b: 0.23 }, opacity: 0.1 },
      gradientPaint
    ],
    topLeftRadius: 10,
    topRightRadius: 10,
    bottomRightRadius: 10,
    bottomLeftRadius: 10,
    effects: [
      {
        type: 'BACKGROUND_BLUR',
        radius: 50,
        visible: true
      }
    ]
  });

  const bgWrapper = createGroupNode({
    id: 'bg-wrapper',
    name: 'BG Wrapper',
    children: [backgroundRect, glowLines]
  });

  const textNode = createTextNode();
  const contentWrapper = createGroupNode({
    id: 'content-wrapper',
    name: 'Content Wrapper',
    width: 120,
    height: 48,
    children: [bgWrapper, textNode]
  });

  const frameNode = createFrameNode({
    layoutMode: 'NONE',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    primaryAxisAlignItems: undefined,
    counterAxisAlignItems: undefined,
    clipsContent: true,
    width: 120,
    height: 48,
    children: [contentWrapper]
  });

  const result = await nodeToElementImpl(frameNode as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.deepEqual(result.fill, [
    '#00753b1a',
    {
      type: 'gradient',
      gradientType: 'linear',
      colors: [
        { position: 0, color: '#bfffd41a' },
        { position: 1, color: '#0000001a' }
      ],
      rotation: -90
    }
  ]);
  assert.deepEqual(result.effect, {
    type: 'background_blur',
    radius: 50
  });
  assert.equal(result.cornerRadius, 10);
  assert.ok(result.stroke);
  assert.deepEqual(result.stroke, {
    align: 'center',
    thickness: 1,
    fill: {
      type: 'gradient',
      gradientType: 'linear',
      colors: [
        { position: 0, color: '#00000000' },
        { position: 0.5, color: '#70fcbacc' },
        { position: 1, color: '#00000000' }
      ],
      rotation: -90,
      enabled: false
    },
    cap: 'round'
  });
  assert.equal(result.children?.some((child) => child.name === 'Background'), false);
});

test('nodeToElementImpl hoists rect-like path styles through clip wrapper', async () => {
  const pathNode = createVectorNode({
    id: 'path-bg',
    name: 'Rectangle 24',
    x: 0,
    y: 0,
    width: 160,
    height: 40,
    vectorPaths: [{ data: 'M 0 0 L 160 0 L 160 40 L 0 40 L 0 0 Z' }],
    fills: [
      {
        type: 'GRADIENT_LINEAR',
        visible: true,
        opacity: 1,
        gradientTransform: [
          [-0.999946766182395, -0.010318168438971043, 1.005132467310683],
          [0.010318168438971043, -0.999946766182395, 0.49483563280242396]
        ],
        gradientStops: [
          { position: 0, color: { r: 0.094, g: 0.424, b: 0.278, a: 0.1 } },
          { position: 1, color: { r: 0.945, g: 0.933, b: 0.765, a: 1 } }
        ]
      },
      {
        type: 'SOLID',
        visible: true,
        opacity: 0.3,
        color: { r: 0, g: 0.592, b: 0.333 }
      }
    ],
    strokes: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }],
    strokeWeight: 1,
    strokeAlign: 'INSIDE',
    cornerRadius: 30,
    effects: [
      {
        type: 'BACKGROUND_BLUR',
        radius: 50,
        visible: true
      }
    ],
    children: []
  });

  const clipFrame = createFrameNode({
    id: 'clip-frame',
    name: 'bj',
    x: 0,
    y: 0,
    width: 160,
    height: 40,
    layoutMode: 'NONE',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    primaryAxisAlignItems: undefined,
    counterAxisAlignItems: undefined,
    clipsContent: true,
    children: [pathNode]
  });

  const groupNode = createGroupNode({
    id: 'banner-btn',
    name: 'banner按钮',
    width: 160,
    height: 40,
    children: [clipFrame]
  });

  const result = await nodeToElementImpl(groupNode as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.equal(result.type, 'frame');
  assert.equal(result.cornerRadius, 30);
  assert.deepEqual(result.effect, {
    type: 'background_blur',
    radius: 50
  });
  assert.ok(result.fill);
  assert.equal(result.children?.some((child) => child.name === 'Rectangle 24'), false);
});

test('nodeToElementImpl preserves inferred corner radius from svg image backgrounds', async () => {
  mockImages.set(
    'svg-pill',
    new TextEncoder().encode(
      '<svg viewBox="0 0 68 22" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M 0 0 H 64 A 4 4 0 0 1 68 4 V 22 H 4 A 4 4 0 0 1 0 18 V 0 Z" fill="#4CE2F3"/>' +
      '</svg>'
    )
  );

  const backgroundNode = createRectangleNode({
    id: 'svg-bg',
    name: 'Rectangle 419',
    width: 68,
    height: 22,
    fills: [{ type: 'IMAGE', visible: true, imageHash: 'svg-pill', scaleMode: 'FILL' }],
    exportAsync: async () => new Uint8Array()
  });
  const textNode = createTextNode({
    id: 'svg-text',
    name: '加赠 20%',
    x: 6,
    y: 2,
    width: 55,
    height: 17,
    characters: '加赠 20%',
    fontSize: 12,
    fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }]
  });
  const groupNode = createGroupNode({
    id: 'svg-badge',
    name: 'Group 734',
    width: 68,
    height: 22,
    children: [backgroundNode, textNode]
  });

  const result = await nodeToElementImpl(groupNode as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.equal(result.type, 'frame');
  assert.deepEqual(result.cornerRadius, [0, 4, 0, 4]);
  assert.equal(result.children?.some((child) => child.name === 'Rectangle 419'), false);
});

test('nodeToElementImpl does not hoist structural opacity to the parent container', async () => {
  const overlayNode = createFrameNode({
    id: 'overlay-frame',
    name: 'Overlay',
    x: 0,
    y: 0,
    width: 120,
    height: 48,
    opacity: 0.6,
    layoutMode: 'NONE',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    primaryAxisAlignItems: undefined,
    counterAxisAlignItems: undefined,
    clipsContent: false,
    fills: [],
    strokes: [],
    strokeWeight: 0,
    children: []
  });
  const textNode = createTextNode({
    id: 'title-text',
    opacity: 1
  });
  const parentNode = createFrameNode({
    id: 'page-root',
    name: 'Page Root',
    x: 0,
    y: 0,
    width: 120,
    height: 48,
    layoutMode: 'NONE',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    primaryAxisAlignItems: undefined,
    counterAxisAlignItems: undefined,
    clipsContent: false,
    children: [overlayNode, textNode]
  });

  const result = await nodeToElementImpl(parentNode as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.equal(result.opacity, undefined);
  assert.equal(result.children?.some((child) => child.name === 'Overlay' && child.opacity === 0.6), true);
});

test('nodeToElementImpl rasterizes groups containing rotated image fills', async () => {
  const rotatedImageNode = createRectangleNode({
    id: 'rotated-image',
    name: 'image 6',
    x: 10,
    y: 0,
    width: 42.95,
    height: 28,
    rotation: 90,
    fills: [{ type: 'IMAGE', visible: true, imageHash: 'arrow-image', scaleMode: 'FILL' }]
  });
  const parentGroup = createGroupNode({
    id: 'arrow-group',
    name: '箭头',
    width: 61.36,
    height: 74,
    children: [rotatedImageNode],
    exportAsync: async () => new Uint8Array([1, 2, 3, 4])
  });

  const result = await nodeToElementImpl(parentGroup as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.equal(result.type, 'frame');
  assert.deepEqual(result.fill, {
    type: 'image',
    url: './image-arrow-group.png',
    mode: 'fill'
  });
  assert.equal(result.children, undefined);
});

test('nodeToElementImpl does not rasterize ancestors of rotated image groups', async () => {
  const rotatedImageNode = createRectangleNode({
    id: 'rotated-image-child',
    name: 'image 6',
    x: 10,
    y: 0,
    width: 42.95,
    height: 28,
    rotation: 90,
    fills: [{ type: 'IMAGE', visible: true, imageHash: 'arrow-image', scaleMode: 'FILL' }]
  });
  const arrowGroup = createGroupNode({
    id: 'arrow-group-child',
    name: '箭头',
    width: 61.36,
    height: 74,
    children: [rotatedImageNode],
    exportAsync: async () => new Uint8Array([1, 2, 3, 4])
  });
  const labelNode = createTextNode({
    id: 'label-text',
    x: 80,
    y: 12,
    opacity: 1
  });
  const parentFrame = createFrameNode({
    id: 'parent-frame',
    name: '箭头衔接',
    x: 0,
    y: 0,
    width: 160,
    height: 80,
    layoutMode: 'NONE',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    primaryAxisAlignItems: undefined,
    counterAxisAlignItems: undefined,
    clipsContent: false,
    children: [arrowGroup, labelNode],
    exportAsync: async () => new Uint8Array([5, 6, 7, 8])
  });

  const result = await nodeToElementImpl(parentFrame as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.equal(result.type, 'frame');
  assert.notDeepEqual(result.fill, {
    type: 'image',
    url: './image-parent-frame.png',
    mode: 'fill'
  });
  assert.equal(result.children?.length, 2);
  assert.deepEqual(result.children?.[0]?.fill, {
    type: 'image',
    url: './image-arrow-group-child.png',
    mode: 'fill'
  });
});

test('nodeToElementImpl applies bonus badge fallback radius for solid fill badges', async () => {
  const textNode = createTextNode({
    id: 'bonus-text',
    name: '加赠 20%',
    x: 6,
    y: 2,
    width: 55,
    height: 17,
    characters: '加赠 20%',
    fontSize: 12,
    fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }]
  });
  const badgeNode = createFrameNode({
    id: 'bonus-badge',
    name: 'Group 734',
    x: 108,
    y: 0,
    width: 68,
    height: 22,
    layoutMode: 'NONE',
    fills: [{ type: 'SOLID', visible: true, color: { r: 0.298, g: 0.886, b: 0.953 } }],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 0,
    topLeftRadius: 0,
    topRightRadius: 0,
    bottomRightRadius: 0,
    bottomLeftRadius: 0,
    children: [textNode]
  });

  const result = await nodeToElementImpl(badgeNode as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.equal(result.type, 'frame');
  assert.deepEqual(result.cornerRadius, [0, 4, 0, 4]);
});

test('nodeToElementImpl applies bonus badge fallback radius for path badge groups', async () => {
  const pathNode = createVectorNode({
    id: 'badge-path',
    name: 'Vector',
    x: 0,
    y: 0,
    width: 68,
    height: 22,
    fills: [{ type: 'SOLID', visible: true, color: { r: 0.298, g: 0.886, b: 0.953 } }],
    vectorPaths: [{ data: 'M 0 0 L 68 0 L 68 22 L 0 22 Z' }]
  });
  const textNode = createTextNode({
    id: 'badge-text',
    name: '加赠 20%',
    x: 6,
    y: 2,
    width: 55,
    height: 17,
    characters: '加赠 20%',
    fontSize: 12,
    fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }]
  });
  const badgeGroup = createGroupNode({
    id: 'badge-group',
    name: 'Group 734',
    width: 68,
    height: 22,
    children: [pathNode, textNode]
  });

  const result = await nodeToElementImpl(badgeGroup as unknown as SceneNode & PluginDataMixin, createExportContext());

  assert.ok(result);
  assert.equal(result.type, 'frame');
  assert.deepEqual(result.cornerRadius, [0, 4, 0, 4]);
});
