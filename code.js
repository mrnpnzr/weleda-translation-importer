// Weleda Translation Import Plugin
figma.showUI(__html__, { 
  width: 420, 
  height: 600,
  themeColors: true,
  title: "🌿 Weleda Translation Import"
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
  
  if (msg.type === 'close') {
    clearInterval(keepAliveInterval);
    figma.closePlugin();
  }
};

async function handleImportTranslations(csvData) {
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
    
    // Process each unique file sequentially
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
          
          // Apply translations to the duplicated frame (await the async function)
          var translatedCount = await applyTranslations(duplicatedFrame, translationsByFile[fileInfo.fileKey][fileInfo.targetLanguage]);
          
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
      
      // Also show text node IDs within this frame
      var textNodes = frame.findAll(function(node) {
        return node.type === 'TEXT';
      });
      
      if (textNodes.length > 0) {
        console.log('   📝 Text Nodes:');
        for (var j = 0; j < textNodes.length; j++) {
          var textNode = textNodes[j];
          var textPreview = textNode.characters.length > 30 ? 
            textNode.characters.substring(0, 30) + '...' : 
            textNode.characters;
          console.log('      • ID: ' + textNode.id + ' | Text: "' + textPreview + '"');
        }
      }
      console.log('   ---');
    }
    
    console.log('\nGefunden: ' + allFrames.length + ' Frame(s) auf Seite "' + figma.currentPage.name + '"');
    
    figma.ui.postMessage({
      type: 'success',
      message: allFrames.length + ' Frame-IDs und Text-Node-IDs in der Console ausgegeben. Öffne die Console (F12) um sie zu sehen.'
    });
    
  } catch (error) {
    console.error('Error getting frame IDs:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Fehler beim Abrufen der Frame-IDs: ' + error.message
    });
  }
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

async function applyTranslations(frame, translations) {
  var translatedCount = 0;
  
  // Find all text nodes in the frame recursively
  var textNodes = frame.findAll(function(node) {
    return node.type === 'TEXT';
  });
  
  console.log('Gefunden: ' + textNodes.length + ' Text-Nodes in Frame "' + frame.name + '"');
  
  // Process text nodes sequentially to avoid font loading conflicts
  for (var i = 0; i < textNodes.length; i++) {
    var textNode = textNodes[i];
    
    try {
      var currentText = textNode.characters;
      var normalizedCurrentText = currentText.replace(/\r\n|\r|\n/g, '\n').trim();
      var nodeId = textNode.id;
      
      console.log('Processing text node ID:', nodeId, 'Text:', normalizedCurrentText);
      
      // Look for translation - first by node ID, then by text content
      var translation = null;
      
      // Priority 1: Match by Node ID (if available in CSV)
      for (var j = 0; j < translations.length; j++) {
        var t = translations[j];
        if (t.nodeId && t.nodeId === nodeId) {
          translation = t;
          console.log('✅ Übersetzung über Node-ID gefunden:', nodeId);
          break;
        }
      }
      
      // Priority 2: Match by text content (fallback)
      if (!translation) {
        for (var k = 0; k < translations.length; k++) {
          var t = translations[k];
          var normalizedSourceText = t.sourceText.replace(/\r\n|\r|\n/g, '\n').trim();
          if (normalizedSourceText === normalizedCurrentText) {
            translation = t;
            console.log('✅ Übersetzung über Text-Inhalt gefunden:', normalizedCurrentText);
            break;
          }
        }
      }
      
      // Apply translation if found and not empty
      if (translation && translation.translatedText && translation.translatedText.trim() !== '') {
        try {
          // Load font before changing text (await the promise)
          await figma.loadFontAsync(textNode.fontName);
          
          // Only change text if translation is different from original
          if (translation.translatedText !== currentText) {
            textNode.characters = translation.translatedText;
            translatedCount++;
            console.log('✅ Text übersetzt:', currentText, '→', translation.translatedText);
          } else {
            console.log('ℹ️ Text ist bereits übersetzt:', currentText);
          }
        } catch (fontError) {
          console.error('Fehler beim Laden der Schriftart:', fontError);
          // Try to change text anyway (might work with default font)
          try {
            textNode.characters = translation.translatedText;
            translatedCount++;
            console.log('⚠️ Text übersetzt ohne Schriftart-Laden:', currentText, '→', translation.translatedText);
          } catch (textError) {
            console.error('Fehler beim Setzen des Textes:', textError);
          }
        }
      } else if (translation && (!translation.translatedText || translation.translatedText.trim() === '')) {
        console.log('⚠️ Leere Übersetzung gefunden für:', currentText, '- Original beibehalten');
      } else {
        console.log('ℹ️ Keine Übersetzung gefunden für:', currentText, '- Original beibehalten');
      }
    } catch (error) {
      console.error('Fehler beim Übersetzen von Text-Node:', error);
    }
  }
  
  return translatedCount;
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
    var nodeId = entry['Node ID'] || entry['Text Node ID'] || ''; // Support multiple column names
    
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
    
    // Add translation with node ID support
    translationsByFile[figmaFileKey][targetLanguage].push({
      sourceText: sourceText,
      translatedText: translatedText,
      frameName: frameName,
      nodeId: nodeId // Add node ID for better matching
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

console.log('Weleda Translation Import Plugin loaded successfully! 🌿');
