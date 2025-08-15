// Weleda Translation Import Plugin - Optimized for Simple CSV
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
    var framesByLanguage = parsedData.framesByLanguage;
    var detectedLanguages = parsedData.detectedLanguages;
    
    if (Object.keys(framesByLanguage).length === 0) {
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
    var totalFramesToProcess = Object.keys(framesByLanguage).length;
    
    // Process each language/frame combination
    for (var languageFrame in framesByLanguage) {
      var parts = languageFrame.split('|');
      var targetLanguage = parts[0];
      var frameName = parts[1];
      var translations = framesByLanguage[languageFrame];
      
      try {
        figma.ui.postMessage({
          type: 'progress',
          message: 'Suche Frame "' + frameName + '" für Sprache "' + targetLanguage + '"...',
          progress: 20 + (importedCount / totalFramesToProcess) * 60
        });
        
        var frameNode = findFrameByName(frameName);
        if (frameNode) {
          var duplicatedFrame = frameNode.clone();
          duplicatedFrame.name = frameNode.name + ' - ' + targetLanguage;
          
          // Position the duplicated frame next to the original
          duplicatedFrame.x = frameNode.x + frameNode.width + 100;
          duplicatedFrame.y = frameNode.y;
          
          figma.ui.postMessage({
            type: 'progress',
            message: 'Übersetze Texte in "' + duplicatedFrame.name + '"...',
            progress: 30 + (importedCount / totalFramesToProcess) * 60
          });
          
          // Apply translations to the duplicated frame
          var translatedCount = await applyTranslations(duplicatedFrame, translations);
          
          importDetails.push({
            frameName: duplicatedFrame.name,
            language: targetLanguage,
            translatedTexts: translatedCount
          });
          
          importedCount++;
          
          console.log('✅ Frame erstellt: "' + duplicatedFrame.name + '" mit ' + translatedCount + ' übersetzten Texten');
        } else {
          console.log('❌ Frame nicht gefunden: "' + frameName + '"');
        }
      } catch (error) {
        console.error('Fehler bei Frame "' + frameName + '":', error);
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
    
    console.log('\n🔍 CSV-EXPORT-DATEN:');
    console.log('=====================================');
    console.log('frame_name,node_id,source_text,target_language,translated_text');
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      
      // Find all text nodes in this frame
      var textNodes = frame.findAll(function(node) {
        return node.type === 'TEXT';
      });
      
      if (textNodes.length > 0) {
        console.log('\n// Frame: ' + frame.name);
        for (var j = 0; j < textNodes.length; j++) {
          var textNode = textNodes[j];
          var textContent = textNode.characters.replace(/"/g, '""'); // Escape quotes
          console.log('"' + frame.name + '","' + textNode.id + '","' + textContent + '","de",""');
        }
      }
    }
    
    console.log('\n=====================================');
    console.log('📄 Kopiere die CSV-Zeilen oben und füge deine Übersetzungen hinzu!');
    
    figma.ui.postMessage({
      type: 'success',
      message: 'CSV-Template in der Console ausgegeben. Öffne die Console (F12) um es zu kopieren.'
    });
    
  } catch (error) {
    console.error('Error getting frame IDs:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Fehler beim Abrufen der Frame-IDs: ' + error.message
    });
  }
}

function findFrameByName(frameName) {
  var allFrames = figma.currentPage.findAll(function(node) {
    return node.type === 'FRAME' || node.type === 'COMPONENT';
  });
  
  // Exact match first
  for (var i = 0; i < allFrames.length; i++) {
    if (allFrames[i].name === frameName) {
      console.log('✅ Frame über Namen gefunden: "' + allFrames[i].name + '"');
      return allFrames[i];
    }
  }
  
  // Partial match as fallback
  for (var j = 0; j < allFrames.length; j++) {
    if (allFrames[j].name.indexOf(frameName) !== -1 || 
        frameName.indexOf(allFrames[j].name) !== -1) {
      console.log('✅ Frame über Teilübereinstimmung gefunden: "' + allFrames[j].name + '"');
      return allFrames[j];
    }
  }
  
  console.log('❌ Frame nicht gefunden: "' + frameName + '"');
  return null;
}

async function applyTranslations(frame, translations) {
  var translatedCount = 0;
  
  // Create a lookup map for faster node ID matching
  var translationMap = {};
  for (var i = 0; i < translations.length; i++) {
    var t = translations[i];
    if (t.nodeId) {
      translationMap[t.nodeId] = t;
    }
  }
  
  // Find all text nodes in the frame recursively
  var textNodes = frame.findAll(function(node) {
    return node.type === 'TEXT';
  });
  
  console.log('Gefunden: ' + textNodes.length + ' Text-Nodes in Frame "' + frame.name + '"');
  console.log('Verfügbare Übersetzungen:', Object.keys(translationMap).length);
  
  // Process text nodes sequentially
  for (var i = 0; i < textNodes.length; i++) {
    var textNode = textNodes[i];
    
    try {
      var nodeId = textNode.id;
      var currentText = textNode.characters;
      
      console.log('Processing Node ID:', nodeId, '| Text:', currentText.substring(0, 50) + '...');
      
      // Look for translation by node ID
      var translation = translationMap[nodeId];
      
      if (translation) {
        console.log('✅ Übersetzung gefunden für Node ID:', nodeId);
        
        // Apply translation if it's not empty
        if (translation.translatedText && translation.translatedText.trim() !== '') {
          try {
            // Load font before changing text
            await figma.loadFontAsync(textNode.fontName);
            
            // Apply the translation
            textNode.characters = translation.translatedText;
            translatedCount++;
            
            console.log('✅ Text übersetzt:', currentText.substring(0, 30) + '...', '→', translation.translatedText.substring(0, 30) + '...');
          } catch (fontError) {
            console.error('Fehler beim Laden der Schriftart:', fontError);
            // Try without font loading
            try {
              textNode.characters = translation.translatedText;
              translatedCount++;
              console.log('⚠️ Text übersetzt ohne Schriftart-Laden');
            } catch (textError) {
              console.error('Fehler beim Setzen des Textes:', textError);
            }
          }
        } else {
          console.log('ℹ️ Leere Übersetzung für Node ID:', nodeId, '- Original beibehalten');
        }
      } else {
        console.log('ℹ️ Keine Übersetzung für Node ID:', nodeId, '- Original beibehalten');
      }
    } catch (error) {
      console.error('Fehler beim Übersetzen von Text-Node:', error);
    }
  }
  
  console.log('🎯 Übersetzung abgeschlossen:', translatedCount, 'von', textNodes.length, 'Texten übersetzt');
  return translatedCount;
}

function parseTranslations(csvData) {
  console.log('📄 Parsing CSV with simple structure...');
  
  var lines = csvData.split('\n');
  var expectedHeaders = ['frame_name', 'node_id', 'source_text', 'target_language', 'translated_text'];
  
  if (lines.length < 2) {
    throw new Error('CSV muss mindestens Header und eine Datenzeile enthalten');
  }
  
  // Parse headers
  var headers = parseCSVLine(lines[0]).map(function(h) {
    return h.replace(/"/g, '').trim().toLowerCase();
  });
  
  console.log('📋 Gefundene Headers:', headers);
  console.log('📋 Erwartete Headers:', expectedHeaders);
  
  // Validate headers
  for (var h = 0; h < expectedHeaders.length; h++) {
    if (headers.indexOf(expectedHeaders[h]) === -1) {
      throw new Error('Fehlender Header: ' + expectedHeaders[h] + '. Gefunden: ' + headers.join(', '));
    }
  }
  
  var framesByLanguage = {};
  var detectedLanguages = [];
  
  // Parse data rows
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    
    var values = parseCSVLine(line);
    if (values.length < headers.length) continue;
    
    // Create entry object
    var entry = {};
    for (var j = 0; j < headers.length; j++) {
      entry[headers[j]] = values[j] ? values[j].replace(/"/g, '').trim() : '';
    }
    
    var frameName = entry.frame_name;
    var nodeId = entry.node_id;
    var sourceText = entry.source_text;
    var targetLanguage = entry.target_language;
    var translatedText = entry.translated_text;
    
    // Validate required fields
    if (!frameName || !nodeId || !sourceText || !targetLanguage) {
      console.log('⚠️ Zeile', i, 'übersprungen - fehlende Pflichtfelder');
      continue;
    }
    
    // Track detected languages
    if (detectedLanguages.indexOf(targetLanguage) === -1) {
      detectedLanguages.push(targetLanguage);
    }
    
    // Group by language and frame
    var key = targetLanguage + '|' + frameName;
    if (!framesByLanguage[key]) {
      framesByLanguage[key] = [];
    }
    
    framesByLanguage[key].push({
      nodeId: nodeId,
      sourceText: sourceText,
      translatedText: translatedText,
      frameName: frameName
    });
    
    console.log('✅ Translation entry added:', frameName, nodeId, targetLanguage);
  }
  
  console.log('📊 Parse complete:');
  console.log('  - Languages:', detectedLanguages);
  console.log('  - Frame/Language combinations:', Object.keys(framesByLanguage).length);
  
  return {
    framesByLanguage: framesByLanguage,
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
