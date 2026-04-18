import type { PenAsset, PenDocument } from '../../shared/pen';
import type { NodeElement } from '../nodes/types.js';

export type ExportAsset = PenAsset;

export type ExportContext = {
  assets: Map<string, ExportAsset>;
};

export type ExportedPenElement = NodeElement;

export type ExportBundle = {
  penData: PenDocument;
  assets: ExportAsset[];
};
