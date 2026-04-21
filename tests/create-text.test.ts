import assert from 'node:assert/strict';
import test from 'node:test';

import { createText } from '../src/plugin/nodes/create-text.ts';

type MockFontName = { family: string; style: string };

type MockTextNode = {
  width: number;
  height: number;
  characters: string;
  fontName: MockFontName;
  fontSize?: number;
  lineHeight?: LineHeight;
  letterSpacing?: LetterSpacing;
  fills?: Paint[];
  textAutoResize?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  resizeCalls: Array<{ width: number; height: number }>;
  rangeFontNames: Array<{ start: number; end: number; value: MockFontName }>;
  rangeFontSizes: Array<{ start: number; end: number; value: number }>;
  rangeFills: Array<{ start: number; end: number; value: Paint[] }>;
  rangeLineHeights: Array<{ start: number; end: number; value: LineHeight }>;
  rangeLetterSpacings: Array<{ start: number; end: number; value: LetterSpacing }>;
  resize(width: number, height: number): void;
  setRangeFontName(start: number, end: number, value: MockFontName): void;
  setRangeFontSize(start: number, end: number, value: number): void;
  setRangeFills(start: number, end: number, value: Paint[]): void;
  setRangeLineHeight(start: number, end: number, value: LineHeight): void;
  setRangeLetterSpacing(start: number, end: number, value: LetterSpacing): void;
};

const loadedFonts: MockFontName[] = [];

function createMockTextNode(): MockTextNode {
  return {
    width: 120,
    height: 24,
    characters: '',
    fontName: { family: 'Inter', style: 'Regular' },
    resizeCalls: [],
    rangeFontNames: [],
    rangeFontSizes: [],
    rangeFills: [],
    rangeLineHeights: [],
    rangeLetterSpacings: [],
    resize(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.resizeCalls.push({ width, height });
    },
    setRangeFontName(start: number, end: number, value: MockFontName) {
      this.rangeFontNames.push({ start, end, value });
    },
    setRangeFontSize(start: number, end: number, value: number) {
      this.rangeFontSizes.push({ start, end, value });
    },
    setRangeFills(start: number, end: number, value: Paint[]) {
      this.rangeFills.push({ start, end, value });
    },
    setRangeLineHeight(start: number, end: number, value: LineHeight) {
      this.rangeLineHeights.push({ start, end, value });
    },
    setRangeLetterSpacing(start: number, end: number, value: LetterSpacing) {
      this.rangeLetterSpacings.push({ start, end, value });
    }
  };
}

Object.defineProperty(globalThis, 'figma', {
  value: {
    createText: () => createMockTextNode(),
    loadFontAsync: async (font: MockFontName) => {
      loadedFonts.push(font);
    }
  },
  configurable: true
});

test('createText restores styled segments and fixed-width sizing', async () => {
  loadedFonts.length = 0;

  const node = await createText(
    {
      type: 'text',
      id: 'gt5tb-text',
      name: '1000券',
      width: 177,
      textGrowth: 'fixed-width',
      textAlign: 'center',
      segments: [
        {
          content: '受邀好友首充后\n双方均',
          fontFamily: 'Source Han Sans CN',
          fontWeight: '400',
          fontSize: 14,
          lineHeight: 26 / 14,
          letterSpacing: 0.7,
          fill: '#ffffff'
        },
        {
          content: '获赠100%',
          fontFamily: 'Source Han Sans CN',
          fontWeight: '400',
          fontSize: 14,
          lineHeight: 26 / 14,
          letterSpacing: 0.7,
          fill: '#14cb75'
        },
        {
          content: '等额渲染券',
          fontFamily: 'Source Han Sans CN',
          fontWeight: '400',
          fontSize: 14,
          lineHeight: 26 / 14,
          letterSpacing: 0.7,
          fill: '#ffffff'
        }
      ]
    },
    {},
    {
      imageCache: new Map(),
      componentMap: new Map()
    }
  );

  const text = node as unknown as MockTextNode;

  assert.equal(text.characters, '受邀好友首充后\n双方均获赠100%等额渲染券');
  assert.equal(text.textAutoResize, 'HEIGHT');
  assert.deepEqual(text.resizeCalls.at(-1), { width: 177, height: 24 });
  assert.equal(text.rangeFontSizes.length, 3);
  assert.equal(text.rangeFills.length, 3);
  assert.deepEqual(text.rangeLetterSpacings[0]?.value, { unit: 'PIXELS', value: 0.7 });
  assert.deepEqual(text.rangeFills[1]?.value, [
    {
      type: 'SOLID',
      color: {
        r: 0x14 / 255,
        g: 0xcb / 255,
        b: 0x75 / 255
      }
    }
  ]);
  assert.ok(loadedFonts.some((font) => font.family === 'Source Han Sans CN'));
});
