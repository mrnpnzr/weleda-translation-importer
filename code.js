// Weleda Translation Import Plugin - Frame Finding Debug
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
    console.log('🚀 Starting import with FRAME FINDING DEBUG...');
    
    // First, let's see what frames are available
    console.log('🔍 AVAILABLE FRAMES ON PAGE:');
    var allFrames = figma.currentPage.findAll(function(node) {
      return node.type === 'FRAME' || node.type === 'COMPONENT';
    });
    
    console.log('📋 Found', allFrames.length, 'frames/components on page "' + figma.currentPage.name + '":');
    for (var x = 0; x < allFrames.length; x++) {
      console.log('  ' + (x + 1) + '. "' + allFrames[x].name + '" (Type: ' + allFrames[x].type + ', ID: ' + allFrames[x].id + ')');
    }
    
    var parsedData = parseTranslations(csvData);
    var framesByLanguage = parsedData.framesByLanguage;
    var detectedLanguages = parsedData.detectedLanguages;
    
    console.log('✅ Parsed data:', Object.keys(framesByLanguage).length, 'frame/language combinations');
    console.log('🎯 Frame/Language keys:', Object.keys(framesByLanguage));
    
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
    var frameSearchResults = [];
    
    // Process each language/frame combination
    for (var languageFrame in framesByLanguage) {
      var parts = languageFrame.split('|');
      var targetLanguage = parts[0];
      var frameName = parts[1];
      var translations = framesByLanguage[languageFrame];
      
      console.log('🔄 PROCESSING:', languageFrame);
      console.log('  - Target Language:', targetLanguage);
      console.log('  - Frame Name from CSV: "' + frameName + '"');
      console.log('  - Translations available:', translations.length);
      
      try {
        figma.ui.postMessage({
          type: 'progress',
          message: 'Suche Frame "' + frameName + '" für Sprache "' + targetLanguage + '"...',
          progress: 20 + (importedCount / totalFramesToProcess) * 60
        });
        
        var frameNode = findFrameByName(frameName);
        
        frameSearchResults.push({
          csvFrameName: frameName,
          found: !!frameNode,
          actualFrameName: frameNode ? frameNode.name : null
        });
        
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
          console.log('❌ FRAME NOT FOUND for: "' + frameName + '"');
        }
      } catch (error) {
        console.error('Fehler bei Frame "' + frameName + '":', error);
      }
    }
    
    // Show frame search summary
    console.log('🔍 FRAME SEARCH SUMMARY:');
    for (var i = 0; i < frameSearchResults.length; i++) {
      var result = frameSearchResults[i];
      if (result.found) {
        console.log('✅ "' + result.csvFrameName + '" → Found: "' + result.actualFrameName + '"');
      } else {
        console.log('❌ "' + result.csvFrameName + '" → NOT FOUND');
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
    
    console.log('\n🔍 AKTUELLE SEITE: "' + figma.currentPage.name + '"');
    console.log('🔍 VERFÜGBARE FRAMES:');
    console.log('=====================================');
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      console.log((i + 1) + '. "' + frame.name + '" (ID: ' + frame.id + ', Type: ' + frame.type + ')');
    }
    
    console.log('\n🔍 CSV-TEMPLATE (nur sichtbare Texte):');
    console.log('=====================================');
    console.log('frame_name,node_id,source_text,target_language,translated_text');
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      
      var allTextNodes = frame.findAll(function(node) {
        return node.type === 'TEXT';
      });
      
      var visibleTextNodes = allTextNodes.filter(function(node) {
        return isNodeTrulyVisible(node);
      });
      
      if (visibleTextNodes.length > 0) {
        console.log('\n// Frame: ' + frame.name + ' (Sichtbare Texte: ' + visibleTextNodes.length + ')');
        for (var j = 0; j < visibleTextNodes.length; j++) {
          var textNode = visibleTextNodes[j];
          var textContent = textNode.characters.replace(/"/g, '""');
          console.log('"' + frame.name + '","' + textNode.id + '","' + textContent + '","de",""');
        }
      }
    }
    
    console.log('\n=====================================');
    
    figma.ui.postMessage({
      type: 'success',
      message: allFrames.length + ' Frame(s) gefunden auf Seite "' + figma.currentPage.name + '". Siehe Console für Details.'
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
  console.log('🔍 DETAILED FRAME SEARCH for: "' + frameName + '"');
  
  var allFrames = figma.currentPage.findAll(function(node) {
    return node.type === 'FRAME' || node.type === 'COMPONENT';
  });
  
  console.log('🔍 Available frames to search in:');
  for (var x = 0; x < allFrames.length; x++) {
    console.log('  ' + (x + 1) + '. "' + allFrames[x].name + '"');
  }
  
  console.log('🔍 Searching for exact match: "' + frameName + '"');
  
  // Exact match first
  for (var i = 0; i < allFrames.length; i++) {
    console.log('🔍 Comparing "' + allFrames[i].name + '" === "' + frameName + '" ?', allFrames[i].name === frameName);
    if (allFrames[i].name === frameName) {
      console.log('✅ EXACT MATCH FOUND: "' + allFrames[i].name + '"');
      return allFrames[i];
    }
  }
  
  console.log('🔍 No exact match, trying partial matches...');
  
  // Partial match as fallback
  for (var j = 0; j < allFrames.length; j++) {
    var frameContainsSearch = allFrames[j].name.indexOf(frameName) !== -1;
    var searchContainsFrame = frameName.indexOf(allFrames[j].name) !== -1;
    
    console.log('🔍 Partial match check for "' + allFrames[j].name + '":');
    console.log('  - Frame contains search: ' + frameContainsSearch);
    console.log('  - Search contains frame: ' + searchContainsFrame);
    
    if (frameContainsSearch || searchContainsFrame) {
      console.log('✅ PARTIAL MATCH FOUND: "' + allFrames[j].name + '"');
      return allFrames[j];
    }
  }
  
  console.log('❌ NO MATCH FOUND for: "' + frameName + '"');
  console.log('❌ Available frame names are:');
  for (var z = 0; z < allFrames.length; z++) {
    console.log('  - "' + allFrames[z].name + '"');
  }
  
  return null;
}

async function applyTranslations(frame, translations) {
  var translatedCount = 0;
  
  console.log('🎯 Applying translations to frame:', frame.name);
  console.log('🎯 Translations available:', translations.length);
  
  // Quick translation application for now
  var translationMap = {};
  for (var i = 0; i < translations.length; i++) {
    var t = translations[i];
    if (t.nodeId && t.translatedText && t.translatedText.trim() !== '') {
      translationMap[t.nodeId] = t;
    }
  }
  
  var visibleTextNodes = frame.findAll(function(node) {
    return node.type === 'TEXT' && isNodeTrulyVisible(node);
  });
  
  for (var i = 0; i < visibleTextNodes.length; i++) {
    var textNode = visibleTextNodes[i];
    var translation = translationMap[textNode.id];
    
    if (translation) {
      try {
        await figma.loadFontAsync(textNode.fontName);
        textNode.characters = translation.translatedText;
        translatedCount++;
      } catch (error) {
        console.error('Translation error:', error);
      }
    }
  }
  
  console.log('🎯 Translation completed:', translatedCount, 'texts translated');
  return translatedCount;
}

function parseTranslations(csvData) {
  console.log('📄 PARSING CSV...');
  console.log('📄 CSV first 800 characters:');
  console.log(csvData.substring(0, 800));
  console.log('📄 =====================================');
  
  var lines = csvData.split('\n');
  console.log('📄 Total lines in CSV:', lines.length);
  
  if (lines.length < 2) {
    throw new Error('CSV muss mindestens Header und eine Datenzeile enthalten');
  }
  
  // Parse headers
  var headers = parseCSVLine(lines[0]).map(function(h) {
    return h.replace(/"/g, '').trim().toLowerCase();
  });
  
  console.log('📄 Headers found:', headers);
  
  // Find column indices
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
  var processedRows = 0;
  
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
    
    if (processedRows < 5) {
      console.log('📄 Sample row ' + i + ':', {
        frameName: frameName,
        nodeId: nodeId,
        sourceText: sourceText.substring(0, 20) + '...',
        targetLanguage: targetLanguage,
        translatedText: translatedText.substring(0, 20) + '...'
      });
    }
    
    if (!frameName || !nodeId || !sourceText || !targetLanguage) {
      continue;
    }
    
    if (detectedLanguages.indexOf(targetLanguage) === -1) {
      detectedLanguages.push(targetLanguage);
    }
    
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
    
    processedRows++;
  }
  
  console.log('📄 PARSING RESULTS:');
  console.log('  - Processed rows: ' + processedRows);
  console.log('  - Detected languages: ' + detectedLanguages.join(', '));
  console.log('  - Frame/Language combinations: ' + Object.keys(framesByLanguage).length);
  console.log('  - Frame names from CSV:');
  
  var uniqueFrameNames = [];
  for (var key in framesByLanguage) {
    var frameName = key.split('|')[1];
    if (uniqueFrameNames.indexOf(frameName) === -1) {
      uniqueFrameNames.push(frameName);
      console.log('    - "' + frameName + '"');
    }
  }
  
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
