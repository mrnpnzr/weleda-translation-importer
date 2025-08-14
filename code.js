// Weleda Transcreate Workspace - Simplified Version (ES5 Compatible)
figma.showUI(__html__, { 
  width: 400, 
  height: 700,
  themeColors: true,
  title: "🌿 Weleda Transcreate Workspace"
});

// Keep-alive system
var keepAliveInterval = setInterval(function() {
  // Send keep-alive signal every 30 seconds
}, 30000);

figma.ui.onmessage = function(msg) {
  console.log('Received message:', msg.type);
  
  if (msg.type === 'import-translations') {
    handleImportTranslations(msg.csvData);
  }
  
  if (msg.type === 'get-frame-ids') {
    handleGetFrameIds();
  }
  
  if (msg.type === 'load-layers') {
    handleLoadLayers();
  }
  
  if (msg.type === 'download-layers-direct') {
    handleDirectDownload(msg.selectedItems, msg.settings);
  }
  
  if (msg.type === 'close') {
    clearInterval(keepAliveInterval);
    figma.closePlugin();
  }
};

function handleImportTranslations(csvData) {
  try {
    var parsedData = parseTranslations(csvData);
    var translationsByFile = parsedData.translationsByFile;
    var uniqueFiles = parsedData.uniqueFiles;
    var detectedLanguages = parsedData.detectedLanguages;
    
    if (Object.keys(translationsByFile).length === 0) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Keine gültigen Übersetzungen in der CSV gefunden.'
      });
      return;
    }
    
    figma.ui.postMessage({
      type: 'progress',
      message: 'Gefunden: ' + detectedLanguages.length + ' Sprache(n) - ' + detectedLanguages.join(', '),
      progress: 10
    });
    
    var importedCount = 0;
    var importDetails = [];
    
    // Process each unique file
    for (var i = 0; i < uniqueFiles.length; i++) {
      var fileInfo = uniqueFiles[i];
      
      try {
        figma.ui.postMessage({
          type: 'progress',
          message: 'Suche Frame "' + fileInfo.frameName + '"...',
          progress: 20 + (importedCount / uniqueFiles.length) * 60
        });
        
        var frameNode = findFrame(fileInfo);
        if (frameNode) {
          var duplicatedFrame = frameNode.clone();
          duplicatedFrame.name = frameNode.name + ' - ' + fileInfo.targetLanguage;
          
          // Position the duplicated frame next to the original
          duplicatedFrame.x = frameNode.x + frameNode.width + 100;
          duplicatedFrame.y = frameNode.y;
          
          figma.ui.postMessage({
            type: 'progress',
            message: 'Übersetze Texte in "' + duplicatedFrame.name + '"...',
            progress: 30 + (importedCount / uniqueFiles.length) * 60
          });
          
          // Apply translations to the duplicated frame
          var translatedCount = applyTranslations(duplicatedFrame, translationsByFile[fileInfo.fileKey][fileInfo.targetLanguage]);
          
          importDetails.push({
            frameName: duplicatedFrame.name,
            language: fileInfo.targetLanguage,
            translatedTexts: translatedCount
          });
          
          importedCount++;
          
          console.log('✅ Frame erstellt: "' + duplicatedFrame.name + '" mit ' + translatedCount + ' übersetzten Texten');
        } else {
          console.log('❌ Frame nicht gefunden: "' + fileInfo.frameName + '"');
        }
      } catch (error) {
        console.error('Fehler bei Frame "' + fileInfo.frameName + '":', error);
      }
    }
    
    // Select all imported frames
    var importedFrames = figma.currentPage.children.filter(function(node) {
      for (var j = 0; j < detectedLanguages.length; j++) {
        if (node.name.endsWith(' - ' + detectedLanguages[j])) {
          return true;
        }
      }
      return false;
    });
    
    if (importedFrames.length > 0) {
      figma.currentPage.selection = importedFrames;
      figma.viewport.scrollAndZoomIntoView(importedFrames);
    }
    
    figma.ui.postMessage({
      type: 'success',
      message: importedCount + ' Frame(s) erfolgreich importiert und übersetzt!',
      details: importDetails,
      progress: 100
    });
    
  } catch (error) {
    console.error('Import error:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Import-Fehler: ' + error.message
    });
  }
}

function handleGetFrameIds() {
  try {
    var allFrames = figma.currentPage.findAll(function(node) {
      return node.type === 'FRAME' || node.type === 'COMPONENT';
    });
    
    console.log('\n🔍 FRAME-IDS DER AKTUELLEN SEITE:');
    console.log('=====================================');
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      console.log('📄 "' + frame.name + '"');
      console.log('   ID: ' + frame.id);
      console.log('   Type: ' + frame.type);
      console.log('   Size: ' + Math.round(frame.width) + '×' + Math.round(frame.height) + 'px');
      console.log('   ---');
    }
    
    console.log('\nGefunden: ' + allFrames.length + ' Frame(s) auf Seite "' + figma.currentPage.name + '"');
    
    figma.ui.postMessage({
      type: 'success',
      message: allFrames.length + ' Frame-IDs in der Console ausgegeben. Öffne die Console (F12) um sie zu sehen.'
    });
    
  } catch (error) {
    console.error('Error getting frame IDs:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Fehler beim Abrufen der Frame-IDs: ' + error.message
    });
  }
}

function handleLoadLayers() {
  try {
    var frameGroups = [];
    
    // Find all frames and their immediate children
    var allFrames = figma.currentPage.findAll(function(node) {
      return node.type === 'FRAME' || node.type === 'COMPONENT';
    });
    
    console.log('Found ' + allFrames.length + ' frames to analyze');
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      
      if (frame.children && frame.children.length > 0) {
        var exportableChildren = [];
        
        for (var j = 0; j < frame.children.length; j++) {
          var child = frame.children[j];
          if (canBeExported(child)) {
            exportableChildren.push({
              id: child.id,
              name: child.name,
              type: child.type,
              width: Math.round(child.width || 0),
              height: Math.round(child.height || 0),
              x: Math.round(child.x || 0),
              y: Math.round(child.y || 0)
            });
          }
        }
        
        if (exportableChildren.length > 0) {
          frameGroups.push({
            frameId: frame.id,
            frameName: frame.name,
            frameWidth: Math.round(frame.width),
            frameHeight: Math.round(frame.height),
            children: exportableChildren
          });
        }
      }
    }
    
    console.log('Found ' + frameGroups.length + ' frames with exportable children');
    
    // Send frames without thumbnails for now (to avoid async issues)
    figma.ui.postMessage({
      type: 'frames-loaded',
      frames: frameGroups
    });
    
  } catch (error) {
    console.error('Error loading frames:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Fehler beim Laden der Frames: ' + error.message
    });
  }
}

function handleDirectDownload(selectedItems, settings) {
  try {
    if (!selectedItems || selectedItems.length === 0) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Keine Elemente zum Export ausgewählt.'
      });
      return;
    }
    
    console.log('Starting export of ' + selectedItems.length + ' elements');
    
    var exportedItems = [];
    var exportIndex = 0;
    
    function exportNextItem() {
      if (exportIndex >= selectedItems.length) {
        // All items exported, send results
        figma.ui.postMessage({
          type: 'download-ready',
          count: exportedItems.length,
          exports: exportedItems
        });
        return;
      }
      
      var item = selectedItems[exportIndex];
      
      figma.ui.postMessage({
        type: 'download-progress',
        current: exportIndex + 1,
        total: selectedItems.length,
        itemName: item.frameName + ' > ' + item.elementName
      });
      
      var node = figma.getNodeById(item.elementId);
      if (!node || !canBeExported(node)) {
        exportIndex++;
        exportNextItem();
        return;
      }
      
      var exportSettings = {
        format: settings.format || 'PNG',
        constraint: {
          type: 'SCALE',
          value: settings.scale || 2
        }
      };
      
      node.exportAsync(exportSettings).then(function(bytes) {
        var filename = generateFilename(item, settings);
        
        exportedItems.push({
          name: filename,
          bytes: Array.from(bytes),
          frameName: item.frameName,
          elementName: item.elementName,
          width: item.width,
          height: item.height
        });
        
        exportIndex++;
        exportNextItem();
      }).catch(function(error) {
        console.error('Export failed for ' + item.elementName + ':', error);
        exportIndex++;
        exportNextItem();
      });
    }
    
    // Start exporting
    exportNextItem();
    
  } catch (error) {
    console.error('Export error:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Export-Fehler: ' + error.message
    });
  }
}

// Helper functions
function canBeExported(node) {
  var exportableTypes = [
    'FRAME', 'COMPONENT', 'INSTANCE', 'GROUP', 
    'RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 
    'VECTOR', 'TEXT', 'IMAGE'
  ];
  return exportableTypes.indexOf(node.type) !== -1;
}

function findFrame(fileInfo) {
  console.log('Suche Frame: "' + fileInfo.frameName + '" mit ID: "' + fileInfo.frameId + '"');
  
  // Primary: Search by Node-ID (if available)
  if (fileInfo.frameId && fileInfo.frameId.trim() !== '') {
    try {
      var nodeById = figma.getNodeById(fileInfo.frameId);
      if (nodeById && (nodeById.type === 'FRAME' || nodeById.type === 'COMPONENT')) {
        console.log('✅ Frame über ID gefunden: "' + nodeById.name + '"');
        return nodeById;
      }
    } catch (error) {
      console.log('ID-Suche fehlgeschlagen für "' + fileInfo.frameId + '": ' + error.message);
    }
  }
  
  // Fallback: Search by name
  var allFrames = figma.currentPage.findAll(function(node) {
    return node.type === 'FRAME' || node.type === 'COMPONENT';
  });
  
  // Exact match first
  for (var i = 0; i < allFrames.length; i++) {
    if (allFrames[i].name === fileInfo.frameName) {
      console.log('✅ Frame über Namen gefunden: "' + allFrames[i].name + '"');
      return allFrames[i];
    }
  }
  
  // Partial match as fallback
  for (var j = 0; j < allFrames.length; j++) {
    if (allFrames[j].name.indexOf(fileInfo.frameName) !== -1 || 
        fileInfo.frameName.indexOf(allFrames[j].name) !== -1) {
      console.log('✅ Frame über Teilübereinstimmung gefunden: "' + allFrames[j].name + '"');
      return allFrames[j];
    }
  }
  
  console.log('❌ Frame nicht gefunden: "' + fileInfo.frameName + '"');
  return null;
}

function applyTranslations(frame, translations) {
  var translatedCount = 0;
  
  // Find all text nodes in the frame recursively
  var textNodes = frame.findAll(function(node) {
    return node.type === 'TEXT';
  });
  
  console.log('Gefunden: ' + textNodes.length + ' Text-Nodes in Frame "' + frame.name + '"');
  
  for (var i = 0; i < textNodes.length; i++) {
    var textNode = textNodes[i];
    
    try {
      var currentText = textNode.characters;
      var normalizedCurrentText = currentText.replace(/\r\n|\r|\n/g, '\n').trim();
      
      // Look for exact matches in translations
      var translation = null;
      for (var j = 0; j < translations.length; j++) {
        var t = translations[j];
        var normalizedSourceText = t.sourceText.replace(/\r\n|\r|\n/g, '\n').trim();
        if (normalizedSourceText === normalizedCurrentText) {
          translation = t;
          break;
        }
      }
      
      if (translation && translation.translatedText && translation.translatedText.trim() !== '') {
        // Load font before changing text (sync operation)
        figma.loadFontAsync(textNode.fontName).then(function() {
          textNode.characters = translation.translatedText;
        });
        
        translatedCount++;
        console.log('✅ Text übersetzt: "' + currentText + '" → "' + translation.translatedText + '"');
      } else {
        console.log('⚠️  Keine Übersetzung gefunden für: "' + currentText + '"');
      }
    } catch (error) {
      console.error('Fehler beim Übersetzen von Text-Node:', error);
    }
  }
  
  return translatedCount;
}

function generateFilename(item, settings) {
  var timestamp = new Date().toISOString().split('T')[0];
  var safeFrameName = item.frameName.replace(/[^a-zA-Z0-9]/g, '_');
  var safeElementName = item.elementName.replace(/[^a-zA-Z0-9]/g, '_');
  var extension = (settings.format || 'PNG').toLowerCase();
  var scale = settings.scale || 2;
  
  switch (settings.naming) {
    case 'frame_element_scale_date':
      return safeFrameName + '_' + safeElementName + '_' + scale + 'x_' + timestamp + '.' + extension;
    case 'element_frame_scale_date':
      return safeElementName + '_' + safeFrameName + '_' + scale + 'x_' + timestamp + '.' + extension;
    case 'frame_element_scale':
      return safeFrameName + '_' + safeElementName + '_' + scale + 'x.' + extension;
    case 'element_frame_scale':
      return safeElementName + '_' + safeFrameName + '_' + scale + 'x.' + extension;
    case 'custom':
      return (settings.customPattern || 'export') + '_' + safeElementName + '_' + timestamp + '.' + extension;
    default:
      return safeFrameName + '_' + safeElementName + '_' + scale + 'x_' + timestamp + '.' + extension;
  }
}

function parseTranslations(csvData) {
  var lines = csvData.split('\n');
  var headers = lines[0].split(',').map(function(h) {
    return h.replace(/"/g, '').trim();
  });
  
  var translationsByFile = {};
  var uniqueFiles = [];
  var seenFiles = {};
  var detectedLanguages = [];
  
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    
    var values = parseCSVLine(line);
    if (values.length < headers.length) continue;
    
    var entry = {};
    for (var j = 0; j < headers.length; j++) {
      entry[headers[j]] = values[j] ? values[j].replace(/"/g, '').trim() : '';
    }
    
    // Extract required fields
    var frameName = entry['Frame Name'] || '';
    var sourceText = entry['Source Text'] || '';
    var translatedText = entry['Translated Text'] || '';
    var targetLanguage = entry['Target Language'] || '';
    var figmaFileKey = entry['Figma File Key'] || 'current';
    var figmaFrameId = entry['Figma Frame ID'] || '';
    
    if (!frameName || !sourceText || !targetLanguage) {
      continue;
    }
    
    if (detectedLanguages.indexOf(targetLanguage) === -1) {
      detectedLanguages.push(targetLanguage);
    }
    
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
    var fileKey = figmaFileKey + '_' + frameName + '_' + targetLanguage;
    if (!seenFiles[fileKey]) {
      seenFiles[fileKey] = true;
      uniqueFiles.push({
        fileKey: figmaFileKey,
        frameName: frameName,
        frameId: figmaFrameId,
        targetLanguage: targetLanguage
      });
    }
  }
  
  return {
    translationsByFile: translationsByFile,
    uniqueFiles: uniqueFiles,
    detectedLanguages: detectedLanguages
  };
}

function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  
  for (var i = 0; i < line.length; i++) {
    var char = line[i];
    var nextChar = line[i + 1];
    
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

console.log('Weleda Transcreate Workspace loaded successfully! 🌿');
