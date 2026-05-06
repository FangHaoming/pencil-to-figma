import type { BridgeScreenshotResult } from '../../src/shared/bridge';
import type { BridgeServer } from '../../bridge/server';
import { requireParsedSelectionLink } from './shared';

export type GetScreenshotFromSelectionLinkArgs = {
  link: string;
};

export type GetScreenshotFromSelectionLinkResult =
  | {
      ok: true;
      fileKey: string;
      nodeId: string;
      value: BridgeScreenshotResult;
    }
  | {
      ok: false;
      error: string;
    };

export async function getScreenshotFromSelectionLink(
  args: GetScreenshotFromSelectionLinkArgs,
  deps: { bridge: BridgeServer }
): Promise<GetScreenshotFromSelectionLinkResult> {
  try {
    const parsed = requireParsedSelectionLink(args.link);
    const value = await deps.bridge.getScreenshot({
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
