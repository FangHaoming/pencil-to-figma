// Pencil.dev Sync for Figma - Main Plugin Code
// Handles importing .pen files into Figma with full structure preservation
// VERSION 2.5 - Improved SVG path handling

console.log('Pencil.dev Sync Plugin v2.5 loaded');

// Handle menu commands
if (figma.command === 'import') {
  // Show UI for import
  figma.showUI(__html__, { width: 400, height: 600 });
} else if (figma.command === 'export-selection') {
  // Export selected nodes to .pen file
  exportSelectionToPen();
} else if (figma.command === 'export-page') {
  // Export entire page to .pen file
  exportPageToPen();
} else {
  // Default: show UI
  figma.showUI(__html__, { width: 400, height: 600 });
}

// Export selection to .pen file
async function exportSelectionToPen() {
  try {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.notify('❌ Please select at least one element to export');
      figma.closePlugin();
      return;
    }

    figma.notify('⏳ Exporting selection to .pen file...');

    const exportBundle = await convertNodesToPenBundle(selection);

    // Show UI briefly to trigger download
    figma.showUI(__html__, { width: 1, height: 1, visible: false });
    
    // Wait for UI to load before sending download message
    setTimeout(() => {
      figma.ui.postMessage({
        type: 'download-pen',
        data: exportBundle.penData,
        assets: exportBundle.assets,
        filename: 'figma-export-selection.pen'
      });
    }, 300);

  } catch (error) {
    figma.notify('❌ Export failed: ' + error.message);
    figma.closePlugin();
  }
}

// Export page to .pen file
async function exportPageToPen() {
  try {
    figma.notify('⏳ Exporting page to .pen file...');

    const exportBundle = await convertNodesToPenBundle(figma.currentPage.children);

    if (exportBundle.penData.children.length === 0) {
      figma.notify('❌ No elements found on page to export');
      figma.closePlugin();
      return;
    }

    // Show UI briefly to trigger download
    figma.showUI(__html__, { width: 1, height: 1, visible: false });
    
    // Wait for UI to load before sending download message
    setTimeout(() => {
      figma.ui.postMessage({
        type: 'download-pen',
        data: exportBundle.penData,
        assets: exportBundle.assets,
        filename: `figma-export-${figma.currentPage.name}.pen`
      });
    }, 300);

  } catch (error) {
    figma.notify('❌ Export failed: ' + error.message);
    figma.closePlugin();
  }
}

// Store component mapping for instances
const componentMap = new Map();
const imageCache = new Map();

function normalizeImagePath(path) {
  if (!path || typeof path !== 'string') return '';
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function getImageDataFromCache(path) {
  if (!path || typeof path !== 'string') return null;
  if (path.startsWith('data:')) return path;

  const normalizedPath = normalizeImagePath(path);
  const fileName = normalizedPath.split('/').pop();

  return imageCache.get(path) ||
    imageCache.get(normalizedPath) ||
    imageCache.get(`./${normalizedPath}`) ||
    (fileName ? imageCache.get(fileName) : null) ||
    null;
}

function getImageFillSpec(fillValue) {
  if (!fillValue) return null;

  if (Array.isArray(fillValue)) {
    for (const fill of fillValue) {
      const imageFill = getImageFillSpec(fill);
      if (imageFill) return imageFill;
    }
    return null;
  }

  if (typeof fillValue === 'object' && fillValue.type === 'image' && fillValue.url) {
    return fillValue;
  }

  return null;
}

function mapPenImageModeToFigma(mode) {
  if (mode === 'fit') return 'FIT';
  if (mode === 'fill') return 'FILL';
  return 'FILL';
}

function mapFigmaImageModeToPen(scaleMode) {
  if (scaleMode === 'FIT') return 'fit';
  if (scaleMode === 'FILL' || scaleMode === 'CROP') return 'fill';
  return 'stretch';
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function uint8ArrayToBase64(bytes) {
  let result = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const byte1 = bytes[i];
    const byte2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const byte3 = i + 2 < bytes.length ? bytes[i + 2] : 0;

    const triplet = (byte1 << 16) | (byte2 << 8) | byte3;

    result += BASE64_CHARS[(triplet >> 18) & 63];
    result += BASE64_CHARS[(triplet >> 12) & 63];
    result += i + 1 < bytes.length ? BASE64_CHARS[(triplet >> 6) & 63] : '=';
    result += i + 2 < bytes.length ? BASE64_CHARS[triplet & 63] : '=';
  }

  return result;
}

function base64ToBinaryString(base64) {
  const cleanBase64 = String(base64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  let result = '';

  for (let i = 0; i < cleanBase64.length; i += 4) {
    const enc1 = BASE64_CHARS.indexOf(cleanBase64[i]);
    const enc2 = BASE64_CHARS.indexOf(cleanBase64[i + 1]);
    const enc3 = cleanBase64[i + 2] === '=' ? 64 : BASE64_CHARS.indexOf(cleanBase64[i + 2]);
    const enc4 = cleanBase64[i + 3] === '=' ? 64 : BASE64_CHARS.indexOf(cleanBase64[i + 3]);

    const triplet = ((enc1 & 63) << 18) | ((enc2 & 63) << 12) | ((enc3 & 63) << 6) | (enc4 & 63);

    result += String.fromCharCode((triplet >> 16) & 255);
    if (enc3 !== 64) result += String.fromCharCode((triplet >> 8) & 255);
    if (enc4 !== 64) result += String.fromCharCode(triplet & 255);
  }

  return result;
}

function detectImageMimeType(bytes) {
  if (!bytes || bytes.length < 12) return 'image/png';

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }

  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }

  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }

  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return 'image/png';
}

function mimeTypeToExtension(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function sanitizeFileNamePart(value, fallback = 'image') {
  const sanitized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || fallback;
}

async function applyImageFillToNode(node, fillValue, context) {
  const imageFill = getImageFillSpec(fillValue);
  if (!imageFill) return false;

  const imageData = getImageDataFromCache(imageFill.url);
  if (!imageData) {
    console.warn(`[IMAGE] ⚠️ Image not found in cache: ${imageFill.url}` + (context ? ` for ${context}` : ''));
    return false;
  }

  try {
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
    const imageBytes = base64ToUint8Array(base64Data);
    const image = figma.createImage(imageBytes);
    node.fills = [{
      type: 'IMAGE',
      scaleMode: mapPenImageModeToFigma(imageFill.mode),
      imageHash: image.hash
    }];
    return true;
  } catch (error) {
    console.error(`[IMAGE] ❌ Failed to create image fill from ${imageFill.url}:`, error);
    return false;
  }
}

async function getExportImageAsset(fill, node, exportContext) {
  if (!exportContext || !fill || fill.type !== 'IMAGE' || !fill.imageHash || fill.visible === false) {
    return null;
  }

  const imageAssetKey = `image:${fill.imageHash}`;
  if (exportContext.assets.has(imageAssetKey)) {
    return exportContext.assets.get(imageAssetKey);
  }

  const image = figma.getImageByHash(fill.imageHash);
  if (image && typeof image.getBytesAsync === 'function') {
    try {
      const bytes = await image.getBytesAsync();
      const mimeType = detectImageMimeType(bytes);
      const extension = mimeTypeToExtension(mimeType);
      const fileName = `${sanitizeFileNamePart(node.name || node.type || 'image')}-${fill.imageHash.slice(0, 8)}.${extension}`;
      const asset = {
        fileName: fileName,
        mimeType: mimeType,
        dataUrl: `data:${mimeType};base64,${uint8ArrayToBase64(bytes)}`
      };

      exportContext.assets.set(imageAssetKey, asset);
      return asset;
    } catch (error) {
    }
  }

  if (typeof node.exportAsync === 'function') {
    try {
      const bytes = await node.exportAsync({ format: 'PNG' });
      const assetKey = `node:${node.id}`;
      const asset = {
        fileName: `${sanitizeFileNamePart(node.name || node.type || 'image')}-${sanitizeFileNamePart(node.id, 'node')}.png`,
        mimeType: 'image/png',
        dataUrl: `data:image/png;base64,${uint8ArrayToBase64(bytes)}`
      };
      exportContext.assets.set(assetKey, asset);
      return asset;
    } catch (error) {
    }
  }

  return null;
}

async function convertNodesToPenBundle(nodes) {
  const exportContext = { assets: new Map() };
  const penData = {
    version: '2.7',
    variables: {},
    children: []
  };

  for (const node of nodes) {
    const element = await nodeToElement(node, exportContext);
    if (element) {
      penData.children.push(element);
    }
  }

  return {
    penData: penData,
    assets: Array.from(exportContext.assets.values())
  };
}

// Listen for messages from the UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'import-pen') {
    try {
      await importPenFile(msg.data, msg.images);
      figma.ui.postMessage({ type: 'import-success' });
    } catch (error) {
      figma.ui.postMessage({ type: 'import-error', error: error.message });
    }
  } else if (msg.type === 'place-import') {
    try {
      const nodes = await createNodesFromPenData(msg.data, msg.images);

      // Nodes already have their positions from the pen file (x, y properties)
      // No need to override them - they maintain their original layout

      // Select the imported nodes
      figma.currentPage.selection = nodes;
      figma.viewport.scrollAndZoomIntoView(nodes);

      figma.notify('✅ Pen file imported successfully!');
      figma.ui.postMessage({ type: 'placement-complete' });
    } catch (error) {
      figma.notify('❌ Error importing: ' + error.message);
      figma.ui.postMessage({ type: 'import-error', error: error.message });
    }
  } else if (msg.type === 'export-pen') {
    try {
      const exportBundle = await exportToPen(msg.mode);
      figma.ui.postMessage({ type: 'export-data', data: exportBundle.penData, assets: exportBundle.assets });
    } catch (error) {
      figma.ui.postMessage({ type: 'export-error', error: error.message });
    }
  } else if (msg.type === 'icon-svg-fetched') {
    // Handle fetched icon SVG
    try {
      if (msg.svgPath && msg.nodeId) {
        console.log('[ICON] Received SVG for icon:', msg.iconName);
        
        // Find the vector node by ID
        const node = figma.getNodeById(msg.nodeId);
        
        if (node && node.type === 'VECTOR') {
          // Update the vector path with the actual icon SVG
          try {
            node.vectorPaths = [{
              windingRule: 'NONZERO',
              data: msg.svgPath
            }];
            
            // Remove the placeholder flag
            node.setPluginData('isIconPlaceholder', 'false');
            node.setPluginData('pendingIconFetch', 'false');
            
            console.log('[ICON] Successfully updated vector with icon SVG:', msg.iconName);
          } catch (pathError) {
            console.error('[ICON] Failed to set vector path:', pathError);
          }
        } else {
          console.warn('[ICON] Node not found or not a vector:', msg.nodeId);
        }
      } else {
        console.warn('[ICON] Failed to fetch icon:', msg.error);
      }
    } catch (error) {
      console.error('[ICON] Error processing fetched icon:', error);
    }
  } else if (msg.type === 'close-after-download') {
    // Close plugin after successful download
    figma.notify('✅ .pen file exported successfully!');
    // Give time for download to complete before closing
    setTimeout(() => {
      figma.closePlugin();
    }, 500);
  } else if (msg.type === 'close') {
    figma.closePlugin();
  }
};

// Main import function
async function importPenFile(penData, images) {
  componentMap.clear();
  imageCache.clear();

  // Store images in cache
  if (images) {
    for (const [filename, dataUrl] of Object.entries(images)) {
      imageCache.set(filename, dataUrl);
    }
  }

  // Validate pen file structure
  if (!penData || typeof penData !== 'object') {
    throw new Error('Invalid pen file: not a valid JSON object');
  }

  if (!penData.children || !Array.isArray(penData.children)) {
    throw new Error('Invalid pen file: missing or invalid children array');
  }

  // Analyze the pen file
  const analysis = analyzePenFile(penData);

  figma.ui.postMessage({
    type: 'ready-to-place',
    data: penData,
    images: images,
    analysis: analysis
  });
}

// Analyze pen file structure
function analyzePenFile(penData) {
  const stats = {
    version: penData.version || 'Unknown',
    totalElements: 0,
    elementTypes: {},
    components: 0,
    instances: 0,
    autoLayoutFrames: 0,
    absoluteFrames: 0,
    images: 0,
    textNodes: 0,
    variables: penData.variables ? Object.keys(penData.variables).length : 0,
    maxDepth: 0,
    hasTheme: !!penData.theme || false
  };

  function analyzeElement(element, depth = 0) {
    if (!element) return;

    stats.totalElements++;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    // Count by type
    const type = element.type || 'unknown';
    stats.elementTypes[type] = (stats.elementTypes[type] || 0) + 1;

    // Specific counts
    if (type === 'ref') stats.instances++;
    if (type === 'text') stats.textNodes++;
    if (type === 'image' || getImageFillSpec(element.fill)) stats.images++;

    if (type === 'frame') {
      if (element.reusable) stats.components++;

      if (element.layout === 'horizontal' || element.layout === 'vertical') {
        stats.autoLayoutFrames++;
      } else if (element.justifyContent || element.alignItems || element.gap !== undefined) {
        stats.autoLayoutFrames++; // Inferred auto-layout
      } else {
        stats.absoluteFrames++;
      }
    }

    // Recurse children
    if (element.children && Array.isArray(element.children)) {
      element.children.forEach(child => analyzeElement(child, depth + 1));
    }
  }

  if (penData.children && Array.isArray(penData.children)) {
    penData.children.forEach(child => analyzeElement(child, 0));
  }

  return stats;
}

// Convert pen format to Figma-compatible format
function convertPenToFigmaFormat(penData) {
  console.log('🔄 Converting pen format to Figma format...');
  
  const figmaData = {
    version: penData.version,
    variables: penData.variables || {},
    children: []
  };

  let convertedCount = 0;
  let normalizedLayoutCount = 0;
  let normalizedDimensionCount = 0;

  function convertElement(element, depth) {
    if (!element || !element.type) return null;
    
    // Prevent infinite recursion
    if (depth > 100) {
      console.warn('⚠️ Max recursion depth reached for:', element.name || element.id);
      return null;
    }

    convertedCount++;

    // Create a shallow copy of the element (without children) to avoid modifying the original
    const converted = {};
    for (const key in element) {
      if (key !== 'children' && element.hasOwnProperty(key)) {
        // Deep copy non-children properties
        if (typeof element[key] === 'object' && element[key] !== null && !Array.isArray(element[key])) {
          converted[key] = JSON.parse(JSON.stringify(element[key]));
        } else if (Array.isArray(element[key])) {
          converted[key] = JSON.parse(JSON.stringify(element[key]));
        } else {
          converted[key] = element[key];
        }
      }
    }

    // Normalize layout property for frames
    if (element.type === 'frame') {
      if (!converted.layout) {
        // Check if frame has layout-related properties
        const hasLayoutProps = element.justifyContent || element.alignItems || element.gap !== undefined || element.padding !== undefined;
        
        if (hasLayoutProps) {
          // Infer layout from properties
          converted.layout = 'horizontal'; // Default to horizontal for auto-layout
          normalizedLayoutCount++;
          console.log('  ✓ Inferred layout=horizontal for:', element.name || element.id);
        } else {
          // No layout properties, default to 'none' (absolute positioning)
          converted.layout = 'none';
          normalizedLayoutCount++;
          console.log('  ✓ Set layout=none for:', element.name || element.id);
        }
      }
      
      // Add default alignment properties for auto-layout frames
      if (converted.layout && converted.layout !== 'none') {
        if (converted.justifyContent === undefined) {
          converted.justifyContent = 'start';
        }
        if (converted.alignItems === undefined) {
          converted.alignItems = 'start';
        }
      }
    }

    // Normalize dimensions - only for auto-layout frames
    if (converted.width === undefined && converted.layout && converted.layout !== 'none') {
      converted.width = 'hug_contents';
      normalizedDimensionCount++;
    }
    if (converted.height === undefined && converted.layout && converted.layout !== 'none') {
      converted.height = 'hug_contents';
      normalizedDimensionCount++;
    }

    // DON'T add default x,y values - only keep them if they exist in the source
    // Children of auto-layout frames don't have x,y coordinates
    // Only absolute-positioned elements have x,y

    // Normalize font weight to string
    if (converted.fontWeight !== undefined && typeof converted.fontWeight === 'number') {
      converted.fontWeight = String(converted.fontWeight);
    }

    // Normalize fill property
    if (converted.fill === 'transparent') {
      delete converted.fill;
    }

    // Normalize padding - ensure it's always an array
    if (converted.padding !== undefined && typeof converted.padding === 'number') {
      converted.padding = [converted.padding];
    }

    // Normalize cornerRadius - ensure proper format
    if (converted.cornerRadius !== undefined) {
      if (typeof converted.cornerRadius === 'string' && converted.cornerRadius.startsWith('$')) {
        // Keep variable references as-is
      } else if (Array.isArray(converted.cornerRadius)) {
        // Ensure all values are numbers or variable references
        converted.cornerRadius = converted.cornerRadius.map(function(r) {
          return (typeof r === 'string' && r.startsWith('$')) ? r : (parseFloat(r) || 0);
        });
      }
    }

    // Normalize stroke thickness - handle object format
    if (converted.stroke && typeof converted.stroke === 'object' && converted.stroke.thickness) {
      if (typeof converted.stroke.thickness === 'object') {
        // Stroke thickness is an object with top/bottom/left/right
        // Figma doesn't support per-side stroke thickness, so use the maximum value
        const thicknesses = [];
        if (converted.stroke.thickness.top !== undefined) thicknesses.push(converted.stroke.thickness.top);
        if (converted.stroke.thickness.bottom !== undefined) thicknesses.push(converted.stroke.thickness.bottom);
        if (converted.stroke.thickness.left !== undefined) thicknesses.push(converted.stroke.thickness.left);
        if (converted.stroke.thickness.right !== undefined) thicknesses.push(converted.stroke.thickness.right);
        if (thicknesses.length > 0) {
          converted.stroke.thickness = Math.max.apply(Math, thicknesses);
        }
      }
    }

    // Recursively convert children
    if (element.children && Array.isArray(element.children)) {
      console.log('  → Converting', element.children.length, 'children for:', element.name || element.id);
      converted.children = element.children.map(function(child) {
        return convertElement(child, depth + 1);
      }).filter(function(c) {
        return c !== null;
      });
      console.log('  → Converted', converted.children.length, 'children for:', element.name || element.id);
    }

    return converted;
  }

  if (penData.children && Array.isArray(penData.children)) {
    figmaData.children = penData.children.map(function(child) {
      return convertElement(child, 0);
    }).filter(function(c) {
      return c !== null;
    });
  }

  console.log('✅ Conversion complete:');
  console.log('  - Converted', convertedCount, 'elements');
  console.log('  - Normalized', normalizedLayoutCount, 'layouts');
  console.log('  - Normalized', normalizedDimensionCount, 'dimensions');
  console.log('  - Result:', figmaData.children.length, 'top-level elements');
  
  return figmaData;
}

// Create Figma nodes from pen data
async function createNodesFromPenData(penData, images) {
  const nodes = [];

  console.log('Creating nodes from pen data. Top-level children count:', penData.children ? penData.children.length : 0);

  // Validate input
  if (!penData || !penData.children || !Array.isArray(penData.children)) {
    throw new Error('Invalid pen data: missing or invalid children array');
  }

  // Convert pen format to Figma format first
  const figmaData = convertPenToFigmaFormat(penData);

  // Process children
  if (figmaData.children && Array.isArray(figmaData.children)) {
    console.log(`[IMPORT] Creating ${figmaData.children.length} top-level nodes...`);
    for (let i = 0; i < figmaData.children.length; i++) {
      const child = figmaData.children[i];
      console.log(`[IMPORT] Creating top-level node ${i}: ${child.name} (type: ${child.type}), has ${child.children ? child.children.length : 0} children`);
      
      try {
        const node = await createNode(child, figmaData.variables);
        if (node) {
          nodes.push(node);
          figma.currentPage.appendChild(node);
          console.log(`[IMPORT] Appended ${node.name} to page. Node has ${node.children ? node.children.length : 0} children`);
        }
      } catch (error) {
        console.error(`[IMPORT] Failed to create node ${child.name}:`, error);
        figma.notify(`⚠️ Skipped ${child.name}: ${error.message}`);
      }

      // Add small delay every 10 nodes to prevent lag
      if (i > 0 && i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  }

  // Second pass: create instances (after all components are created)
  await createInstances(figmaData.children, figmaData.variables);

  // Log summary
  console.log('');
  console.log('✅ Import Summary:');
  console.log(`  - Created ${nodes.length} top-level nodes`);
  
  // Count node types
  const typeCounts = {};
  function countTypes(node) {
    typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        countTypes(node.children[i]);
      }
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    countTypes(nodes[i]);
  }
  console.log('  - Node types created:');
  for (const type in typeCounts) {
    console.log(`    • ${type}: ${typeCounts[type]}`);
  }

  return nodes;
}

// Create a single node based on type
async function createNode(element, variables, parentNode = null) {
  if (!element || element.enabled === false) return null;

  // Skip refs in first pass
  if (element.type === 'ref') return null;

  let node = null;

  try {
    switch (element.type) {
      case 'frame':
        node = await createFrame(element, variables, parentNode);
        break;
      case 'rectangle':
        node = await createRectangle(element, variables, parentNode);
        break;
      case 'ellipse':
      case 'circle':
        node = await createEllipse(element, variables, parentNode);
        break;
      case 'text':
        node = await createText(element, variables, parentNode);
        break;
      case 'image':
        node = await createImage(element, variables, parentNode);
        break;
      case 'line':
        node = createLine(element, variables, parentNode);
        break;
      case 'path':
      case 'vector':
      case 'svg':
        node = await createVector(element, variables, parentNode);
        break;
      case 'group':
        node = await createGroup(element, variables, parentNode);
        break;
      case 'icon_font':
        // Icon fonts should be rendered as vectors
        // If geometry data exists, use it directly
        if (element.geometry) {
          console.log(`[ICON] Converting icon_font "${element.name}" with geometry to vector`);
          node = createVector(element, variables, parentNode);
        } else {
          // No geometry - need to fetch icon SVG or create placeholder
          console.log(`[ICON] Icon "${element.name}" (${element.iconFontName}) needs SVG data`);
          // For now, create as vector placeholder that can be replaced
          node = await createIconFont(element, variables, parentNode);
        }
        break;
      case 'prompt':
        // Prompt is a special type that may be used for AI interactions
        // For now, skip it or render as a placeholder
        console.warn('Prompt element type not yet supported, skipping:', element.name);
        return null;
      default:
        console.warn('Unknown element type:', element.type, element);
        return null;
    }
  } catch (error) {
    console.error('Error creating node:', element.type, element.name, error);
    figma.notify('⚠️ Error creating ' + element.name + ': ' + error.message);
    return null;
  }

  if (node) {
    // Set common properties
    if (element.name) node.name = element.name;
    if (element.id) {
      node.setPluginData('pencilId', element.id);
      node.setPluginData('pencilSync', 'true');
    }

    // Handle reusable components
    if (element.reusable && node.type === 'FRAME') {
      const component = figma.createComponent();
      component.name = element.name || 'Component';
      component.resize(node.width, node.height);

      // Copy all properties from frame to component
      copyNodeProperties(node, component);

      // Move children
      const children = [];
      for (let j = 0; j < node.children.length; j++) {
        children.push(node.children[j]);
      }
      for (let j = 0; j < children.length; j++) {
        component.appendChild(children[j]);
      }

      component.setPluginData('pencilId', element.id);
      component.setPluginData('pencilSync', 'true');

      componentMap.set(element.id, component);
      node.remove();
      node = component;
    }

    // Process children recursively - IMPORTANT: use the converted element data
    if (element.children && Array.isArray(element.children)) {
      console.log(`[FRAME] Creating ${element.children.length} children for ${element.name || element.id}`);
      let createdCount = 0;
      let skippedCount = 0;
      for (let i = 0; i < element.children.length; i++) {
        const childElement = element.children[i];
        console.log(`[FRAME] Creating child ${i}: ${childElement.type} - ${childElement.name || childElement.id}`);
        // Pass the actual node (not element data) so children can check parent's layout mode
        const childNode = await createNode(childElement, variables, node);
        if (childNode) {
          createdCount++;
          // Append child to parent
          node.appendChild(childNode);
          console.log(`[FRAME] Child added: ${childNode.name}`);

          // Apply deferred layout sizing AFTER appendChild
          // FILL/HUG/FIXED can only be set on children of auto-layout frames
          if (node.layoutMode && node.layoutMode !== 'NONE') {
            try {
              let hSizing = childNode.getPluginData ? childNode.getPluginData('deferredLayoutSizingH') : '';
              let vSizing = childNode.getPluginData ? childNode.getPluginData('deferredLayoutSizingV') : '';

              // Also check the original child element data for sizing
              if (!hSizing && childElement.width) {
                if (childElement.width === 'fill_container' || (typeof childElement.width === 'string' && childElement.width.startsWith('fill_container'))) {
                  hSizing = 'FILL';
                } else if (childElement.width === 'hug_contents') {
                  hSizing = 'HUG';
                }
              }

              if (!vSizing && childElement.height) {
                if (childElement.height === 'fill_container' || (typeof childElement.height === 'string' && childElement.height.startsWith('fill_container'))) {
                  vSizing = 'FILL';
                } else if (childElement.height === 'hug_contents' || childElement.height === 'fit_content' || (typeof childElement.height === 'string' && (childElement.height.startsWith('fit_content') || childElement.height.startsWith('hug_contents')))) {
                  vSizing = 'HUG';
                }
              }

              // Apply sizing if supported by this node type
              if (hSizing === 'FILL' && 'layoutSizingHorizontal' in childNode) {
                childNode.layoutSizingHorizontal = 'FILL';
              } else if (hSizing === 'HUG' && 'layoutSizingHorizontal' in childNode) {
                childNode.layoutSizingHorizontal = 'HUG';
              } else if (hSizing === 'FIXED' && 'layoutSizingHorizontal' in childNode) {
                childNode.layoutSizingHorizontal = 'FIXED';
              }

              if (vSizing === 'FILL' && 'layoutSizingVertical' in childNode) {
                childNode.layoutSizingVertical = 'FILL';
              } else if (vSizing === 'HUG' && 'layoutSizingVertical' in childNode) {
                childNode.layoutSizingVertical = 'HUG';
              } else if (vSizing === 'FIXED' && 'layoutSizingVertical' in childNode) {
                childNode.layoutSizingVertical = 'FIXED';
              }

              // Clean up deferred data
              if (childNode.setPluginData) {
                childNode.setPluginData('deferredLayoutSizingH', '');
                childNode.setPluginData('deferredLayoutSizingV', '');
              }
            } catch (e) {
              console.warn('Could not apply layout sizing to', childElement.name, e.message);
            }
          }
        } else {
          skippedCount++;
          if (childElement.type !== 'ref') {
            console.log('⚠️ Skipped child:', childElement.name || childElement.id, 'type:', childElement.type, 'enabled:', childElement.enabled);
          }
        }

        // Add small delay every 5 child nodes to prevent lag
        if (i > 0 && i % 5 === 0) {
          await new Promise(function(resolve) { setTimeout(resolve, 5); });
        }
      }
      if (skippedCount > 0) {
        console.log(`[FRAME] Created ${createdCount} children, skipped ${skippedCount} (refs will be created in second pass)`);
      }
      
      // NOTE: Deferred sizing for THIS node (FILL/HUG/FIXED) will be applied by its PARENT
      // after the parent calls appendChild(node). See the deferred sizing block above.
    }
  }

  return node;
}

// Create frame with auto-layout support
async function createFrame(element, variables, parentNode = null) {
  const frame = figma.createFrame();

  // Log what we received (for debugging)
  if (element.justifyContent || element.alignItems || element.gap !== undefined) {
    console.log('Creating frame:', element.name, 'layout:', element.layout, 'justifyContent:', element.justifyContent, 'alignItems:', element.alignItems, 'gap:', element.gap);
  }

  // First, determine layout mode to handle dimensions correctly
  let layoutMode = 'NONE';
  if (element.layout === 'horizontal') {
    layoutMode = 'HORIZONTAL';
  } else if (element.layout === 'vertical') {
    layoutMode = 'VERTICAL';
  } else if (element.layout === 'none') {
    layoutMode = 'NONE';
  } else if (element.layout === undefined) {
    // This should NOT happen after conversion, but handle it as fallback
    console.warn('⚠️ Frame missing layout property after conversion:', element.name);
    const hasLayoutProps = element.justifyContent || element.alignItems || element.gap !== undefined || element.padding !== undefined;
    
    if (hasLayoutProps) {
      // Check if we have hints about direction
      if (element.flexDirection === 'column') {
        layoutMode = 'VERTICAL';
      } else if (element.flexDirection === 'row') {
        layoutMode = 'HORIZONTAL';
      } else {
        // Default to HORIZONTAL for frames with layout properties but no explicit direction
        layoutMode = 'HORIZONTAL';
        console.log('  → Defaulting to HORIZONTAL layout');
      }
    }
  }

  // Set layout mode before dimensions
  frame.layoutMode = layoutMode;

  // Handle dimensions based on layout mode
  let width = 100;
  let height = 100;

  if (layoutMode !== 'NONE') {
    // For auto-layout frames, handle FILL/HUG/FIXED properly
    if (element.width === 'fill_container' || (typeof element.width === 'string' && element.width.startsWith('fill_container'))) {
      frame.setPluginData('deferredLayoutSizingH', 'FILL');
      width = parseDimension(element.width, 100); // Temporary size
    } else if (element.width === 'hug_contents') {
      frame.setPluginData('deferredLayoutSizingH', 'HUG');
      width = 100; // Will auto-size to content
    } else if (element.width !== undefined) {
      // Fixed width - will set FIXED after resize
      width = parseDimension(element.width, 100);
      frame.setPluginData('deferredLayoutSizingH', 'FIXED');
    } else {
      // Default for auto-layout: HUG
      frame.setPluginData('deferredLayoutSizingH', 'HUG');
      width = 100;
    }

    // Same for height
    if (element.height === 'fill_container' || (typeof element.height === 'string' && element.height.startsWith('fill_container'))) {
      frame.setPluginData('deferredLayoutSizingV', 'FILL');
      height = parseDimension(element.height, 100);
    } else if (element.height === 'hug_contents' || element.height === 'fit_content' || (typeof element.height === 'string' && element.height.startsWith('fit_content'))) {
      frame.setPluginData('deferredLayoutSizingV', 'HUG');
      height = 100;
    } else if (element.height !== undefined) {
      height = parseDimension(element.height, 100);
      frame.setPluginData('deferredLayoutSizingV', 'FIXED');
    } else {
      // Default for auto-layout: HUG
      frame.setPluginData('deferredLayoutSizingV', 'HUG');
      height = 100;
    }
  } else {
    // Absolute positioning - use dimensions as-is
    if (element.width !== undefined) width = parseDimension(element.width, 100);
    if (element.height !== undefined) height = parseDimension(element.height, 100);
  }

  // Resize with calculated dimensions
  if (width > 0 && height > 0) {
    frame.resize(width, height);
  }

  // Position (only set if defined and not NaN)
  // Don't set x/y for children of auto-layout frames - they're positioned by the layout
  const isInAutoLayout = parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE';
  if (!isInAutoLayout) {
    if (element.x !== undefined && !isNaN(element.x)) {
      frame.x = element.x;
      console.log(`  → Set x=${element.x} for ${element.name || element.id}`);
    }
    if (element.y !== undefined && !isNaN(element.y)) {
      frame.y = element.y;
      console.log(`  → Set y=${element.y} for ${element.name || element.id}`);
    }
  } else {
    console.log(`  → Skipped x,y for ${element.name || element.id} (in auto-layout parent)`);
  }

  // Clip content
  if (element.clip !== undefined) frame.clipsContent = element.clip;

  // Layout mode already set above during dimension handling

  // Layout properties - only apply if frame has auto-layout
  if (frame.layoutMode !== 'NONE') {
    if (element.gap !== undefined) frame.itemSpacing = element.gap;
    if (element.padding !== undefined) {
      const padding = Array.isArray(element.padding) ? element.padding : [element.padding];
      if (padding.length === 1) {
        frame.paddingTop = frame.paddingRight = frame.paddingBottom = frame.paddingLeft = padding[0];
      } else if (padding.length === 2) {
        frame.paddingTop = frame.paddingBottom = padding[0];
        frame.paddingLeft = frame.paddingRight = padding[1];
      } else if (padding.length === 4) {
        frame.paddingTop = padding[0];
        frame.paddingRight = padding[1];
        frame.paddingBottom = padding[2];
        frame.paddingLeft = padding[3];
      }
    }

    // Alignment
    if (element.justifyContent) {
      frame.primaryAxisAlignItems = mapJustifyContent(element.justifyContent);
    } else {
      // Default to MIN (start) if not specified
      frame.primaryAxisAlignItems = 'MIN';
      if (element.name) {
        console.log('  → Applied default primaryAxisAlignItems=MIN for:', element.name);
      }
    }
    
    if (element.alignItems) {
      frame.counterAxisAlignItems = mapAlignItems(element.alignItems);
    } else {
      // Default to MIN (start) if not specified
      frame.counterAxisAlignItems = 'MIN';
      if (element.name) {
        console.log('  → Applied default counterAxisAlignItems=MIN for:', element.name);
      }
    }
  }

  // Fill
  if (element.fill) {
    const hasImageFill = await applyImageFillToNode(frame, element.fill, element.name || element.id);
    if (!hasImageFill) {
      const fill = parseColor(element.fill, variables, element.name || element.id);
      if (fill) {
        frame.fills = [fill];
      }
    }
  }

  // Stroke
  if (element.stroke) {
    applyStroke(frame, element.stroke, variables, element.name || element.id);
  }

  // Corner radius
  if (element.cornerRadius !== undefined) {
    const radius = parseCornerRadius(element.cornerRadius, variables);
    if (Array.isArray(radius)) {
      frame.topLeftRadius = radius[0];
      frame.topRightRadius = radius[1];
      frame.bottomRightRadius = radius[2];
      frame.bottomLeftRadius = radius[3];
    } else {
      frame.cornerRadius = radius;
    }
  }

  // Effects
  if (element.effect) {
    applyEffect(frame, element.effect, variables);
  }

  // Opacity
  if (element.opacity !== undefined) {
    frame.opacity = element.opacity;
  }

  return frame;
}

// Create rectangle
async function createRectangle(element, variables, parentNode = null) {
  const rect = figma.createRectangle();

  const width = parseDimension(element.width, 100);
  const height = parseDimension(element.height, 100);
  rect.resize(width, height);

  // Don't set x/y for children of auto-layout frames
  const isInAutoLayout = parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE';
  if (!isInAutoLayout) {
    if (element.x !== undefined && !isNaN(element.x)) rect.x = element.x;
    if (element.y !== undefined && !isNaN(element.y)) rect.y = element.y;
  }

  if (element.fill) {
    const hasImageFill = await applyImageFillToNode(rect, element.fill, element.name || element.id);
    if (!hasImageFill) {
      const fill = parseColor(element.fill, variables, element.name || element.id);
      if (fill) {
        rect.fills = [fill];
      } else {
        // If parseColor returns null (e.g., for images), set empty fills
        rect.fills = [];
      }
    }
  } else {
    // No fill defined - set empty fills instead of default white
    rect.fills = [];
  }

  if (element.stroke) {
    applyStroke(rect, element.stroke, variables, element.name || element.id);
  }

  if (element.cornerRadius !== undefined) {
    const radius = parseCornerRadius(element.cornerRadius, variables);
    if (Array.isArray(radius)) {
      rect.topLeftRadius = radius[0];
      rect.topRightRadius = radius[1];
      rect.bottomRightRadius = radius[2];
      rect.bottomLeftRadius = radius[3];
    } else {
      rect.cornerRadius = radius;
    }
  }

  return rect;
}

// Create ellipse
async function createEllipse(element, variables, parentNode = null) {
  const ellipse = figma.createEllipse();

  const width = parseDimension(element.width, 100);
  const height = parseDimension(element.height, element.type === 'circle' ? width : 100);
  ellipse.resize(width, height);

  // Don't set x/y for children of auto-layout frames
  const isInAutoLayout = parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE';
  if (!isInAutoLayout) {
    if (element.x !== undefined && !isNaN(element.x)) ellipse.x = element.x;
    if (element.y !== undefined && !isNaN(element.y)) ellipse.y = element.y;
  }

  if (element.fill) {
    const hasImageFill = await applyImageFillToNode(ellipse, element.fill, element.name || element.id);
    if (!hasImageFill) {
      const fill = parseColor(element.fill, variables, element.name || element.id);
      if (fill) ellipse.fills = [fill];
    }
  }

  if (element.stroke) {
    applyStroke(ellipse, element.stroke, variables, element.name || element.id);
  }

  return ellipse;
}

// Create text
async function createText(element, variables, parentNode = null) {
  const text = figma.createText();

  // Load font FIRST before setting any text properties
  const fontFamily = element.fontFamily ? resolveVariable(element.fontFamily, variables) : 'Inter';
  const fontWeight = element.fontWeight || 'Regular';
  
  // Handle font style (italic) in the initial load
  let fontStyle = mapFontWeight(fontWeight);
  if (element.fontStyle === 'italic') {
    // Try to load italic variant
    fontStyle = fontStyle.includes('Italic') ? fontStyle : (fontStyle + ' Italic').trim();
  }

  try {
    await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
    text.fontName = { family: fontFamily, style: fontStyle };
  } catch (e) {
    // Try without italic if that failed
    if (element.fontStyle === 'italic') {
      try {
        const baseStyle = mapFontWeight(fontWeight);
        await figma.loadFontAsync({ family: fontFamily, style: baseStyle });
        text.fontName = { family: fontFamily, style: baseStyle };
      } catch (e2) {
        // Fallback to Inter Regular
        try {
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          text.fontName = { family: 'Inter', style: 'Regular' };
        } catch (e3) {
          console.error('Failed to load any font:', e3);
          throw new Error('Cannot load font for text: ' + (element.name || element.content));
        }
      }
    } else {
      // Fallback to Inter Regular if font not available
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        text.fontName = { family: 'Inter', style: 'Regular' };
      } catch (e2) {
        console.error('Failed to load fallback font:', e2);
        throw new Error('Cannot load font for text: ' + (element.name || element.content));
      }
    }
  }

  // Set text content AFTER font is loaded
  text.characters = element.content || '';

  if (element.fontSize) {
    text.fontSize = element.fontSize;
  }

  if (element.lineHeight) {
    text.lineHeight = { unit: 'PERCENT', value: element.lineHeight * 100 };
  }

  if (element.textAlign) {
    text.textAlignHorizontal = mapTextAlign(element.textAlign);
  }

  if (element.textAlignVertical) {
    text.textAlignVertical = mapTextAlignVertical(element.textAlignVertical);
  }

  if (element.fill) {
    const fill = parseColor(element.fill, variables, element.name || element.id);
    if (fill) text.fills = [fill];
  }

  // Don't set x/y for children of auto-layout frames
  const isInAutoLayout = parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE';
  if (!isInAutoLayout) {
    if (element.x !== undefined && !isNaN(element.x)) text.x = element.x;
    if (element.y !== undefined && !isNaN(element.y)) text.y = element.y;
  }

  // Text sizing
  if (element.width) {
    const width = parseDimension(element.width, text.width);
    if (element.textGrowth === 'fixed-width') {
      text.textAutoResize = 'HEIGHT';
      text.resize(width, text.height);
    }
  }

  return text;
}

// Create image
async function createImage(element, variables, parentNode = null) {
  const frame = figma.createFrame();
  frame.name = element.name || 'Image';

  const width = parseDimension(element.width, 100);
  const height = parseDimension(element.height, 100);
  frame.resize(width, height);

  // Don't set x/y for children of auto-layout frames
  const isInAutoLayout = parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE';
  if (!isInAutoLayout) {
    if (element.x !== undefined && !isNaN(element.x)) frame.x = element.x;
    if (element.y !== undefined && !isNaN(element.y)) frame.y = element.y;
  }

  // Try to load image
  let appliedImageFill = false;

  if (element.fill) {
    appliedImageFill = await applyImageFillToNode(frame, element.fill, element.name || element.id);
  }

  if (!appliedImageFill) {
    if (element.src) {
      console.log(`[IMAGE] Looking for image: ${element.src}`);
      const imageData = getImageDataFromCache(element.src);
      if (imageData) {
        try {
          console.log(`[IMAGE] Found image data for: ${element.src}, loading...`);
          const imageBytes = base64ToUint8Array(imageData.split(',')[1]);
          const image = figma.createImage(imageBytes);
          frame.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
          console.log(`[IMAGE] ✅ Successfully loaded image: ${element.src}`);
        } catch (e) {
          console.error(`[IMAGE] ❌ Failed to load image ${element.src}:`, e);
        }
      } else {
        console.warn(`[IMAGE] ⚠️ Image not found in cache: ${element.src}. Make sure to select the images folder.`);
      }
    } else {
      console.warn(`[IMAGE] ⚠️ Image element has no src property`);
    }
  }

  if (element.fill && !appliedImageFill) {
    const fill = parseColor(element.fill, variables, element.name || element.id);
    if (fill) frame.fills = [fill];
  }

  return frame;
}

// Create line
function createLine(element, variables, parentNode = null) {
  const line = figma.createLine();

  const width = parseDimension(element.width, 100);
  line.resize(width, 0);

  // Don't set x/y for children of auto-layout frames
  const isInAutoLayout = parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE';
  if (!isInAutoLayout) {
    if (element.x !== undefined && !isNaN(element.x)) line.x = element.x;
    if (element.y !== undefined && !isNaN(element.y)) line.y = element.y;
  }

  if (element.stroke) {
    applyStroke(line, element.stroke, variables, element.name || element.id);
  }

  return line;
}

// Create vector/path
async function createVector(element, variables, parentNode = null) {
  const width = parseDimension(element.width, 100);
  const height = parseDimension(element.height, 100);

  // Check for path data in various properties
  const pathData = element.geometry || element.d || element.pathData || element.path;

  if (pathData) {
    console.log(`[VECTOR] Creating vector "${element.name}" with path data (${pathData.length} chars)`);
    try {
      // Convert shorthand SVG path to explicit format for Figma
      const convertedPath = convertSvgPathToFigma(pathData);

      if (convertedPath) {
        const vector = figma.createVector();

        try {
          vector.vectorPaths = [{ windingRule: element.fillRule === 'evenodd' ? 'EVENODD' : 'NONZERO', data: convertedPath }];
          console.log(`[VECTOR] ✓ Successfully created vector "${element.name}"`);
        } catch (pathError) {
          console.warn(`[VECTOR] ✗ Failed to set vector path for "${element.name}":`, pathError.message);
          console.warn('[VECTOR] Path data preview:', pathData.substring(0, 100) + '...');
          // Clean up and fall through to placeholder
          vector.remove();
          throw pathError;
        }

        // Only resize if dimensions are provided and valid
        if (width > 0 && height > 0) {
          vector.resize(width, height);
        }

        // Don't set x/y for children of auto-layout frames
        const isInAutoLayout = parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE';
        if (!isInAutoLayout) {
          if (element.x !== undefined && !isNaN(element.x)) vector.x = element.x;
          if (element.y !== undefined && !isNaN(element.y)) vector.y = element.y;
        }

        if (element.fill) {
          const hasImageFill = await applyImageFillToNode(vector, element.fill, element.name || element.id);
          if (!hasImageFill) {
            const fill = parseColor(element.fill, variables, element.name || element.id);
            if (fill) vector.fills = [fill];
          }
        }

        if (element.stroke) {
          applyStroke(vector, element.stroke, variables, element.name || element.id);
        }

        return vector;
      }
    } catch (e) {
      console.warn(`[VECTOR] ✗ Failed to parse geometry for "${element.name}":`, e.message);
    }
  } else {
    console.warn(`[VECTOR] ✗ No path data found for "${element.name}"`);
  }

  // Fallback: create a simple rectangle as placeholder for vectors that can't be parsed
  console.log(`[VECTOR] Creating placeholder rectangle for "${element.name}"`);
  const placeholder = figma.createRectangle();
  placeholder.name = element.name || 'Vector (placeholder)';
  placeholder.resize(width > 0 ? width : 20, height > 0 ? height : 20);
  placeholder.cornerRadius = 2;

  // Don't set x/y for children of auto-layout frames
  const isInAutoLayout = parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE';
  if (!isInAutoLayout) {
    if (element.x !== undefined && !isNaN(element.x)) placeholder.x = element.x;
    if (element.y !== undefined && !isNaN(element.y)) placeholder.y = element.y;
  }

  if (element.fill) {
    const hasImageFill = await applyImageFillToNode(placeholder, element.fill, element.name || element.id);
    if (!hasImageFill) {
      const fill = parseColor(element.fill, variables, element.name || element.id);
      if (fill) placeholder.fills = [fill];
    }
  } else {
    // Give it a subtle fill so it's visible
    placeholder.fills = [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 }, opacity: 0.3 }];
  }

  if (element.stroke) {
    applyStroke(placeholder, element.stroke, variables, element.name || element.id);
  }

  // Store original geometry for reference
  if (pathData) {
    placeholder.setPluginData('originalGeometry', pathData);
  }
  return placeholder;
}

// Convert SVG path to Figma-compatible format
// Figma only supports: M, L, Q, C, Z (all absolute, commands separated by spaces)
// Figma requires format like: "M 0 0 L 6 6 L 12 0" (command followed by space, then numbers)
function convertSvgPathToFigma(pathData) {
  if (!pathData || typeof pathData !== 'string') return null;

  try {
    // Parse the SVG path into tokens
    const tokens = tokenizeSvgPath(pathData);
    if (!tokens || tokens.length === 0) return null;

    // Convert to absolute coordinates and supported commands
    const pathSegments = [];
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;
    let i = 0;

    // Helper to format number (round to 6 decimal places to avoid precision issues)
    const fmt = (n) => {
      const rounded = Math.round(n * 1000000) / 1000000;
      return rounded;
    };

    while (i < tokens.length) {
      const token = tokens[i];

      if (typeof token === 'string') {
        const command = token;
        const isRelative = command === command.toLowerCase();
        const cmd = command.toUpperCase();

        i++; // Move past command

        switch (cmd) {
          case 'M': {
            // Move to - ensure we have both x and y coordinates
            if (i >= tokens.length || typeof tokens[i] !== 'number') {
              console.warn('Invalid M command: missing x coordinate');
              break;
            }
            const x = parseFloat(tokens[i++]) || 0;
            
            if (i >= tokens.length || typeof tokens[i] !== 'number') {
              console.warn('Invalid M command: missing y coordinate');
              break;
            }
            const y = parseFloat(tokens[i++]) || 0;
            
            const absX = isRelative ? currentX + x : x;
            const absY = isRelative ? currentY + y : y;
            pathSegments.push(`M ${fmt(absX)} ${fmt(absY)}`);
            currentX = absX;
            currentY = absY;
            startX = absX;
            startY = absY;

            // Implicit lineto commands after moveto
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 1 >= tokens.length || typeof tokens[i + 1] !== 'number') {
                break; // Need both x and y
              }
              const lx = parseFloat(tokens[i++]) || 0;
              const ly = parseFloat(tokens[i++]) || 0;
              const absLX = isRelative ? currentX + lx : lx;
              const absLY = isRelative ? currentY + ly : ly;
              pathSegments.push(`L ${fmt(absLX)} ${fmt(absLY)}`);
              currentX = absLX;
              currentY = absLY;
            }
            break;
          }

          case 'L': {
            // Line to
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 1 >= tokens.length || typeof tokens[i + 1] !== 'number') {
                break; // Need both x and y
              }
              const x = parseFloat(tokens[i++]) || 0;
              const y = parseFloat(tokens[i++]) || 0;
              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;
              pathSegments.push(`L ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'H': {
            // Horizontal line - convert to L
            while (i < tokens.length && typeof tokens[i] === 'number') {
              const x = parseFloat(tokens[i++]) || 0;
              const absX = isRelative ? currentX + x : x;
              pathSegments.push(`L ${fmt(absX)} ${fmt(currentY)}`);
              currentX = absX;
            }
            break;
          }

          case 'V': {
            // Vertical line - convert to L
            while (i < tokens.length && typeof tokens[i] === 'number') {
              const y = parseFloat(tokens[i++]) || 0;
              const absY = isRelative ? currentY + y : y;
              pathSegments.push(`L ${fmt(currentX)} ${fmt(absY)}`);
              currentY = absY;
            }
            break;
          }

          case 'C': {
            // Cubic bezier - needs 6 coordinates
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 5 >= tokens.length) {
                break; // Need all 6 coordinates
              }
              const x1 = parseFloat(tokens[i++]) || 0;
              const y1 = parseFloat(tokens[i++]) || 0;
              const x2 = parseFloat(tokens[i++]) || 0;
              const y2 = parseFloat(tokens[i++]) || 0;
              const x = parseFloat(tokens[i++]) || 0;
              const y = parseFloat(tokens[i++]) || 0;

              const absX1 = isRelative ? currentX + x1 : x1;
              const absY1 = isRelative ? currentY + y1 : y1;
              const absX2 = isRelative ? currentX + x2 : x2;
              const absY2 = isRelative ? currentY + y2 : y2;
              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;

              pathSegments.push(`C ${fmt(absX1)} ${fmt(absY1)} ${fmt(absX2)} ${fmt(absY2)} ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'Q': {
            // Quadratic bezier - needs 4 coordinates
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 3 >= tokens.length) {
                break; // Need all 4 coordinates
              }
              const x1 = parseFloat(tokens[i++]) || 0;
              const y1 = parseFloat(tokens[i++]) || 0;
              const x = parseFloat(tokens[i++]) || 0;
              const y = parseFloat(tokens[i++]) || 0;

              const absX1 = isRelative ? currentX + x1 : x1;
              const absY1 = isRelative ? currentY + y1 : y1;
              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;

              pathSegments.push(`Q ${fmt(absX1)} ${fmt(absY1)} ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'S': {
            // Smooth cubic - convert to C (using reflection of previous control point) - needs 4 coordinates
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 3 >= tokens.length) {
                break; // Need all 4 coordinates
              }
              const x2 = parseFloat(tokens[i++]) || 0;
              const y2 = parseFloat(tokens[i++]) || 0;
              const x = parseFloat(tokens[i++]) || 0;
              const y = parseFloat(tokens[i++]) || 0;

              // For simplicity, use current point as first control point
              const absX2 = isRelative ? currentX + x2 : x2;
              const absY2 = isRelative ? currentY + y2 : y2;
              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;

              pathSegments.push(`C ${fmt(currentX)} ${fmt(currentY)} ${fmt(absX2)} ${fmt(absY2)} ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'T': {
            // Smooth quadratic - convert to Q - needs 2 coordinates
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 1 >= tokens.length) {
                break; // Need both x and y
              }
              const x = parseFloat(tokens[i++]) || 0;
              const y = parseFloat(tokens[i++]) || 0;

              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;

              // For simplicity, use midpoint as control point
              const ctrlX = (currentX + absX) / 2;
              const ctrlY = (currentY + absY) / 2;

              pathSegments.push(`Q ${fmt(ctrlX)} ${fmt(ctrlY)} ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'A': {
            // Arc - convert to line (simplified, arcs are complex) - needs 7 parameters
            while (i < tokens.length && typeof tokens[i] === 'number') {
              if (i + 6 >= tokens.length) {
                break; // Need all 7 parameters
              }
              i += 5; // Skip rx, ry, rotation, large-arc, sweep
              const x = parseFloat(tokens[i++]) || 0;
              const y = parseFloat(tokens[i++]) || 0;

              const absX = isRelative ? currentX + x : x;
              const absY = isRelative ? currentY + y : y;

              // Approximate arc with a line (not perfect but prevents errors)
              pathSegments.push(`L ${fmt(absX)} ${fmt(absY)}`);
              currentX = absX;
              currentY = absY;
            }
            break;
          }

          case 'Z': {
            // Close path
            pathSegments.push('Z');
            currentX = startX;
            currentY = startY;
            break;
          }

          default:
            // Unknown command, skip
            console.warn('Unknown SVG path command:', command);
            break;
        }
      } else {
        // Orphan number, skip
        i++;
      }
    }

    // Validate result has at least a move command
    if (pathSegments.length === 0 || !pathSegments[0].startsWith('M')) {
      console.warn('Invalid path result:', pathSegments);
      return null;
    }

    // Join segments with spaces
    return pathSegments.join(' ');

  } catch (e) {
    console.warn('Error converting SVG path:', e.message);
    return null;
  }
}

// Tokenize SVG path string into commands and numbers
function tokenizeSvgPath(path) {
  const tokens = [];
  let i = 0;

  while (i < path.length) {
    const char = path[i];

    // Skip whitespace and commas
    if (/[\s,]/.test(char)) {
      i++;
      continue;
    }

    // Check for command letter
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(char)) {
      tokens.push(char);
      i++;
      continue;
    }

    // Parse number (including negative, decimals, scientific notation)
    let numStr = '';
    
    // Handle negative sign
    if (char === '-') {
      numStr += char;
      i++;
    }
    
    // Parse digits and decimal point
    let hasDecimal = false;
    let hasExponent = false;
    
    while (i < path.length) {
      const c = path[i];
      
      if (/[0-9]/.test(c)) {
        numStr += c;
        i++;
      } else if (c === '.' && !hasDecimal && !hasExponent) {
        numStr += c;
        hasDecimal = true;
        i++;
      } else if (/[eE]/.test(c) && !hasExponent && numStr.length > 0) {
        // Scientific notation
        numStr += c;
        hasExponent = true;
        i++;
        // Check for sign after exponent
        if (i < path.length && /[+-]/.test(path[i])) {
          numStr += path[i];
          i++;
        }
      } else {
        // End of number
        break;
      }
    }
    
    if (numStr.length > 0 && numStr !== '-') {
      tokens.push(parseFloat(numStr));
    } else if (numStr === '-') {
      // Lone minus sign, skip it
      console.warn('Lone minus sign in path, skipping');
    }
  }

  return tokens;
}

// Create icon font (fetch and render actual SVG icons)
async function createIconFont(element, variables, parentNode = null) {
  const width = parseDimension(element.width, 20);
  const height = parseDimension(element.height, 20);
  const iconName = element.iconFontName || 'circle';
  const iconFamily = element.iconFontFamily || 'lucide';

  console.log(`[ICON] Creating vector for icon: ${iconName} (${iconFamily})`);

  // Create a vector node (this will be recognized as SVG in Figma)
  const vector = figma.createVector();
  vector.name = element.name || `Icon: ${iconName}`;
  vector.resize(width, height);

  // Don't set x/y for children of auto-layout frames
  const isInAutoLayout = parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE';
  if (!isInAutoLayout) {
    if (element.x !== undefined && !isNaN(element.x)) vector.x = element.x;
    if (element.y !== undefined && !isNaN(element.y)) vector.y = element.y;
  }

  // Create a simple placeholder path (circle) until real SVG is fetched
  // Use a simple circle path that Figma can parse
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 3;
  
  // Simple circle using 4 arc segments (more reliable than 2-arc approach)
  const circlePath = `M ${centerX} ${centerY - radius} ` +
    `A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY} ` +
    `A ${radius} ${radius} 0 0 1 ${centerX} ${centerY + radius} ` +
    `A ${radius} ${radius} 0 0 1 ${centerX - radius} ${centerY} ` +
    `A ${radius} ${radius} 0 0 1 ${centerX} ${centerY - radius} Z`;
  
  try {
    vector.vectorPaths = [{
      windingRule: 'NONZERO',
      data: circlePath
    }];
  } catch (error) {
    console.warn('[ICON] Failed to set vector path:', error.message);
  }

  // Apply fill color
  if (element.fill) {
    const fill = parseColor(element.fill, variables, element.name || element.id);
    if (fill) {
      vector.fills = [fill];
    } else {
      vector.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    }
  } else {
    vector.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
  }

  // Store icon metadata
  vector.setPluginData('iconFontName', iconName);
  vector.setPluginData('iconFontFamily', iconFamily);
  vector.setPluginData('isIconPlaceholder', 'true');
  vector.setPluginData('pendingIconFetch', 'true');

  // Request icon SVG from UI (UI has network access, plugin doesn't)
  console.log(`[ICON] Requesting icon fetch from UI: ${iconName}`);
  figma.ui.postMessage({
    type: 'fetch-icon',
    iconName: iconName,
    iconFamily: iconFamily,
    nodeId: vector.id
  });

  return vector;
}


// Create group
async function createGroup(element, variables, parentNode = null) {
  const frame = figma.createFrame();
  frame.name = element.name || 'Group';
  frame.layoutMode = 'NONE';

  const width = parseDimension(element.width, 100);
  const height = parseDimension(element.height, 100);
  frame.resize(width, height);

  // Don't set x/y for children of auto-layout frames
  const isInAutoLayout = parentNode && parentNode.layoutMode && parentNode.layoutMode !== 'NONE';
  if (!isInAutoLayout) {
    if (element.x !== undefined && !isNaN(element.x)) frame.x = element.x;
    if (element.y !== undefined && !isNaN(element.y)) frame.y = element.y;
  }

  if (element.fill) {
    const hasImageFill = await applyImageFillToNode(frame, element.fill, element.name || element.id);
    if (!hasImageFill) {
      const fill = parseColor(element.fill, variables, element.name || element.id);
      if (fill) frame.fills = [fill];
    }
  }

  return frame;
}

// Second pass: create instances
async function createInstances(children, variables) {
  if (!children || !Array.isArray(children)) return;

  let instanceCount = 0;
  for (const element of children) {
    if (element.type === 'ref' && element.enabled !== false) {
      const component = componentMap.get(element.ref);
      if (component) {
        const instance = component.createInstance();
        instance.name = element.name || 'Instance';

        if (element.x !== undefined && !isNaN(element.x)) instance.x = element.x;
        if (element.y !== undefined && !isNaN(element.y)) instance.y = element.y;

        if (element.id) {
          instance.setPluginData('pencilId', element.id);
          instance.setPluginData('pencilSync', 'true');
        }

        // Apply overrides
        if (element.descendants) {
          applyOverrides(instance, element.descendants);
        }

        figma.currentPage.appendChild(instance);
        instanceCount++;

        // Add delay every 10 instances to prevent lag
        if (instanceCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    }

    // Recurse into children
    if (element.children) {
      await createInstances(element.children, variables);
    }
  }
}

// Apply overrides to instance
function applyOverrides(instance, descendants) {
  for (const [id, overrides] of Object.entries(descendants)) {
    const child = findChildByPencilId(instance, id);
    if (child) {
      if (overrides.content !== undefined && child.type === 'TEXT') {
        child.characters = overrides.content;
      }
      if (overrides.enabled !== undefined) {
        child.visible = overrides.enabled;
      }
      // Add more override properties as needed
    }
  }
}

// Find child by pencil ID
function findChildByPencilId(node, pencilId) {
  if (node.getPluginData('pencilId') === pencilId) {
    return node;
  }

  if ('children' in node) {
    for (const child of node.children) {
      const found = findChildByPencilId(child, pencilId);
      if (found) return found;
    }
  }

  return null;
}

// Helper: Parse dimension (supports numbers, "fill_container", "hug_contents", "fit_content")
function parseDimension(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.startsWith('fill_container')) {
      const match = value.match(/fill_container\((\d+)\)/);
      return match ? parseInt(match[1]) : defaultValue;
    }
    if (value.startsWith('fit_content')) {
      const match = value.match(/fit_content\((\d+)\)/);
      return match ? parseInt(match[1]) : defaultValue;
    }
    if (value === 'hug_contents' || value === 'fit_content') return defaultValue;
  }
  return defaultValue;
}

// Helper: Extract fallback color from gradient object
function extractGradientFallbackColor(gradientObject) {
  if (!gradientObject || typeof gradientObject !== 'object') {
    return null;
  }

  // Check multiple possible property names for color stops
  const possibleStopProperties = ['stops', 'colors', 'colorStops', 'gradientStops'];
  
  for (let i = 0; i < possibleStopProperties.length; i++) {
    const propName = possibleStopProperties[i];
    const stops = gradientObject[propName];
    
    // Check if stops exist and is an array
    if (stops && Array.isArray(stops) && stops.length > 0) {
      const firstStop = stops[0];
      
      // Extract color from the first stop
      // The stop might be an object with a 'color' property, or just a color value
      if (firstStop && typeof firstStop === 'object') {
        // Check for color property in the stop object
        if (firstStop.color !== undefined) {
          return firstStop.color;
        }
        // If the stop object doesn't have a color property, it might be the color itself
        // (though this is unusual, handle it gracefully)
        return firstStop;
      } else if (firstStop !== undefined && firstStop !== null) {
        // If the first stop is not an object, it might be a direct color value
        return firstStop;
      }
    }
  }

  // No valid stops found
  return null;
}

// Helper: Convert gradient object to Figma gradient format
function convertToFigmaGradient(gradientObject, variables, context) {
  if (!gradientObject || typeof gradientObject !== 'object') {
    return null;
  }

  // Get gradient type
  const gradientType = gradientObject.gradientType || 'linear';
  
  // Get color stops
  const possibleStopProperties = ['stops', 'colors', 'colorStops', 'gradientStops'];
  let stops = null;
  
  for (let i = 0; i < possibleStopProperties.length; i++) {
    const propName = possibleStopProperties[i];
    if (gradientObject[propName] && Array.isArray(gradientObject[propName])) {
      stops = gradientObject[propName];
      break;
    }
  }
  
  if (!stops || stops.length === 0) {
    return null;
  }
  
  // Convert stops to Figma format
  const figmaStops = [];
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    let colorValue = stop.color || stop;
    let position = stop.position !== undefined ? stop.position : (i / (stops.length - 1));
    
    // Parse the color
    let rgb = null;
    
    // Handle color object
    if (typeof colorValue === 'object' && colorValue.type === 'color') {
      colorValue = colorValue.color;
    }
    
    // Resolve variables
    if (typeof colorValue === 'string') {
      const resolved = resolveVariable(colorValue, variables);
      if (resolved.startsWith('#')) {
        rgb = hexToRgb(resolved);
      } else if (resolved.startsWith('rgb')) {
        rgb = parseRgb(resolved);
      }
    }
    
    if (!rgb) {
      console.warn('[convertToFigmaGradient] Could not parse color stop:', colorValue);
      continue;
    }
    
    figmaStops.push({
      position: position,
      color: rgb
    });
  }
  
  if (figmaStops.length === 0) {
    return null;
  }
  
  // Create Figma gradient object
  const figmaGradient = {
    type: gradientType === 'radial' ? 'GRADIENT_RADIAL' : 'GRADIENT_LINEAR',
    gradientStops: figmaStops
  };
  
  // Set gradient transform
  if (gradientType === 'linear') {
    // Linear gradient transform
    const rotation = gradientObject.rotation || 0;
    const angleRad = (rotation * Math.PI) / 180;
    
    // Figma uses a transform matrix for gradients
    // For a linear gradient at angle θ:
    // Start point: (0.5 - 0.5*cos(θ), 0.5 - 0.5*sin(θ))
    // End point: (0.5 + 0.5*cos(θ), 0.5 + 0.5*sin(θ))
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    figmaGradient.gradientTransform = [
      [cos, -sin, 0.5 - 0.5 * cos + 0.5 * sin],
      [sin, cos, 0.5 - 0.5 * sin - 0.5 * cos]
    ];
  } else {
    // Radial gradient transform (centered)
    figmaGradient.gradientTransform = [
      [1, 0, 0],
      [0, 1, 0]
    ];
  }
  
  console.log('[convertToFigmaGradient] Converted ' + gradientType + ' gradient with ' + figmaStops.length + ' stops' + (context ? " for element '" + context + "'" : ''));
  
  return figmaGradient;
}

// Helper: Format color value for logging
function formatColorForLogging(colorValue) {
  // Handle null/undefined
  if (colorValue === null) {
    return 'null';
  }
  if (colorValue === undefined) {
    return 'undefined';
  }

  // Handle objects
  if (typeof colorValue === 'object') {
    try {
      const jsonStr = JSON.stringify(colorValue);
      // Truncate to ~100 characters
      if (jsonStr.length > 100) {
        return jsonStr.substring(0, 100) + '... (truncated)';
      }
      return jsonStr;
    } catch (e) {
      // Handle circular references or other stringify errors
      return '[object (unstringifiable)]';
    }
  }

  // For strings and other primitives, return as-is with type info
  const typeInfo = typeof colorValue;
  if (typeInfo === 'string') {
    return colorValue;
  }
  
  // For other types (number, boolean, etc.), include type
  return `${colorValue} (${typeInfo})`;
}

// Helper: Parse color (supports hex, rgb, rgba, transparent, and variables)
function parseColor(colorValue, variables, context) {
  if (!colorValue) return null;

  // Handle disabled fills
  if (typeof colorValue === 'object' && colorValue.enabled === false) {
    return null;
  }

  // Handle color objects
  if (typeof colorValue === 'object' && colorValue.type === 'color') {
    colorValue = colorValue.color;
  }

  // Handle gradient objects
  if (typeof colorValue === 'object' && colorValue.type === 'gradient') {
    // Check enabled flag for gradients
    if (colorValue.enabled === false) {
      const msg = '[parseColor] Gradient with enabled=false, returning null' + (context ? " for element '" + context + "'" : '');
      console.log(msg);
      return null;
    }
    
    // Log gradient detection
    const gradientType = colorValue.gradientType || 'linear';
    const detectMsg = '[parseColor] Detected gradient object (type: ' + gradientType + ')' + (context ? " for element '" + context + "'" : '');
    console.log(detectMsg);
    
    // Convert to Figma gradient
    const figmaGradient = convertToFigmaGradient(colorValue, variables, context);
    
    if (figmaGradient === null) {
      const noStopsMsg = '[parseColor] Warning: Gradient has no color stops, returning null' + (context ? " for element '" + context + "'" : '');
      console.warn(noStopsMsg);
      return null;
    }
    
    return figmaGradient;
  }

  // Handle image objects - return null so they can be handled separately
  if (typeof colorValue === 'object' && colorValue.type === 'image') {
    // Images are not colors, they need to be handled by image fill logic
    // Return null here so the caller knows this is not a color fill
    console.log('[parseColor] Image fill detected, returning null (images handled separately)' + (context ? " for element '" + context + "'" : ''));
    return null;
  }

  // If still an object after unwrapping, it's invalid
  if (typeof colorValue === 'object') {
    // Check if object has a type property
    const objectType = colorValue.type;
    const typeInfo = objectType ? " with type '" + objectType + "'" : '';
    const formattedValue = formatColorForLogging(colorValue);
    const invalidMsg = '[parseColor] Warning: Invalid color value (object' + typeInfo + '): ' + formattedValue + (context ? " for element '" + context + "'" : '');
    console.warn(invalidMsg);
    return null;
  }

  const resolved = resolveVariable(colorValue, variables);

  // Ensure resolved is a string
  if (typeof resolved !== 'string') {
    const resolveMsg = '[parseColor] Warning: Color resolution failed, not a string' + (context ? " for element '" + context + "'" : '');
    console.warn(resolveMsg, resolved);
    return null;
  }

  // Handle transparent
  if (resolved === 'transparent') {
    return null;
  }

  if (resolved.startsWith('#')) {
    return { type: 'SOLID', color: hexToRgb(resolved) };
  }

  // Handle rgb/rgba
  if (resolved.startsWith('rgb')) {
    return { type: 'SOLID', color: parseRgb(resolved) };
  }

  // If we get here, the color format is not recognized
  console.warn('[parseColor] Warning: Unrecognized color format: ' + resolved + (context ? " for element '" + context + "'" : ''));
  return null;
}

// Helper: Resolve variable references ($variableName)
function resolveVariable(value, variables) {
  if (typeof value !== 'string') return value;

  if (value.startsWith('$')) {
    const varName = value.substring(1).replace(/^--/, '');
    if (variables && variables[varName]) {
      const variable = variables[varName];
      return variable.value || variable;
    }
  }

  return value;
}

// Helper: Convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
}

// Helper: Parse RGB string
function parseRgb(rgb) {
  const values = rgb.match(/\d+/g);
  if (values) {
    return {
      r: parseInt(values[0]) / 255,
      g: parseInt(values[1]) / 255,
      b: parseInt(values[2]) / 255
    };
  }
  return { r: 0, g: 0, b: 0 };
}

// Helper: Apply stroke
function applyStroke(node, stroke, variables, context) {
  if (!stroke) return;

  const thickness = stroke.thickness || 1;
  const fill = stroke.fill || '#000000';

  const color = parseColor(fill, variables, context);
  if (color) {
    node.strokes = [color];

    // Handle complex thickness (top, right, bottom, left)
    if (typeof thickness === 'object') {
      node.strokeWeight = thickness.top || 1;
    } else {
      node.strokeWeight = thickness;
    }

    if (stroke.align === 'inside') {
      node.strokeAlign = 'INSIDE';
    } else if (stroke.align === 'outside') {
      node.strokeAlign = 'OUTSIDE';
    } else {
      node.strokeAlign = 'CENTER';
    }

    if (stroke.cap) {
      node.strokeCap = stroke.cap.toUpperCase();
    }

    if (stroke.join) {
      node.strokeJoin = stroke.join.toUpperCase();
    }
  }
}

// Helper: Apply effects (shadows, etc.)
function applyEffect(node, effect, variables) {
  if (!effect) return;

  if (effect.type === 'shadow') {
    // Check if node supports clipsContent and whether it's enabled
    // Spread parameter is only supported when clipsContent is true
    const supportsClipsContent = 'clipsContent' in node;
    const hasClipsEnabled = supportsClipsContent && node.clipsContent;

    const shadowEffect = {
      type: effect.shadowType === 'inner' ? 'INNER_SHADOW' : 'DROP_SHADOW',
      color: hexToRgba(effect.color || '#00000026'),
      offset: {
        x: effect.offset && effect.offset.x !== undefined ? effect.offset.x : 0,
        y: effect.offset && effect.offset.y !== undefined ? effect.offset.y : 0
      },
      radius: effect.blur || 0,
      // Only apply spread if clips content is enabled, otherwise Figma throws a warning
      spread: hasClipsEnabled ? (effect.spread || 0) : 0,
      visible: true,
      blendMode: 'NORMAL'
    };
    node.effects = [shadowEffect];
  }
}

// Helper: Convert hex to RGBA
function hexToRgba(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
      a: result[4] ? parseInt(result[4], 16) / 255 : 1
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

// Helper: Parse corner radius
function parseCornerRadius(radius, variables) {
  if (typeof radius === 'number') return radius;
  if (typeof radius === 'string') {
    const resolved = resolveVariable(radius, variables);
    if (resolved === '$--radius-pill') return 9999;
    if (resolved.startsWith('$--radius-')) {
      const size = resolved.replace('$--radius-', '');
      if (size === 's') return 4;
      if (size === 'm') return 6;
      if (size === 'l') return 8;
    }
    return parseFloat(resolved) || 0;
  }
  if (Array.isArray(radius)) {
    return radius.map(r => parseCornerRadius(r, variables));
  }
  return 0;
}

// Helper: Map justify content to Figma
function mapJustifyContent(value) {
  const map = {
    'start': 'MIN',
    'center': 'CENTER',
    'end': 'MAX',
    'space_between': 'SPACE_BETWEEN'
  };
  return map[value] || 'MIN';
}

// Helper: Map align items to Figma
function mapAlignItems(value) {
  const map = {
    'start': 'MIN',
    'center': 'CENTER',
    'end': 'MAX'
  };
  return map[value] || 'MIN';
}

// Helper: Map text align
function mapTextAlign(value) {
  const map = {
    'left': 'LEFT',
    'center': 'CENTER',
    'right': 'RIGHT',
    'justify': 'JUSTIFIED'
  };
  return map[value] || 'LEFT';
}

// Helper: Map text align vertical
function mapTextAlignVertical(value) {
  const map = {
    'top': 'TOP',
    'middle': 'CENTER',
    'bottom': 'BOTTOM'
  };
  return map[value] || 'TOP';
}

// Helper: Map font weight
function mapFontWeight(weight) {
  // Convert to string if it's a number
  const weightStr = String(weight);
  
  const map = {
    'normal': 'Regular',
    '400': 'Regular',
    '500': 'Medium',
    '600': 'SemiBold',
    '700': 'Bold',
    '800': 'ExtraBold',
    '900': 'Black',
    'bold': 'Bold',
    'semibold': 'SemiBold',
    'medium': 'Medium'
  };
  return map[weightStr.toLowerCase()] || 'Regular';
}

// Helper: Copy node properties
function copyNodeProperties(from, to) {
  if ('fills' in from && 'fills' in to) to.fills = from.fills;
  if ('strokes' in from && 'strokes' in to) to.strokes = from.strokes;
  if ('strokeWeight' in from && 'strokeWeight' in to) to.strokeWeight = from.strokeWeight;
  if ('strokeAlign' in from && 'strokeAlign' in to) to.strokeAlign = from.strokeAlign;
  if ('cornerRadius' in from && 'cornerRadius' in to) to.cornerRadius = from.cornerRadius;
  if ('opacity' in from && 'opacity' in to) to.opacity = from.opacity;
  
  // Copy clipsContent first before effects (since effects may depend on it)
  if ('clipsContent' in from && 'clipsContent' in to) to.clipsContent = from.clipsContent;
  
  // Copy effects, but fix spread parameter if clipsContent is disabled
  if ('effects' in from && 'effects' in to && from.effects && from.effects.length > 0) {
    const supportsClipsContent = 'clipsContent' in to;
    const hasClipsEnabled = supportsClipsContent && to.clipsContent;
    
    // Clone effects and adjust spread if needed
    const adjustedEffects = from.effects.map(function(effect) {
      if ((effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && !hasClipsEnabled && effect.spread) {
        // Remove spread if clips content is disabled
        return {
          type: effect.type,
          color: effect.color,
          offset: effect.offset,
          radius: effect.radius,
          spread: 0,
          visible: effect.visible,
          blendMode: effect.blendMode
        };
      }
      return effect;
    });
    
    to.effects = adjustedEffects;
  }

  if (from.layoutMode !== 'NONE' && 'layoutMode' in to) {
    to.layoutMode = from.layoutMode;
    to.itemSpacing = from.itemSpacing;
    to.paddingTop = from.paddingTop;
    to.paddingRight = from.paddingRight;
    to.paddingBottom = from.paddingBottom;
    to.paddingLeft = from.paddingLeft;
    to.primaryAxisAlignItems = from.primaryAxisAlignItems;
    to.counterAxisAlignItems = from.counterAxisAlignItems;
  }
}

// Helper: Base64 to Uint8Array
function base64ToUint8Array(base64) {
  const binaryString = base64ToBinaryString(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Export to pen format
async function exportToPen(mode) {
  const nodes = mode === 'selection' ? figma.currentPage.selection : getAllSyncedNodes();

  if (nodes.length === 0) {
    throw new Error('No nodes to export');
  }

  return convertNodesToPenBundle(nodes);
}

// Get all synced nodes
function getAllSyncedNodes() {
  const nodes = [];

  function traverse(node) {
    if (node.getPluginData('pencilSync') === 'true') {
      nodes.push(node);
    }
    if ('children' in node) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(figma.currentPage);
  return nodes;
}

// Convert Figma node to pen element
async function nodeToElement(node, exportContext = null) {
  let type = 'frame';

  // Map Figma types to pen types
  if (node.type === 'RECTANGLE') type = 'rectangle';
  else if (node.type === 'ELLIPSE') type = 'ellipse';
  else if (node.type === 'TEXT') type = 'text';
  else if (node.type === 'LINE') type = 'line';
  else if (node.type === 'VECTOR') type = 'path';
  else if (node.type === 'COMPONENT') type = 'frame';
  else if (node.type === 'INSTANCE') type = 'ref';
  else if (node.type === 'FRAME') type = 'frame';

  const element = {
    type: type,
    id: node.getPluginData('pencilId') || generateId(),
    name: node.name
  };

  // Position
  if (node.x !== undefined) element.x = Math.round(node.x * 100) / 100;
  if (node.y !== undefined) element.y = Math.round(node.y * 100) / 100;

  // Dimensions
  if ('width' in node && node.width !== undefined) {
    element.width = Math.round(node.width * 100) / 100;
  }
  if ('height' in node && node.height !== undefined) {
    element.height = Math.round(node.height * 100) / 100;
  }

  // Frame-specific properties
  if (node.type === 'FRAME' || node.type === 'COMPONENT') {
    // Clip content
    if (node.clipsContent) element.clip = true;

    // Auto-layout
    if (node.layoutMode === 'HORIZONTAL') {
      element.layout = 'horizontal';
    } else if (node.layoutMode === 'VERTICAL') {
      element.layout = 'vertical';
    } else {
      element.layout = 'none';
    }

    // Layout properties
    if (node.layoutMode !== 'NONE') {
      if (node.itemSpacing) element.gap = node.itemSpacing;

      // Padding
      if (node.paddingTop || node.paddingRight || node.paddingBottom || node.paddingLeft) {
        const pt = node.paddingTop || 0;
        const pr = node.paddingRight || 0;
        const pb = node.paddingBottom || 0;
        const pl = node.paddingLeft || 0;

        if (pt === pr && pr === pb && pb === pl) {
          element.padding = pt;
        } else if (pt === pb && pl === pr) {
          element.padding = [pt, pr];
        } else {
          element.padding = [pt, pr, pb, pl];
        }
      }

      // Alignment
      if (node.primaryAxisAlignItems) {
        element.justifyContent = mapFigmaJustifyContent(node.primaryAxisAlignItems);
      }
      if (node.counterAxisAlignItems) {
        element.alignItems = mapFigmaAlignItems(node.counterAxisAlignItems);
      }
    }

    // Mark as reusable if it's a component
    if (node.type === 'COMPONENT') {
      element.reusable = true;
    }
  }

  // Instance (ref)
  if (node.type === 'INSTANCE') {
    const mainComponent = node.mainComponent;
    if (mainComponent) {
      element.ref = mainComponent.getPluginData('pencilId') || mainComponent.id;
    }
  }

  // Fill
  if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === 'SOLID' && fill.visible !== false) {
      element.fill = rgbToHex(fill.color);
    } else if (fill.type === 'IMAGE' && fill.visible !== false) {
      const asset = await getExportImageAsset(fill, node, exportContext);
      if (asset) {
        element.fill = {
          type: 'image',
          url: `./${asset.fileName}`,
          mode: mapFigmaImageModeToPen(fill.scaleMode)
        };
      }
    }
  }

  // Stroke
  if ('strokes' in node && node.strokes && node.strokes.length > 0 && node.strokeWeight > 0) {
    const stroke = node.strokes[0];
    if (stroke.type === 'SOLID') {
      element.stroke = {
        align: node.strokeAlign ? node.strokeAlign.toLowerCase() : 'inside',
        thickness: node.strokeWeight,
        fill: rgbToHex(stroke.color)
      };

      if (node.strokeCap) {
        element.stroke.cap = node.strokeCap.toLowerCase();
      }
      if (node.strokeJoin) {
        element.stroke.join = node.strokeJoin.toLowerCase();
      }
    }
  }

  // Corner radius
  if ('cornerRadius' in node && node.cornerRadius !== undefined) {
    if ('topLeftRadius' in node) {
      const tl = node.topLeftRadius || 0;
      const tr = node.topRightRadius || 0;
      const br = node.bottomRightRadius || 0;
      const bl = node.bottomLeftRadius || 0;

      if (tl === tr && tr === br && br === bl) {
        element.cornerRadius = tl;
      } else {
        element.cornerRadius = [tl, tr, br, bl];
      }
    } else {
      element.cornerRadius = node.cornerRadius;
    }
  }

  // Effects (shadows)
  if ('effects' in node && node.effects && node.effects.length > 0) {
    const effect = node.effects[0];
    if (effect.visible && (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW')) {
      element.effect = {
        type: 'shadow',
        shadowType: effect.type === 'INNER_SHADOW' ? 'inner' : 'outer',
        color: rgbaToHex(effect.color),
        offset: {
          x: effect.offset.x,
          y: effect.offset.y
        },
        blur: effect.radius,
        spread: effect.spread || 0
      };
    }
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity !== 1) {
    element.opacity = Math.round(node.opacity * 100) / 100;
  }

  // Text-specific properties
  if (node.type === 'TEXT') {
    element.content = node.characters;
    element.fontSize = node.fontSize;
    element.fontFamily = node.fontName.family;
    element.fontWeight = mapFigmaFontWeight(node.fontName.style);

    if (node.textAlignHorizontal) {
      element.textAlign = mapFigmaTextAlign(node.textAlignHorizontal);
    }
    if (node.textAlignVertical) {
      element.textAlignVertical = mapFigmaTextAlignVertical(node.textAlignVertical);
    }

    // Line height
    if (node.lineHeight && node.lineHeight.unit === 'PERCENT') {
      element.lineHeight = node.lineHeight.value / 100;
    } else if (node.lineHeight && node.lineHeight.unit === 'PIXELS') {
      element.lineHeight = node.lineHeight.value / node.fontSize;
    }
  }

  // Vector/path geometry
  if (node.type === 'VECTOR' && node.vectorPaths && node.vectorPaths.length > 0) {
    element.geometry = node.vectorPaths[0].data;
  }

  // Children
  if ('children' in node && node.children.length > 0) {
    element.children = [];
    for (const child of node.children) {
      const childElement = await nodeToElement(child, exportContext);
      if (childElement) {
        element.children.push(childElement);
      }
    }
  }

  return element;
}

// Helper: Map Figma justify content to pen
function mapFigmaJustifyContent(value) {
  const map = {
    'MIN': 'start',
    'CENTER': 'center',
    'MAX': 'end',
    'SPACE_BETWEEN': 'space_between'
  };
  return map[value] || 'start';
}

// Helper: Map Figma align items to pen
function mapFigmaAlignItems(value) {
  const map = {
    'MIN': 'start',
    'CENTER': 'center',
    'MAX': 'end'
  };
  return map[value] || 'start';
}

// Helper: Map Figma text align to pen
function mapFigmaTextAlign(value) {
  const map = {
    'LEFT': 'left',
    'CENTER': 'center',
    'RIGHT': 'right',
    'JUSTIFIED': 'justify'
  };
  return map[value] || 'left';
}

// Helper: Map Figma text align vertical to pen
function mapFigmaTextAlignVertical(value) {
  const map = {
    'TOP': 'top',
    'CENTER': 'middle',
    'BOTTOM': 'bottom'
  };
  return map[value] || 'top';
}

// Helper: Map Figma font weight to pen
function mapFigmaFontWeight(style) {
  const map = {
    'Regular': 'normal',
    'Medium': '500',
    'SemiBold': '600',
    'Semi Bold': '600',
    'Bold': '700',
    'Black': '900'
  };
  return map[style] || 'normal';
}

// Helper: RGB to Hex
function rgbToHex(rgb) {
  const r = Math.round(rgb.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgb.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgb.b * 255).toString(16).padStart(2, '0');
  return '#' + r + g + b;
}

// Helper: RGBA to Hex
function rgbaToHex(rgba) {
  const r = Math.round(rgba.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgba.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgba.b * 255).toString(16).padStart(2, '0');
  const a = Math.round(rgba.a * 255).toString(16).padStart(2, '0');
  return '#' + r + g + b + a;
}

// Generate random ID
function generateId() {
  return Math.random().toString(36).substring(2, 7);
}
