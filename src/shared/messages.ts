import type { BridgeCommand, BridgeSuccessPayload } from './bridge';
import type { PenAnalysis, PenAsset, PenDocument } from './pen';

export type PluginToUiMessage =
  | { type: 'import-success' }
  | { type: 'import-error'; error: string }
  | { type: 'placement-complete' }
  | { type: 'ready-to-place'; data: PenDocument; images?: Record<string, string> | null; analysis?: PenAnalysis }
  | { type: 'fetch-icon'; iconName: string; iconFamily: string; nodeId: string }
  | { type: 'export-data'; data: PenDocument; assets: PenAsset[] }
  | { type: 'export-error'; error: string }
  | { type: 'download-pen'; data: PenDocument; assets: PenAsset[]; filename?: string }
  | { type: 'bridge-result'; requestId: string; payload: BridgeSuccessPayload }
  | { type: 'bridge-error'; requestId: string; error: string };

export type UiToPluginMessage =
  | { type: 'ready-to-place'; data: PenDocument; images?: Record<string, string> | null }
  | { type: 'import-pen'; data: PenDocument; images?: Record<string, string> | null }
  | { type: 'place-import'; data: PenDocument; images?: Record<string, string> | null }
  | { type: 'export-pen' }
  | { type: 'bridge-command'; command: BridgeCommand }
  | { type: 'icon-svg-fetched'; nodeId: string; svgPath: string | null; iconName?: string; error?: string }
  | { type: 'close-after-download' }
  | { type: 'close' };

export type PluginMessageEnvelope = {
  pluginMessage: PluginToUiMessage | UiToPluginMessage;
};
