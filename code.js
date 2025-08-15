// Weleda Translation Import Plugin - Fixed for Frame ID Search
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
    console.log('🚀 Starting import with Frame ID search...');
    
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
      var frameIdentifier = parts[1]; // Could be name or ID
      var translations = framesByLanguage[languageFrame];
      
      console.log('🔄 Processing:', languageFrame);
      console.log('  - Target Language:', targetLanguage);
      console.log('  - Frame Identifier:', frameIdentifier);
      console.log('  - Translations available:', translations.length);
      
      try {
        figma.ui.postMessage({
          type: 'progress',
          message: 'Suche Frame "' + frameIdentifier + '" für Sprache "' + targetLanguage + '"...',
          progress: 20 + (importedCount / totalFramesToProcess) * 60
        });
        
        // Try to find frame by ID first, then by name
        var frameNode = findFrameByIdOrName(frameIdentifier);
        
        if (frameNode) {
          console.log('✅ FRAME FOUND! Creating duplicate...');
          
          var duplicatedFrame = frameNode.clone();
          duplicatedFrame.name = frameNode.name + ' - ' + targetLanguage;
          
          // Position the duplicated frame next to the original
          duplicatedFrame.x = frameNode.x + frameNode.width + 100;
          duplicatedFrame.y = frameNode.y;
          
          console.log('✅ Duplicate created: "' + duplicatedFrame.name + '"');
          
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
          console.log('❌ FRAME NOT FOUND for: "' + frameIdentifier + '"');
        }
      } catch (error) {
        console.error('Fehler bei Frame "' + frameIdentifier + '":', error);
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
    
    console.log('\n🔍 VERFÜGBARE FRAMES:');
    console.log('=====================================');
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      console.log((i + 1) + '. Name: "' + frame.name + '" | ID: "' + frame.id + '"');
    }
    
    console.log('\n🔍 CSV-TEMPLATE (mit Frame-IDs):');
    console.log('=====================================');
    console.log('frame_name,node_id,source_text,target_language,translated_text');
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      
      var visibleTextNodes = frame.findAll(function(node) {
        return node.type === 'TEXT' && isNodeTrulyVisible(node);
      });
      
      if (visibleTextNodes.length > 0) {
        console.log('\n// Frame: ' + frame.name + ' (ID: ' + frame.id + ')');
        for (var j = 0; j < visibleTextNodes.length; j++) {
          var textNode = visibleTextNodes[j];
          var textContent = textNode.characters.replace(/"/g, '""');
          console.log('"' + frame.id + '","' + textNode.id + '","' + textContent + '","de",""');
        }
      }
    }
    
    console.log('\n=====================================');
    console.log('💡 HINWEIS: Nutze Frame-IDs statt Namen für bessere Zuordnung!');
    
    figma.ui.postMessage({
      type: 'success',
      message: allFrames.length + ' Frame(s) gefunden. Siehe Console für Frame-IDs und Namen.'
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
  if (node.visible === false) return false;
  if (node.opacity !== undefined && node.opacity < 0.01) return false;
  
  if (node.type === "TEXT") {
    var hasFills = node.fills && node.fills.length > 0 && node.fills.some(function(fill) {
      return fill.visible !== false && fill.opacity > 0;
    });
    
    var hasStrokes = node.strokes && node.strokes.length > 0 && node.strokes.some(function(stroke) {
      return stroke.visible !== false && stroke.opacity > 0;
    });
    
    if (!hasFills && !hasStrokes) return false;
  }
  
  return true;
}

// NEW: Enhanced frame finding function that searches by ID first, then name
function findFrameByIdOrName(identifier) {
  console.log('🔍 ENHANCED FRAME SEARCH for: "' + identifier + '"');
  
  var allFrames = figma.currentPage.findAll(function(node) {
    return node.type === 'FRAME' || node.type === 'COMPONENT';
  });
  
  console.log('🔍 Available frames:');
  for (var x = 0; x < allFrames.length; x++) {
    console.log('  ' + (x + 1) + '. Name: "' + allFrames[x].name + '" | ID: "' + allFrames[x].id + '"');
  }
  
  // PRIORITY 1: Search by Frame ID (exact match)
  console.log('🔍 Step 1: Searching by Frame ID...');
  for (var i = 0; i < allFrames.length; i++) {
    if (allFrames[i].id === identifier) {
      console.log('✅ FRAME FOUND BY ID: "' + allFrames[i].name + '" (ID: ' + allFrames[i].id + ')');
      return allFrames[i];
    }
  }
  
  // PRIORITY 2: Search by Frame Name (exact match)
  console.log('🔍 Step 2: Searching by Frame Name...');
  for (var j = 0; j < allFrames.length; j++) {
    if (allFrames[j].name === identifier) {
      console.log('✅ FRAME FOUND BY NAME: "' + allFrames[j].name + '" (ID: ' + allFrames[j].id + ')');
      return allFrames[j];
    }
  }
  
  // PRIORITY 3: Search by partial matches
  console.log('🔍 Step 3: Searching by partial matches...');
  for (var k = 0; k < allFrames.length; k++) {
    var frameContainsIdentifier = allFrames[k].name.indexOf(identifier) !== -1;
    var identifierContainsFrame = identifier.indexOf(allFrames[k].name) !== -1;
    
    if (frameContainsIdentifier || identifierContainsFrame) {
      console.log('✅ FRAME FOUND BY PARTIAL MATCH: "' + allFrames[k].name + '" (ID: ' + allFrames[k].id + ')');
      return allFrames[k];
    }
  }
  
  console.log('❌ NO FRAME FOUND for identifier: "' + identifier + '"');
  return null;
}

async function applyTranslations(frame, translations) {
  var translatedCount = 0;
  
  console.log('🎯 Applying translations to frame:', frame.name);
  console.log('🎯 Translations available:', translations.length);
  
  // Create translation map - only for non-empty translations
  var translationMap = {};
  var validTranslations = 0;
  
  for (var i = 0; i < translations.length; i++) {
    var t = translations[i];
    if (t.nodeId && t.translatedText && t.translatedText.trim() !== '') {
      translationMap[t.nodeId] = t;
      validTranslations++;
    }
  }
  
  console.log('📊 Valid translations with text:', validTranslations);
  
  // Find visible text nodes in frame
  var visibleTextNodes = frame.findAll(function(node) {
    return node.type === 'TEXT' && isNodeTrulyVisible(node);
  });
  
  console.log('📊 Visible text nodes in frame:', visibleTextNodes.length);
  
  // Apply translations
  for (var i = 0; i < visibleTextNodes.length; i++) {
    var textNode = visibleTextNodes[i];
    var translation = translationMap[textNode.id];
    
    if (translation) {
      try {
        console.log('🔄 Translating node ' + textNode.id + ': "' + textNode.characters + '" → "' + translation.translatedText + '"');
        
        await figma.loadFontAsync(textNode.fontName);
        textNode.characters = translation.translatedText;
        translatedCount++;
        
        console.log('✅ Translation applied successfully');
        
      } catch (error) {
        console.error('❌ Translation error:', error);
        // Try without font loading
        try {
          textNode.characters = translation.translatedText;
          translatedCount++;
          console.log('⚠️ Translation applied without font loading');
        } catch (textError) {
          console.error('❌ Failed to set text:', textError);
        }
      }
    } else {
      console.log('ℹ️ No translation for node ' + textNode.id + ' - keeping original');
    }
  }
  
  console.log('🎯 Translation completed:', translatedCount, 'of', visibleTextNodes.length, 'texts translated');
  return translatedCount;
}

function parseTranslations(csvData) {
  console.log('📄 Parsing CSV...');
  
  var lines = csvData.split('\n');
  if (lines.length < 2) {
    throw new Error('CSV muss mindestens Header und eine Datenzeile enthalten');
  }
  
  // Parse headers
  var headers = parseCSVLine(lines[0]).map(function(h) {
    return h.replace(/"/g, '').trim().toLowerCase();
  });
  
  console.log('📄 Headers found:', headers);
  
  // Find column indices flexibly
  var requiredColumns = {
    frameName: -1,
    nodeId: -1,
    sourceText: -1,
    targetLanguage: -1,
    translatedText: -1
  };
  
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (header === 'frame_name' || header.indexOf('frame') !== -1) {
      requiredColumns.frameName = i;
    } else if (header === 'node_id' || header.indexOf('node') !== -1) {
      requiredColumns.nodeId = i;
    } else if (header === 'source_text' || header.indexOf('source') !== -1) {
      requiredColumns.sourceText = i;
    } else if (header === 'target_language' || header.indexOf('language') !== -1) {
      requiredColumns.targetLanguage = i;
    } else if (header === 'translated_text' || header.indexOf('translated') !== -1) {
      requiredColumns.translatedText = i;
    }
  }
  
  console.log('📄 Column mapping:', requiredColumns);
  
  // Validate columns
  for (var key in requiredColumns) {
    if (requiredColumns[key] === -1) {
      throw new Error('Required column not found: ' + key);
    }
  }
  
  var framesByLanguage = {};
  var detectedLanguages = [];
  var validRows = 0;
  
  // Parse data rows
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    
    var values = parseCSVLine(line);
    if (values.length < headers.length) continue;
    
    var frameName = values[requiredColumns.frameName] ? values[requiredColumns.frameName].replace(/"/g, '').trim() : '';
    var nodeId = values[requiredColumns.nodeId] ? values[requiredColumns.nodeId].replace(/"/g, '').trim() : '';
    var sourceText = values[requiredColumns.sourceText] ? values[requiredColumns.sourceText].replace(/"/g, '').trim() : '';
    var targetLanguage = values[requiredColumns.targetLanguage] ? values[requiredColumns.targetLanguage].replace(/"/g, '').trim() : '';
    var translatedText = values[requiredColumns.translatedText] ? values[requiredColumns.translatedText].replace(/"/g, '').trim() : '';
    
    if (!frameName || !nodeId || !sourceText || !targetLanguage) {
      continue;
    }
    
    if (detectedLanguages.indexOf(targetLanguage) === -1) {
      detectedLanguages.push(targetLanguage);
    }
    
    // Use frameName (which might be ID) as the key
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
  
  console.log('📄 Parsing complete:');
  console.log('  - Valid rows: ' + validRows);
  console.log('  - Languages: ' + detectedLanguages.join(', '));
  console.log('  - Frame identifiers: ' + Object.keys(framesByLanguage).map(function(k) { return k.split('|')[1]; }).join(', '));
  
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
