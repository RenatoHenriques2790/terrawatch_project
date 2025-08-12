// Enhanced User Profile Management for Dashboard

// Load profile data - MAIN ENTRY POINT
async function loadProfileData() {
    console.log('loadProfileData called');
    await handleProfile();
}

// Initialize profile management
function initializeProfileManagement() {
    console.log('Initializing profile management...');
    
    // Make sure all functions are available
    if (typeof handleProfile === 'function') {
        handleProfile();
    }
}

// Create Worksheet Handler
function handleCreateWorksheet() {
    // Create modal container if it doesn't exist
    let modalContainer = document.getElementById('createWorksheetModal');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'createWorksheetModal';
        modalContainer.className = 'modal create-worksheet-modal';
        document.body.appendChild(modalContainer);
    }

    modalContainer.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>
                    <i class="ri-file-add-line"></i>
                    Criar Nova Worksheet
                </h3>
                <button class="close-modal" onclick="closeCreateWorksheetModal()">
                    <i class="ri-close-line"></i>
                </button>
            </div>
            <div class="modal-body">
                <form id="createWsForm">
                    <div class="file-upload" id="fileDropArea">
                        <i class="ri-upload-cloud-2-line"></i>
                        <p><strong>Arraste e solte o arquivo GeoJSON aqui</strong><br>ou clique para selecionar</p>
                        <small>Formatos aceitos: .geojson, .json</small>
                        <input type="file" id="worksheetFile" name="worksheetFile" accept=".geojson,.json" style="display: none;">
                        <div class="selected-file" id="selectedFile" style="display: none;">
                            <i class="ri-file-text-line"></i>
                            <span></span>
                            <button type="button" class="btn-icon" onclick="removeSelectedFile()" title="Remover arquivo">
                                <i class="ri-close-line"></i>
                            </button>
                        </div>
                    </div>
                    <div class="file-validation" id="fileValidation" style="display: none;">
                        <div class="validation-message">
                            <i class="ri-error-warning-line"></i>
                            <span></span>
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" id="submitWorksheet" disabled>
                    <i class="ri-upload-line"></i>
                    Enviar Worksheet
                </button>
                <button type="button" class="btn btn-secondary" onclick="closeCreateWorksheetModal()">
                    <i class="ri-close-line"></i>
                    Cancelar
                </button>
            </div>
        </div>
    `;

    // Show modal
    modalContainer.style.display = 'flex';

    // Close modal when clicking outside
    modalContainer.onclick = function(event) {
        if (event.target === modalContainer) {
            closeCreateWorksheetModal();
        }
    };

    // Close modal when pressing ESC
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeCreateWorksheetModal();
        }
    });

    // Setup drag and drop
    const dropArea = document.getElementById('fileDropArea');
    const fileInput = document.getElementById('worksheetFile');
    const selectedFileDiv = document.getElementById('selectedFile');
    const submitButton = document.getElementById('submitWorksheet');
    const validationDiv = document.getElementById('fileValidation');

    // Click to select file
    dropArea.addEventListener('click', () => fileInput.click());

    // Handle drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.remove('dragover');
        });
    });

    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFile(file);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        handleFile(file);
    }

    function handleFile(file) {
        if (!file) return;

        // Validate file type
        const validTypes = ['.geojson', '.json'];
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        
        if (!validTypes.includes(fileExtension)) {
            showValidationError('Por favor, selecione um arquivo GeoJSON válido (.geojson ou .json)');
            return;
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            showValidationError('O arquivo é muito grande. Tamanho máximo: 10MB');
            return;
        }

        // Clear any previous errors
        clearValidationError();

        // Update UI
        selectedFileDiv.style.display = 'flex';
        selectedFileDiv.querySelector('span').textContent = file.name;
        submitButton.disabled = false;

        // Store file for later
        dropArea.file = file;
    }

    function showValidationError(message) {
        validationDiv.style.display = 'block';
        validationDiv.querySelector('span').textContent = message;
        dropArea.classList.add('error');
        submitButton.disabled = true;
    }

    function clearValidationError() {
        validationDiv.style.display = 'none';
        dropArea.classList.remove('error');
    }

    // Handle form submission
    submitButton.addEventListener('click', async () => {
        const file = dropArea.file;
        if (!file) {
            ui.showAlert('Por favor, selecione um ficheiro GeoJSON.', 'error');
            return;
        }

        // Show loading state
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="ri-loader-4-line"></i> Enviando...';
        dropArea.classList.add('loading');

        const reader = new FileReader();
        reader.onload = async () => {
            let payload;
            try {
                payload = JSON.parse(reader.result);
                
                // Basic GeoJSON validation
                if (!payload.type || payload.type !== 'FeatureCollection') {
                    throw new Error('Arquivo deve ser um GeoJSON FeatureCollection válido');
                }
                
                if (!payload.features || !Array.isArray(payload.features)) {
                    throw new Error('GeoJSON deve conter um array de features');
                }

            } catch (err) {
                ui.showAlert('GeoJSON inválido: ' + err.message, 'error');
                resetSubmitButton();
                return;
            }

            try {
                ui.showLoading(true, 'Criando worksheet...');

                const resp = await auth.fetch('/rest/worksheet/create', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                if (!resp.ok) {
                    const text = await resp.text();
                    throw new Error(text || `HTTP ${resp.status}`);
                }

                const success = await resp.json();
                if (success === true) {
                    ui.showAlert('Worksheet criado com sucesso!', 'success');
                    closeCreateWorksheetModal();
                    // Refresh worksheets list if available
                    if (typeof refreshWorksheetsList === 'function') {
                        refreshWorksheetsList();
                    }
                } else {
                    throw new Error('Resposta inesperada do servidor');
                }
            } catch (err) {
                ui.showAlert('Erro ao criar worksheet: ' + err.message, 'error');
            } finally {
                ui.showLoading(false);
                resetSubmitButton();
            }
        };

        reader.onerror = () => {
            ui.showAlert('Erro ao ler o ficheiro.', 'error');
            resetSubmitButton();
        };

        reader.readAsText(file);
    });

    function resetSubmitButton() {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="ri-upload-line"></i> Enviar Worksheet';
        dropArea.classList.remove('loading');
    }
}

// Close create worksheet modal
function closeCreateWorksheetModal() {
    const modalContainer = document.getElementById('createWorksheetModal');
    if (modalContainer) {
        modalContainer.style.display = 'none';
    }
}

// Remove selected file
function removeSelectedFile() {
    const selectedFileDiv = document.getElementById('selectedFile');
    const fileInput = document.getElementById('worksheetFile');
    const submitButton = document.getElementById('submitWorksheet');
    const validationDiv = document.getElementById('fileValidation');
    const dropArea = document.getElementById('fileDropArea');

    if (selectedFileDiv) {
        selectedFileDiv.style.display = 'none';
        selectedFileDiv.querySelector('span').textContent = '';
    }
    
    if (fileInput) {
        fileInput.value = '';
    }
    
    if (submitButton) {
        submitButton.disabled = true;
    }
    
    if (validationDiv) {
        validationDiv.style.display = 'none';
    }
    
    if (dropArea) {
        dropArea.classList.remove('error');
        dropArea.file = null;
    }
}

// Remove Worksheet Handler
function handleRemoveWorksheet() {
    const container = document.getElementById('operatorContent');
    if (!container) return;
    
    container.innerHTML = `
        <div class="form-section">
            <form id="deleteWsForm" class="form-vertical">
                <div class="form-group">
                    <label for="wsId">ID do Worksheet a remover</label>
                    <input type="number" id="wsId" name="wsId" class="form-control"
                        placeholder="Ex: 12345" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-danger">
                        <i class="ri-delete-bin-line"></i>
                        Remover
                    </button>
                </div>
            </form>
            <div id="deleteWsResult" class="mt-2"></div>
        </div>
    `;

    document.getElementById('deleteWsForm').addEventListener('submit', async e => {
        e.preventDefault();
        const id = e.target.wsId.value.trim();
        const resultDiv = document.getElementById('deleteWsResult');

        if (!id) {
            ui.showAlert('Por favor, indica o ID do worksheet.', 'error');
            return;
        }

        if (!confirm(`Tens a certeza que queres remover o worksheet ${id}?`)) {
            return;
        }

        try {
            ui.showLoading(true, 'Removendo worksheet...');
            resultDiv.textContent = 'Processando…';
            
            const resp = await auth.fetch(`/rest/worksheet/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });

            if (!resp.ok) {
                const errorText = await resp.text().catch(() => null);
                throw new Error(errorText || `HTTP ${resp.status}`);
            }

            ui.showAlert(`Worksheet ${id} removido com sucesso!`, 'success');
            resultDiv.textContent = '';
            
            // Refresh worksheets list if available
            if (typeof refreshWorksheetsList === 'function') {
                refreshWorksheetsList();
            }
        } catch (err) {
            console.error('Erro ao remover worksheet:', err);
            ui.showAlert(`Falha ao remover worksheet: ${err.message}`, 'error');
            resultDiv.textContent = '';
        } finally {
            ui.showLoading(false);
        }
    });
}

// Visualize Worksheet Handler
function handleVisualizeWorksheet() {
    const container = document.getElementById('operatorContent');
    if (!container) return;
    
    container.innerHTML = `
        <div class="form-section">
            <form id="visualizeForm" class="form-vertical">
                <div class="form-group">
                    <label for="wsId">ID da Worksheet</label>
                    <input type="number" name="wsId" id="wsId" class="form-control" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        <i class="ri-eye-line"></i>
                        Visualizar
                    </button>
                </div>
            </form>
            <div id="visualizeResult" class="mt-3"></div>
        </div>
    `;

    document.getElementById('visualizeForm').addEventListener('submit', async e => {
        e.preventDefault();
        const id = e.target.wsId.value;
        const resultDiv = document.getElementById('visualizeResult');
        
        try {
            ui.showLoading(true, 'Carregando worksheet...');
            resultDiv.textContent = 'Carregando…';

            const resp = await auth.fetch(`/rest/worksheet/${encodeURIComponent(id)}`, {
                method: 'GET'
            });

            if (resp.status === 404) {
                throw new Error('Worksheet não encontrada');
            }
            if (!resp.ok) {
                const txt = await resp.text();
                throw new Error(txt || `HTTP ${resp.status}`);
            }

            const data = await resp.json();

            resultDiv.innerHTML = `
                <div class="worksheet-display">
                    <h4>Dados da Worksheet #${id}</h4>
                    <pre class="code-block" style="background: #f8f9fa; padding: 1rem; border-radius: 4px; max-height: 400px; overflow-y: auto;">
                        ${JSON.stringify(data, null, 2)}
                    </pre>
                </div>
            `;

        } catch (err) {
            console.error('Erro ao visualizar worksheet:', err);
            ui.showAlert('Falha: ' + err.message, 'error');
            resultDiv.textContent = '';
        } finally {
            ui.showLoading(false);
        }
    });
}

// Setup worksheet management functionality
function setupWorksheetManagement() {
    console.log('Setting up worksheet management...');
    
    // Setup refresh button
    const refreshBtn = document.getElementById('refreshWorksheetsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (typeof refreshWorksheetsList === 'function') {
                refreshWorksheetsList();
            }
        });
    }

    // Setup create button
    const createBtn = document.getElementById('createWorksheetBtn');
    if (createBtn) {
        createBtn.addEventListener('click', handleCreateWorksheet);
    }
    
    // Setup search functionality
    const searchInput = document.getElementById('worksheetSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function() {
            filterWorksheets(this.value);
        }, 300));
    }
    
    // Load initial worksheet list
    if (typeof refreshWorksheetsList === 'function') {
        console.log('Initial worksheet list refresh...');
        refreshWorksheetsList().catch(error => {
            console.error('Error during initial worksheet refresh:', error);
        });
    } else {
        console.warn('refreshWorksheetsList function not available');
    }
}

// Filter worksheets based on search input
function filterWorksheets(searchTerm) {
    if (!currentWorksheets) return;
    
    const filtered = searchTerm
        ? currentWorksheets.filter(ws => 
            ws.id.toString().includes(searchTerm) ||
            (ws.service_provider_id || ws.serviceProviderId || '').toString().includes(searchTerm)
          )
        : currentWorksheets;
    
    displayWorksheetsList(filtered);
}

// Debounce helper function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Show worksheet details - enhanced version
function showWorksheetDetails(worksheetId) {
    if (typeof viewWorksheetDetails === 'function') {
        viewWorksheetDetails(worksheetId);
    } else {
        console.warn('viewWorksheetDetails function not available');
    }
}

// Format date utility
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-PT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch (error) {
        return 'Data inválida';
    }
}

// Export functions to global scope
window.handleCreateWorksheet = handleCreateWorksheet;
window.handleRemoveWorksheet = handleRemoveWorksheet;
window.handleVisualizeWorksheet = handleVisualizeWorksheet;
window.setupWorksheetManagement = setupWorksheetManagement;
window.showWorksheetDetails = showWorksheetDetails;
window.loadProfileData = loadProfileData;
window.initializeProfileManagement = initializeProfileManagement;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeProfileManagement);
} else {
    initializeProfileManagement();
}