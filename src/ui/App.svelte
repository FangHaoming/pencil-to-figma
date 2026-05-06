<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createBridgeClient, type BridgeClient } from './bridge-client';
  import type { BridgeCommand } from '../shared/bridge';
  import type { PluginMessageEnvelope, PluginToUiMessage, UiToPluginMessage } from '../shared/messages';
  import type { PenAnalysis, PenAsset, PenDocument } from '../shared/pen';

  type TabName = 'import' | 'export';
  type ImageMap = Record<string, string>;
  type StatusType = 'success' | 'error' | 'info';
  type StepName = 'upload' | 'place';
  type StatusKey = 'upload' | 'images' | 'export';

  type StatusState = {
    type: StatusType;
    message: string;
  } | null;

  type FileMeta = {
    name: string;
    version: string;
    elementCount: number;
  };

  let activeTab: TabName = 'import';
  let currentStep: StepName = 'upload';
  let isDropActive = false;
  let isPlacing = false;
  let isExporting = false;

  let penFileData: PenDocument | null = null;
  let imagesData: ImageMap | null = null;
  let fileMeta: FileMeta | null = null;
  let analysis: PenAnalysis | null = null;

  let uploadStatus: StatusState = null;
  let imagesStatus: StatusState = null;
  let exportStatus: StatusState = null;

  let fileInput: HTMLInputElement | null = null;
  let imagesInput: HTMLInputElement | null = null;
  let bridgeClient: BridgeClient | null = null;

  const bridgeUrl = 'ws://localhost:3210';
  const pluginSessionId = `plugin-${Math.random().toString(36).slice(2, 10)}`;

  const statusTimeouts = new Map<StatusKey, number>();

  $: analysisTypesText = analysis
    ? Object.entries(analysis.elementTypes)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ')
    : '';

  function postPluginMessage(message: UiToPluginMessage): void {
    parent.postMessage({ pluginMessage: message }, '*');
  }

  function createRequestId(prefix = 'request'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function requestRuntimeInfo(): void {
    const command: BridgeCommand = {
      kind: 'bridge.getRuntimeInfo',
      requestId: createRequestId('runtime'),
      timestamp: Date.now()
    };

    postPluginMessage({
      type: 'bridge-command',
      command
    });
  }

  function connectBridge(): void {
    if (bridgeClient) {
      return;
    }

    bridgeClient = createBridgeClient({
      url: bridgeUrl,
      onOpen: () => {
        requestRuntimeInfo();
      },
      onCommand: (command) => {
        postPluginMessage({
          type: 'bridge-command',
          command
        });
      },
      onError: (error) => {
        console.warn('[BRIDGE]', error.message);
      }
    });

    bridgeClient.connect();
  }

  onMount(() => {
    connectBridge();
  });

  onDestroy(() => {
    bridgeClient?.disconnect();
    bridgeClient = null;
  });

  function setStatus(key: StatusKey, status: StatusState, autoHideMs?: number): void {
    const timeoutId = statusTimeouts.get(key);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      statusTimeouts.delete(key);
    }

    if (key === 'upload') uploadStatus = status;
    if (key === 'images') imagesStatus = status;
    if (key === 'export') exportStatus = status;

    if (status && autoHideMs) {
      const nextTimeoutId = window.setTimeout(() => {
        if (key === 'upload') uploadStatus = null;
        if (key === 'images') imagesStatus = null;
        if (key === 'export') exportStatus = null;
        statusTimeouts.delete(key);
      }, autoHideMs);
      statusTimeouts.set(key, nextTimeoutId);
    }
  }

  function selectTab(tab: TabName): void {
    activeTab = tab;
  }

  function goToStep(step: StepName): void {
    currentStep = step;
  }

  function resetImportState(): void {
    currentStep = 'upload';
    isDropActive = false;
    isPlacing = false;
    penFileData = null;
    imagesData = null;
    fileMeta = null;
    analysis = null;
    uploadStatus = null;
    imagesStatus = null;

    if (fileInput) {
      fileInput.value = '';
    }

    if (imagesInput) {
      imagesInput.value = '';
    }
  }

  async function handlePenFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as PenDocument;

      penFileData = parsed;
      fileMeta = {
        name: file.name,
        version: parsed.version || 'Unknown',
        elementCount: parsed.children ? parsed.children.length : 0
      };
      analysis = null;

      setStatus('upload', {
        type: 'success',
        message: '✓ File loaded successfully'
      }, 3000);
    } catch (error) {
      penFileData = null;
      fileMeta = null;
      analysis = null;
      setStatus('upload', {
        type: 'error',
        message: '✗ Invalid .pen file: ' + getErrorMessage(error)
      });
    }
  }

  async function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }

  async function handleImagesSelection(fileList: FileList | null): Promise<void> {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      imagesData = null;
      setStatus('images', {
        type: 'error',
        message: '✗ No image files found in selected folder'
      });
      return;
    }

    const nextImagesData: ImageMap = {};

    for (const file of imageFiles) {
      const dataUrl = await readFileAsDataUrl(file);
      const relativePath = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, '/');
      const normalizedPath = relativePath.replace(/^\/+/, '');
      const pathWithoutRoot = normalizedPath.includes('/') ? normalizedPath.split('/').slice(1).join('/') : normalizedPath;

      nextImagesData[file.name] = dataUrl;
      nextImagesData[normalizedPath] = dataUrl;
      nextImagesData[`./${normalizedPath}`] = dataUrl;

      if (pathWithoutRoot) {
        nextImagesData[pathWithoutRoot] = dataUrl;
        nextImagesData[`./${pathWithoutRoot}`] = dataUrl;
      }
    }

    imagesData = nextImagesData;
    setStatus('images', {
      type: 'success',
      message: `✓ Loaded ${imageFiles.length} images`
    });
  }

  function handlePenInputChange(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      void handlePenFile(file);
    }
  }

  function handleImagesInputChange(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    void handleImagesSelection(target.files);
  }

  function handleDragOver(): void {
    isDropActive = true;
  }

  function handleDragLeave(): void {
    isDropActive = false;
  }

  function handleDrop(event: DragEvent): void {
    isDropActive = false;
    const file = event.dataTransfer?.files?.[0];
    if (file && file.name.endsWith('.pen')) {
      void handlePenFile(file);
    }
  }

  function openPenFilePicker(): void {
    fileInput?.click();
  }

  function openImagesPicker(): void {
    imagesInput?.click();
  }

  function handleNext(): void {
    if (!penFileData) return;

    goToStep('place');
    postPluginMessage({
      type: 'ready-to-place',
      data: penFileData,
      images: imagesData
    });
  }

  function handleBack(): void {
    goToStep('upload');
  }

  function handlePlace(): void {
    if (!penFileData) return;

    isPlacing = true;
    postPluginMessage({
      type: 'place-import',
      data: penFileData,
      images: imagesData
    });
  }

  function handleExport(): void {
    isExporting = true;
    setStatus('export', null);
    postPluginMessage({ type: 'export-pen' });
  }

  function handleWindowMessage(event: MessageEvent<PluginMessageEnvelope>): void {
    const msg = event.data?.pluginMessage as PluginToUiMessage | undefined;
    if (!msg) return;

    if (msg.type === 'import-success') {
      setStatus('upload', { type: 'success', message: '✓ Import successful' }, 3000);
      return;
    }

    if (msg.type === 'import-error') {
      isPlacing = false;
      setStatus('upload', { type: 'error', message: '✗ Error: ' + msg.error });
      return;
    }

    if (msg.type === 'placement-complete') {
      resetImportState();
      return;
    }

    if (msg.type === 'export-data') {
      const assets = msg.assets || [];
      void downloadExportPackage(msg.data, 'index.pen', assets)
        .then(() => {
          const suffix = assets.length > 0 ? `，已打包 ${assets.length} 张图片` : '';
          setStatus('export', {
            type: 'success',
            message: `✓ Export successful${suffix}`
          });
        })
        .catch((error) => {
          setStatus('export', {
            type: 'error',
            message: '✗ Error: ' + getErrorMessage(error)
          });
        })
        .finally(() => {
          isExporting = false;
        });
      return;
    }

    if (msg.type === 'export-error') {
      isExporting = false;
      setStatus('export', {
        type: 'error',
        message: '✗ Error: ' + msg.error
      });
      return;
    }

    if (msg.type === 'ready-to-place') {
      penFileData = msg.data;
      imagesData = msg.images || null;
      analysis = msg.analysis || null;
      return;
    }

    if (msg.type === 'fetch-icon') {
      void fetchIconSVG(msg.iconName, msg.iconFamily, msg.nodeId);
      return;
    }

    if (msg.type === 'bridge-result') {
      if (!bridgeClient?.isConnected()) {
        return;
      }

      if (msg.payload.kind === 'bridge.runtimeInfo') {
        bridgeClient.send({
          kind: 'plugin.hello',
          pluginSessionId,
          timestamp: Date.now(),
          payload: msg.payload.result
        });
        return;
      }

      bridgeClient.send({
        kind: 'plugin.result',
        pluginSessionId,
        requestId: msg.requestId,
        timestamp: Date.now(),
        payload: msg.payload
      });
      return;
    }

    if (msg.type === 'bridge-error') {
      if (!bridgeClient?.isConnected()) {
        return;
      }

      bridgeClient.send({
        kind: 'plugin.error',
        pluginSessionId,
        requestId: msg.requestId,
        timestamp: Date.now(),
        payload: {
          error: msg.error
        }
      });
      return;
    }

    if (msg.type === 'download-pen') {
      const assets = msg.assets || [];
      void downloadExportPackage(msg.data, msg.filename || 'index.pen', assets).then(() => {
        window.setTimeout(() => {
          postPluginMessage({ type: 'close-after-download' });
        }, Math.max(800, 250 * (assets.length + 1)));
      });
    }
  }

  function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function dataUrlToUint8Array(dataUrl: string): Uint8Array {
    const parts = dataUrl.split(',');
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  function makeCrc32Table(): Uint32Array {
    const table = new Uint32Array(256);

    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }

    return table;
  }

  const CRC32_TABLE = makeCrc32Table();

  function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;

    for (let i = 0; i < bytes.length; i++) {
      crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeUint16(view: DataView, offset: number, value: number): void {
    view.setUint16(offset, value, true);
  }

  function writeUint32(view: DataView, offset: number, value: number): void {
    view.setUint32(offset, value, true);
  }

  function toBlobPart(bytes: Uint8Array): ArrayBuffer {
    return bytes.slice().buffer as ArrayBuffer;
  }

  function createStoredZip(entries: Array<{ name: string; data: Uint8Array }>): Blob {
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
      const fileNameBytes = new TextEncoder().encode(entry.name);
      const fileBytes = entry.data;
      const fileCrc32 = crc32(fileBytes);

      const localHeader = new Uint8Array(30 + fileNameBytes.length);
      const localView = new DataView(localHeader.buffer);
      writeUint32(localView, 0, 0x04034b50);
      writeUint16(localView, 4, 20);
      writeUint16(localView, 6, 0);
      writeUint16(localView, 8, 0);
      writeUint16(localView, 10, 0);
      writeUint16(localView, 12, 0);
      writeUint32(localView, 14, fileCrc32);
      writeUint32(localView, 18, fileBytes.length);
      writeUint32(localView, 22, fileBytes.length);
      writeUint16(localView, 26, fileNameBytes.length);
      writeUint16(localView, 28, 0);
      localHeader.set(fileNameBytes, 30);
      localParts.push(localHeader, fileBytes);

      const centralHeader = new Uint8Array(46 + fileNameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      writeUint32(centralView, 0, 0x02014b50);
      writeUint16(centralView, 4, 20);
      writeUint16(centralView, 6, 20);
      writeUint16(centralView, 8, 0);
      writeUint16(centralView, 10, 0);
      writeUint16(centralView, 12, 0);
      writeUint16(centralView, 14, 0);
      writeUint32(centralView, 16, fileCrc32);
      writeUint32(centralView, 20, fileBytes.length);
      writeUint32(centralView, 24, fileBytes.length);
      writeUint16(centralView, 28, fileNameBytes.length);
      writeUint16(centralView, 30, 0);
      writeUint16(centralView, 32, 0);
      writeUint16(centralView, 34, 0);
      writeUint16(centralView, 36, 0);
      writeUint32(centralView, 38, 0);
      writeUint32(centralView, 42, offset);
      centralHeader.set(fileNameBytes, 46);
      centralParts.push(centralHeader);

      offset += localHeader.length + fileBytes.length;
    }

    const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    writeUint32(endView, 0, 0x06054b50);
    writeUint16(endView, 4, 0);
    writeUint16(endView, 6, 0);
    writeUint16(endView, 8, entries.length);
    writeUint16(endView, 10, entries.length);
    writeUint32(endView, 12, centralDirectorySize);
    writeUint32(endView, 16, offset);
    writeUint16(endView, 20, 0);

    return new Blob(
      [...localParts, ...centralParts, endRecord].map(toBlobPart),
      { type: 'application/zip' }
    );
  }

  function toZipFilename(penFilename: string): string {
    return penFilename.replace(/\.pen$/i, '') + '.zip';
  }

  async function downloadExportPackage(
    penData: PenDocument,
    penFilename: string,
    assets: PenAsset[] = []
  ): Promise<void> {
    if (!assets.length) {
      const penBlob = new Blob([JSON.stringify(penData, null, 2)], { type: 'application/json' });
      downloadBlob(penBlob, penFilename);
      return;
    }

    const textEncoder = new TextEncoder();
    const zipEntries: Array<{ name: string; data: Uint8Array }> = [{
      name: penFilename,
      data: textEncoder.encode(JSON.stringify(penData, null, 2))
    }];

    for (const asset of assets) {
      if (!asset || !asset.dataUrl || !asset.fileName) {
        continue;
      }

      zipEntries.push({
        name: asset.fileName,
        data: dataUrlToUint8Array(asset.dataUrl)
      });
    }

    const zipBlob = createStoredZip(zipEntries);
    downloadBlob(zipBlob, toZipFilename(penFilename));
  }

  async function fetchIconSVG(iconName: string, iconFamily: string, nodeId: string): Promise<void> {
    try {
      let svgUrl = '';

      if (iconFamily === 'lucide' || iconFamily.toLowerCase().includes('lucide')) {
        svgUrl = `https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/${iconName}.svg`;
      } else if (iconFamily.toLowerCase().includes('material')) {
        postPluginMessage({
          type: 'icon-svg-fetched',
          nodeId,
          svgPath: null,
          error: 'Material Symbols not yet supported'
        });
        return;
      } else {
        postPluginMessage({
          type: 'icon-svg-fetched',
          nodeId,
          svgPath: null,
          error: 'Unknown icon family: ' + iconFamily
        });
        return;
      }

      const response = await fetch(svgUrl);
      if (!response.ok) {
        throw new Error('Icon not found: ' + iconName);
      }

      const svgText = await response.text();
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      const pathElements = svgDoc.querySelectorAll('path, circle, rect, polygon, polyline');

      if (pathElements.length === 0) {
        throw new Error('No path data found in SVG');
      }

      const pathData = pathElements[0].getAttribute('d');
      if (!pathData) {
        throw new Error('No d attribute found in path');
      }

      postPluginMessage({
        type: 'icon-svg-fetched',
        nodeId,
        svgPath: pathData,
        iconName
      });
    } catch (error) {
      postPluginMessage({
        type: 'icon-svg-fetched',
        nodeId,
        svgPath: null,
        error: getErrorMessage(error)
      });
    }
  }

  function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
</script>

<svelte:window on:message={handleWindowMessage} />

<div class="app">
  <div class="tabs">
    <button
      type="button"
      class:active={activeTab === 'import'}
      class="tab"
      on:click={() => selectTab('import')}
    >
      📥 Import
    </button>
    <button
      type="button"
      class:active={activeTab === 'export'}
      class="tab"
      on:click={() => selectTab('export')}
    >
      📤 Export
    </button>
  </div>

  {#if activeTab === 'import'}
    {#if currentStep === 'upload'}
      <div class="step-indicator">Step 1 of 2</div>
      <h2>Import .pen file</h2>

      <button
        type="button"
        class:active={isDropActive}
        class="drop-zone"
        on:click={openPenFilePicker}
        on:dragover|preventDefault={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop|preventDefault={handleDrop}
      >
        <div class="drop-zone-icon">📄</div>
        <div class="drop-zone-text">Drag & drop your .pen file here</div>
        <div class="drop-zone-subtext">or click to browse</div>
      </button>

      <input
        bind:this={fileInput}
        class="file-input"
        type="file"
        accept=".pen"
        on:change={handlePenInputChange}
      />

      {#if fileMeta}
        <div class="file-info">
          <div class="file-name">{fileMeta.name}</div>
          <div class="file-details">
            Version: {fileMeta.version} • {fileMeta.elementCount} elements
          </div>
        </div>
      {/if}

      {#if analysis}
        <div class="file-info">
          <div class="file-name">📊 File Analysis</div>
          <div class="file-details">
            <strong>Version:</strong> {analysis.version}<br />
            <strong>Total Elements:</strong> {analysis.totalElements}<br />
            <strong>Components:</strong> {analysis.components} | <strong>Instances:</strong> {analysis.instances}<br />
            <strong>Auto-Layout Frames:</strong> {analysis.autoLayoutFrames} | <strong>Absolute:</strong> {analysis.absoluteFrames}<br />
            <strong>Text Nodes:</strong> {analysis.textNodes} | <strong>Images:</strong> {analysis.images}<br />
            <strong>Variables:</strong> {analysis.variables} | <strong>Max Depth:</strong> {analysis.maxDepth}<br />
            <strong>Types:</strong> {analysisTypesText}
          </div>
        </div>
      {/if}

      <div class="section">
        <label class="label" for="imagesInput">Images (optional)</label>
        <button type="button" class="button secondary" on:click={openImagesPicker}>
          Select images folder
        </button>
        <div class="help-text">If your design uses local images, select the folder containing them</div>
        {#if imagesStatus}
          <div class={`status ${imagesStatus.type}`}>{imagesStatus.message}</div>
        {/if}
      </div>

      <input
        bind:this={imagesInput}
        id="imagesInput"
        class="file-input"
        type="file"
        webkitdirectory
        multiple
        on:change={handleImagesInputChange}
      />

      {#if uploadStatus}
        <div class={`status ${uploadStatus.type}`}>{uploadStatus.message}</div>
      {/if}

      <button type="button" class="button" disabled={!penFileData} on:click={handleNext}>
        Next →
      </button>
    {:else}
      <div class="step-indicator">Step 2 of 2</div>
      <h2>Place on canvas</h2>

      <div class="status info">
        <strong>Ready to import!</strong><br />
        Navigate to where you want the design placed, then click "Place here"
      </div>

      {#if fileMeta}
        <div class="file-info">
          <div class="file-name">{fileMeta.name}</div>
          <div class="file-details">
            Version: {fileMeta.version} • {fileMeta.elementCount} elements
          </div>
        </div>
      {/if}

      <button type="button" class="button" disabled={isPlacing || !penFileData} on:click={handlePlace}>
        {#if isPlacing}Placing...{:else}📍 Place here{/if}
      </button>
      <button type="button" class="button secondary" on:click={handleBack}>
        ← Back
      </button>
    {/if}
  {:else}
    <h2>Export to .pen</h2>

    <div class="section">
      <div class="label">Export selection</div>
      <div class="help-text">The plugin exports the nodes currently selected on the canvas</div>
    </div>

    {#if exportStatus}
      <div class={`status ${exportStatus.type}`}>{exportStatus.message}</div>
    {/if}

    <button type="button" class="button" disabled={isExporting} on:click={handleExport}>
      {#if isExporting}Exporting...{:else}📤 Export{/if}
    </button>
  {/if}
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background: #fff;
  }

  :global(body) {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px;
    color: #333;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .app {
    padding: 16px;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: #000;
  }

  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    border-bottom: 1px solid #e5e5e5;
  }

  .tab {
    padding: 8px 16px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    color: #666;
    transition: all 0.2s;
  }

  .tab:hover {
    color: #000;
  }

  .tab.active {
    color: #18a0fb;
    border-bottom-color: #18a0fb;
  }

  .drop-zone {
    width: 100%;
    margin-bottom: 16px;
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 32px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: #fff;
  }

  .drop-zone:hover {
    border-color: #18a0fb;
    background: #f0f8ff;
  }

  .drop-zone.active {
    border-color: #18a0fb;
    background: #e6f4ff;
  }

  .drop-zone-icon {
    margin-bottom: 8px;
    font-size: 48px;
    opacity: 0.5;
  }

  .drop-zone-text {
    margin-bottom: 4px;
    font-size: 13px;
    color: #666;
  }

  .drop-zone-subtext {
    font-size: 11px;
    color: #999;
  }

  .file-input {
    display: none;
  }

  .button {
    width: 100%;
    margin-bottom: 8px;
    padding: 10px 16px;
    background: #18a0fb;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .button:hover:not(:disabled) {
    background: #0d8ce8;
  }

  .button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .button.secondary {
    background: #fff;
    color: #333;
    border: 1px solid #ccc;
  }

  .button.secondary:hover:not(:disabled) {
    background: #f5f5f5;
  }

  .file-info {
    margin-bottom: 12px;
    border-radius: 6px;
    padding: 12px;
    background: #f5f5f5;
  }

  .file-name {
    margin-bottom: 4px;
    font-weight: 500;
    color: #000;
  }

  .file-details {
    font-size: 11px;
    color: #666;
    line-height: 1.5;
  }

  .status {
    margin-bottom: 12px;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 11px;
    line-height: 1.4;
  }

  .status.success {
    background: #e6f7e6;
    color: #2d6a2d;
  }

  .status.error {
    background: #ffe6e6;
    color: #d32f2f;
  }

  .status.info {
    background: #e6f4ff;
    color: #0d47a1;
  }

  .section {
    margin-bottom: 20px;
  }

  .label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: #333;
  }

  .help-text {
    margin-top: 4px;
    font-size: 11px;
    line-height: 1.4;
    color: #999;
  }

  .step-indicator {
    margin-bottom: 16px;
    text-align: center;
    font-size: 11px;
    color: #666;
  }
</style>
