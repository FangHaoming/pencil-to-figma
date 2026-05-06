import type { PenAsset, PenDocument } from './pen';

export type PluginToUiMessage =
  | { type: 'export-progress'; stage: 'export' | 'package'; message: string }
  | { type: 'export-data'; data: PenDocument; assets: PenAsset[] }
  | { type: 'export-error'; error: string }
  | { type: 'download-pen'; data: PenDocument; assets: PenAsset[]; filename?: string };

export type UiToPluginMessage =
  | { type: 'export-pen' }
  | { type: 'close-after-download' }
  | { type: 'close' };

export type PluginMessageEnvelope = {
  pluginMessage: PluginToUiMessage | UiToPluginMessage;
};
