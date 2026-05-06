import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

import type {
  BridgeCommand,
  BridgeDesignContextResult,
  BridgeDownloadImageResult,
  BridgeExportNodePngResult,
  BridgeMetadataResult,
  BridgeRuntimeInfo,
  BridgeScreenshotResult,
  BridgeVariableDefsResult,
  PluginCapability,
  PluginEvent
} from '../src/shared/bridge';
import type { PluginSession } from './sessions';
import {
  findSessionByFileKey,
  listSessions,
  registerSession,
  removeSession,
  touchSession,
  updateSession
} from './sessions';
import { createTask, rejectTask, resolveTask } from './tasks';

const DEFAULT_TIMEOUT_MS = 60_000;

type BridgeReadArgs = {
  fileKey: string;
  nodeId: string;
  timeoutMs?: number;
};

export type BridgeStatus = {
  connected: boolean;
  sessions: PluginSession[];
};

export type BridgeServer = {
  start(): Promise<void>;
  stop(): Promise<void>;
  getMetadata(args: BridgeReadArgs): Promise<BridgeMetadataResult>;
  getDesignContext(args: BridgeReadArgs): Promise<BridgeDesignContextResult>;
  getScreenshot(args: BridgeReadArgs): Promise<BridgeScreenshotResult>;
  getVariableDefs(args: BridgeReadArgs): Promise<BridgeVariableDefsResult>;
  downloadImage(args: BridgeReadArgs): Promise<BridgeDownloadImageResult>;
  exportNodePng(args: BridgeReadArgs): Promise<BridgeExportNodePngResult>;
  getStatus(): BridgeStatus;
};

function parsePluginEvent(rawMessage: unknown): PluginEvent | null {
  try {
    const parsed = JSON.parse(String(rawMessage)) as PluginEvent;
    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createBridgeServer(args: { port: number }): BridgeServer {
  const sessionSockets = new Map<string, WebSocket>();
  let server: WebSocketServer | null = null;

  function setSessionIdle(sessionId: string): void {
    updateSession(sessionId, {
      status: 'idle',
      lastSeenAt: Date.now()
    });
  }

  function getOpenSocketForSession(sessionId: string): WebSocket | null {
    const socket = sessionSockets.get(sessionId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return null;
    }
    return socket;
  }

  function getTargetSession(fileKey: string, capability: PluginCapability): { session: PluginSession; socket: WebSocket } {
    const sessions = listSessions();
    if (sessions.length === 0) {
      throw new Error('No plugin session connected');
    }

    const session = findSessionByFileKey(fileKey);
    if (!session) {
      throw new Error('No plugin session matches fileKey');
    }

    if (!session.capabilities.includes(capability)) {
      throw new Error(`Plugin capability not supported: ${capability}`);
    }

    const socket = getOpenSocketForSession(session.pluginSessionId);
    if (!socket) {
      throw new Error('No plugin session connected');
    }

    return { session, socket };
  }

  async function dispatchCommand<TResult>(
    fileKey: string,
    capability: PluginCapability,
    command: BridgeCommand,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<TResult> {
    const { session, socket } = getTargetSession(fileKey, capability);

    updateSession(session.pluginSessionId, {
      status: 'busy',
      lastSeenAt: Date.now()
    });

    const task = createTask<TResult>(command.requestId, timeoutMs);
    socket.send(JSON.stringify(command));

    try {
      return await task;
    } finally {
      setSessionIdle(session.pluginSessionId);
    }
  }

  function handlePluginEvent(socket: WebSocket, event: PluginEvent): void {
    if (event.kind === 'plugin.hello') {
      const runtimeInfo = event.payload as BridgeRuntimeInfo;
      registerSession({
        pluginSessionId: event.pluginSessionId,
        fileKey: runtimeInfo.fileKey,
        fileName: runtimeInfo.fileName,
        pageId: runtimeInfo.pageId,
        pageName: runtimeInfo.pageName,
        capabilities: runtimeInfo.capabilities,
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        status: 'idle'
      });
      sessionSockets.set(event.pluginSessionId, socket);
      return;
    }

    touchSession(event.pluginSessionId);

    if (event.kind === 'plugin.result') {
      resolveTask(event.requestId, event.payload.result);
      return;
    }

    if (event.kind === 'plugin.error') {
      rejectTask(event.requestId, new Error(`Plugin returned error: ${event.payload.error}`));
      setSessionIdle(event.pluginSessionId);
      return;
    }

    if (event.kind === 'plugin.pong') {
      setSessionIdle(event.pluginSessionId);
    }
  }

  function removeSocketSessions(socket: WebSocket): void {
    for (const [sessionId, sessionSocket] of sessionSockets.entries()) {
      if (sessionSocket === socket) {
        sessionSockets.delete(sessionId);
        removeSession(sessionId);
      }
    }
  }

  return {
    async start(): Promise<void> {
      if (server) {
        return;
      }

      server = new WebSocketServer({
        port: args.port
      });

      server.on('connection', (socket: WebSocket) => {
        socket.on('message', (rawMessage: unknown) => {
          const event = parsePluginEvent(rawMessage);
          if (!event) {
            return;
          }
          handlePluginEvent(socket, event);
        });

        socket.on('close', () => {
          removeSocketSessions(socket);
        });

        socket.on('error', () => {
          removeSocketSessions(socket);
        });
      });

      await new Promise<void>((resolve, reject) => {
        server?.once('listening', () => resolve());
        server?.once('error', reject);
      });
    },

    async stop(): Promise<void> {
      if (!server) {
        return;
      }

      const currentServer = server;
      server = null;

      await new Promise<void>((resolve, reject) => {
        currentServer.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      sessionSockets.clear();
      for (const session of listSessions()) {
        removeSession(session.pluginSessionId);
      }
    },

    async getMetadata(args): Promise<BridgeMetadataResult> {
      return dispatchCommand<BridgeMetadataResult>(
        args.fileKey,
        'read.metadata',
        {
          kind: 'bridge.read.metadata',
          requestId: randomUUID(),
          timestamp: Date.now(),
          payload: { nodeId: args.nodeId }
        },
        args.timeoutMs
      );
    },

    async getDesignContext(args): Promise<BridgeDesignContextResult> {
      return dispatchCommand<BridgeDesignContextResult>(
        args.fileKey,
        'read.designContext',
        {
          kind: 'bridge.read.designContext',
          requestId: randomUUID(),
          timestamp: Date.now(),
          payload: { nodeId: args.nodeId }
        },
        args.timeoutMs
      );
    },

    async getScreenshot(args): Promise<BridgeScreenshotResult> {
      return dispatchCommand<BridgeScreenshotResult>(
        args.fileKey,
        'read.screenshot',
        {
          kind: 'bridge.read.screenshot',
          requestId: randomUUID(),
          timestamp: Date.now(),
          payload: { nodeId: args.nodeId }
        },
        args.timeoutMs
      );
    },

    async getVariableDefs(args): Promise<BridgeVariableDefsResult> {
      return dispatchCommand<BridgeVariableDefsResult>(
        args.fileKey,
        'read.variableDefs',
        {
          kind: 'bridge.read.variableDefs',
          requestId: randomUUID(),
          timestamp: Date.now(),
          payload: { nodeId: args.nodeId }
        },
        args.timeoutMs
      );
    },

    async downloadImage(args): Promise<BridgeDownloadImageResult> {
      return dispatchCommand<BridgeDownloadImageResult>(
        args.fileKey,
        'read.downloadImage',
        {
          kind: 'bridge.read.downloadImage',
          requestId: randomUUID(),
          timestamp: Date.now(),
          payload: { nodeId: args.nodeId }
        },
        args.timeoutMs
      );
    },

    async exportNodePng(args): Promise<BridgeExportNodePngResult> {
      return dispatchCommand<BridgeExportNodePngResult>(
        args.fileKey,
        'read.exportNodePng',
        {
          kind: 'bridge.read.exportNodePng',
          requestId: randomUUID(),
          timestamp: Date.now(),
          payload: { nodeId: args.nodeId }
        },
        args.timeoutMs
      );
    },

    getStatus(): BridgeStatus {
      const sessions = listSessions();
      return {
        connected: sessions.length > 0,
        sessions
      };
    }
  };
}
