// Weleda Translation Import Plugin - Flexible CSV Parser
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
    console.log('🚀 Starting import with flexible CSV parser...');
    
    var parsedData = parseTranslations(csvData);
    var framesByLanguage = parsedData.framesByLanguage;
    var detectedLanguages = parsedData.detectedLanguages;
    
    console.log('✅ Parsed data:', Object.keys(framesByLanguage).length, 'frame/language combinations');
    
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
      
      console.log('🔄 Processing frame:', frameName, 'Language:', targetLanguage);
      console.log('🔄 Translations for this frame:', translations.length);
      
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
      
      // Find all visible text nodes in this frame
      var allTextNodes = frame.findAll(function(node) {
        return node.type === 'TEXT';
      });
      
      var visibleTextNodes = allTextNodes.filter(function(node) {
        return isNodeTrulyVisible(node);
      });
      
      if (visibleTextNodes.length > 0) {
        console.log('\n// Frame: ' + frame.name);
        for (var j = 0; j < visibleTextNodes.length; j++) {
          var textNode = visibleTextNodes[j];
          var textContent = textNode.characters.replace(/"/g, '""'); // Escape quotes
          console.log('"' + frame.name + '","' + textNode.id + '","' + textContent + '","de",""');
        }
      }
    }
    
    console.log('\n=====================================');
    console.log('📄 Kopiere diese Zeilen für den CSV-Import!');
    
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

function isNodeTrulyVisible(node) {
  if (node.visible === false) {
    return false;
  }
  
  if (node.opacity !== undefined && node.opacity < 0.01) {
    return false;
  }
  
  if (node.type === "TEXT") {
    var hasFills = node.fills && node.fills.length > 0 && node.fills.some(function(fill) {
      return fill.visible !== false && fill.opacity > 0;
    });
    
    var hasStrokes = node.strokes && node.strokes.length > 0 && node.strokes.some(function(stroke) {
      return stroke.visible !== false && stroke.opacity > 0;
    });
    
    if (!hasFills && !hasStrokes) {
      return false;
    }
  }
  
  return true;
}

function findFrameByName(frameName) {
  var allFrames = figma.currentPage.findAll(function(node) {
    return node.type === 'FRAME' || node.type === 'COMPONENT';
  });
  
  // Exact match first
  for (var i = 0; i < allFrames.length; i++) {
    if (allFrames[i].name === frameName) {
      console.log('✅ Frame gefunden: "' + allFrames[i].name + '"');
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
  
  console.log('🎯 SUPER DEBUG: Starting translation application');
  console.log('🎯 Frame:', frame.name);
  console.log('🎯 Translations available:', translations.length);
  
  // Create a lookup map and show what we have
  var translationMap = {};
  var validTranslations = 0;
  var emptyTranslations = 0;
  
  for (var i = 0; i < translations.length; i++) {
    var t = translations[i];
    console.log('🔍 Processing translation entry:', {
      nodeId: t.nodeId,
      sourceText: t.sourceText ? t.sourceText.substring(0, 30) + '...' : 'EMPTY',
      translatedText: t.translatedText ? t.translatedText.substring(0, 30) + '...' : 'EMPTY',
      hasValidTranslation: !!(t.translatedText && t.translatedText.trim() !== '')
    });
    
    if (t.nodeId) {
      if (t.translatedText && t.translatedText.trim() !== '') {
        translationMap[t.nodeId] = t;
        validTranslations++;
        console.log('✅ Valid translation mapped for nodeId:', t.nodeId);
      } else {
        emptyTranslations++;
        console.log('⚠️ Empty translation ignored for nodeId:', t.nodeId);
      }
    } else {
      console.log('❌ No nodeId found in translation entry');
    }
  }
  
  console.log('📊 Translation mapping summary:');
  console.log('  - Valid translations with text: ' + validTranslations);
  console.log('  - Empty translations ignored: ' + emptyTranslations);
  console.log('  - Translation map keys: [' + Object.keys(translationMap).join(', ') + ']');
  
  // Find text nodes in frame
  var allTextNodes = frame.findAll(function(node) {
    return node.type === 'TEXT';
  });
  
  var visibleTextNodes = allTextNodes.filter(function(node) {
    return isNodeTrulyVisible(node);
  });
  
  console.log('📊 Text nodes in frame:');
  console.log('  - Total text nodes: ' + allTextNodes.length);
  console.log('  - Visible text nodes: ' + visibleTextNodes.length);
  
  // Show all text nodes for debugging
  for (var x = 0; x < visibleTextNodes.length; x++) {
    var node = visibleTextNodes[x];
    var hasTranslation = !!translationMap[node.id];
    console.log('📝 Text Node ' + (x + 1) + ':', {
      id: node.id,
      text: node.characters.substring(0, 50) + '...',
      hasTranslation: hasTranslation,
      translationText: hasTranslation ? translationMap[node.id].translatedText.substring(0, 30) + '...' : 'N/A'
    });
  }
  
  // Apply translations
  for (var i = 0; i < visibleTextNodes.length; i++) {
    var textNode = visibleTextNodes[i];
    
    try {
      var nodeId = textNode.id;
      var currentText = textNode.characters;
      
      console.log('🔄 PROCESSING NODE:', nodeId);
      console.log('  - Current text: "' + currentText + '"');
      
      var translation = translationMap[nodeId];
      
      if (translation) {
        console.log('  - Found translation: "' + translation.translatedText + '"');
        console.log('  - Will change text from "' + currentText + '" to "' + translation.translatedText + '"');
        
        try {
          // Load font
          await figma.loadFontAsync(textNode.fontName);
          console.log('  - Font loaded successfully');
          
          // CRITICAL: Apply the translation
          textNode.characters = translation.translatedText;
          
          // Verify the change
          var newText = textNode.characters;
          console.log('  - Text after change: "' + newText + '"');
          console.log('  - Change successful: ' + (newText === translation.translatedText));
          
          if (newText === translation.translatedText) {
            translatedCount++;
            console.log('✅ SUCCESS: Text node ' + nodeId + ' translated successfully!');
          } else {
            console.log('❌ FAILED: Text did not change as expected!');
          }
          
        } catch (fontError) {
          console.error('⚠️ Font error:', fontError);
          try {
            textNode.characters = translation.translatedText;
            translatedCount++;
            console.log('✅ SUCCESS: Text translated without font loading');
          } catch (textError) {
            console.error('❌ Text setting error:', textError);
          }
        }
      } else {
        console.log('  - No translation found for this node');
      }
    } catch (error) {
      console.error('❌ Error processing node:', error);
    }
    
    console.log('---'); // Separator
  }
  
  console.log('🎯 FINAL RESULT:');
  console.log('  - Visible nodes processed: ' + visibleTextNodes.length);
  console.log('  - Successfully translated: ' + translatedCount);
  console.log('  - Success rate: ' + Math.round((translatedCount / visibleTextNodes.length) * 100) + '%');
  
  return translatedCount;
}

function parseTranslations(csvData) {
  console.log('📄 FLEXIBLE CSV PARSING...');
  console.log('📄 CSV length:', csvData.length);
  console.log('📄 CSV preview:', csvData.substring(0, 500));
  
  var lines = csvData.split('\n');
  console.log('📄 Total lines found:', lines.length);
  
  if (lines.length < 2) {
    throw new Error('CSV muss mindestens Header und eine Datenzeile enthalten');
  }
  
  // Parse headers - flexible approach
  var headers = parseCSVLine(lines[0]).map(function(h) {
    return h.replace(/"/g, '').trim().toLowerCase();
  });
  
  console.log('📄 All headers found:', headers);
  
  // Find required column indices
  var requiredColumns = {
    frameName: -1,
    nodeId: -1,
    sourceText: -1,
    targetLanguage: -1,
    translatedText: -1
  };
  
  // Look for frame name column
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (header === 'frame_name' || header === 'framename' || header.indexOf('frame') !== -1) {
      requiredColumns.frameName = i;
    } else if (header === 'node_id' || header === 'nodeid' || header.indexOf('node') !== -1) {
      requiredColumns.nodeId = i;
    } else if (header === 'source_text' || header === 'sourcetext' || header.indexOf('source') !== -1) {
      requiredColumns.sourceText = i;
    } else if (header === 'target_language' || header === 'targetlanguage' || header.indexOf('language') !== -1) {
      requiredColumns.targetLanguage = i;
    } else if (header === 'translated_text' || header === 'translatedtext' || header.indexOf('translated') !== -1) {
      requiredColumns.translatedText = i;
    }
  }
  
  console.log('📄 Column mapping:', requiredColumns);
  
  // Validate that all required columns were found
  for (var key in requiredColumns) {
    if (requiredColumns[key] === -1) {
      throw new Error('Required column not found: ' + key + '. Available headers: ' + headers.join(', '));
    }
  }
  
  var framesByLanguage = {};
  var detectedLanguages = [];
  var validRows = 0;
  var emptyTranslationRows = 0;
  
  // Parse data rows
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    
    var values = parseCSVLine(line);
    if (values.length < headers.length) {
      console.log('⚠️ Line', i, 'has insufficient columns, skipping');
      continue;
    }
    
    // Extract values using column indices
    var frameName = values[requiredColumns.frameName] ? values[requiredColumns.frameName].replace(/"/g, '').trim() : '';
    var nodeId = values[requiredColumns.nodeId] ? values[requiredColumns.nodeId].replace(/"/g, '').trim() : '';
    var sourceText = values[requiredColumns.sourceText] ? values[requiredColumns.sourceText].replace(/"/g, '').trim() : '';
    var targetLanguage = values[requiredColumns.targetLanguage] ? values[requiredColumns.targetLanguage].replace(/"/g, '').trim() : '';
    var translatedText = values[requiredColumns.translatedText] ? values[requiredColumns.translatedText].replace(/"/g, '').trim() : '';
    
    console.log('📄 Row', i, 'extracted:', {
      frameName: frameName,
      nodeId: nodeId,
      sourceText: sourceText.substring(0, 30) + '...',
      targetLanguage: targetLanguage,
      translatedText: translatedText.substring(0, 30) + '...',
      hasTranslation: !!(translatedText && translatedText.trim() !== '')
    });
    
    // Validate required fields
    if (!frameName || !nodeId || !sourceText || !targetLanguage) {
      console.log('⚠️ Line', i, 'missing required fields, skipping');
      continue;
    }
    
    // Track empty translations
    if (!translatedText || translatedText.trim() === '') {
      emptyTranslationRows++;
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
    
    validRows++;
  }
  
  console.log('📄 PARSING COMPLETE:');
  console.log('  - Valid rows processed: ' + validRows);
  console.log('  - Empty translations: ' + emptyTranslationRows);
  console.log('  - Detected languages: ' + detectedLanguages.join(', '));
  console.log('  - Frame/Language combinations: ' + Object.keys(framesByLanguage).length);
  
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
