import type { BridgeDownloadImageResult } from '../../src/shared/bridge';
import type { BridgeServer } from '../../bridge/server';
import { requireParsedSelectionLink } from './shared';

export type DownloadImageFromSelectionLinkArgs = {
  link: string;
};

export type DownloadImageFromSelectionLinkResult =
  | {
      ok: true;
      fileKey: string;
      nodeId: string;
      value: BridgeDownloadImageResult;
    }
  | {
      ok: false;
      error: string;
    };

export async function downloadImageFromSelectionLink(
  args: DownloadImageFromSelectionLinkArgs,
  deps: { bridge: BridgeServer }
): Promise<DownloadImageFromSelectionLinkResult> {
  try {
    const parsed = requireParsedSelectionLink(args.link);
    const value = await deps.bridge.downloadImage({
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
