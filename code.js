// Plugin als großes, andockbares Panel
figma.showUI(__html__, { 
  width: 400, 
  height: 700,
  themeColors: true,
  title: "🌿 Weleda Transcreate Workspace"
});

// Plugin-Verhalten optimieren
figma.ui.onmessage = async (msg) => {
  // Plugin soll NICHT automatisch schließen
  if (msg.type === 'keep-alive') {
    // Plugin offen halten
    return;
  }
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
      const settings = msg.settings || { scale: 2, format: 'PNG', naming: 'frame_lang_date' };
      let exportedCount = 0;
      let actualNodesToExport = [];
      
      figma.ui.postMessage({
        type: 'progress',
        message: 'Analysiere Frame-Inhalte...'
      });
      
      // Frames basierend auf Auswahl bestimmen
      if (framesToExport === 'selected') {
        // Aktuell ausgewählte Frames in Figma
        const selectedNodes = figma.currentPage.selection.filter(node => 
          node.type === 'FRAME' || node.type === 'COMPONENT'
        );
        
        // Eine Ebene tiefer: Kinder der Frames
        for (const frame of selectedNodes) {
          console.log(`Analysiere Frame: ${frame.name} mit ${frame.children.length} Kindern`);
          
          const children = frame.children.filter(child => {
            console.log(`Kind gefunden: ${child.name} (Type: ${child.type})`);
            return child.type === 'FRAME' || 
                   child.type === 'COMPONENT' || 
                   child.type === 'GROUP' ||
                   child.type === 'INSTANCE' ||  // ◊ Rauten-Symbol
                   child.type === 'RECTANGLE' ||
                   child.type === 'ELLIPSE' ||
                   child.type === 'POLYGON' ||
                   child.type === 'STAR' ||
                   child.type === 'VECTOR' ||
                   child.type === 'TEXT';
          });
          
          console.log(`Exportierbare Kinder: ${children.length}`);
          
          children.forEach((child, index) => {
            actualNodesToExport.push({
              frameName: `${frame.name}_${child.name || `Element_${index + 1}`}`,
              language: 'exported',
              parentFrame: frame.name,
              childIndex: index + 1,
              childType: child.type,
              node: child
            });
          });
        }
        
        if (actualNodesToExport.length === 0) {
          figma.ui.postMessage({
            type: 'warning',
            message: 'Keine exportierbaren Elemente in den ausgewählten Frames gefunden.'
          });
          return;
        }
      } else {
        // Frames aus der Liste verwenden - eine Ebene tiefer
        for (const frameInfo of framesToExport) {
          const frameNode = figma.currentPage.findOne(node => 
            node.name === frameInfo.frameName
          );
          
          if (frameNode && (frameNode.type === 'FRAME' || frameNode.type === 'COMPONENT')) {
            console.log(`Analysiere Frame: ${frameNode.name} mit ${frameNode.children.length} Kindern`);
            
            // Kinder des Frames exportieren
            const children = frameNode.children.filter(child => {
              console.log(`Kind gefunden: ${child.name} (Type: ${child.type})`);
              return child.type === 'FRAME' || 
                     child.type === 'COMPONENT' || 
                     child.type === 'GROUP' ||
                     child.type === 'INSTANCE' ||  // ◊ Rauten-Symbol
                     child.type === 'RECTANGLE' ||
                     child.type === 'ELLIPSE' ||
                     child.type === 'POLYGON' ||
                     child.type === 'STAR' ||
                     child.type === 'VECTOR' ||
                     child.type === 'TEXT';
            });
            
            console.log(`Exportierbare Kinder: ${children.length}`);
            
            children.forEach((child, index) => {
              actualNodesToExport.push({
                frameName: `${frameInfo.frameName}_${child.name || `Element_${index + 1}`}`,
                language: frameInfo.language,
                translatedTexts: frameInfo.translatedTexts,
                parentFrame: frameInfo.frameName,
                childIndex: index + 1,
                childType: child.type,
                nodeId: child.id,
                node: child
              });
            });
          }
        }
      }
      
      if (actualNodesToExport.length === 0) {
        figma.ui.postMessage({
          type: 'warning',
          message: 'Keine exportierbaren Kinder-Elemente in den Frames gefunden.'
        });
        return;
      }
      
      figma.ui.postMessage({
        type: 'progress',
        message: `Gefunden: ${actualNodesToExport.length} Elemente zum Export aus ${framesToExport === 'selected' ? 'ausgewählten' : framesToExport.length} Frame(s)`
      });
      
      // Debug: Zeige was exportiert wird
      console.log('Zu exportierende Elemente:');
      actualNodesToExport.forEach((item, index) => {
        console.log(`${index + 1}. ${item.frameName} (${item.childType || 'unknown'}) - ${item.node.name}`);
      });
      
      // Export-Daten für Download vorbereiten
      const exportData = [];
      
      for (const nodeInfo of actualNodesToExport) {
        try {
          // Export-Einstellungen konfigurieren
          const exportSettings = {
            format: settings.format,
            constraint: {
              type: 'SCALE',
              value: settings.scale
            }
          };
          
          // Element als Bild exportieren
          const imageData = await nodeInfo.node.exportAsync(exportSettings);
          
          // Dateiname basierend auf Naming-Schema generieren
          const timestamp = new Date().toISOString().slice(0, 10);
          const sanitizedParentName = nodeInfo.parentFrame.replace(/[^a-zA-Z0-9]/g, '_');
          const sanitizedChildName = (nodeInfo.node.name || `Element_${nodeInfo.childIndex}`).replace(/[^a-zA-Z0-9]/g, '_');
          const language = nodeInfo.language || 'exported';
          
          let fileName;
          switch (settings.naming) {
            case 'lang_frame_date':
              fileName = `${language}_${sanitizedParentName}_${sanitizedChildName}_${timestamp}.${settings.format.toLowerCase()}`;
              break;
            case 'frame_lang':
              fileName = `${sanitizedParentName}_${sanitizedChildName}_${language}.${settings.format.toLowerCase()}`;
              break;
            case 'custom':
              fileName = `${sanitizedParentName}_${sanitizedChildName}_${language}_${timestamp}.${settings.format.toLowerCase()}`;
              break;
            default: // frame_lang_date
              fileName = `${sanitizedParentName}_${sanitizedChildName}_${language}_${timestamp}.${settings.format.toLowerCase()}`;
          }
          
          // Export-Daten sammeln (für möglichen späteren Batch-Download)
          exportData.push({
            fileName: fileName,
            imageData: imageData,
            width: nodeInfo.node.width,
            height: nodeInfo.node.height,
            parentFrame: nodeInfo.parentFrame,
            childName: nodeInfo.node.name || `Element_${nodeInfo.childIndex}`
          });
          
          console.log(`Vorbereitet für Export: ${fileName} (${Math.round(nodeInfo.node.width)}×${Math.round(nodeInfo.node.height)}px)`);
          
          exportedCount++;
          
          figma.ui.postMessage({
            type: 'progress',
            message: `Vorbereitet: ${fileName} (${exportedCount}/${actualNodesToExport.length})`
          });
          
        } catch (exportError) {
          console.warn(`Fehler beim Exportieren von ${nodeInfo.frameName}: ${exportError.message}`);
        }
      }
      
      // Export-Informationen an UI senden
      figma.ui.postMessage({
        type: 'export-completed',
        count: exportedCount,
        exportData: exportData,
        message: `${exportedCount} Element(e) aus Frames exportiert. Direkter Download verfügbar!`
      });
      
      // Direkter Download für alle Dateien
      if (exportData.length > 0) {
        figma.ui.postMessage({
          type: 'download-ready',
          files: exportData, // Alle Dateien, keine Begrenzung
          message: `Download bereit für ${exportData.length} Datei(en)`
        });
      }
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: `Fehler beim Export: ${error.message}`
      });
    }
  }
  
  if (msg.type === 'load-layers') {
    try {
      const allLayers = [];
      
      // Funktion zum rekursiven Durchlaufen aller Nodes
      function traverseNode(node, depth = 0, parentName = '') {
        // Nur sichtbare und exportierbare Nodes
        if (node.visible !== false && node.type !== 'PAGE') {
          const layerInfo = {
            id: node.id,
            name: node.name || 'Unnamed',
            type: node.type,
            width: node.width || 0,
            height: node.height || 0,
            depth: depth,
            parentName: parentName,
            fullPath: parentName ? `${parentName} > ${node.name}` : node.name,
            node: node
          };
          
          allLayers.push(layerInfo);
        }
        
        // Rekursiv durch Kinder
        if ('children' in node && node.children) {
          for (const child of node.children) {
            traverseNode(child, depth + 1, node.name);
          }
        }
      }
      
      // Alle Seiten durchsuchen
      for (const page of figma.root.children) {
        traverseNode(page, 0);
      }
      
      // Sortieren: Frames zuerst, dann alphabetisch
      allLayers.sort((a, b) => {
        if (a.type === 'FRAME' && b.type !== 'FRAME') return -1;
        if (a.type !== 'FRAME' && b.type === 'FRAME') return 1;
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.name.localeCompare(b.name);
      });
      
      console.log(`Gefunden: ${allLayers.length} Ebenen/Gruppen/Frames`);
      
      figma.ui.postMessage({
        type: 'layers-loaded',
        layers: allLayers.map(layer => ({
          id: layer.id,
          name: layer.name,
          type: layer.type,
          width: layer.width,
          height: layer.height,
          depth: layer.depth,
          parentName: layer.parentName,
          fullPath: layer.fullPath
        }))
      });
      
    } catch (error) {
      figma.ui.postMessage({
        type: 'error',
        message: `Fehler beim Laden der Ebenen: ${error.message}`
      });
    }
  }
  
  if (msg.type === 'export-selected-layers') {
    try {
      const layersToExport = msg.layers;
      const settings = msg.settings || { scale: 2, format: 'PNG', naming: 'layer_name_date' };
      let exportedCount = 0;
      const exportData = [];
      
      figma.ui.postMessage({
        type: 'progress',
        message: `Beginne Export von ${layersToExport.length} ausgewählten Ebenen...`
      });
      
      for (const layerInfo of layersToExport) {
        try {
          // Node anhand der ID finden
          const node = await figma.getNodeByIdAsync(layerInfo.id);
          
          if (!node) {
            console.warn(`Node mit ID ${layerInfo.id} nicht gefunden`);
            continue;
          }
          
          // Export-Einstellungen
          const exportSettings = {
            format: settings.format,
            constraint: {
              type: 'SCALE',
              value: settings.scale
            }
          };
          
          // Node exportieren
          const imageData = await node.exportAsync(exportSettings);
          
          // Dateiname generieren
          const timestamp = new Date().toISOString().slice(0, 10);
          const sanitizedName = layerInfo.name.replace(/[^a-zA-Z0-9]/g, '_');
          const sanitizedType = layerInfo.type.toLowerCase();
          
          let fileName;
          switch (settings.naming) {
            case 'type_layer_date':
              fileName = `${sanitizedType}_${sanitizedName}_${timestamp}.${settings.format.toLowerCase()}`;
              break;
            case 'layer_type':
              fileName = `${sanitizedName}_${sanitizedType}.${settings.format.toLowerCase()}`;
              break;
            default: // layer_name_date
              fileName = `${sanitizedName}_${timestamp}.${settings.format.toLowerCase()}`;
          }
          
          exportData.push({
            fileName: fileName,
            imageData: imageData,
            width: layerInfo.width,
            height: layerInfo.height,
            layerName: layerInfo.name,
            layerType: layerInfo.type
          });
          
          exportedCount++;
          
          figma.ui.postMessage({
            type: 'progress',
            message: `Exportiert: ${fileName} (${exportedCount}/${layersToExport.length})`
          });
          
        } catch (exportError) {
          console.warn(`Fehler beim Exportieren von ${layerInfo.name}: ${exportError.message}`);
        }
      }
      
      figma.ui.postMessage({
        type: 'export-completed',
        count: exportedCount,
        message: `${exportedCount} Ebenen erfolgreich exportiert!`
      });
      
      // Direkter Download
      if (exportData.length > 0) {
        figma.ui.postMessage({
          type: 'download-ready',
          files: exportData,
          message: `Download bereit für ${exportData.length} Datei(en)`
        });
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
