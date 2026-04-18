import assert from 'node:assert/strict';
import test from 'node:test';

import { nodeToElementImpl } from '../src/plugin/export/node-to-element.ts';
import type { ExportContext } from '../src/plugin/export/types.ts';

const mixed = Symbol('figma.mixed');

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
      mixed
    },
    configurable: true
  });
}

function createPluginDataStore(data: Record<string, string> = {}): (key: string) => string {
  return (key: string) => data[key] || '';
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
    fills: [],
    strokes: [],
    strokeWeight: 0,
    children: [],
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

test('nodeToElementImpl maps frame auto-layout properties and children', async () => {
  const textNode = createTextNode();
  const frameNode = createFrameNode({
    children: [textNode]
  });

  const exportContext: ExportContext = {
    assets: new Map()
  };

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
    fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 0, b: 0 } }]
  });

  const result = await nodeToElementImpl(textNode as unknown as SceneNode & PluginDataMixin, { assets: new Map() });

  assert.ok(result);
  assert.equal(result.type, 'text');
  assert.equal(result.content, 'Hello');
  assert.equal(result.fontFamily, 'Inter');
  assert.equal(result.fontWeight, '700');
  assert.equal(result.textAlign, 'center');
  assert.equal(result.textAlignVertical, 'bottom');
  assert.equal(result.lineHeight, 1.5);
  assert.equal(result.fill, '#ff0000');
  assert.equal(result.opacity, 0.85);
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
    { assets: new Map() },
    parentGroup as unknown as BaseNode
  );

  assert.ok(result);
  assert.equal(result.type, 'path');
  assert.equal(result.x, 4);
  assert.equal(result.y, 6);
  assert.equal(result.geometry, 'M 0 0 L 10 10 Z');
});
