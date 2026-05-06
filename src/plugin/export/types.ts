import type { PenAsset, PenDocument } from '../../shared/pen';
import type { NodeElement } from '../nodes/types.js';

export type InferredCornerRadius = NodeElement['cornerRadius'];

export type ExportAsset = PenAsset & {
  inferredCornerRadius?: InferredCornerRadius;
};

export type ExportProgressSnapshot = {
  totalSceneNodes: number;
  processedSceneNodes: number;
  totalAssets: number;
  exportedAssets: number;
};

export type ExportContext = {
  assets: Map<string, ExportAsset>;
  inferredCornerRadiusByNodeId: Map<string, InferredCornerRadius>;
  progress?: ExportProgressSnapshot & {
    onUpdate: (snapshot: ExportProgressSnapshot) => void;
  };
};

export type ExportedPenElement = NodeElement;

export type ExportBundle = {
  penData: PenDocument;
  assets: ExportAsset[];
};
