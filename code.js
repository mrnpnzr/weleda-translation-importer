// Weleda Translation Import Plugin - KOMPLETT NEU GESCHRIEBEN
figma.showUI(__html__, { 
  width: 420, 
  height: 600,
  themeColors: true,
  title: "🌿 Weleda Translation Import"
});

var keepAliveInterval = setInterval(function() {
  // Keep-alive signal every 30 seconds
}, 30000);

figma.ui.onmessage = function(msg) {
  console.log('📨 Received message:', msg.type);
  
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
    console.log('🚀 Starting fresh import...');
    
    // Parse CSV
    var translations = parseCSV(csvData);
    console.log('✅ Parsed', translations.length, 'translations');
    
    if (translations.length === 0) {
      figma.ui.postMessage({
        type: 'error',
        message: 'Keine gültigen Übersetzungen gefunden.'
      });
      return;
    }
    
    // Group by frame
    var frameGroups = {};
    for (var i = 0; i < translations.length; i++) {
      var t = translations[i];
      var key = t.targetLanguage + '|' + t.frameName;
      if (!frameGroups[key]) {
        frameGroups[key] = [];
      }
      frameGroups[key].push(t);
    }
    
    console.log('📋 Frame groups:', Object.keys(frameGroups));
    
    var successCount = 0;
    
    // Process each frame group
    for (var groupKey in frameGroups) {
      var parts = groupKey.split('|');
      var language = parts[0];
      var frameId = parts[1];
      var frameTranslations = frameGroups[groupKey];
      
      console.log('🔄 Processing frame:', frameId, 'for language:', language);
      
      var success = await processFrame(frameId, language, frameTranslations);
      if (success) {
        successCount++;
      }
    }
    
    figma.ui.postMessage({
      type: 'success',
      message: successCount + ' Frame(s) erfolgreich übersetzt!',
      progress: 100
    });
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Import-Fehler: ' + error.message
    });
  }
}

async function processFrame(frameId, language, translations) {
  try {
    // Find frame
    var originalFrame = findFrame(frameId);
    if (!originalFrame) {
      console.log('❌ Frame not found:', frameId);
      return false;
    }
    
    console.log('✅ Found frame:', originalFrame.name);
    
    // Create duplicate
    var newFrame = originalFrame.clone();
    newFrame.name = originalFrame.name + ' - ' + language;
    newFrame.x = originalFrame.x + originalFrame.width + 100;
    newFrame.y = originalFrame.y;
    
    console.log('✅ Created duplicate:', newFrame.name);
    
    // Apply translations
    var translatedCount = await applyTranslationsToFrame(newFrame, translations);
    
    console.log('✅ Applied', translatedCount, 'translations to', newFrame.name);
    
    return true;
    
  } catch (error) {
    console.error('❌ Frame processing failed:', error);
    return false;
  }
}

async function applyTranslationsToFrame(frame, translations) {
  var translatedCount = 0;
  
  // Create lookup map
  var translationMap = {};
  for (var i = 0; i < translations.length; i++) {
    var t = translations[i];
    if (t.sourceText && t.translatedText) {
      var key = t.sourceText.trim().replace(/\s+/g, ' ');
      translationMap[key] = t.translatedText;
    }
  }
  
  console.log('📝 Translation map has', Object.keys(translationMap).length, 'entries');
  
  // Find all text nodes
  var textNodes = frame.findAll(function(node) {
    return node.type === 'TEXT' && node.visible;
  });
  
  console.log('📝 Found', textNodes.length, 'text nodes');
  
  // Apply translations
  for (var i = 0; i < textNodes.length; i++) {
    var textNode = textNodes[i];
    var currentText = textNode.characters.trim().replace(/\s+/g, ' ');
    var translation = translationMap[currentText];
    
    if (translation) {
      console.log('🔄 Translating:', currentText, '→', translation);
      
      var success = await translateTextNode(textNode, translation);
      if (success) {
        translatedCount++;
      }
    }
  }
  
  return translatedCount;
}

async function translateTextNode(textNode, translatedText) {
  try {
    console.log('🎯 Creating new text node for:', translatedText);
    
    // Save original properties INCLUDING FONT PROPERTIES
    var props = {
      x: textNode.x,
      y: textNode.y,
      width: textNode.width,
      height: textNode.height,
      constraints: textNode.constraints,
      visible: textNode.visible,
      opacity: textNode.opacity,
      rotation: textNode.rotation,
      parent: textNode.parent,
      index: textNode.parent.children.indexOf(textNode),
      // FONT PROPERTIES
      fontName: textNode.fontName,
      fontSize: textNode.fontSize,
      fontWeight: textNode.fontWeight,
      textAlignHorizontal: textNode.textAlignHorizontal,
      textAlignVertical: textNode.textAlignVertical,
      letterSpacing: textNode.letterSpacing,
      lineHeight: textNode.lineHeight,
      fills: textNode.fills,
      strokes: textNode.strokes,
      strokeWeight: textNode.strokeWeight
    };
    
    console.log('📝 Original font:', props.fontName.family, props.fontName.style);
    console.log('📝 Original color:', props.fills);
    
    // Create new text node
    var newTextNode = figma.createText();
    
    // Apply basic properties
    newTextNode.x = props.x;
    newTextNode.y = props.y;
    newTextNode.constraints = props.constraints;
    newTextNode.visible = props.visible;
    newTextNode.opacity = props.opacity;
    newTextNode.rotation = props.rotation;
    
    // Apply text with markdown (using original fonts)
    if (translatedText.includes('**')) {
      await applyMarkdownText(newTextNode, translatedText, props);
    } else {
      await applyPlainText(newTextNode, translatedText, props);
    }
    
    // Apply text styling
    newTextNode.fontSize = props.fontSize;
    newTextNode.textAlignHorizontal = props.textAlignHorizontal;
    newTextNode.textAlignVertical = props.textAlignVertical;
    newTextNode.letterSpacing = props.letterSpacing;
    newTextNode.lineHeight = props.lineHeight;
    newTextNode.fills = props.fills;
    newTextNode.strokes = props.strokes;
    newTextNode.strokeWeight = props.strokeWeight;
    
    console.log('✅ Applied all styling properties');
    
    // Try to match size
    try {
      newTextNode.resize(props.width, props.height);
    } catch (e) {
      console.log('⚠️ Could not resize');
    }
    
    // Insert at same position
    props.parent.insertChild(props.index, newTextNode);
    
    // Remove old
    textNode.remove();
    
    console.log('✅ Text node recreated with original styling');
    return true;
    
  } catch (error) {
    console.error('❌ Text node recreation failed:', error);
    
    // Simple fallback
    try {
      textNode.characters = translatedText.replace(/\*\*/g, '');
      console.log('⚠️ Used simple fallback');
      return true;
    } catch (e) {
      console.error('❌ Even fallback failed');
      return false;
    }
  }
}

async function applyMarkdownText(textNode, markdownText, originalProps) {
  console.log('🎨 Applying markdown with original fonts:', markdownText);
  
  // Parse markdown
  var segments = [];
  var current = '';
  var isBold = false;
  var i = 0;
  
  while (i < markdownText.length) {
    if (markdownText.substring(i, i + 2) === '**') {
      if (current) {
        segments.push({ text: current, bold: isBold });
        current = '';
      }
      isBold = !isBold;
      i += 2;
    } else {
      current += markdownText[i];
      i++;
    }
  }
  
  if (current) {
    segments.push({ text: current, bold: isBold });
  }
  
  console.log('📋 Parsed into', segments.length, 'segments');
  
  // Create full text
  var fullText = '';
  for (var j = 0; j < segments.length; j++) {
    fullText += segments[j].text;
  }
  
  // Use original font as base
  var regularFont = originalProps.fontName;
  var boldFont = getBoldVariantOfFont(regularFont);
  
  console.log('🔤 Using original font:', regularFont.family, regularFont.style);
  console.log('🔤 Bold variant:', boldFont.family, boldFont.style);
  
  try {
    // Try to load original fonts
    await figma.loadFontAsync(regularFont);
    console.log('✅ Loaded original regular font');
    
    try {
      await figma.loadFontAsync(boldFont);
      console.log('✅ Loaded original bold font');
    } catch (e) {
      console.log('⚠️ Bold variant not available, using regular');
      boldFont = regularFont;
    }
    
  } catch (e) {
    console.log('⚠️ Original font failed, using Inter fallback');
    regularFont = { family: "Inter", style: "Regular" };
    boldFont = { family: "Inter", style: "Bold" };
    
    await figma.loadFontAsync(regularFont);
    try {
      await figma.loadFontAsync(boldFont);
    } catch (e2) {
      boldFont = regularFont;
    }
  }
  
  // Set text FIRST with regular font
  textNode.fontName = regularFont;
  textNode.characters = fullText;
  console.log('✅ Set base text with original font:', fullText);
  
  // Apply formatting
  var charIndex = 0;
  for (var j = 0; j < segments.length; j++) {
    var segment = segments[j];
    if (segment.text.length > 0) {
      var font = segment.bold ? boldFont : regularFont;
      textNode.setRangeFontName(charIndex, charIndex + segment.text.length, font);
      console.log('🎨 Applied', font.style, 'to "' + segment.text + '"');
      charIndex += segment.text.length;
    }
  }
  
  console.log('✅ Markdown applied with original fonts');
}

function getBoldVariantOfFont(regularFont) {
  var family = regularFont.family;
  var style = regularFont.style;
  
  // Try to create bold variant
  if (style.toLowerCase().includes('regular') || style.toLowerCase().includes('normal')) {
    return { family: family, style: "Bold" };
  } else if (style.toLowerCase().includes('light')) {
    return { family: family, style: "Regular" };
  } else {
    // Already bold or other style, return as is
    return regularFont;
  }
}

async function applyPlainText(textNode, text, originalProps) {
  console.log('📝 Applying plain text with original font:', text);
  
  var font = originalProps.fontName;
  
  try {
    await figma.loadFontAsync(font);
    console.log('✅ Loaded original font for plain text:', font.family, font.style);
  } catch (e) {
    console.log('⚠️ Original font failed, using Inter fallback');
    font = { family: "Inter", style: "Regular" };
    await figma.loadFontAsync(font);
  }
  
  textNode.fontName = font;
  textNode.characters = text;
  
  console.log('✅ Plain text applied with original font:', text);
}

function findFrame(frameId) {
  var allFrames = figma.currentPage.findAll(function(node) {
    return node.type === 'FRAME' || node.type === 'COMPONENT';
  });
  
  for (var i = 0; i < allFrames.length; i++) {
    if (allFrames[i].id === frameId) {
      return allFrames[i];
    }
  }
  
  return null;
}

function parseCSV(csvData) {
  var translations = [];
  var lines = csvData.split('\n');
  
  if (lines.length < 2) {
    return translations;
  }
  
  // Parse header
  var headers = parseCSVLine(lines[0]);
  var frameCol = -1, nodeCol = -1, sourceCol = -1, langCol = -1, transCol = -1;
  
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toLowerCase().replace(/"/g, '');
    if (h.includes('frame')) frameCol = i;
    else if (h.includes('node')) nodeCol = i;
    else if (h.includes('source')) sourceCol = i;
    else if (h.includes('language')) langCol = i;
    else if (h.includes('translated')) transCol = i;
  }
  
  // Parse data
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    
    var values = parseCSVLine(line);
    if (values.length < 5) continue;
    
    var frameName = values[frameCol] ? values[frameCol].replace(/"/g, '').trim() : '';
    var sourceText = values[sourceCol] ? values[sourceCol].replace(/"/g, '').trim() : '';
    var targetLanguage = values[langCol] ? values[langCol].replace(/"/g, '').trim() : '';
    var translatedText = values[transCol] ? values[transCol].replace(/"/g, '').trim() : '';
    
    if (frameName && sourceText && targetLanguage) {
      translations.push({
        frameName: frameName,
        sourceText: sourceText,
        targetLanguage: targetLanguage,
        translatedText: translatedText
      });
    }
  }
  
  return translations;
}

function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  var i = 0;
  
  while (i < line.length) {
    var char = line[i];
    var nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
    i++;
  }
  
  result.push(current);
  return result;
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
    
    console.log('\n📝 CSV-TEMPLATE:');
    console.log('=====================================');
    console.log('frame_name,node_id,source_text,target_language,translated_text');
    
    for (var i = 0; i < allFrames.length; i++) {
      var frame = allFrames[i];
      
      var textNodes = frame.findAll(function(node) {
        return node.type === 'TEXT' && node.visible;
      });
      
      if (textNodes.length > 0) {
        console.log('\n// Frame: ' + frame.name + ' (ID: ' + frame.id + ')');
        for (var j = 0; j < textNodes.length; j++) {
          var textNode = textNodes[j];
          var text = textNode.characters.replace(/"/g, '""');
          console.log('"' + frame.id + '","' + textNode.id + '","' + text + '","de",""');
        }
      }
    }
    
    figma.ui.postMessage({
      type: 'success',
      message: allFrames.length + ' Frame(s) gefunden. Siehe Console!'
    });
    
  } catch (error) {
    console.error('Error:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Fehler: ' + error.message
    });
  }
}

console.log('🌿 Weleda Translation Plugin loaded - CLEAN VERSION!');
