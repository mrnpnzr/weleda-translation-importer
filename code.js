// LÖSUNG: Ersetze deine parseTranslations Funktion mit dieser korrigierten Version

function parseTranslations(csvData) {
  console.log('📄 Parsing CSV...');
  
  // WICHTIG: Verwende eine robuste CSV-Parsing-Methode
  // Anstatt Zeile für Zeile zu parsen, parse das gesamte CSV korrekt
  
  var rows = parseCSVData(csvData);
  
  if (rows.length < 2) {
    throw new Error('CSV muss mindestens Header und eine Datenzeile enthalten');
  }
  
  // Parse headers
  var headers = rows[0].map(function(h) {
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
  
  // Parse data rows (skip header)
  for (var i = 1; i < rows.length; i++) {
    var values = rows[i];
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

// NEUE FUNKTION: Robuster CSV-Parser der mehrzeilige Texte korrekt behandelt
function parseCSVData(csvData) {
  var rows = [];
  var currentRow = [];
  var currentField = '';
  var inQuotes = false;
  var i = 0;
  
  while (i < csvData.length) {
    var char = csvData[i];
    var nextChar = csvData[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote - add literal quote to field
        currentField += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // End of row (only if not inside quotes)
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        if (currentRow.some(function(field) { return field.trim() !== ''; })) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      }
      // Skip \r\n combinations
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      // Regular character
      currentField += char;
    }
    
    i++;
  }
  
  // Add final field/row if exists
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(function(field) { return field.trim() !== ''; })) {
      rows.push(currentRow);
    }
  }
  
  return rows;
}

// Du kannst deine alte parseCSVLine Funktion entfernen, da sie durch parseCSVData ersetzt wird
