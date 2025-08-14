figma.showUI(__html__, { width: 480, height: 720 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'import-translations') {
    try {
      const csvData = msg.csvData;
      
      // Übersetzungen und Datei-Informationen verarbeiten
      const { translationsByFile, uniqueFiles, detectedLanguages } = parseTranslations(csvData);

      if (Object.keys(translationsByFile).length === 0) {
        figma.ui.postMessage({
          type: 'error',
          message: `Keine gültigen Übersetzungen in der CSV gefunden.`
        });
        return;
      }
      
      // Import-Start Message mit Frame-Informationen
      figma.ui.postMessage({
        type: 'import-start',
        totalFrames: uniqueFiles.length,
        frames: uniqueFiles.map(f => ({
          frameName: f.frameName,
          language: f.targetLanguage
        }))
      });
      
      let totalImported = 0;
      let importedFramesList = [];
      
      // Für jede Datei die Frames importieren
      for (const fileInfo of uniqueFiles) {
        try {
          figma.ui.postMessage({
            type: 'progress',
            message: `Suche Frame "${fileInfo.frameName}"...`
          });
          
          console.log(`Verarbeite Frame: ${fileInfo.frameName}, Sprache: ${fileInfo.targetLanguage}`);
          
          const frameData = await importFrameFromFile(fileInfo);
          if (frameData) {
            console.log(`Frame gefunden, erstelle Kopie...`);
            
            const duplicatedFrame = frameData.clone();
            const newFrameName = `${frameData.name} - ${fileInfo.targetLanguage}`;
            duplicatedFrame.name = newFrameName;
            
            console.log(`Neuer Frame-Name: ${newFrameName}`);
            
            // Frame auf der aktuellen Seite platzieren
            figma.currentPage.appendChild(duplicatedFrame);
            
            // Position basierend auf bereits importierten Frames berechnen
            const newX = totalImported * (duplicatedFrame.width + 100);
            const newY = 0;
            duplicatedFrame.x = newX;
            duplicatedFrame.y = newY;
            
            console.log(`Frame positioniert bei x:${newX}, y:${newY}`);
            
            figma.ui.postMessage({
              type: 'progress',
              message: `Übersetze Texte in "${fileInfo.frameName}"...`
            });
            
            // Übersetzungen anwenden
            const translationKey = fileInfo.fileKey + '::' + fileInfo.frameName + '::' + fileInfo.targetLanguage;
            const translations = translationsByFile[translationKey];
            
            console.log(`Suche Übersetzungen mit Key: ${translationKey}`);
            console.log(`Gefundene Übersetzungen:`, translations ? translations.size : 0);
            
            const updatedCount = await replaceTextsInFrame(duplicatedFrame, translations);
            
            console.log(`${updatedCount} Texte übersetzt`);
            
            totalImported++;
            importedFramesList.push({
              fileName: fileInfo.fileName || fileInfo.fileKey,
              frameName: duplicatedFrame.name,
              translatedTexts: updatedCount,
              language: fileInfo.targetLanguage,
              nodeId: duplicatedFrame.id
            });
            
            // Frame completed message
            figma.ui.postMessage({
              type: 'frame-completed',
              frameName: fileInfo.frameName,
              language: fileInfo.targetLanguage,
              textsCount: updatedCount
            });
            
          } else {
            console.warn(`Frame "${fileInfo.frameName}" konnte nicht gefunden werden`);
            figma.ui.postMessage({
              type: 'warning',
              message: `Frame "${fileInfo.frameName}" nicht gefunden - überspringe`
            });
          }
        } catch (error) {
          console.error(`Fehler beim Importieren von ${fileInfo.frameName}:`, error);
          figma.ui.postMessage({
            type: 'warning',
            message: `Konnte ${fileInfo.frameName} nicht importieren: ${error.message}`
          });
        }
      }
      
      // Alle importierten Frames auswählen und in den Viewport bringen
      const allImportedFrames = figma.currentPage.children.filter(node => 
        detectedLanguages.some(lang => node.name.endsWith(` - ${lang}`))
      );
      
      if (allImportedFrames.length > 0) {
        figma.currentPage.selection = allImportedFrames;
        figma.viewport.scrollAndZoomIntoView(allImportedFrames);
      }
      
      figma.ui.postMessage({
        type: 'success',
        message: `Import abgeschlossen! ${totalImported} Frame(s) erfolgreich importiert.`,
        details: importedFramesList
      });
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: `Fehler beim Import: ${error.message}`
      });
    }
  }
  
  if (msg.type === 'export-frames') {
    try {
      const framesToExport = msg.frames;
      let exportedCount = 0;
      
      figma.ui.postMessage({
        type: 'progress',
        message: 'Beginne PNG-Export...'
      });
      
      for (const frameInfo of framesToExport) {
        try {
          // Frame anhand des Namens finden
          const targetFrame = figma.currentPage.findOne(node => 
            node.name === frameInfo.frameName
          );
          
          if (targetFrame && (targetFrame.type === 'FRAME' || targetFrame.type === 'COMPONENT')) {
            // PNG-Export konfigurieren
            const exportSettings = {
              format: 'PNG',
              constraint: {
                type: 'SCALE',
                value: 2 // 2x für höhere Qualität
              }
            };
            
            // Frame exportieren
            const imageData = await targetFrame.exportAsync(exportSettings);
            
            // Dateiname generieren: FrameName_Language_Timestamp.png
            const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const sanitizedFrameName = frameInfo.frameName.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${sanitizedFrameName}_${frameInfo.language}_${timestamp}.png`;
            
            // Export über Figma's File API (wird als Download angeboten)
            figma.showUI(__html__, { visible: false });
            
            // Simuliere Export (da direkter Datei-Download nicht über Plugin API möglich ist)
            // Benutzer muss Frame manuell als PNG exportieren
            console.log(`Würde exportieren: ${fileName}`);
            
            exportedCount++;
            
            figma.ui.postMessage({
              type: 'progress',
              message: `Exportiert: ${fileName} (${exportedCount}/${framesToExport.length})`
            });
            
          }
        } catch (exportError) {
          console.warn(`Fehler beim Exportieren von ${frameInfo.frameName}: ${exportError.message}`);
        }
      }
      
      figma.ui.postMessage({
        type: 'export-completed',
        count: exportedCount,
        message: 'Frames wurden zur manuellen PNG-Auswahl vorbereitet. Bitte wähle die Frames aus und exportiere sie über "Export" → "PNG".'
      });
      
      // Frames für manuellen Export auswählen
      const framesToSelect = figma.currentPage.children.filter(node => 
        framesToExport.some(f => f.frameName === node.name)
      );
      
      if (framesToSelect.length > 0) {
        figma.currentPage.selection = framesToSelect;
        figma.viewport.scrollAndZoomIntoView(framesToSelect);
        
        // Plugin UI wieder anzeigen
        figma.showUI(__html__, { width: 480, height: 720 });
      }
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: `Fehler beim Export: ${error.message}`
      });
    }
  }
  
  if (msg.type === 'get-frame-ids') {
    try {
      // Alle Frames der aktuellen Seite mit IDs ausgeben
      const allFrames = figma.currentPage.findAll(node => 
        node.type === 'FRAME' || node.type === 'COMPONENT'
      );
      
      const frameData = allFrames.map(frame => ({
        name: frame.name,
        id: frame.id,
        type: frame.type,
        width: frame.width,
        height: frame.height
      }));
      
      figma.ui.postMessage({
        type: 'frame-ids-list',
        frames: frameData
      });
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: `Fehler beim Abrufen der Frame-IDs: ${error.message}`
      });
    }
  }
  
  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

function parseTranslations(csvData) {
  const lines = csvData.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  
  const translationsByFile = {};
  const uniqueFiles = [];
  const seenFiles = new Set();
  const detectedLanguages = new Set();
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseCSVLine(lines[i]);
    
    if (values.length >= headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ? values[index].replace(/"/g, '').trim() : '';
      });
      
      const targetLanguage = row['Target Language'];
      
      // Nur Zeilen mit gültiger Übersetzung verarbeiten
      if (targetLanguage && 
          row['Translated Text'] && 
          row['Translated Text'] !== '') {
        
        detectedLanguages.add(targetLanguage);
        
        const fileKey = row['Figma File Key'] || 'current';
        const frameName = row['Frame Name'];
        const fileName = row['Figma File Name'] || '';
        const frameId = row['Figma Frame ID'] || '';
        
        const fileFrameLangKey = `${fileKey}::${frameName}::${targetLanguage}`;
        const fileFrameKey = `${fileKey}::${frameName}`;
        
        // Datei-Info sammeln für einmaligen Import pro Sprache
        if (!seenFiles.has(fileFrameLangKey)) {
          uniqueFiles.push({
            fileKey: fileKey,
            frameName: frameName,
            fileName: fileName,
            frameId: frameId,
            targetLanguage: targetLanguage,
            fileUrl: row['Figma File URL'] || ''
          });
          seenFiles.add(fileFrameLangKey);
        }
        
        // Übersetzungen gruppieren nach Datei/Frame/Sprache
        if (!translationsByFile[fileFrameLangKey]) {
          translationsByFile[fileFrameLangKey] = new Map();
        }
        
        const sourceText = row['Source Text'].replace(/\\n/g, '\n');
        const translatedText = row['Translated Text'].replace(/\\n/g, '\n');
        
        translationsByFile[fileFrameLangKey].set(sourceText, {
          translatedText: translatedText,
          layerPath: row['Layer Name'],
          frameName: frameName,
          figmaNodeId: row['Figma Node ID'] || ''
        });
      }
    }
  }
  
  return { 
    translationsByFile, 
    uniqueFiles, 
    detectedLanguages: Array.from(detectedLanguages) 
  };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
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

async function importFrameFromFile(fileInfo) {
  try {
    console.log(`Suche Frame: "${fileInfo.frameName}" mit ID: "${fileInfo.frameId}"`);
    
    // Primär: Über Node-ID suchen (wenn vorhanden)
    if (fileInfo.frameId && fileInfo.frameId.trim() !== '') {
      try {
        const nodeById = await figma.getNodeByIdAsync(fileInfo.frameId);
        if (nodeById && (nodeById.type === 'FRAME' || nodeById.type === 'COMPONENT')) {
          console.log(`Frame über ID gefunden: ${nodeById.name} (ID: ${nodeById.id})`);
          return nodeById;
        } else if (nodeById) {
          console.warn(`Node mit ID ${fileInfo.frameId} gefunden, aber falscher Typ: ${nodeById.type}`);
        }
      } catch (idError) {
        console.warn(`Frame mit ID "${fileInfo.frameId}" nicht gefunden:`, idError.message);
      }
    }
    
    // Fallback: Über Namen suchen
    console.log(`Fallback: Suche Frame über Namen "${fileInfo.frameName}"`);
    const foundFrame = findFrameByName(fileInfo.frameName);
    
    if (foundFrame) {
      console.log(`Frame über Namen gefunden: ${foundFrame.name} (ID: ${foundFrame.id})`);
      
      // Für zukünftige Referenz: Node-ID in Console ausgeben
      figma.ui.postMessage({
        type: 'progress',
        message: `Frame gefunden! Für zukünftige CSV: Figma Frame ID = "${foundFrame.id}"`
      });
      
      return foundFrame;
    } else {
      console.warn(`Frame "${fileInfo.frameName}" weder über ID noch Namen gefunden`);
      
      // Debug: Alle verfügbaren Frames mit IDs auflisten
      const allFrames = figma.currentPage.findAll(node => 
        node.type === 'FRAME' || node.type === 'COMPONENT'
      );
      
      const frameInfo = allFrames.map(f => `"${f.name}" (ID: ${f.id})`).join(', ');
      console.log('Verfügbare Frames mit IDs:', frameInfo);
      
      figma.ui.postMessage({
        type: 'warning',
        message: `Frame "${fileInfo.frameName}" nicht gefunden. Verfügbare Frames: ${allFrames.map(f => `${f.name} (ID: ${f.id})`).slice(0, 3).join(', ')}${allFrames.length > 3 ? '...' : ''}`
      });
      
      return null;
    }
    
  } catch (error) {
    console.error(`Fehler beim Importieren von ${fileInfo.frameName}:`, error);
    return null;
  }
}

function findFrameByName(frameName) {
  console.log(`Suche nach Frame mit Namen: "${frameName}"`);
  
  // Exakte Übereinstimmung in aktueller Seite
  let matches = figma.currentPage.findAll(node => 
    (node.type === 'FRAME' || node.type === 'COMPONENT') && node.name === frameName
  );
  
  if (matches.length > 0) {
    console.log(`Exakte Übereinstimmung gefunden: ${matches[0].name} (ID: ${matches[0].id})`);
    return matches[0];
  }
  
  // Teilübereinstimmung (falls Frame-Namen leicht abweichen)
  matches = figma.currentPage.findAll(node => 
    (node.type === 'FRAME' || node.type === 'COMPONENT') && 
    node.name.toLowerCase().includes(frameName.toLowerCase())
  );
  
  if (matches.length > 0) {
    console.log(`Teilübereinstimmung gefunden: ${matches[0].name} (ID: ${matches[0].id})`);
    figma.ui.postMessage({
      type: 'warning', 
      message: `Exakter Frame-Name nicht gefunden. Verwende ähnlichen Frame: "${matches[0].name}" (ID: ${matches[0].id})`
    });
    return matches[0];
  }
  
  // In allen Seiten suchen
  for (const page of figma.root.children) {
    const pageMatches = page.findAll(node => 
      (node.type === 'FRAME' || node.type === 'COMPONENT') && node.name === frameName
    );
    if (pageMatches.length > 0) {
      console.log(`Frame in anderer Seite gefunden: ${pageMatches[0].name} (ID: ${pageMatches[0].id}, Seite: ${page.name})`);
      figma.ui.postMessage({
        type: 'warning',
        message: `Frame "${frameName}" in Seite "${page.name}" gefunden (ID: ${pageMatches[0].id}), aber nicht in aktueller Seite.`
      });
      return pageMatches[0];
    }
  }
  
  console.warn(`Kein Frame mit Namen "${frameName}" gefunden`);
  return null;
}

// Hilfsfunktion: Node-IDs für aktuell ausgewählte Frames ausgeben
function getSelectedFrameIds() {
  const selectedFrames = figma.currentPage.selection.filter(node => 
    node.type === 'FRAME' || node.type === 'COMPONENT'
  );
  
  if (selectedFrames.length > 0) {
    console.log('Ausgewählte Frame-IDs:');
    selectedFrames.forEach(frame => {
      console.log(`"${frame.name}" → ID: "${frame.id}"`);
    });
  }
  
  return selectedFrames.map(f => ({ name: f.name, id: f.id }));
}

async function replaceTextsInFrame(frame, translations) {
  let updatedCount = 0;
  
  // Alle Text-Nodes im Frame finden
  const textNodes = frame.findAll(node => node.type === 'TEXT');
  
  for (const textNode of textNodes) {
    try {
      // Font laden falls nötig
      if (textNode.fontName !== figma.mixed) {
        await figma.loadFontAsync(textNode.fontName);
      } else {
        // Bei gemischten Fonts alle Fonts laden
        const len = textNode.characters.length;
        for (let i = 0; i < len; i++) {
          await figma.loadFontAsync(textNode.getRangeFontName(i, i + 1));
        }
      }
      
      const currentText = textNode.characters;
      
      // Direkte Übereinstimmung prüfen
      if (translations.has(currentText)) {
        const translation = translations.get(currentText);
        textNode.characters = translation.translatedText;
        updatedCount++;
        console.log(`Ersetzt: "${currentText}" → "${translation.translatedText}"`);
        continue;
      }
      
      // Auch nach Teilübereinstimmungen suchen (für den Fall, dass Layer-Namen als zusätzliche Info genutzt werden)
      for (const [sourceText, translation] of translations) {
        if (currentText.includes(sourceText) || sourceText.includes(currentText)) {
          textNode.characters = translation.translatedText;
          updatedCount++;
          console.log(`Teilersetzung: "${currentText}" → "${translation.translatedText}"`);
          break;
        }
      }
      
    } catch (error) {
      console.warn(`Fehler beim Verarbeiten des Text-Nodes "${textNode.name}": ${error.message}`);
    }
  }
  
  return updatedCount;
}
