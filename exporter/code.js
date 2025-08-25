// Weleda Asset Export Plugin - Code.js
figma.showUI(__html__, { 
  width: 460, 
  height: 700,
  themeColors: true,
  title: "📤 Weleda Asset Export"
});

var keepAliveInterval = setInterval(function() {
  // Keep-alive signal every 30 seconds
}, 30000);

figma.ui.onmessage = function(msg) {
  console.log('📨 Received message:', msg.type);
  
  if (msg.type === 'scan-groups') {
    handleScanGroups();
  }
  
  if (msg.type === 'export-assets') {
    handleExportAssets(msg.selectedAssets);
  }
  
  if (msg.type === 'close') {
    clearInterval(keepAliveInterval);
    figma.closePlugin();
  }
};

async function handleScanGroups() {
  try {
    console.log('🔍 Starting group scan...');
    
    figma.ui.postMessage({
      type: 'progress-update',
      title: 'Gruppen werden gescannt...',
      current: 'Suche nach sichtbaren Gruppen',
      progress: 10
    });
    
    // Find all visible groups on current page
    var allGroups = figma.currentPage.findAll(function(node) {
      return (node.type === 'GROUP' || node.type === 'FRAME') && node.visible;
    });
    
    console.log('📋 Found', allGroups.length, 'visible groups/frames');
    
    figma.ui.postMessage({
      type: 'progress-update',
      title: 'Gruppen analysieren...',
      current: allGroups.length + ' Gruppen gefunden',
      progress: 30
    });
    
    var pngGroups = [];
    var jpegGroups = [];
    
    // Analyze each group
    for (var i = 0; i < allGroups.length; i++) {
      var group = allGroups[i];
      var width = Math.round(group.width);
      var height = Math.round(group.height);
      
      console.log('📐 Analyzing:', group.name, width + '×' + height);
      
      // Check for 1:1 ratio (PNG 2x)
      if (width === height) {
        pngGroups.push({
          id: group.id,
          name: group.name,
          width: width,
          height: height,
          node: group
        });
        console.log('✅ PNG candidate:', group.name, '(' + width + '×' + height + ')');
      }
      // Check for 768×1344 (JPEG 1x)
      else if (width === 768 && height === 1344) {
        jpegGroups.push({
          id: group.id,
          name: group.name,
          width: width,
          height: height,
          node: group
        });
        console.log('✅ JPEG candidate:', group.name, '(' + width + '×' + height + ')');
      }
      
      // Update progress
      var progress = 30 + (i / allGroups.length) * 50;
      figma.ui.postMessage({
        type: 'progress-update',
        title: 'Gruppen analysieren...',
        current: 'Analysiere: ' + group.name,
        progress: progress
      });
    }
    
    var totalFound = pngGroups.length + jpegGroups.length;
    console.log('📊 Results: PNG=' + pngGroups.length + ', JPEG=' + jpegGroups.length);
    
    figma.ui.postMessage({
      type: 'progress-update',
      title: 'Scan abgeschlossen',
      current: totalFound + ' exportierbare Assets gefunden',
      progress: 100
    });
    
    // Send results to UI
    figma.ui.postMessage({
      type: 'scan-results',
      results: {
        png: pngGroups.map(function(g) {
          return {
            id: g.id,
            name: g.name,
            width: g.width,
            height: g.height
          };
        }),
        jpeg: jpegGroups.map(function(g) {
          return {
            id: g.id,
            name: g.name,
            width: g.width,
            height: g.height
          };
        })
      }
    });
    
  } catch (error) {
    console.error('❌ Scan failed:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Scan-Fehler: ' + error.message
    });
  }
}

async function handleExportAssets(selectedAssetIds) {
  try {
    console.log('📤 Starting export for', selectedAssetIds.length, 'assets...');
    
    figma.ui.postMessage({
      type: 'progress-update',
      title: 'Export wird vorbereitet...',
      current: 'Sammle Asset-Informationen',
      progress: 5
    });
    
    // Find all groups again (we need the actual nodes)
    var allGroups = figma.currentPage.findAll(function(node) {
      return (node.type === 'GROUP' || node.type === 'FRAME') && node.visible;
    });
    
    // Filter selected groups
    var selectedGroups = [];
    var pngCount = 0;
    var jpegCount = 0;
    
    for (var i = 0; i < allGroups.length; i++) {
      var group = allGroups[i];
      if (selectedAssetIds.indexOf(group.id) !== -1) {
        var width = Math.round(group.width);
        var height = Math.round(group.height);
        
        var exportInfo = {
          node: group,
          name: group.name,
          width: width,
          height: height
        };
        
        // Determine export settings
        if (width === height) {
          // 1:1 ratio -> PNG 2x
          exportInfo.format = 'PNG';
          exportInfo.scale = 2;
          pngCount++;
        } else if (width === 768 && height === 1344) {
          // 768×1344 -> JPEG 1x
          exportInfo.format = 'JPEG';
          exportInfo.scale = 1;
          jpegCount++;
        }
        
        selectedGroups.push(exportInfo);
      }
    }
    
    console.log('📊 Export plan: PNG=' + pngCount + ' (2x), JPEG=' + jpegCount + ' (1x)');
    
    if (selectedGroups.length === 0) {
      figma.ui.postMessage({
        type: 'export-error',
        message: 'Keine gültigen Assets zum Exportieren gefunden.'
      });
      return;
    }
    
    // Export each asset
    var exportedFiles = [];
    var totalAssets = selectedGroups.length;
    
    for (var i = 0; i < selectedGroups.length; i++) {
      var assetInfo = selectedGroups[i];
      var progressPercent = 10 + (i / totalAssets) * 80;
      
      figma.ui.postMessage({
        type: 'progress-update',
        title: 'Assets werden exportiert...',
        current: 'Exportiere: ' + assetInfo.name + ' (' + assetInfo.format + ')',
        progress: progressPercent
      });
      
      try {
        var exportSettings = {
          format: assetInfo.format,
          constraint: {
            type: 'SCALE',
            value: assetInfo.scale
          }
        };
        
        // Add JPEG quality if needed
        if (assetInfo.format === 'JPEG') {
          exportSettings.jpegQuality = 0.9; // 90% quality
        }
        
        console.log('🎯 Exporting:', assetInfo.name, 'as', assetInfo.format, assetInfo.scale + 'x');
        
        var uint8Array = await assetInfo.node.exportAsync(exportSettings);
        
        // Create file info
        var fileExtension = assetInfo.format === 'PNG' ? 'png' : 'jpg';
        var fileName = sanitizeFileName(assetInfo.name) + '.' + fileExtension;
        
        exportedFiles.push({
          name: fileName,
          data: Array.from(uint8Array), // Convert to regular array for transmission
          format: assetInfo.format,
          originalName: assetInfo.name,
          size: uint8Array.length
        });
        
        console.log('✅ Exported:', fileName, '(' + uint8Array.length + ' bytes)');
        
      } catch (exportError) {
        console.error('❌ Export failed for', assetInfo.name, ':', exportError);
        // Continue with other assets
      }
    }
    
    figma.ui.postMessage({
      type: 'progress-update',
      title: 'Export abgeschlossen',
      current: exportedFiles.length + ' Assets erfolgreich exportiert',
      progress: 100
    });
    
    // Create download (in real implementation, you'd create a ZIP or send files to UI)
    console.log('📦 Creating download package...');
    
    // Send completion with actual file data
    figma.ui.postMessage({
      type: 'export-complete',
      stats: {
        totalExported: exportedFiles.length,
        pngCount: pngCount,
        jpegCount: jpegCount
      },
      files: exportedFiles // Send the actual file data
    });
    
  } catch (error) {
    console.error('❌ Export failed:', error);
    figma.ui.postMessage({
      type: 'export-error',
      message: 'Export-Fehler: ' + error.message
    });
  }
}

// Helper function to sanitize file names
function sanitizeFileName(name) {
  // Remove invalid characters and limit length
  return name
    .replace(/[^a-zA-Z0-9_\-\s]/g, '') // Remove special chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 50) // Limit length
    .toLowerCase(); // Lowercase
}

// Helper function to determine if ratio is 1:1 (with small tolerance)
function isSquareRatio(width, height, tolerance = 2) {
  return Math.abs(width - height) <= tolerance;
}

// Helper function to check exact dimensions
function hasExactDimensions(width, height, targetWidth, targetHeight, tolerance = 2) {
  return Math.abs(width - targetWidth) <= tolerance && 
         Math.abs(height - targetHeight) <= tolerance;
}

console.log('🌿 Weleda Asset Export Plugin loaded!');
