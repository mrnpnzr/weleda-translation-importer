// Weleda Translation Import Plugin - Fixed for Visible Texts Only
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
    console.log('🚀 Starting import...');
    
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
    
    console.log('\n🔍 CSV-EXPORT-DATEN (NUR SICHTBARE TEXTE):');
    console.log('=====================================');
    console.log('frame_name,node_id,source_text,target_language,translated_text');
    
    var totalVisibleTexts = 0;
    var totalHiddenTexts = 0;
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      
      // Find all text nodes in this frame
      var allTextNodes = frame.findAll(function(node) {
        return node.type === 'TEXT';
      });
      
      // Filter for visible text nodes only
      var visibleTextNodes = allTextNodes.filter(function(node) {
        return isNodeTrulyVisible(node);
      });
      
      totalVisibleTexts += visibleTextNodes.length;
      totalHiddenTexts += (allTextNodes.length - visibleTextNodes.length);
      
      if (visibleTextNodes.length > 0) {
        console.log('\n// Frame: ' + frame.name + ' (Sichtbar: ' + visibleTextNodes.length + ', Versteckt: ' + (allTextNodes.length - visibleTextNodes.length) + ')');
        for (var j = 0; j < visibleTextNodes.length; j++) {
          var textNode = visibleTextNodes[j];
          var textContent = textNode.characters.replace(/"/g, '""'); // Escape quotes
          console.log('"' + frame.name + '","' + textNode.id + '","' + textContent + '","de",""');
        }
      }
    }
    
    console.log('\n=====================================');
    console.log('📊 STATISTIK:');
    console.log('- Sichtbare Texte: ' + totalVisibleTexts);
    console.log('- Versteckte Texte: ' + totalHiddenTexts);
    console.log('- Gesamt: ' + (totalVisibleTexts + totalHiddenTexts));
    console.log('📄 Nutze DIESE Node-IDs für sichtbare Texte!');
    
    figma.ui.postMessage({
      type: 'success',
      message: totalVisibleTexts + ' sichtbare Text-Node-IDs in der Console ausgegeben. ' + totalHiddenTexts + ' versteckte Texte ignoriert.'
    });
    
  } catch (error) {
    console.error('Error getting frame IDs:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Fehler beim Abrufen der Frame-IDs: ' + error.message
    });
  }
}

// Verbesserte Sichtbarkeitsprüfung
function isNodeTrulyVisible(node) {
  // Direkte Sichtbarkeitsprüfung
  if (node.visible === false) {
    return false;
  }
  
  // Opacity-Prüfung (sehr niedrige Opacity = effektiv unsichtbar)
  if (node.opacity !== undefined && node.opacity < 0.01) {
    return false;
  }
  
  // Text-spezifische Prüfungen
  if (node.type === "TEXT") {
    // Prüfe Fills (Textfarben)
    var hasFills = node.fills && node.fills.length > 0 && node.fills.some(function(fill) {
      return fill.visible !== false && fill.opacity > 0;
    });
    
    // Prüfe Strokes (Umrandungen)
    var hasStrokes = node.strokes && node.strokes.length > 0 && node.strokes.some(function(stroke) {
      return stroke.visible !== false && stroke.opacity > 0;
    });
    
    // Text ohne sichtbare Fills oder Strokes ist effektiv unsichtbar
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
  
  console.log('🎯 Starting translation for frame:', frame.name);
  console.log('🎯 Available translations:', translations.length);
  
  // Create a lookup map for faster node ID matching - ONLY for non-empty translations
  var translationMap = {};
  var emptyTranslations = 0;
  
  for (var i = 0; i < translations.length; i++) {
    var t = translations[i];
    if (t.nodeId) {
      if (t.translatedText && t.translatedText.trim() !== '') {
        translationMap[t.nodeId] = t;
        console.log('📝 Valid translation mapped:', t.nodeId, '→', t.translatedText.substring(0, 30) + '...');
      } else {
        emptyTranslations++;
        console.log('⚠️ Empty translation ignored:', t.nodeId, '(probably hidden text)');
      }
    }
  }
  
  console.log('📊 Translation map summary:');
  console.log('  - Valid translations: ' + Object.keys(translationMap).length);
  console.log('  - Empty translations (ignored): ' + emptyTranslations);
  
  // Find all text nodes in the frame recursively - ONLY VISIBLE ONES
  var allTextNodes = frame.findAll(function(node) {
    return node.type === 'TEXT';
  });
  
  var visibleTextNodes = allTextNodes.filter(function(node) {
    return isNodeTrulyVisible(node);
  });
  
  console.log('📊 Text nodes summary:');
  console.log('  - Total text nodes: ' + allTextNodes.length);
  console.log('  - Visible text nodes: ' + visibleTextNodes.length);
  console.log('  - Hidden text nodes: ' + (allTextNodes.length - visibleTextNodes.length));
  
  // Process visible text nodes sequentially
  for (var i = 0; i < visibleTextNodes.length; i++) {
    var textNode = visibleTextNodes[i];
    
    try {
      var nodeId = textNode.id;
      var currentText = textNode.characters;
      
      console.log('🔄 Processing visible text node:', nodeId, '|', currentText.substring(0, 50) + '...');
      
      // Look for translation by node ID
      var translation = translationMap[nodeId];
      
      if (translation) {
        console.log('✅ Translation found:', translation.translatedText.substring(0, 50) + '...');
        
        try {
          // Load font before changing text
          await figma.loadFontAsync(textNode.fontName);
          
          // Apply the translation
          textNode.characters = translation.translatedText;
          translatedCount++;
          
          console.log('✅ Text successfully translated!');
          
        } catch (fontError) {
          console.error('⚠️ Font loading error:', fontError);
          // Try without font loading
          try {
            textNode.characters = translation.translatedText;
            translatedCount++;
            console.log('✅ Text translated without font loading');
          } catch (textError) {
            console.error('❌ Text setting error:', textError);
          }
        }
      } else {
        console.log('ℹ️ No translation for visible node:', nodeId, '- keeping original');
      }
    } catch (error) {
      console.error('❌ Error processing text node:', error);
    }
  }
  
  console.log('🎯 Translation complete:');
  console.log('  - Visible nodes processed: ' + visibleTextNodes.length);
  console.log('  - Successfully translated: ' + translatedCount);
  console.log('  - Success rate: ' + Math.round((translatedCount / visibleTextNodes.length) * 100) + '%');
  
  return translatedCount;
}

function parseTranslations(csvData) {
  console.log('📄 Parsing CSV...');
  
  var lines = csvData.split('\n');
  var expectedHeaders = ['frame_name', 'node_id', 'source_text', 'target_language', 'translated_text'];
  
  if (lines.length < 2) {
    throw new Error('CSV muss mindestens Header und eine Datenzeile enthalten');
  }
  
  // Parse headers
  var headers = parseCSVLine(lines[0]).map(function(h) {
    return h.replace(/"/g, '').trim().toLowerCase();
  });
  
  console.log('📄 Headers found:', headers);
  
  // Validate headers
  for (var h = 0; h < expectedHeaders.length; h++) {
    if (headers.indexOf(expectedHeaders[h]) === -1) {
      throw new Error('Missing header: ' + expectedHeaders[h] + '. Found: ' + headers.join(', '));
    }
  }
  
  var framesByLanguage = {};
  var detectedLanguages = [];
  var totalRows = 0;
  var validRows = 0;
  var emptyTranslationRows = 0;
  
  // Parse data rows
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    
    totalRows++;
    
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
      console.log('⚠️ Line', i, 'skipped - missing required fields');
      continue;
    }
    
    // Track empty translations (probably hidden texts)
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
  
  console.log('📄 Parsing complete:');
  console.log('  - Total rows: ' + totalRows);
  console.log('  - Valid rows: ' + validRows);
  console.log('  - Empty translations (hidden texts): ' + emptyTranslationRows);
  console.log('  - Languages: ' + detectedLanguages.join(', '));
  
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
