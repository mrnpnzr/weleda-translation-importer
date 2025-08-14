figma.showUI(__html__, { width: 450, height: 600 });

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
      
      figma.ui.postMessage({
        type: 'progress',
        message: `Gefunden: ${uniqueFiles.length} Frame(s) mit Übersetzungen in ${detectedLanguages.join(', ')}. Importiere...`
      });
      
      let totalImported = 0;
      let importedFiles = [];
      
      // Für jede Datei die Frames importieren
      for (const fileInfo of uniqueFiles) {
        try {
          const frameData = await importFrameFromFile(fileInfo);
          if (frameData) {
            const duplicatedFrame = frameData.clone();
            duplicatedFrame.name = `${frameData.name} - ${fileInfo.targetLanguage}`;
            
            // Frame auf der aktuellen Seite platzieren
            figma.currentPage.appendChild(duplicatedFrame);
            
            // Position basierend auf bereits importierten Frames berechnen
            duplicatedFrame.x = totalImported * (duplicatedFrame.width + 100);
            duplicatedFrame.y = 0;
            
            // Übersetzungen anwenden
            const translations = translationsByFile[fileInfo.fileKey + '::' + fileInfo.frameName + '::' + fileInfo.targetLanguage];
            const updatedCount = await replaceTextsInFrame(duplicatedFrame, translations);
            
            totalImported++;
            importedFiles.push({
              fileName: fileInfo.fileName || fileInfo.fileKey,
              frameName: duplicatedFrame.name,
              translatedTexts: updatedCount,
              language: fileInfo.targetLanguage
            });
            
            figma.ui.postMessage({
              type: 'progress',
              message: `Importiert: ${fileInfo.frameName} (${updatedCount} Texte übersetzt)`
            });
            
          }
        } catch (error) {
          console.warn(`Fehler beim Importieren von ${fileInfo.frameName}: ${error.message}`);
          figma.ui.postMessage({
            type: 'warning',
            message: `Konnte ${fileInfo.frameName} nicht importieren: ${error.message}`
          });
        }
      }
      
      // Alle importierten Frames auswählen und in den Viewport bringen
      const importedFrames = figma.currentPage.children.filter(node => 
        detectedLanguages.some(lang => node.name.endsWith(` - ${lang}`))
      );
      
      if (importedFrames.length > 0) {
        figma.currentPage.selection = importedFrames;
        figma.viewport.scrollAndZoomIntoView(importedFrames);
      }
      
      figma.ui.postMessage({
        type: 'success',
        message: `Import abgeschlossen! ${totalImported} Frame(s) erfolgreich importiert.`,
        details: importedFiles
      });
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: `Fehler beim Import: ${error.message}`
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
    // Wenn es die aktuelle Datei ist
    if (fileInfo.fileKey === 'current' || fileInfo.fileKey === figma.fileKey) {
      return findFrameByName(fileInfo.frameName);
    }
    
    // Für externe Dateien - hier würde normalerweise eine REST API Anfrage gemacht
    // Da das Figma Plugin API keine direkten File-Imports unterstützt, 
    // müssen wir den Benutzer auffordern, die Frames manuell zu kopieren
    
    figma.ui.postMessage({
      type: 'manual-import-needed',
      fileInfo: fileInfo
    });
    
    return null;
    
  } catch (error) {
    console.error(`Fehler beim Importieren von ${fileInfo.frameName}:`, error);
    return null;
  }
}

function findFrameByName(frameName) {
  // Zuerst in der aktuellen Seite suchen
  const currentPageFrames = figma.currentPage.findAll(node => 
    (node.type === 'FRAME' || node.type === 'COMPONENT') && node.name === frameName
  );
  
  if (currentPageFrames.length > 0) {
    return currentPageFrames[0];
  }
  
  // Dann in allen Seiten suchen
  for (const page of figma.root.children) {
    const frames = page.findAll(node => 
      (node.type === 'FRAME' || node.type === 'COMPONENT') && node.name === frameName
    );
    if (frames.length > 0) {
      return frames[0];
    }
  }
  
  return null;
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
