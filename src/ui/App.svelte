<script lang="ts">
  import type { PluginMessageEnvelope, PluginToUiMessage, UiToPluginMessage } from '../shared/messages';
  import type { PenAsset, PenDocument } from '../shared/pen';

  type StatusType = 'success' | 'error' | 'info';
  type StatusState = {
    type: StatusType;
    message: string;
  } | null;
  type ExportProgress = {
    stage: 'export' | 'package';
    label: string;
  } | null;

  let isExporting = false;
  let exportStatus: StatusState = null;
  let exportProgress: ExportProgress = null;

  function postPluginMessage(message: UiToPluginMessage): void {
    parent.postMessage({ pluginMessage: message }, '*');
  }

  function setExportStatus(status: StatusState): void {
    exportStatus = status;
  }

  function setExportProgress(progress: ExportProgress): void {
    exportProgress = progress;
  }

  function setExportProgressStatus(current: number, total: number): void {
    const label = `正在打包 ZIP（${current}/${total}）`;
    setExportProgress({ stage: 'package', label });
    setExportStatus({
      type: 'info',
      message: `正在打包第 ${current} / ${total} 个文件...`
    });
  }

  function handleExport(): void {
    isExporting = true;
    setExportStatus(null);
    setExportProgress(null);
    postPluginMessage({ type: 'export-pen' });
  }

  function handleWindowMessage(event: MessageEvent<PluginMessageEnvelope>): void {
    const msg = event.data?.pluginMessage as PluginToUiMessage | undefined;
    if (!msg) return;

    if (msg.type === 'export-data') {
      const assets = msg.assets || [];
      const validAssetCount = assets.filter(isValidAsset).length;
      void downloadExportPackage(msg.data, 'index.pen', assets, setExportProgressStatus)
        .then(() => {
          const suffix = validAssetCount > 0 ? `，并打包了 ${validAssetCount} 张图片` : '';
          setExportProgress(null);
          setExportStatus({
            type: 'success',
            message: `已成功导出 .pen${suffix}`
          });
        })
        .catch((error) => {
          setExportProgress(null);
          setExportStatus({
            type: 'error',
            message: '导出失败：' + getErrorMessage(error)
          });
        })
        .finally(() => {
          isExporting = false;
        });
      return;
    }

    if (msg.type === 'export-progress') {
      setExportProgress({
        stage: msg.stage,
        label: msg.message
      });
      setExportStatus({
        type: 'info',
        message: msg.message
      });
      return;
    }

    if (msg.type === 'export-error') {
      isExporting = false;
      setExportProgress(null);
      setExportStatus({
        type: 'error',
        message: '导出失败：' + msg.error
      });
      return;
    }

    if (msg.type === 'download-pen') {
      const assets = msg.assets || [];
      void downloadExportPackage(msg.data, msg.filename || 'index.pen', assets)
        .then(() => {
          window.setTimeout(() => {
            postPluginMessage({ type: 'close-after-download' });
          }, Math.max(800, 250 * (assets.length + 1)));
        })
        .catch((error) => {
          isExporting = false;
          setExportStatus({
            type: 'error',
            message: '下载失败：' + getErrorMessage(error)
          });
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

  function isValidAsset(asset: PenAsset | null | undefined): asset is PenAsset {
    return !!asset && !!asset.dataUrl && !!asset.fileName;
  }

  function nextRenderFrame(): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  async function downloadExportPackage(
    penData: PenDocument,
    penFilename: string,
    assets: PenAsset[] = [],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    const validAssets = assets.filter(isValidAsset);
    const totalFiles = 1 + validAssets.length;

    onProgress?.(1, totalFiles);

    if (!validAssets.length) {
      const penBlob = new Blob([JSON.stringify(penData, null, 2)], { type: 'application/json' });
      downloadBlob(penBlob, penFilename);
      return;
    }

    const textEncoder = new TextEncoder();
    const zipEntries: Array<{ name: string; data: Uint8Array }> = [{
      name: penFilename,
      data: textEncoder.encode(JSON.stringify(penData, null, 2))
    }];

    await nextRenderFrame();

    for (let index = 0; index < validAssets.length; index++) {
      const asset = validAssets[index];
      zipEntries.push({
        name: asset.fileName,
        data: dataUrlToUint8Array(asset.dataUrl)
      });

      onProgress?.(index + 2, totalFiles);
      await nextRenderFrame();
    }

    const zipBlob = createStoredZip(zipEntries);
    downloadBlob(zipBlob, toZipFilename(penFilename));
  }

  function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
</script>

<svelte:window on:message={handleWindowMessage} />

<main class="app">
  <header class="hero">
    <h1>figma to pen</h1>
    <p class="lead">将当前选中的 Figma 节点导出为 `.pen` 文件，图片资源会自动一并打包下载。</p>
  </header>

  <section class="panel" aria-labelledby="export-title">
    <h2 id="export-title">导出当前选择</h2>
    <ol class="steps">
      <li>在 Figma 画布中选中要导出的节点。</li>
      <li>点击下方按钮生成 `.pen` 文件。</li>
      <li>如果选区包含图片资源，插件会下载带资产的压缩包。</li>
    </ol>

    {#if exportStatus}
      <p class={`status ${exportStatus.type}`} role={exportStatus.type === 'error' ? 'alert' : 'status'}>
        {exportStatus.message}
      </p>
    {/if}

    <button type="button" class="button" disabled={isExporting} on:click={handleExport}>
      {#if isExporting}正在导出...{:else}导出为 .pen{/if}
    </button>
  </section>

</main>

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

  .hero {
    margin-bottom: 16px;
  }

  h1,
  h2 {
    margin: 0;
    color: #000;
  }

  h1 {
    font-size: 16px;
    font-weight: 700;
  }

  h2 {
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 600;
  }

  .lead {
    margin: 8px 0 0;
    color: #666;
    line-height: 1.5;
  }

  .panel {
    border: 1px solid #e5e5e5;
    border-radius: 10px;
    padding: 16px;
    background: #fafafa;
  }

  .steps {
    margin: 0 0 16px;
    padding-left: 18px;
    color: #555;
    line-height: 1.6;
  }

  .button {
    width: 100%;
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

  .status {
    margin: 0 0 12px;
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

  .footnote {
    margin-top: 12px;
    font-size: 11px;
    line-height: 1.5;
    color: #888;
  }
</style>
