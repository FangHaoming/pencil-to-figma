import type { BridgeDesignContextResult } from '../../src/shared/bridge';
import type { BridgeServer } from '../../bridge/server';
import { requireParsedSelectionLink } from './shared';

export type GetDesignContextFromSelectionLinkArgs = {
  link: string;
};

export type GetDesignContextFromSelectionLinkResult =
  | {
      ok: true;
      fileKey: string;
      nodeId: string;
      value: BridgeDesignContextResult;
    }
  | {
      ok: false;
      error: string;
    };

export async function getDesignContextFromSelectionLink(
  args: GetDesignContextFromSelectionLinkArgs,
  deps: { bridge: BridgeServer }
): Promise<GetDesignContextFromSelectionLinkResult> {
  try {
    const parsed = requireParsedSelectionLink(args.link);
    const value = await deps.bridge.getDesignContext({
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
