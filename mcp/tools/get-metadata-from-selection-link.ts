import type { BridgeMetadataResult } from '../../src/shared/bridge';
import type { BridgeServer } from '../../bridge/server';
import { requireParsedSelectionLink } from './shared';

export type GetMetadataFromSelectionLinkArgs = {
  link: string;
};

export type GetMetadataFromSelectionLinkResult =
  | {
      ok: true;
      fileKey: string;
      nodeId: string;
      value: BridgeMetadataResult;
    }
  | {
      ok: false;
      error: string;
    };

export async function getMetadataFromSelectionLink(
  args: GetMetadataFromSelectionLinkArgs,
  deps: { bridge: BridgeServer }
): Promise<GetMetadataFromSelectionLinkResult> {
  try {
    const parsed = requireParsedSelectionLink(args.link);
    const value = await deps.bridge.getMetadata({
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
