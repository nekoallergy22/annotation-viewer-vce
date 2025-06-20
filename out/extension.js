"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
function activate(context) {
    let disposable = vscode.commands.registerCommand('annotationViewer.openViewer', async (resourceUri, allSelected) => {
        let dirPath;
        // Handle multiple file selection
        if (allSelected && allSelected.length > 0) {
            // Find the directory containing the selected files
            const selectedPaths = allSelected.map(uri => uri.fsPath);
            const directories = selectedPaths.filter(p => {
                try {
                    return fs.statSync(p).isDirectory();
                }
                catch {
                    return false;
                }
            });
            if (directories.length > 0) {
                dirPath = directories[0];
            }
            else {
                // Use directory of first selected file
                dirPath = path.dirname(selectedPaths[0]);
            }
        }
        else if (resourceUri && resourceUri.scheme === 'file') {
            dirPath = resourceUri.fsPath;
        }
        else {
            const dirUri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Directory to View Images'
            });
            if (!dirUri || dirUri.length === 0) {
                vscode.window.showErrorMessage('Directory not selected');
                return;
            }
            dirPath = dirUri[0].fsPath;
        }
        const panel = vscode.window.createWebviewPanel('annotationViewer', 'Annotation Viewer', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
        let imageFiles = getImageFiles(dirPath, imageExtensions);
        if (imageFiles.length === 0) {
            const message = allSelected && allSelected.length > 0 ?
                'No images found in selected files' :
                'No images found in directory';
            vscode.window.showInformationMessage(message);
            return;
        }
        // Look for annotation files in the same directory
        let annotationFiles = getAnnotationFiles(dirPath);
        // If files were specifically selected, filter to only those
        if (allSelected && allSelected.length > 0) {
            const selectedPaths = allSelected.map(uri => uri.fsPath);
            const selectedFiles = allSelected.map(uri => path.basename(uri.fsPath));
            // Check for directories
            const directories = selectedPaths.filter(p => {
                try {
                    return fs.statSync(p).isDirectory();
                }
                catch {
                    return false;
                }
            });
            // Check for JSON files (get full paths, not just filenames)
            const selectedJsonPaths = selectedPaths.filter(p => {
                const ext = path.extname(p).toLowerCase();
                return ext === '.json';
            });
            // Validate: only one JSON file allowed
            if (selectedJsonPaths.length > 1) {
                vscode.window.showErrorMessage('Please select only one JSON annotation file.');
                return;
            }
            // If directory is selected, get images from directory
            if (directories.length > 0) {
                dirPath = directories[0];
                imageFiles = getImageFiles(dirPath, imageExtensions);
            }
            else {
                // Filter selected image files
                const selectedImageFiles = selectedFiles.filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    return imageExtensions.includes(ext);
                });
                if (selectedImageFiles.length > 0) {
                    imageFiles = selectedImageFiles.sort();
                }
            }
            // Use selected annotation file if found (use basename for consistency)
            if (selectedJsonPaths.length > 0) {
                annotationFiles = selectedJsonPaths.map(p => path.basename(p));
                // Update dirPath to JSON file's directory if not already set
                if (!directories.length && !imageFiles.length) {
                    dirPath = path.dirname(selectedJsonPaths[0]);
                    imageFiles = getImageFiles(dirPath, imageExtensions);
                }
            }
        }
        // Pass full JSON paths if files were specifically selected
        const jsonFilePaths = allSelected && allSelected.length > 0 ?
            allSelected.filter(uri => path.extname(uri.fsPath).toLowerCase() === '.json').map(uri => uri.fsPath) :
            [];
        panel.webview.html = getWebviewContent(imageFiles, annotationFiles, dirPath, panel.webview, context.extensionUri, jsonFilePaths);
        panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'alert':
                    vscode.window.showErrorMessage(message.text);
                    return;
            }
        }, undefined, context.subscriptions);
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
function getImageFiles(dirPath, extensions) {
    try {
        const files = fs.readdirSync(dirPath);
        return files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return extensions.includes(ext);
        }).sort();
    }
    catch (error) {
        return [];
    }
}
function getAnnotationFiles(dirPath) {
    try {
        const files = fs.readdirSync(dirPath);
        return files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ext === '.json';
        }).sort();
    }
    catch (error) {
        return [];
    }
}
function parseAnnotations(annotationPath) {
    try {
        const content = fs.readFileSync(annotationPath, 'utf8');
        return JSON.parse(content);
    }
    catch (error) {
        console.error('Failed to parse annotation file:', error);
        return null;
    }
}
function findAnnotationsForImage(imageFilename, allAnnotations) {
    const imageAnnotations = [];
    for (const annotationFile of allAnnotations) {
        const data = annotationFile.data;
        // Support COCO format
        if (data.images && data.annotations && data.categories) {
            // Find image by file_name (COCO standard) or filename
            const imageInfo = data.images.find((img) => img.file_name === imageFilename || img.filename === imageFilename);
            if (imageInfo) {
                // Find all annotations for this image
                const annotations = data.annotations.filter((ann) => ann.image_id === imageInfo.id);
                // Add annotations with category information
                annotations.forEach((ann) => {
                    const category = data.categories.find((cat) => cat.id === ann.category_id);
                    imageAnnotations.push({
                        ...ann,
                        categoryName: category ? category.name : 'Unknown',
                        categorySuper: category ? category.supercategory : 'Unknown',
                        source: annotationFile.filename,
                        imageWidth: imageInfo.width,
                        imageHeight: imageInfo.height
                    });
                });
            }
        }
        // Support simple format where filename matches
        else if (data[imageFilename]) {
            imageAnnotations.push({
                annotations: data[imageFilename],
                source: annotationFile.filename
            });
        }
    }
    return imageAnnotations;
}
function getTotalAnnotations(imageData) {
    return imageData.reduce((total, img) => total + (img.annotations ? img.annotations.length : 0), 0);
}
function getWebviewContent(imageFiles, annotationFiles, dirPath, webview, extensionUri, jsonFilePaths = []) {
    // Parse all annotation files
    const allAnnotations = annotationFiles.map((filename, index) => {
        // Use full path if provided, otherwise join with dirPath
        const annotationPath = jsonFilePaths.length > index ?
            jsonFilePaths[index] :
            path.join(dirPath, filename);
        const data = parseAnnotations(annotationPath);
        return {
            filename,
            data: data
        };
    }).filter(ann => ann.data !== null);
    const imageData = imageFiles.map((filename, index) => {
        const imgPath = path.join(dirPath, filename);
        const imgUri = webview.asWebviewUri(vscode.Uri.file(imgPath));
        // Find annotations for this image
        const imageAnnotations = findAnnotationsForImage(filename, allAnnotations);
        return {
            index,
            filename,
            uri: imgUri.toString(),
            annotations: imageAnnotations
        };
    });
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Annotation Viewer</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #1e1e1e;
            color: #cccccc;
        }
        .container {
            max-width: 100%;
            margin: 0 auto;
        }
        .header {
            margin-bottom: 20px;
            border-bottom: 1px solid #444;
            padding-bottom: 15px;
        }
        .directory-path {
            font-size: 12px;
            color: #888;
            margin-bottom: 10px;
            word-wrap: break-word;
            font-family: monospace;
        }
        .stats {
            display: flex;
            gap: 20px;
            margin-top: 10px;
        }
        .stat-item {
            background-color: #2d2d2d;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            color: #ccc;
        }
        .controls {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
            margin: 20px 0;
            flex-wrap: wrap;
        }
        .control-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .toggle-button {
            background-color: #0e639c;
            color: white;
            border: none;
            padding: 8px 16px;
            margin: 0 5px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .toggle-button:hover {
            background-color: #1177bb;
        }
        .toggle-button.active {
            background-color: #1177bb;
        }
        .annotation-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .annotation-toggle {
            background-color: #28a745;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .annotation-toggle.disabled {
            background-color: #6c757d;
        }
        
        /* Grid View */
        .grid-view {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .grid-item {
            background-color: #2d2d2d;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .grid-item:hover {
            transform: scale(1.02);
        }
        .grid-item img {
            width: 100%;
            height: 150px;
            object-fit: cover;
            display: block;
        }
        .grid-item .filename {
            padding: 8px;
            font-size: 12px;
            color: #ccc;
            text-align: center;
            word-wrap: break-word;
        }
        
        /* Fullscreen View */
        .fullscreen-view {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: #1e1e1e;
            z-index: 1000;
        }
        .fullscreen-header {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            background-color: rgba(30, 30, 30, 0.9);
            padding: 10px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 1001;
        }
        .close-button {
            background-color: #666;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }
        .close-button:hover {
            background-color: #888;
        }
        .fullscreen-content {
            position: absolute;
            top: 60px;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .fullscreen-image {
            max-width: 95%;
            max-height: 90%;
            object-fit: contain;
            cursor: grab;
            transition: transform 0.1s ease;
        }
        .fullscreen-image:active {
            cursor: grabbing;
        }
        .fullscreen-filename {
            margin-top: 20px;
            font-size: 16px;
            color: #fff;
        }
        .navigation {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            background-color: rgba(30, 30, 30, 0.9);
            padding: 15px 20px;
            border-radius: 8px;
            min-width: 400px;
            justify-content: space-between;
        }
        .nav-left {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .nav-center {
            display: flex;
            align-items: center;
            gap: 20px;
            flex: 1;
            justify-content: center;
        }
        .slider-container {
            flex: 1;
            max-width: 200px;
        }
        .slider {
            width: 100%;
            height: 6px;
            border-radius: 3px;
            background: #444;
            outline: none;
            -webkit-appearance: none;
        }
        .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #0e639c;
            cursor: pointer;
        }
        .slider::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #0e639c;
            cursor: pointer;
            border: none;
        }
        .nav-button {
            background-color: #28a745;
            color: white;
            border: none;
            padding: 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .nav-button:hover {
            background-color: #34ce57;
        }
        .nav-button:disabled {
            background-color: #555;
            cursor: not-allowed;
        }
        .counter {
            color: #ffffff;
            font-size: 16px;
        }
        .play-button {
            background-color: #0e639c;
            color: white;
            border: none;
            padding: 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .play-button:hover {
            background-color: #1177bb;
        }
        .play-button.paused {
            background-color: #dc3545;
        }
        .play-button.paused:hover {
            background-color: #c82333;
        }
        .speed-selector {
            background-color: #2d2d2d;
            color: white;
            border: 1px solid #444;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        .repeat-toggle {
            background-color: #2d2d2d;
            color: white;
            border: 1px solid #444;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
        }
        .repeat-toggle.active {
            background-color: #28a745;
            border-color: #28a745;
        }
        /* Annotation Overlay */
        .annotation-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10;
        }
        .annotation-box {
            position: absolute;
            border: 2px solid;
            border-radius: 2px;
            background-color: rgba(255, 255, 255, 0.1);
        }
        .annotation-label {
            position: absolute;
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 2px 6px;
            font-size: 12px;
            border-radius: 2px;
            white-space: nowrap;
        }
        .current-annotation-info {
            position: absolute;
            top: 70px;
            right: 20px;
            background-color: rgba(30, 30, 30, 0.9);
            padding: 10px;
            border-radius: 4px;
            font-size: 12px;
            max-width: 200px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Annotation Viewer</h1>
            <div class="directory-path">Path: ${dirPath}</div>
            <div class="stats">
                <span class="stat-item">Images: ${imageData.length}</span>
                <span class="stat-item">Annotations: ${getTotalAnnotations(imageData)}</span>
                <span class="stat-item">JSON Files: ${annotationFiles.length}</span>
            </div>
        </div>
        
        
        <div class="grid-view" id="gridView">
            ${imageData.map(img => `
                <div class="grid-item" data-index="${img.index}">
                    <img src="${img.uri}" alt="${img.filename}" loading="lazy">
                    <div class="filename">${img.filename}</div>
                </div>
            `).join('')}
        </div>
    </div>
    
    <div class="fullscreen-view" id="fullscreenView">
        <div class="fullscreen-header">
            <div class="counter" id="fullscreenCounter">1 / ${imageData.length}</div>
            <button class="close-button" id="closeButton">Close</button>
        </div>
        <div class="fullscreen-content">
            <div style="position: relative; display: inline-block;">
                <img class="fullscreen-image" id="fullscreenImage" src="" alt="">
                <div class="annotation-overlay" id="annotationOverlay"></div>
            </div>
            <div class="fullscreen-filename" id="fullscreenFilename"></div>
        </div>
        <div class="current-annotation-info" id="currentAnnotationInfo" style="display: none;">
            <div id="annotationDetails"></div>
        </div>
        <div class="navigation">
            <div class="nav-left">
                <button class="nav-button" id="prevButton">←</button>
                <button class="nav-button" id="nextButton">→</button>
            </div>
            <div class="nav-center">
                <span class="counter" id="navigationCounter">1 / ${imageData.length}</span>
                <div class="slider-container">
                    <input type="range" min="1" max="${imageData.length}" value="1" class="slider" id="imageSlider">
                </div>
                <button class="play-button" id="playButton">▶</button>
                <select class="speed-selector" id="speedSelector">
                    <option value="100" selected>0.1s</option>
                    <option value="500">0.5s</option>
                    <option value="1000">1s</option>
                    <option value="2000">2s</option>
                </select>
                <button class="repeat-toggle active" id="repeatToggle">Repeat: ON</button>
                <button class="annotation-toggle" id="fullscreenAnnotationToggle">Annotations: ON</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const imageData = ${JSON.stringify(imageData)};
        let currentIndex = 0;
        let scale = 1;
        let translateX = 0;
        let translateY = 0;
        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        let isPlaying = false;
        let playInterval = null;
        let isRepeatMode = true;
        let showAnnotations = true;
        
        const fullscreenView = document.getElementById('fullscreenView');
        const fullscreenImage = document.getElementById('fullscreenImage');
        const fullscreenFilename = document.getElementById('fullscreenFilename');
        const fullscreenCounter = document.getElementById('fullscreenCounter');
        const navigationCounter = document.getElementById('navigationCounter');
        const imageSlider = document.getElementById('imageSlider');
        const closeButton = document.getElementById('closeButton');
        const prevButton = document.getElementById('prevButton');
        const nextButton = document.getElementById('nextButton');
        const playButton = document.getElementById('playButton');
        const speedSelector = document.getElementById('speedSelector');
        const repeatToggle = document.getElementById('repeatToggle');
        const annotationOverlay = document.getElementById('annotationOverlay');
        const fullscreenAnnotationToggle = document.getElementById('fullscreenAnnotationToggle');
        const currentAnnotationInfo = document.getElementById('currentAnnotationInfo');
        const annotationDetails = document.getElementById('annotationDetails');
        
        // Grid item click handlers
        document.querySelectorAll('.grid-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                openFullscreen(index);
            });
        });
        
        function openFullscreen(index) {
            currentIndex = index;
            scale = 1;
            translateX = 0;
            translateY = 0;
            updateFullscreenImage();
            fullscreenView.style.display = 'block';
            document.body.style.overflow = 'hidden';
            
            // Ensure annotations are updated after image loads
            setTimeout(() => {
                updateAnnotations();
            }, 100);
        }
        
        function closeFullscreen() {
            if (isPlaying) stopSlideshow();
            fullscreenView.style.display = 'none';
            document.body.style.overflow = 'auto';
            scale = 1;
            translateX = 0;
            translateY = 0;
        }
        
        function updateFullscreenImage() {
            const img = imageData[currentIndex];
            fullscreenImage.src = img.uri;
            fullscreenFilename.textContent = img.filename;
            fullscreenCounter.textContent = \`\${currentIndex + 1} / \${imageData.length}\`;
            navigationCounter.textContent = \`\${currentIndex + 1} / \${imageData.length}\`;
            imageSlider.value = currentIndex + 1;
            
            prevButton.disabled = currentIndex === 0;
            nextButton.disabled = currentIndex === imageData.length - 1;
            
            // Reset transform when changing images
            scale = 1;
            translateX = 0;
            translateY = 0;
            updateImageTransform();
            
            // Update annotations
            updateAnnotations();
            updateAnnotationInfo();
        }
        
        function updateImageTransform() {
            fullscreenImage.style.transform = \`translate(\${translateX}px, \${translateY}px) scale(\${scale})\`;
            updateAnnotations();
        }
        
        function updateAnnotations() {
            if (!annotationOverlay) return;
            
            annotationOverlay.innerHTML = '';
            
            if (!showAnnotations) return;
            
            const img = imageData[currentIndex];
            
            if (!img.annotations || img.annotations.length === 0) return;
            
            // Wait for image to load to get dimensions
            const imageRect = fullscreenImage.getBoundingClientRect();
            const imageElement = fullscreenImage;
            
            img.annotations.forEach((annotation, index) => {
                if (annotation.bbox) {
                    const [x, y, width, height] = annotation.bbox;
                    
                    // Calculate base scaling from image natural size to display size
                    const baseScaleX = imageElement.clientWidth / imageElement.naturalWidth;
                    const baseScaleY = imageElement.clientHeight / imageElement.naturalHeight;
                    
                    // Get image center in displayed coordinates
                    const imageCenterX = imageElement.clientWidth / 2;
                    const imageCenterY = imageElement.clientHeight / 2;
                    
                    // Calculate annotation position relative to image center
                    const annotationCenterX = (x + width / 2) * baseScaleX;
                    const annotationCenterY = (y + height / 2) * baseScaleY;
                    
                    // Apply zoom from center point
                    const scaledAnnotationCenterX = (annotationCenterX - imageCenterX) * scale + imageCenterX;
                    const scaledAnnotationCenterY = (annotationCenterY - imageCenterY) * scale + imageCenterY;
                    
                    // Calculate final position and size
                    const finalWidth = width * baseScaleX * scale;
                    const finalHeight = height * baseScaleY * scale;
                    const finalX = scaledAnnotationCenterX - finalWidth / 2 + translateX;
                    const finalY = scaledAnnotationCenterY - finalHeight / 2 + translateY;
                    
                    const box = document.createElement('div');
                    box.className = 'annotation-box';
                    box.style.left = finalX + 'px';
                    box.style.top = finalY + 'px';
                    box.style.width = finalWidth + 'px';
                    box.style.height = finalHeight + 'px';
                    box.style.borderColor = getAnnotationColor(annotation.category_id || index);
                    
                    // Add label if available
                    if (annotation.categoryName) {
                        const label = document.createElement('div');
                        label.className = 'annotation-label';
                        label.textContent = annotation.categoryName;
                        label.style.backgroundColor = getAnnotationColor(annotation.category_id || index);
                        label.style.top = '-20px';
                        label.style.fontSize = Math.max(10, 12 * scale) + 'px';
                        box.appendChild(label);
                    }
                    
                    annotationOverlay.appendChild(box);
                }
            });
        }
        
        function getAnnotationColor(categoryId) {
            const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080'];
            return colors[categoryId % colors.length];
        }
        
        function updateAnnotationInfo() {
            const img = imageData[currentIndex];
            const annotationCount = img.annotations ? img.annotations.length : 0;
            
            if (annotationDetails && img.annotations && img.annotations.length > 0) {
                const details = img.annotations.map((ann, index) => {
                    const category = ann.categoryName || \`Annotation \${index + 1}\`;
                    return \`• \${category}\`;
                }).join('<br>');
                
                annotationDetails.innerHTML = \`<strong>Annotations (\${img.annotations.length}):</strong><br>\${details}\`;
                currentAnnotationInfo.style.display = 'block';
            } else {
                currentAnnotationInfo.style.display = 'none';
            }
        }
        
        function startSlideshow() {
            if (currentIndex === imageData.length - 1 && !isRepeatMode) {
                currentIndex = 0;
                updateFullscreenImage();
            }
            
            isPlaying = true;
            playButton.textContent = '⏸';
            playButton.classList.add('paused');
            const interval = parseInt(speedSelector.value);
            playInterval = setInterval(() => {
                if (currentIndex < imageData.length - 1) {
                    currentIndex++;
                    updateFullscreenImage();
                } else if (isRepeatMode) {
                    currentIndex = 0;
                    updateFullscreenImage();
                } else {
                    stopSlideshow();
                }
            }, interval);
        }
        
        function stopSlideshow() {
            isPlaying = false;
            playButton.textContent = '▶';
            playButton.classList.remove('paused');
            if (playInterval) {
                clearInterval(playInterval);
                playInterval = null;
            }
        }
        
        function toggleSlideshow() {
            if (isPlaying) {
                stopSlideshow();
            } else {
                startSlideshow();
            }
        }
        
        function toggleRepeatMode() {
            isRepeatMode = !isRepeatMode;
            repeatToggle.textContent = isRepeatMode ? 'Repeat: ON' : 'Repeat: OFF';
            repeatToggle.classList.toggle('active', isRepeatMode);
        }
        
        function toggleAnnotations() {
            showAnnotations = !showAnnotations;
            if (fullscreenAnnotationToggle) {
                fullscreenAnnotationToggle.textContent = showAnnotations ? 'Annotations: ON' : 'Annotations: OFF';
                fullscreenAnnotationToggle.classList.toggle('disabled', !showAnnotations);
            }
            updateAnnotations();
        }
        
        // Mouse drag zoom functionality
        fullscreenImage.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - lastMouseX;
            const deltaY = e.clientY - lastMouseY;
            
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                // Vertical movement - zoom
                const zoomFactor = deltaY > 0 ? 0.99 : 1.01;
                scale *= zoomFactor;
                scale = Math.max(0.1, Math.min(5, scale)); // Limit zoom range
            } else {
                // Horizontal movement - pan
                if (scale > 1) {
                    translateX += deltaX;
                    translateY += deltaY;
                }
            }
            
            updateImageTransform();
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        // Mouse wheel zoom
        fullscreenImage.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            scale *= zoomFactor;
            scale = Math.max(0.1, Math.min(5, scale));
            updateImageTransform();
        });
        
        function nextImage() {
            if (isPlaying) stopSlideshow();
            if (currentIndex < imageData.length - 1) {
                currentIndex++;
                updateFullscreenImage();
            }
        }
        
        function prevImage() {
            if (isPlaying) stopSlideshow();
            if (currentIndex > 0) {
                currentIndex--;
                updateFullscreenImage();
            }
        }
        
        // Event listeners
        closeButton.addEventListener('click', closeFullscreen);
        prevButton.addEventListener('click', prevImage);
        nextButton.addEventListener('click', nextImage);
        playButton.addEventListener('click', toggleSlideshow);
        repeatToggle.addEventListener('click', toggleRepeatMode);
        if (fullscreenAnnotationToggle) fullscreenAnnotationToggle.addEventListener('click', toggleAnnotations);
        
        // Slider event listener
        imageSlider.addEventListener('input', (e) => {
            if (isPlaying) stopSlideshow();
            currentIndex = parseInt(e.target.value) - 1;
            updateFullscreenImage();
        });
        
        // Keyboard navigation
        document.addEventListener('keydown', (event) => {
            if (fullscreenView.style.display === 'block') {
                switch(event.key) {
                    case 'Escape':
                        event.preventDefault();
                        closeFullscreen();
                        break;
                    case 'ArrowLeft':
                        event.preventDefault();
                        prevImage();
                        break;
                    case 'ArrowRight':
                        event.preventDefault();
                        nextImage();
                        break;
                    case ' ':
                    case 'Space':
                        event.preventDefault();
                        toggleSlideshow();
                        break;
                }
            }
        });
        
        // Click outside to close
        fullscreenView.addEventListener('click', (event) => {
            if (event.target === fullscreenView) {
                closeFullscreen();
            }
        });
    </script>
</body>
</html>`;
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map