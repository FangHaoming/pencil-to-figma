import type { BridgeServer } from '../../bridge/server';

export type GetBridgeStatusResult = {
  connected: boolean;
  sessions: Array<{
    pluginSessionId: string;
    fileKey?: string;
    fileName?: string;
    pageId?: string;
    pageName?: string;
    capabilities: string[];
    status: 'idle' | 'busy';
  }>;
};

export async function getBridgeStatus(
  deps: { bridge: BridgeServer }
): Promise<GetBridgeStatusResult> {
  const status = deps.bridge.getStatus();

  return {
    connected: status.connected,
    sessions: status.sessions.map((session) => ({
      pluginSessionId: session.pluginSessionId,
      fileKey: session.fileKey,
      fileName: session.fileName,
      pageId: session.pageId,
      pageName: session.pageName,
      capabilities: [...session.capabilities],
      status: session.status
    }))
  };
}
