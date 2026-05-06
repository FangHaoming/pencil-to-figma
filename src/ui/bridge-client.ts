import type { BridgeCommand, PluginEvent } from '../shared/bridge';

export type BridgeClientOptions = {
  url: string;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
  onCommand?: (command: BridgeCommand) => void;
};

export type BridgeClient = {
  connect(): void;
  disconnect(): void;
  send(event: PluginEvent): void;
  isConnected(): boolean;
};

export function createBridgeClient(options: BridgeClientOptions): BridgeClient {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let shouldReconnect = true;

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(): void {
    if (!shouldReconnect || reconnectTimer !== null) {
      return;
    }

    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1500);
  }

  function connect(): void {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    clearReconnectTimer();

    try {
      socket = new WebSocket(options.url);
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      options.onOpen?.();
    });

    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(String(event.data)) as BridgeCommand;
        options.onCommand?.(data);
      } catch (error) {
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    });

    socket.addEventListener('error', () => {
      options.onError?.(new Error('Bridge socket error'));
    });

    socket.addEventListener('close', () => {
      socket = null;
      options.onClose?.();
      scheduleReconnect();
    });
  }

  function disconnect(): void {
    shouldReconnect = false;
    clearReconnectTimer();
    socket?.close();
    socket = null;
  }

  function send(event: PluginEvent): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(event));
  }

  function isConnected(): boolean {
    return !!socket && socket.readyState === WebSocket.OPEN;
  }

  return {
    connect,
    disconnect,
    send,
    isConnected
  };
}
