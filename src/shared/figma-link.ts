export type ParsedFigmaSelectionLink = {
  url: string;
  fileKey: string;
  fileName?: string;
  nodeId: string;
  pageId?: string;
  originalNodeId?: string;
};

export type ParseFigmaLinkResult =
  | { ok: true; value: ParsedFigmaSelectionLink }
  | { ok: false; error: string };

function normalizeNodeId(nodeId: string): string {
  return nodeId.replace(/-/g, ':');
}

function sanitizeNodeId(nodeId: string | null): string | null {
  if (!nodeId) {
    return null;
  }

  const trimmed = nodeId.trim();
  if (!trimmed) {
    return null;
  }

  return normalizeNodeId(trimmed);
}

function getFigmaFileKey(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  if (parts[0] === 'design') {
    if (parts[2] === 'branch' && parts[3]) {
      return parts[3];
    }
    return parts[1] || null;
  }

  if (parts[0] === 'file' || parts[0] === 'board' || parts[0] === 'make') {
    return parts[1] || null;
  }

  return null;
}

function getFigmaFileName(url: URL): string | undefined {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 3) {
    return undefined;
  }

  if (parts[0] === 'design') {
    if (parts[2] === 'branch') {
      return parts[4] ? decodeURIComponent(parts[4]) : undefined;
    }
    return parts[2] ? decodeURIComponent(parts[2]) : undefined;
  }

  if (parts[0] === 'file' || parts[0] === 'board' || parts[0] === 'make') {
    return parts[2] ? decodeURIComponent(parts[2]) : undefined;
  }

  return undefined;
}

export function parseFigmaSelectionLink(link: string): ParseFigmaLinkResult {
  const rawLink = link.trim();
  if (!rawLink) {
    return { ok: false, error: 'Invalid Figma selection link' };
  }

  let url: URL;
  try {
    url = new URL(rawLink);
  } catch {
    return { ok: false, error: 'Invalid Figma selection link' };
  }

  if (url.hostname !== 'www.figma.com' && url.hostname !== 'figma.com') {
    return { ok: false, error: 'Invalid Figma selection link' };
  }

  const fileKey = getFigmaFileKey(url);
  if (!fileKey) {
    return { ok: false, error: 'Invalid Figma selection link' };
  }

  const originalNodeId = url.searchParams.get('node-id');
  if (!originalNodeId) {
    return { ok: false, error: 'Missing node-id in Figma link' };
  }

  const nodeId = sanitizeNodeId(originalNodeId);
  if (!nodeId) {
    return { ok: false, error: 'Missing node-id in Figma link' };
  }

  const pageId = sanitizeNodeId(url.searchParams.get('page-id'));

  return {
    ok: true,
    value: {
      url: rawLink,
      fileKey,
      fileName: getFigmaFileName(url),
      nodeId,
      pageId: pageId || undefined,
      originalNodeId
    }
  };
}
