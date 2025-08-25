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
    console.log('📤 Starting smart export for', selectedAssetIds.length, 'assets...');
    
    // Limit concurrent exports to prevent crashes
    const MAX_CONCURRENT = 1; // Export one at a time
    const MAX_SIZE = 2048; // Max dimension to prevent memory issues
    
    figma.ui.postMessage({
      type: 'progress-update',
      title: 'Export wird vorbereitet...',
      current: 'Smart Memory Management aktiviert',
      progress: 5
    });
    
    // Find and filter selected groups
    var allGroups = figma.currentPage.findAll(function(node) {
      return (node.type === 'GROUP' || node.type === 'FRAME') && node.visible;
    });
    
    var selectedGroups = [];
    var pngCount = 0;
    var jpegCount = 0;
    
    for (var i = 0; i < allGroups.length; i++) {
      var group = allGroups[i];
      if (selectedAssetIds.indexOf(group.id) !== -1) {
        var width = Math.round(group.width);
        var height = Math.round(group.height);
        
        // Skip assets that are too large to prevent crashes
        var maxDimension = Math.max(width, height);
        if (maxDimension > MAX_SIZE) {
          console.log('⚠️ Skipping large asset:', group.name, width + 'x' + height);
          continue;
        }
        
        var exportInfo = {
          node: group,
          name: group.name,
          width: width,
          height: height,
          id: group.id
        };
        
        // Determine export settings
        if (width === height) {
          exportInfo.format = 'PNG';
          exportInfo.scale = Math.min(2, Math.floor(MAX_SIZE / width)); // Smart scaling
          pngCount++;
        } else if (width === 768 && height === 1344) {
          exportInfo.format = 'JPEG';
          exportInfo.scale = 1;
          jpegCount++;
          console.log('✅ JPEG candidate found:', group.name, width + 'x' + height);
        } else {
          // Skip assets that don't match our criteria
          console.log('⏭️ Skipping asset (wrong dimensions):', group.name, width + 'x' + height);
          continue;
        }
        
        selectedGroups.push(exportInfo);
      }
    }
    
    console.log('📊 Smart export plan: PNG=' + pngCount + ', JPEG=' + jpegCount);
    
    if (selectedGroups.length === 0) {
      figma.ui.postMessage({
        type: 'export-error',
        message: 'Keine exportierbaren Assets gefunden (möglicherweise zu groß).'
      });
      return;
    }
    
    // Export one by one to prevent memory issues
    var exportedFiles = [];
    var failedExports = [];
    
    for (var i = 0; i < selectedGroups.length; i++) {
      var assetInfo = selectedGroups[i];
      var progressPercent = 20 + (i / selectedGroups.length) * 70;
      
      figma.ui.postMessage({
        type: 'progress-update',
        title: 'Exportiere Assets...',
        current: `${i + 1}/${selectedGroups.length}: ${assetInfo.name}`,
        progress: progressPercent
      });
      
      try {
        // Conservative export settings
        var exportSettings = {
          format: assetInfo.format,
          constraint: {
            type: 'SCALE',
            value: assetInfo.scale
          }
        };
        
        // Special settings for different formats
        if (assetInfo.format === 'JPEG') {
          exportSettings = {
            format: 'JPG',
            constraint: {
              type: 'SCALE', 
              value: 1
            }
          };
          // Remove jpegQuality - let Figma use default
          console.log('🎯 JPEG Export settings (no quality specified)');
        } else {
          // PNG settings
          exportSettings = {
            format: 'PNG',
            constraint: {
              type: 'SCALE',
              value: assetInfo.scale
            }
          };
          console.log('🎯 PNG Export settings, scale:', assetInfo.scale);
        }
        
        console.log('🎯 Export settings:', JSON.stringify(exportSettings));
        console.log('🎯 Exporting:', assetInfo.name, 'Size:', assetInfo.width + 'x' + assetInfo.height, 'Format:', assetInfo.format);
        console.log('🎯 Node type:', assetInfo.node.type, 'Visible:', assetInfo.node.visible);
        
        // Simple export without timeout for testing
        console.log('⏳ Starting export...');
        var uint8Array = await assetInfo.node.exportAsync(exportSettings);
        console.log('✅ Export completed, size:', uint8Array.length, 'bytes');
        
        // More generous file size limit
        var fileSizeMB = uint8Array.length / (1024 * 1024);
        console.log('📏 File size:', fileSizeMB.toFixed(2) + ' MB');
        
        if (uint8Array.length > 10 * 1024 * 1024) { // 10MB limit instead of 5MB
          console.log('⚠️ File too large, skipping:', assetInfo.name);
          failedExports.push(assetInfo.name + ' (file too large: ' + fileSizeMB.toFixed(1) + 'MB)');
          continue;
        }
        
        // Add sequential numbering to filenames
        var fileNumber = String(i + 1).padStart(3, '0'); // 001, 002, 003...
        var fileName = fileNumber + '_' + sanitizeFileName(assetInfo.name) + '.' + (assetInfo.format === 'PNG' ? 'png' : 'jpg');
        
        exportedFiles.push({
          name: fileName,
          data: Array.from(uint8Array), // Convert to array for UI transmission
          format: assetInfo.format,
          originalName: assetInfo.name,
          size: uint8Array.length
        });
        
        console.log('✅ Exported successfully:', fileName, fileSizeMB.toFixed(2) + ' MB');
        
        // Longer pause for memory cleanup, especially after large exports
        var pauseDuration = fileSizeMB > 2 ? 500 : 200;
        await new Promise(resolve => setTimeout(resolve, pauseDuration));
        
      } catch (exportError) {
        console.error('❌ Export failed for', assetInfo.name, ':', exportError.message);
        console.error('Asset details:', assetInfo.width + 'x' + assetInfo.height, assetInfo.format, assetInfo.scale + 'x');
        failedExports.push(assetInfo.name + ' (error: ' + exportError.message + ')');
      }
    }
    
    if (exportedFiles.length === 0) {
      figma.ui.postMessage({
        type: 'export-error',
        message: 'Alle Exports fehlgeschlagen. Assets möglicherweise zu komplex oder zu groß.'
      });
      return;
    }
    
    figma.ui.postMessage({
      type: 'progress-update',
      title: 'Export abgeschlossen',
      current: `${exportedFiles.length} erfolgreich, ${failedExports.length} fehlgeschlagen`,
      progress: 100
    });
    
    // Send files for download
    figma.ui.postMessage({
      type: 'export-complete',
      stats: {
        totalExported: exportedFiles.length,
        pngCount: exportedFiles.filter(f => f.format === 'PNG').length,
        jpegCount: exportedFiles.filter(f => f.format === 'JPEG').length,
        failed: failedExports
      },
      files: exportedFiles
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
