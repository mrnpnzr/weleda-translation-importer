// Weleda Layer Export Plugin
figma.showUI(__html__, { 
  width: 420, 
  height: 800,
  themeColors: true,
  title: "🌿 Weleda Layer Export"
});

// Keep-alive system
var keepAliveInterval = setInterval(function() {
  // Send keep-alive signal every 30 seconds
}, 30000);

figma.ui.onmessage = function(msg) {
  console.log('Received message:', msg.type);
  
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

function handleAutoExport() {
  console.log('HandleAutoExport aufgerufen');
  
  try {
    // Re-scan for auto-export items
    var autoExportItems = [];
    
    var allFrames = figma.currentPage.findAll(function(node) {
      return node.type === 'FRAME' || node.type === 'COMPONENT';
    });
    
    console.log('Scanning ' + allFrames.length + ' frames for auto-export patterns');
    
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
          
          console.log('Auto-Export Item gefunden: ' + child.name + ' → ' + autoExportInfo.format + ' ' + autoExportInfo.scale + 'x');
        }
      }
    }
    
    console.log('Auto-Export Items gefunden: ' + autoExportItems.length);
    
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
        console.log('Auto-Export abgeschlossen: ' + exportedItems.length + ' Dateien');
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
      
      console.log('Exportiere Item ' + (exportIndex + 1) + '/' + autoExportItems.length + ': ' + item.elementName);
      
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
      
      console.log('Exportiere mit Settings:', exportSettings);
      
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

function generateFilename(item, settings) {
  var timestamp = new Date().toISOString().split('T')[0];
  var safeName = item.elementName.replace(/[^a-zA-Z0-9]/g, '_');
  var safeFrameName = item.frameName.replace(/[^a-zA-Z0-9]/g, '_');
  var extension = settings.format.toLowerCase();
  
  if (settings.naming === 'custom' && settings.customPattern) {
    return settings.customPattern
      .replace('{frame}', safeFrameName)
      .replace('{element}', safeName)
      .replace('{scale}', settings.scale + 'x')
      .replace('{date}', timestamp) + '.' + extension;
  }
  
  switch (settings.naming) {
    case 'element_frame_scale_date':
      return safeName + '_' + safeFrameName + '_' + settings.scale + 'x_' + timestamp + '.' + extension;
    case 'frame_element_scale':
      return safeFrameName + '_' + safeName + '_' + settings.scale + 'x.' + extension;
    case 'element_frame_scale':
      return safeName + '_' + safeFrameName + '_' + settings.scale + 'x.' + extension;
    default: // frame_element_scale_date
      return safeFrameName + '_' + safeName + '_' + settings.scale + 'x_' + timestamp + '.' + extension;
  }
}

console.log('Weleda Layer Export Plugin loaded successfully! 🌿');
