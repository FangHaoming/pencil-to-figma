import type { BridgeExportNodePngResult } from '../../src/shared/bridge';
import type { BridgeServer } from '../../bridge/server';
import { requireParsedSelectionLink } from './shared';

export type ExportNodePngFromSelectionLinkArgs = {
  link: string;
};

export type ExportNodePngFromSelectionLinkResult =
  | {
      ok: true;
      fileKey: string;
      nodeId: string;
      value: BridgeExportNodePngResult;
    }
  | {
      ok: false;
      error: string;
    };

export async function exportNodePngFromSelectionLink(
  args: ExportNodePngFromSelectionLinkArgs,
  deps: { bridge: BridgeServer }
): Promise<ExportNodePngFromSelectionLinkResult> {
  try {
    const parsed = requireParsedSelectionLink(args.link);
    const value = await deps.bridge.exportNodePng({
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId
    });

    return {
      ok: true,
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
      value
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
