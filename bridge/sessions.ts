import type { PluginCapability } from '../src/shared/bridge';

export type PluginSession = {
  pluginSessionId: string;
  fileKey?: string;
  fileName?: string;
  pageId?: string;
  pageName?: string;
  capabilities: PluginCapability[];
  connectedAt: number;
  lastSeenAt: number;
  status: 'idle' | 'busy';
};

const sessions = new Map<string, PluginSession>();

export function registerSession(session: PluginSession): void {
  sessions.set(session.pluginSessionId, session);
}

export function updateSession(sessionId: string, patch: Partial<PluginSession>): void {
  const existing = sessions.get(sessionId);
  if (!existing) {
    return;
  }

  sessions.set(sessionId, {
    ...existing,
    ...patch
  });
}

export function touchSession(sessionId: string): void {
  updateSession(sessionId, {
    lastSeenAt: Date.now()
  });
}

export function removeSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function listSessions(): PluginSession[] {
  return Array.from(sessions.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function findSessionByFileKey(fileKey: string): PluginSession | null {
  for (const session of sessions.values()) {
    if (session.fileKey === fileKey) {
      return session;
    }
  }

  return null;
}

export function findAnyCapableSession(capability: PluginCapability): PluginSession | null {
  for (const session of sessions.values()) {
    if (session.capabilities.includes(capability)) {
      return session;
    }
  }

  return null;
}
