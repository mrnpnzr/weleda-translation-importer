// Weleda Transcreate Workspace - Plugin Code
figma.showUI(__html__, { 
  width: 400, 
  height: 700,
  themeColors: true,
  title: "🌿 Weleda Transcreate Workspace"
});

// Keep-alive system to prevent plugin from closing
let keepAliveInterval = setInterval(() => {
  // Send keep-alive signal every 30 seconds
}, 30000);

figma.ui.onmessage = async (msg) => {
  console.log('Received message:', msg.type);
  
  if (msg.type === 'import-translations') {
    try {
      const csvData = msg.csvData;
      
      // Parse translations and file information
      const { translationsByFile, uniqueFiles, detectedLanguages } = parseTranslations(csvData);
      
      if (Object.keys(translationsByFile).length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: `Keine gültigen Übersetzungen in der CSV gefunden.`
        });
        return;
      }
      
      figma.ui.postMessage({
        type: 'progress',
        message: `Gefunden: ${detectedLanguages.length} Sprache(n) - ${detectedLanguages.join(', ')}`,
        progress: 10
      });
      
      let importedCount = 0;
      let importDetails = [];
      
      // Process each unique file
      for (const fileInfo of uniqueFiles) {
        try {
          figma.ui.postMessage({
            type: 'progress',
            message: `Suche Frame "${fileInfo.frameName}"...`,
            progress: 20 + (importedCount / uniqueFiles.length) * 60
          });
          
          const frameNode = await findFrame(fileInfo);
          if (frameNode) {
            const duplicatedFrame = frameNode.clone();
            duplicatedFrame.name = `${frameNode.name} - ${fileInfo.targetLanguage}`;
            
            // Position the duplicated frame next to the original
            duplicatedFrame.x = frameNode.x + frameNode.width + 100;
            duplicatedFrame.y = frameNode.y;
            
            figma.ui.postMessage({
              type: 'progress',
              message: `Übersetze Texte in "${duplicatedFrame.name}"...`,
              progress: 30 + (importedCount / uniqueFiles.length) * 60
            });
            
            // Apply translations to the duplicated frame
            const translatedCount = await applyTranslations(duplicatedFrame, translationsByFile[fileInfo.fileKey][fileInfo.targetLanguage]);
            
            importDetails.push({
              frameName: duplicatedFrame.name,
              language: fileInfo.targetLanguage,
              translatedTexts: translatedCount
            });
            
            importedCount++;
            
            console.log(`✅ Frame erstellt: "${duplicatedFrame.name}" mit ${translatedCount} übersetzten Texten`);
          } else {
            console.log(`❌ Frame nicht gefunden: "${fileInfo.frameName}"`);
            
            // List all available frames for debugging
            const allFrames = figma.currentPage.findAll(node => 
              node.type === 'FRAME' || node.type === 'COMPONENT'
            );
            console.log('Verfügbare Frames:', allFrames.map(f => f.name));
          }
        } catch (error) {
          console.error(`Fehler bei Frame "${fileInfo.frameName}":`, error);
          figma.ui.postMessage({
            type: 'progress',
            message: `Fehler bei "${fileInfo.frameName}": ${error.message}`,
            progress: 30 + (importedCount / uniqueFiles.length) * 60
          });
        }
      }
      
      // Select all imported frames and zoom to them
      const importedFramesList = figma.currentPage.children.filter(node => 
        detectedLanguages.some(lang => node.name.endsWith(` - ${lang}`))
      );
      
      if (importedFramesList.length > 0) {
        figma.currentPage.selection = importedFramesList;
        figma.viewport.scrollAndZoomIntoView(importedFramesList);
      }
      
      figma.ui.postMessage({
        type: 'success',
        message: `${importedCount} Frame(s) erfolgreich importiert und übersetzt!`,
        details: importDetails,
        progress: 100
      });
      
    } catch (error) {
      console.error('Import error:', error);
      figma.ui.postMessage({
        type: 'error',
        message: `Import-Fehler: ${error.message}`
      });
    }
  }
  
  if (msg.type === 'get-frame-ids') {
    try {
      // Get all frames from current page with their IDs
      const allFrames = figma.currentPage.findAll(node => 
        node.type === 'FRAME' || node.type === 'COMPONENT'
      );
      
      console.log('\n🔍 FRAME-IDS DER AKTUELLEN SEITE:');
      console.log('=====================================');
      
      allFrames.forEach(frame => {
        console.log(`📄 "${frame.name}"`);
        console.log(`   ID: ${frame.id}`);
        console.log(`   Type: ${frame.type}`);
        console.log(`   Size: ${Math.round(frame.width)}×${Math.round(frame.height)}px`);
        console.log('   ---');
      });
      
      console.log(`\nGefunden: ${allFrames.length} Frame(s) auf Seite "${figma.currentPage.name}"`);
      
      figma.ui.postMessage({
        type: 'success',
        message: `${allFrames.length} Frame-IDs in der Console ausgegeben. Öffne die Console (F12) um sie zu sehen.`
      });
      
    } catch (error) {
      console.error('Error getting frame IDs:', error);
      figma.ui.postMessage({
        type: 'error',
        message: `Fehler beim Abrufen der Frame-IDs: ${error.message}`
      });
    }
  }
  
  if (msg.type === 'load-layers') {
    try {
      const frameGroups = [];
      
      // Find all frames and their immediate children (one level deep)
      const allFrames = figma.currentPage.findAll(node => 
        node.type === 'FRAME' || node.type === 'COMPONENT'
      );
      
      console.log(`Found ${allFrames.length} frames to analyze`);
      
      allFrames.forEach(frame => {
        if ('children' in frame && frame.children && frame.children.length > 0) {
          const exportableChildren = frame.children.filter(child => canBeExported(child));
          
          if (exportableChildren.length > 0) {
            frameGroups.push({
              frameId: frame.id,
              frameName: frame.name,
              frameWidth: Math.round(frame.width),
              frameHeight: Math.round(frame.height),
              children: exportableChildren.map(child => ({
                id: child.id,
                name: child.name,
                type: child.type,
                width: Math.round(child.width || 0),
                height: Math.round(child.height || 0),
                x: Math.round(child.x || 0),
                y: Math.round(child.y || 0)
              }))
            });
          }
        }
      });
      
      console.log(`Found ${frameGroups.length} frames with exportable children`);
      
      // Generate thumbnails for preview
      const frameGroupsWithThumbnails = await Promise.all(
        frameGroups.slice(0, 20).map(async (frameGroup) => { // Limit to 20 for performance
          try {
            const frame = figma.getNodeById(frameGroup.frameId);
            const thumbnailBytes = await frame.exportAsync({
              format: 'PNG',
              constraint: { type: 'SCALE', value: 0.1 } // Very small thumbnail
            });
            
            return {
              ...frameGroup,
              thumbnail: Array.from(thumbnailBytes)
            };
          } catch (error) {
            console.log(`Thumbnail generation failed for ${frameGroup.frameName}:`, error.message);
            return {
              ...frameGroup,
              thumbnail: null
            };
          }
        })
      );
      
      figma.ui.postMessage({
        type: 'frames-loaded',
        frames: frameGroupsWithThumbnails
      });
      
    } catch (error) {
      console.error('Error loading frames:', error);
      figma.ui.postMessage({
        type: 'error',
        message: `Fehler beim Laden der Frames: ${error.message}`
      });
    }
  }
  
  if (msg.type === 'download-layers-direct') {
    try {
      const selectedItems = msg.selectedItems || [];
      const settings = msg.settings || { 
        format: 'PNG', 
        scale: 2, 
        naming: 'frame_element_scale_date'
      };
      
      if (selectedItems.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Keine Elemente zum Export ausgewählt.'
        });
        return;
      }
      
      console.log(`Starting export of ${selectedItems.length} elements with settings:`, settings);
      
      const exportPromises = selectedItems.map(async (item, index) => {
        try {
          figma.ui.postMessage({
            type: 'download-progress',
            current: index + 1,
            total: selectedItems.length,
            itemName: `${item.frameName} > ${item.elementName}`
          });
          
          const node = figma.getNodeById(item.elementId);
          if (!node || !canBeExported(node)) {
            throw new Error(`Element ${item.elementName} nicht exportierbar`);
          }
          
          // Generate export settings
          const exportSettings = {
            format: settings.format,
            constraint: {
              type: 'SCALE',
              value: settings.scale
            }
          };
          
          // Export the element
          const bytes = await node.exportAsync(exportSettings);
          
          // Generate filename based on naming pattern
          const filename = generateFilename(item, settings);
          
          return {
            name: filename,
            bytes: bytes,
            frameName: item.frameName,
            elementName: item.elementName,
            width: item.width,
            height: item.height
          };
          
        } catch (error) {
          console.error(`Export failed for ${item.elementName}:`, error);
          return null;
        }
      });
      
      // Wait for all exports to complete
      const exportResults = await Promise.all(exportPromises);
      const successfulExports = exportResults.filter(result => result !== null);
      
      if (successfulExports.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Alle Exports fehlgeschlagen.'
        });
        return;
      }
      
      // Send export data to UI for download
      figma.ui.postMessage({
        type: 'download-ready',
        count: successfulExports.length,
        exports: successfulExports.map(exp => ({
          name: exp.name,
          bytes: Array.from(exp.bytes),
          frameName: exp.frameName,
          elementName: exp.elementName,
          width: exp.width,
          height: exp.height
        }))
      });
      
      console.log(`✅ Export completed: ${successfulExports.length}/${selectedItems.length} files ready`);
      
    } catch (error) {
      console.error('Export error:', error);
      figma.ui.postMessage({
        type: 'error',
        message: `Export-Fehler: ${error.message}`
      });
    }
  }
  
  if (msg.type === 'export-selected-layers') {
    try {
      const selectedLayerIds = msg.layers.map(layer => layer.id);
      const nodesToExport = [];
      
      // Find the actual nodes by their IDs
      selectedLayerIds.forEach(layerId => {
        const node = figma.getNodeById(layerId);
        if (node && canBeExported(node)) {
          nodesToExport.push(node);
        }
      });
      
      if (nodesToExport.length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Keine exportierbaren Elemente gefunden.'
        });
        return;
      }
      
      // Select all nodes for export
      figma.currentPage.selection = nodesToExport;
      
      // Zoom to selected nodes
      if (nodesToExport.length > 0) {
        figma.viewport.scrollAndZoomIntoView(nodesToExport);
      }
      
      console.log(`Selected ${nodesToExport.length} nodes for export:`, nodesToExport.map(n => n.name));
      
      figma.ui.postMessage({
        type: 'export-completed',
        message: `${nodesToExport.length} Element(e) ausgewählt. Verwende Cmd/Ctrl+Shift+E für den Export.`
      });
      
    } catch (error) {
      console.error('Export error:', error);
      figma.ui.postMessage({
        type: 'error',
        message: `Export-Fehler: ${error.message}`
      });
    }
  }
  
  if (msg.type === 'close') {
    clearInterval(keepAliveInterval);
    figma.closePlugin();
  }
};

// Helper function to check if a node can be exported
function canBeExported(node) {
  const exportableTypes = [
    'FRAME', 'COMPONENT', 'INSTANCE', 'GROUP', 
    'RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 
    'VECTOR', 'TEXT', 'IMAGE'
  ];
  return exportableTypes.includes(node.type);
}

// Helper function to find a frame
async function findFrame(fileInfo) {
  try {
    console.log(`Suche Frame: "${fileInfo.frameName}" mit ID: "${fileInfo.frameId}"`);
    
    // Primary: Search by Node-ID (if available)
    if (fileInfo.frameId && fileInfo.frameId.trim() !== '') {
      try {
        const nodeById = figma.getNodeById(fileInfo.frameId);
        if (nodeById && (nodeById.type === 'FRAME' || nodeById.type === 'COMPONENT')) {
          console.log(`✅ Frame über ID gefunden: "${nodeById.name}"`);
          return nodeById;
        }
      } catch (error) {
        console.log(`ID-Suche fehlgeschlagen für "${fileInfo.frameId}":`, error.message);
      }
    }
    
    // Fallback: Search by name
    const allFrames = figma.currentPage.findAll(node => 
      node.type === 'FRAME' || node.type === 'COMPONENT'
    );
    
    // Exact match first
    let targetFrame = allFrames.find(frame => frame.name === fileInfo.frameName);
    
    if (!targetFrame) {
      // Partial match as fallback
      targetFrame = allFrames.find(frame => 
        frame.name.includes(fileInfo.frameName) || fileInfo.frameName.includes(frame.name)
      );
    }
    
    if (targetFrame) {
      console.log(`✅ Frame über Namen gefunden: "${targetFrame.name}"`);
      return targetFrame;
    } else {
      console.log(`❌ Frame nicht gefunden: "${fileInfo.frameName}"`);
      console.log('Verfügbare Frames:', allFrames.map(f => `"${f.name}"`).join(', '));
      
      // Suggest similar frames
      const similarFrames = allFrames.filter(frame => {
        const similarity = calculateSimilarity(frame.name.toLowerCase(), fileInfo.frameName.toLowerCase());
        return similarity > 0.3;
      });
      
      if (similarFrames.length > 0) {
        console.log('Ähnliche Frames gefunden:', similarFrames.map(f => `"${f.name}"`).join(', '));
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Fehler beim Suchen von Frame "${fileInfo.frameName}":`, error);
    return null;
  }
}

// Helper function to calculate string similarity
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Helper function to apply translations to a frame
async function applyTranslations(frame, translations) {
  let translatedCount = 0;
  
  // Find all text nodes in the frame recursively
  const textNodes = frame.findAll(node => node.type === 'TEXT');
  
  console.log(`Gefunden: ${textNodes.length} Text-Nodes in Frame "${frame.name}"`);
  
  for (const textNode of textNodes) {
    try {
      const currentText = textNode.characters;
      const normalizedCurrentText = currentText.replace(/\r\n|\r|\n/g, '\n').trim();
      
      // Look for exact matches in translations
      const translation = translations.find(t => {
        const normalizedSourceText = t.sourceText.replace(/\r\n|\r|\n/g, '\n').trim();
        return normalizedSourceText === normalizedCurrentText;
      });
      
      if (translation && translation.translatedText && translation.translatedText.trim() !== '') {
        // Load font before changing text
        await figma.loadFontAsync(textNode.fontName);
        
        textNode.characters = translation.translatedText;
        translatedCount++;
        
        console.log(`✅ Text übersetzt: "${currentText}" → "${translation.translatedText}"`);
      } else {
        console.log(`⚠️  Keine Übersetzung gefunden für: "${currentText}"`);
      }
    } catch (error) {
      console.error(`Fehler beim Übersetzen von Text-Node:`, error);
    }
  }
  
  return translatedCount;
}

// Helper function to parse CSV translations
function parseTranslations(csvData) {
  const lines = csvData.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  
  const translationsByFile = {};
  const uniqueFiles = [];
  const seenFiles = new Set();
  const detectedLanguages = new Set();
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    if (values.length < headers.length) continue;
    
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] ? values[index].replace(/"/g, '').trim() : '';
    });
    
    // Extract required fields
    const frameName = entry['Frame Name'] || '';
    const sourceText = entry['Source Text'] || '';
    const translatedText = entry['Translated Text'] || '';
    const targetLanguage = entry['Target Language'] || '';
    const figmaFileKey = entry['Figma File Key'] || 'current';
    const figmaFrameId = entry['Figma Frame ID'] || '';
    
    if (!frameName || !sourceText || !targetLanguage) {
      continue;
    }
    
    detectedLanguages.add(targetLanguage);
    
    // Initialize nested structure
    if (!translationsByFile[figmaFileKey]) {
      translationsByFile[figmaFileKey] = {};
    }
    if (!translationsByFile[figmaFileKey][targetLanguage]) {
      translationsByFile[figmaFileKey][targetLanguage] = [];
    }
    
    // Add translation
    translationsByFile[figmaFileKey][targetLanguage].push({
      sourceText: sourceText,
      translatedText: translatedText,
      frameName: frameName
    });
    
    // Track unique files
    const fileKey = `${figmaFileKey}_${frameName}_${targetLanguage}`;
    if (!seenFiles.has(fileKey)) {
      seenFiles.add(fileKey);
      uniqueFiles.push({
        fileKey: figmaFileKey,
        frameName: frameName,
        frameId: figmaFrameId,
        targetLanguage: targetLanguage
      });
    }
  }
  
  return {
    translationsByFile,
    uniqueFiles,
    detectedLanguages: Array.from(detectedLanguages)
  };
}

// Helper function to parse a CSV line with proper quote handling
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

// Helper function to generate filename based on naming pattern
function generateFilename(item, settings) {
  const timestamp = new Date().toISOString().split('T')[0];
  const safeFrameName = item.frameName.replace(/[^a-zA-Z0-9]/g, '_');
  const safeElementName = item.elementName.replace(/[^a-zA-Z0-9]/g, '_');
  const extension = settings.format.toLowerCase();
  
  switch (settings.naming) {
    case 'frame_element_scale_date':
      return `${safeFrameName}_${safeElementName}_${settings.scale}x_${timestamp}.${extension}`;
    case 'element_frame_scale_date':
      return `${safeElementName}_${safeFrameName}_${settings.scale}x_${timestamp}.${extension}`;
    case 'frame_element_scale':
      return `${safeFrameName}_${safeElementName}_${settings.scale}x.${extension}`;
    case 'element_frame_scale':
      return `${safeElementName}_${safeFrameName}_${settings.scale}x.${extension}`;
    case 'custom':
      return `${settings.customPattern || 'export'}_${safeElementName}_${timestamp}.${extension}`;
    default:
      return `${safeFrameName}_${safeElementName}_${settings.scale}x_${timestamp}.${extension}`;
  }
}

console.log('Weleda Transcreate Workspace loaded successfully! 🌿');
