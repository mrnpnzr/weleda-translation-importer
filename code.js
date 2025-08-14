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
  
  if (msg.type === 'auto-export') {
    handleAutoExport();
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
    var autoExportItems = [];
    
    // Find all frames and their immediate children
    var allFrames = figma.currentPage.findAll(function(node) {
      return node.type === 'FRAME' || node.type === 'COMPONENT';
    });
    
    console.log('Found ' + allFrames.length + ' frames to analyze');
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      
      // Skip hidden or locked frames
      if (!canBeExported(frame)) {
        console.log('Frame übersprungen: "' + frame.name + '" (ausgeblendet oder gesperrt)');
        continue;
      }
      
      if (frame.children && frame.children.length > 0) {
        var exportableChildren = [];
        
        for (var j = 0; j < frame.children.length; j++) {
          var child = frame.children[j];
          if (canBeExported(child)) {
            var childInfo = {
              id: child.id,
              name: child.name,
              type: child.type,
              width: Math.round(child.width || 0),
              height: Math.round(child.height || 0),
              x: Math.round(child.x || 0),
              y: Math.round(child.y || 0),
              visible: child.visible,
              locked: child.locked
            };
            
            // Check if this child matches auto-export patterns
            var autoExportInfo = checkAutoExportPattern(child.name);
            if (autoExportInfo) {
              autoExportItems.push({
                frameId: frame.id,
                frameName: frame.name,
                elementId: child.id,
                elementName: child.name,
                elementType: child.type,
                width: childInfo.width,
                height: childInfo.height,
                format: autoExportInfo.format,
                scale: autoExportInfo.scale,
                pattern: autoExportInfo.pattern
              });
              
              console.log('🎯 Auto-Export gefunden: "' + child.name + '" → ' + autoExportInfo.format + ' ' + autoExportInfo.scale + 'x');
              
              // Mark for visual indication
              childInfo.autoExport = autoExportInfo;
            }
            
            exportableChildren.push(childInfo);
          }
        }
        
        if (exportableChildren.length > 0) {
          frameGroups.push({
            frameId: frame.id,
            frameName: frame.name,
            frameWidth: Math.round(frame.width),
            frameHeight: Math.round(frame.height),
            children: exportableChildren,
            visible: frame.visible,
            locked: frame.locked
          });
          
          console.log('Frame "' + frame.name + '": ' + exportableChildren.length + ' exportierbare Kinder gefunden');
        } else {
          console.log('Frame "' + frame.name + '": Keine exportierbaren Kinder gefunden');
        }
      }
    }
    
    console.log('Gefunden: ' + frameGroups.length + ' Frames mit exportierbaren Kindern');
    console.log('Auto-Export: ' + autoExportItems.length + ' Elemente erkannt');
    console.log('Ausgeschlossen: ' + (allFrames.length - frameGroups.length) + ' Frames (ausgeblendet/gesperrt/leer)');
    
    // Send frames and auto-export items
    figma.ui.postMessage({
      type: 'frames-loaded',
      frames: frameGroups,
      autoExportItems: autoExportItems
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
      if (!node) {
        console.log('Element nicht gefunden: ' + item.elementName);
        exportIndex++;
        exportNextItem();
        return;
      }
      
      // Double-check if element is still exportable (visibility/lock could have changed)
      if (!canBeExported(node)) {
        console.log('Element übersprungen (nicht mehr exportierbar): ' + item.elementName);
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
        
        console.log('✅ Exportiert: ' + filename);
        exportIndex++;
        exportNextItem();
      }).catch(function(error) {
        console.error('Export fehlgeschlagen für ' + item.elementName + ':', error);
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
  
  // Check if node type is exportable
  if (exportableTypes.indexOf(node.type) === -1) {
    return false;
  }
  
  // Check if node is visible
  if (node.visible === false) {
    console.log('Ausgeschlossen (ausgeblendet): "' + node.name + '"');
    return false;
  }
  
  // Check if node is locked (for groups and frames)
  if (node.locked === true) {
    console.log('Ausgeschlossen (gesperrt): "' + node.name + '"');
    return false;
  }
  
  // Check if node has zero dimensions (invalid for export)
  if ((node.width && node.width <= 0) || (node.height && node.height <= 0)) {
    console.log('Ausgeschlossen (keine Größe): "' + node.name + '"');
    return false;
  }
  
  // Check if parent is hidden or locked (recursive check)
  var parent = node.parent;
  while (parent && parent.type !== 'PAGE') {
    if (parent.visible === false) {
      console.log('Ausgeschlossen (Parent ausgeblendet): "' + node.name + '" -> Parent: "' + parent.name + '"');
      return false;
    }
    if (parent.locked === true) {
      console.log('Ausgeschlossen (Parent gesperrt): "' + node.name + '" -> Parent: "' + parent.name + '"');
      return false;
    }
    parent = parent.parent;
  }
  
  return true;
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

// Helper function to check auto-export patterns
function checkAutoExportPattern(name) {
  // Pattern 1: "1zu1" → PNG 2x
  if (name.indexOf('1zu1') !== -1) {
    return {
      pattern: '1zu1',
      format: 'PNG',
      scale: 2
    };
  }
  
  // Pattern 2: "768x1344" → JPG 1x  
  if (name.indexOf('768x1344') !== -1) {
    return {
      pattern: '768x1344',
      format: 'JPG',
      scale: 1
    };
  }
  
  return null;
}

// New function to handle auto-export
function handleAutoExport() {
  try {
    // Re-scan for auto-export items
    var autoExportItems = [];
    
    var allFrames = figma.currentPage.findAll(function(node) {
      return node.type === 'FRAME' || node.type === 'COMPONENT';
    });
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      
      if (!canBeExported(frame) || !frame.children) continue;
      
      for (var j = 0; j < frame.children.length; j++) {
        var child = frame.children[j];
        
        if (!canBeExported(child)) continue;
        
        var autoExportInfo = checkAutoExportPattern(child.name);
        if (autoExportInfo) {
          autoExportItems.push({
            frameId: frame.id,
            frameName: frame.name,
            elementId: child.id,
            elementName: child.name,
            elementType: child.type,
            width: Math.round(child.width || 0),
            height: Math.round(child.height || 0),
            format: autoExportInfo.format,
            scale: autoExportInfo.scale,
            pattern: autoExportInfo.pattern
          });
        }
      }
    }
    
    if (autoExportItems.length === 0) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Keine Auto-Export Elemente gefunden. Stelle sicher, dass Gruppennamen "1zu1" oder "768x1344" enthalten.'
      });
      return;
    }
    
    console.log('Starting auto-export of ' + autoExportItems.length + ' elements');
    
    figma.ui.postMessage({
      type: 'progress',
      message: 'Auto-Export gestartet: ' + autoExportItems.length + ' Elemente erkannt',
      progress: 5
    });
    
    // Start exporting
    var exportedItems = [];
    var exportIndex = 0;
    
    function exportNextAutoItem() {
      if (exportIndex >= autoExportItems.length) {
        // All items exported, send results
        figma.ui.postMessage({
          type: 'download-ready',
          count: exportedItems.length,
          exports: exportedItems,
          autoExport: true
        });
        return;
      }
      
      var item = autoExportItems[exportIndex];
      var progress = Math.round(10 + (exportIndex / autoExportItems.length) * 80);
      
      figma.ui.postMessage({
        type: 'download-progress',
        current: exportIndex + 1,
        total: autoExportItems.length,
        itemName: item.frameName + ' > ' + item.elementName,
        progress: progress
      });
      
      var node = figma.getNodeById(item.elementId);
      if (!node) {
        console.log('Element nicht gefunden: ' + item.elementName);
        exportIndex++;
        exportNextAutoItem();
        return;
      }
      
      // Double-check if element is still exportable
      if (!canBeExported(node)) {
        console.log('Element übersprungen (nicht mehr exportierbar): ' + item.elementName);
        exportIndex++;
        exportNextAutoItem();
        return;
      }
      
      var exportSettings = {
        format: item.format,
        constraint: {
          type: 'SCALE',
          value: item.scale
        }
      };
      
      node.exportAsync(exportSettings).then(function(bytes) {
        var timestamp = new Date().toISOString().split('T')[0];
        var safeName = item.elementName.replace(/[^a-zA-Z0-9]/g, '_');
        var filename = safeName + '_' + item.scale + 'x_' + timestamp + '.' + item.format.toLowerCase();
        
        exportedItems.push({
          name: filename,
          bytes: Array.from(bytes),
          frameName: item.frameName,
          elementName: item.elementName,
          width: item.width,
          height: item.height,
          pattern: item.pattern,
          format: item.format,
          scale: item.scale
        });
        
        console.log('✅ Auto-Export: ' + filename + ' (' + item.pattern + ')');
        exportIndex++;
        exportNextAutoItem();
      }).catch(function(error) {
        console.error('Auto-Export fehlgeschlagen für ' + item.elementName + ':', error);
        exportIndex++;
        exportNextAutoItem();
      });
    }
    
    // Start auto-exporting
    exportNextAutoItem();
    
  } catch (error) {
    console.error('Auto-Export error:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Auto-Export-Fehler: ' + error.message
    });
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
