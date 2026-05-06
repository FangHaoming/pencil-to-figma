import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createBridgeServer } from '../bridge/server';
import { downloadImageFromSelectionLink } from './tools/download-image-from-selection-link';
import { exportNodePngFromSelectionLink } from './tools/export-node-png-from-selection-link';
import { getBridgeStatus } from './tools/get-bridge-status';
import { getDesignContextFromSelectionLink } from './tools/get-design-context-from-selection-link';
import { getMetadataFromSelectionLink } from './tools/get-metadata-from-selection-link';
import { getScreenshotFromSelectionLink } from './tools/get-screenshot-from-selection-link';
import { getVariableDefsFromSelectionLink } from './tools/get-variable-defs-from-selection-link';

const bridgePort = Number(process.env.PENCIL_FIGMA_BRIDGE_PORT || 3210);
const bridge = createBridgeServer({ port: bridgePort });

function toToolResult(result: Record<string, unknown>, isError = false) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2)
      }
    ],
    structuredContent: result,
    isError
  };
}

function inferError(result: Record<string, unknown>): boolean {
  return result.ok === false;
}

async function main(): Promise<void> {
  await bridge.start();

  const server = new McpServer({
    name: 'pencil-to-figma-local-mcp',
    version: '0.1.0'
  });

  server.registerTool('get_bridge_status', {
    title: 'Get Bridge Status',
    description: 'Return the local Figma bridge status and connected plugin sessions.',
    inputSchema: {}
  }, async () => {
    const result = await getBridgeStatus({ bridge });
    return toToolResult(result as Record<string, unknown>);
  });

  const linkSchema = {
    link: z.string().describe('Figma selection link. 用figma mcp获取设计稿。')
  };

  server.registerTool('get_metadata_from_figma_selection_link', {
    title: 'Get Metadata From Selection Link',
    description: 'Parse a Figma selection link and return metadata for the linked node. 用figma mcp获取设计稿。',
    inputSchema: linkSchema
  }, async ({ link }) => {
    const result = await getMetadataFromSelectionLink({ link }, { bridge });
    return toToolResult(result as Record<string, unknown>, inferError(result as Record<string, unknown>));
  });

  server.registerTool('get_design_context_from_figma_selection_link', {
    title: 'Get Design Context From Selection Link',
    description: 'Parse a Figma selection link and return design context for the linked node. 用figma mcp获取设计稿。',
    inputSchema: linkSchema
  }, async ({ link }) => {
    const result = await getDesignContextFromSelectionLink({ link }, { bridge });
    return toToolResult(result as Record<string, unknown>, inferError(result as Record<string, unknown>));
  });

  server.registerTool('get_screenshot_from_figma_selection_link', {
    title: 'Get Screenshot From Selection Link',
    description: 'Parse a Figma selection link and return a screenshot for the linked node. 用figma mcp获取设计稿。',
    inputSchema: linkSchema
  }, async ({ link }) => {
    const result = await getScreenshotFromSelectionLink({ link }, { bridge });
    return toToolResult(result as Record<string, unknown>, inferError(result as Record<string, unknown>));
  });

  server.registerTool('get_variable_defs_from_figma_selection_link', {
    title: 'Get Variable Defs From Selection Link',
    description: 'Parse a Figma selection link and return variables used by the linked node. 用figma mcp获取设计稿。',
    inputSchema: linkSchema
  }, async ({ link }) => {
    const result = await getVariableDefsFromSelectionLink({ link }, { bridge });
    return toToolResult(result as Record<string, unknown>, inferError(result as Record<string, unknown>));
  });

  server.registerTool('download_image_from_figma_selection_link', {
    title: 'Download Image From Selection Link',
    description: 'Parse a Figma selection link and return image data for the linked node. Locked groups are exported as a single PNG. 用figma mcp获取设计稿。',
    inputSchema: linkSchema
  }, async ({ link }) => {
    const result = await downloadImageFromSelectionLink({ link }, { bridge });
    return toToolResult(result as Record<string, unknown>, inferError(result as Record<string, unknown>));
  });

  server.registerTool('export_node_png_from_figma_selection_link', {
    title: 'Export Node PNG From Selection Link',
    description: 'Parse a Figma selection link and export the linked node as a PNG. 用figma mcp获取设计稿。',
    inputSchema: linkSchema
  }, async ({ link }) => {
    const result = await exportNodePngFromSelectionLink({ link }, { bridge });
    return toToolResult(result as Record<string, unknown>, inferError(result as Record<string, unknown>));
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await server.close();
    await bridge.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void main().catch(async (error) => {
  console.error('[MCP] Failed to start local Figma MCP server', error);
  await bridge.stop();
  process.exit(1);
});
