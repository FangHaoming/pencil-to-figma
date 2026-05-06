import type { BridgeVariableDefsResult } from '../../src/shared/bridge';
import type { BridgeServer } from '../../bridge/server';
import { requireParsedSelectionLink } from './shared';

export type GetVariableDefsFromSelectionLinkArgs = {
  link: string;
};

export type GetVariableDefsFromSelectionLinkResult =
  | {
      ok: true;
      fileKey: string;
      nodeId: string;
      value: BridgeVariableDefsResult;
    }
  | {
      ok: false;
      error: string;
    };

export async function getVariableDefsFromSelectionLink(
  args: GetVariableDefsFromSelectionLinkArgs,
  deps: { bridge: BridgeServer }
): Promise<GetVariableDefsFromSelectionLinkResult> {
  try {
    const parsed = requireParsedSelectionLink(args.link);
    const value = await deps.bridge.getVariableDefs({
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
