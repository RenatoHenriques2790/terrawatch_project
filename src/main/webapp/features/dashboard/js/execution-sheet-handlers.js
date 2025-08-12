// ExecutionSheet Functionality Handlers - Social Network Features

// Global variables for execution sheets
let selectedWorksheetForExecution = null;

// Setup execution sheet management functionality - DELEGATE TO DASHBOARD.JS
function setupExecutionSheetManagement() {
    // Delegate to the main dashboard.js function
    if (typeof window.setupExecutionSheetManagementFromDashboard === 'function') {
        return window.setupExecutionSheetManagementFromDashboard();
    } else {
        console.warn('Dashboard setupExecutionSheetManagement function not found, using fallback');
        // Basic fallback setup
        const refreshBtn = document.getElementById('refreshExecutionSheetsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (typeof refreshExecutionSheetsList === 'function') {
                    refreshExecutionSheetsList();
                }
            });
        }
    }
}

// Refresh execution sheets list with optional worksheet filter - DELEGATE TO DASHBOARD.JS
async function refreshExecutionSheetsList(filterWorksheetId) {
    // Delegate to the main dashboard.js function
    if (typeof window.refreshExecutionSheetsListFromDashboard === 'function') {
        return window.refreshExecutionSheetsListFromDashboard(filterWorksheetId);
    } else {
        console.warn('Dashboard refreshExecutionSheetsList function not found, using fallback');
        ui.showAlert('Função de atualização não disponível', 'warning');
    }
}

// Display execution sheets in grid format - DELEGATE TO DASHBOARD.JS
function displayExecutionSheetsList(executionSheets, filterWorksheetId) {
    // Delegate to the main dashboard.js function
    if (typeof window.displayExecutionSheetsListFromDashboard === 'function') {
        return window.displayExecutionSheetsListFromDashboard(executionSheets, filterWorksheetId);
    } else {
        console.warn('Dashboard displayExecutionSheetsList function not found, using fallback');
        const executionSheetsGrid = document.getElementById('executionSheetsGrid');
        if (executionSheetsGrid) {
            executionSheetsGrid.innerHTML = '<p>Função de exibição não disponível</p>';
        }
    }
}

// Handle creating new execution sheet - DELEGATE TO DASHBOARD.JS
async function handleCreateExecutionSheet(worksheetId) {
    // Delegate to the main dashboard.js function
    if (typeof window.handleCreateExecutionSheetFromDashboard === 'function') {
        return window.handleCreateExecutionSheetFromDashboard(worksheetId);
    } else {
        console.warn('Dashboard handleCreateExecutionSheet function not found, using fallback');
        ui.showAlert('Função de criação não disponível', 'warning');
    }
}

// Show worksheets selection modal
function showWorksheetsSelectionModal(worksheets) {
    const modal = document.createElement('div');
    modal.className = 'worksheets-modal';
    modal.innerHTML = `
        <div class="worksheets-modal-content">
            <div class="worksheets-modal-header">
                <h3>Selecionar Worksheet</h3>
                <button class="worksheets-modal-close" onclick="this.closest('.worksheets-modal').remove()">
                    <i class="ri-close-line"></i>
                </button>
            </div>
            <div class="available-worksheets-list">
                ${worksheets.map(ws => `
                    <div class="available-worksheet-item" data-worksheet-id="${ws.id}" onclick="selectWorksheetForExecution(${ws.id})">
                        <h4>Worksheet #${ws.id}</h4>
                        <p><strong>Data Início:</strong> ${formatDate(ws.startingDate)}</p>
                        <p><strong>Data Fim:</strong> ${formatDate(ws.finishingDate)}</p>
                        <p><strong>Fornecedor:</strong> ${ws.serviceProviderId}</p>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 2rem; display: flex; justify-content: flex-end; gap: 1rem;">
                <button class="btn btn-secondary" onclick="this.closest('.worksheets-modal').remove()">
                    Cancelar
                </button>
                <button class="btn btn-primary" onclick="createExecutionSheetFromSelected()" id="createExecutionSheetModalBtn" disabled>
                    Criar Folha de Execução
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Select worksheet for execution
function selectWorksheetForExecution(worksheetId) {
    // Remove previous selection
    document.querySelectorAll('.available-worksheet-item').forEach(item => {
        item.classList.remove('selected');
    });

    // Add selection to clicked item
    const selectedItem = document.querySelector(`[data-worksheet-id="${worksheetId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        selectedWorksheetForExecution = worksheetId;

        // Enable create button
        const createBtn = document.getElementById('createExecutionSheetModalBtn');
        if (createBtn) {
            createBtn.disabled = false;
        }
    }
}

// Create execution sheet from selected worksheet
async function createExecutionSheetFromSelected() {
    if (!selectedWorksheetForExecution) {
        ui.showAlert('Por favor, selecione uma worksheet', 'warning');
        return;
    }

    try {
        ui.showLoading(true, 'Criando folha de execução...');

        const response = await auth.fetch(`/rest/executionsheet/create/${selectedWorksheetForExecution}`, {
            method: 'POST'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Falha ao criar folha de execução');
        }

        ui.showAlert('Folha de execução criada com sucesso!', 'success');

        // Close modal
        document.querySelector('.worksheets-modal')?.remove();

        // Reset selection
        selectedWorksheetForExecution = null;

        // Refresh list
        refreshExecutionSheetsList();

    } catch (error) {
        console.error('Error creating execution sheet:', error);
        ui.showAlert('Erro ao criar folha de execução: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// View execution sheet details with social features - DELEGATE TO DASHBOARD.JS
async function viewExecutionSheetDetails(executionSheetId) {
    // Delegate to the main dashboard.js function
    if (typeof window.viewExecutionSheetDetailsFromDashboard === 'function') {
        return window.viewExecutionSheetDetailsFromDashboard(executionSheetId);
    } else {
        console.warn('Dashboard viewExecutionSheetDetails function not found, using fallback');
        ui.showAlert('Função de visualização não disponível', 'warning');
    }
}

// View activity details with photos
async function viewActivityDetails(activityId, parcelId) {
    try {
        ui.showLoading(true, 'Carregando detalhes da atividade...');

        // Get activity details
        const activityResponse = await auth.fetch(`/rest/executionsheet/view/${parcelId}`);
        if (!activityResponse.ok) {
            throw new Error('Falha ao carregar detalhes da atividade');
        }

        const activityData = await activityResponse.json();

        // Get photos for this activity
        const photosResponse = await auth.fetch(`/rest/executionsheet/photo/activity/${activityId}`);
        let photoGallery = { photos: [], totalPhotos: 0 };
        if (photosResponse.ok) {
            photoGallery = await photosResponse.json();
        }

        displayActivityDetail(activityId, activityData, photoGallery);

    } catch (error) {
        console.error('Error loading activity details:', error);
        ui.showAlert('Erro ao carregar detalhes: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Display activity detail with photo gallery
function displayActivityDetail(activityId, activityData, photoGallery) {
    const modal = document.createElement('div');
    modal.className = 'activity-modal';
    modal.innerHTML = `
        <div class="activity-modal-content">
            <div class="activity-modal-header">
                <h3>Detalhes da Atividade</h3>
                <button class="activity-modal-close" onclick="this.closest('.activity-modal').remove()">
                    <i class="ri-close-line"></i>
                </button>
            </div>
            
            <div class="activity-info">
                <div class="activity-info-item">
                    <span class="info-label">ID da Atividade:</span>
                    <span>${activityId}</span>
                </div>
                <div class="activity-info-item">
                    <span class="info-label">Operador:</span>
                    <span>${activityData.operator || 'Não atribuído'}</span>
                </div>
                <div class="activity-info-item">
                    <span class="info-label">Status:</span>
                    <span class="status-badge ${activityData.status}">${getStatusDisplayName(activityData.status)}</span>
                </div>
                <div class="activity-info-item">
                    <span class="info-label">Início:</span>
                    <span>${activityData.startDateTime ? formatDate(activityData.startDateTime) : 'Não iniciado'}</span>
                </div>
                ${activityData.endDateTime ? `
                    <div class="activity-info-item">
                        <span class="info-label">Fim:</span>
                        <span>${formatDate(activityData.endDateTime)}</span>
                    </div>
                ` : ''}
                ${activityData.observations ? `
                    <div class="activity-info-item full-width">
                        <span class="info-label">Observações:</span>
                        <p>${activityData.observations}</p>
                    </div>
                ` : ''}
            </div>
            
            <div class="photo-gallery-section">
                <div class="photo-gallery-header">
                    <h4>Galeria de Fotos (${photoGallery.totalPhotos})</h4>
                    ${canUploadPhotos(activityData) ? `
                        <button class="btn btn-primary btn-sm" onclick="showPhotoUploadModal('${activityId}')">
                            <i class="ri-camera-line"></i>
                            Adicionar Foto
                        </button>
                    ` : ''}
                </div>
                
                ${photoGallery.photos.length > 0 ? `
                    <div class="photo-gallery-grid">
                        ${photoGallery.photos.map(photo => `
                            <div class="photo-item" data-photo-id="${photo.id}">
                                <img src="/rest/executionsheet/photo/${photo.id}/thumbnail" alt="${photo.description}"
                                     onclick="viewPhotoDetail('${photo.id}')">
                                <div class="photo-overlay">
                                    <div class="photo-info">
                                        <span class="photo-uploader">${photo.uploadedBy}</span>
                                        <span class="photo-date">${formatTimeAgo(photo.uploadTimestamp)}</span>
                                    </div>
                                    <div class="photo-actions">
                                        <button class="photo-like-btn ${photo.userLiked ? 'liked' : ''}" 
                                                onclick="togglePhotoLike('${photo.id}')">
                                            <i class="ri-heart-${photo.userLiked ? 'fill' : 'line'}"></i>
                                            <span>${photo.likes}</span>
                                        </button>
                                    </div>
                                </div>
                                ${photo.description ? `
                                    <p class="photo-description">${photo.description}</p>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="empty-gallery">
                        <i class="ri-image-line"></i>
                        <p>Nenhuma foto adicionada ainda</p>
                    </div>
                `}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Show photo upload modal
function showPhotoUploadModal(activityId) {
    const modal = document.createElement('div');
    modal.className = 'photo-upload-modal';
    modal.innerHTML = `
        <div class="photo-upload-modal-content">
            <div class="photo-upload-header">
                <h3>Adicionar Foto</h3>
                <button class="modal-close" onclick="this.closest('.photo-upload-modal').remove()">
                    <i class="ri-close-line"></i>
                </button>
            </div>
            
            <div class="photo-upload-body">
                <div class="photo-preview-area" id="photoPreviewArea">
                    <i class="ri-camera-line"></i>
                    <p>Clique para selecionar uma foto</p>
                    <input type="file" id="photoInput" accept="image/*" onchange="previewPhoto(this)">
                </div>
                
                <div class="photo-details">
                    <label>Descrição (opcional):</label>
                    <textarea id="photoDescription" placeholder="Adicione uma descrição..."></textarea>
                    
                    <label>Localização GPS:</label>
                    <div class="location-input">
                        <input type="text" id="photoLocation" placeholder="Lat, Long" readonly>
                        <button class="btn btn-sm" onclick="getCurrentLocation()">
                            <i class="ri-map-pin-line"></i>
                            Obter Localização
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="photo-upload-footer">
                <button class="btn btn-secondary" onclick="this.closest('.photo-upload-modal').remove()">
                    Cancelar
                </button>
                <button class="btn btn-primary" onclick="uploadPhoto('${activityId}')" id="uploadPhotoBtn" disabled>
                    <i class="ri-upload-line"></i>
                    Enviar Foto
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Preview selected photo
function previewPhoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();

        reader.onload = function (e) {
            const previewArea = document.getElementById('photoPreviewArea');
            previewArea.innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button class="remove-photo" onclick="clearPhotoSelection()">
                    <i class="ri-close-line"></i>
                </button>
            `;

            // Enable upload button
            document.getElementById('uploadPhotoBtn').disabled = false;
        };

        reader.readAsDataURL(input.files[0]);
    }
}

// Clear photo selection
function clearPhotoSelection() {
    const previewArea = document.getElementById('photoPreviewArea');
    previewArea.innerHTML = `
        <i class="ri-camera-line"></i>
        <p>Clique para selecionar uma foto</p>
        <input type="file" id="photoInput" accept="image/*" onchange="previewPhoto(this)">
    `;
    document.getElementById('uploadPhotoBtn').disabled = true;
}

// Get current GPS location
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const location = `${position.coords.latitude}, ${position.coords.longitude}`;
                document.getElementById('photoLocation').value = location;
                ui.showAlert('Localização obtida com sucesso!', 'success');
            },
            (error) => {
                console.error('Error getting location:', error);
                ui.showAlert('Erro ao obter localização', 'error');
            }
        );
    } else {
        ui.showAlert('Geolocalização não suportada pelo navegador', 'error');
    }
}

// Upload photo to activity
async function uploadPhoto(activityId) {
    const photoInput = document.getElementById('photoInput');
    const description = document.getElementById('photoDescription').value;
    const location = document.getElementById('photoLocation').value;

    if (!photoInput.files || !photoInput.files[0]) {
        ui.showAlert('Por favor, selecione uma foto', 'warning');
        return;
    }

    try {
        ui.showLoading(true, 'Enviando foto...');

        // Convert image to base64
        const file = photoInput.files[0];
        const base64 = await convertToBase64(file);

        const response = await auth.fetch(`/rest/executionsheet/photo/upload/${activityId}`, {
            method: 'POST',
            body: JSON.stringify({
                image: base64,
                description: description,
                location: location
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Falha ao enviar foto');
        }

        const result = await response.json();
        ui.showAlert(result.message, 'success');

        // Close modal
        document.querySelector('.photo-upload-modal')?.remove();

        // Refresh the activity view to show the new photo
        // Find the activity modal and refresh it
        const activityModal = document.querySelector('.activity-modal');
        if (activityModal) {
            // Extract activityId from the modal or use the passed parameter
            const modalActivityId = activityId;
            if (modalActivityId) {
                // Get the parcel ID from the activity data or use a default approach
                // For now, we'll refresh the entire execution sheet view
                const executionSheetId = modalActivityId.split('_')[0]; // Extract execution sheet ID
                if (executionSheetId) {
                    viewExecutionSheetDetails(executionSheetId);
                }
            }
        }

    } catch (error) {
        console.error('Error uploading photo:', error);
        ui.showAlert('Erro ao enviar foto: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Convert file to base64
function convertToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Toggle photo like
async function togglePhotoLike(photoId) {
    try {
        const response = await auth.fetch(`/rest/executionsheet/photo/${photoId}/like`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Falha ao processar curtida');
        }

        const result = await response.json();
        ui.showAlert(result.message, result.liked ? 'success' : 'info');

        // Update the UI to reflect the like change
        const photoElement = document.querySelector(`[data-photo-id="${photoId}"]`);
        if (photoElement) {
            const likeButton = photoElement.querySelector('.photo-like-btn');
            const likeIcon = likeButton.querySelector('i');
            const likeCount = likeButton.querySelector('span');

            if (result.liked) {
                likeButton.classList.add('liked');
                likeIcon.className = 'ri-heart-fill';
            } else {
                likeButton.classList.remove('liked');
                likeIcon.className = 'ri-heart-line';
            }

            if (likeCount) {
                likeCount.textContent = result.totalLikes || 0;
            }
        }

    } catch (error) {
        console.error('Error toggling photo like:', error);
        ui.showAlert('Erro ao processar curtida: ' + error.message, 'error');
    }
}

// View photo detail
function viewPhotoDetail(photoId) {
    const photoUrl = `https://storage.googleapis.com/terra-watch-photos/${photoId}.jpg`;
    
    // Create modal to show full-size photo
    const modal = document.createElement('div');
    modal.className = 'photo-detail-modal';
    modal.innerHTML = `
        <div class="photo-detail-content">
            <button class="photo-detail-close" onclick="this.closest('.photo-detail-modal').remove()">
                <i class="ri-close-line"></i>
            </button>
            <img src="${photoUrl}" alt="Photo detail" onerror="this.style.display='none'; console.warn('Failed to load image:', this.src);">
        </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // Close on click outside
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    };

    // Close on escape
    document.addEventListener('keydown', function escapeHandler(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    });
}

// Check if user can upload photos
function canUploadPhotos(activityData) {
    const user = window.currentUser || currentUser;
    if (!user) return false;

    return activityData.operator === user.username ||
        roles.canManageExecutionSheets(user.role);
}

// Utility functions
function getStatusDisplayName(status) {
    const statusNames = {
        'NOT_STARTED': 'Não Iniciado',
        'IN_PROGRESS': 'Em Progresso',
        'COMPLETED': 'Completo'
    };
    return statusNames[status] || status;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('pt-BR');
}

function formatTimeAgo(dateString) {
    if (!dateString) return 'N/A';
    return dateUtils.formatTimeAgo(dateString);
}

// Export functions for global access
window.setupExecutionSheetManagement = setupExecutionSheetManagement;
window.refreshExecutionSheetsList = refreshExecutionSheetsList;
window.handleCreateExecutionSheet = handleCreateExecutionSheet;
window.selectWorksheetForExecution = selectWorksheetForExecution;
window.createExecutionSheetFromSelected = createExecutionSheetFromSelected;
window.viewExecutionSheetDetails = viewExecutionSheetDetails;
window.viewActivityDetails = viewActivityDetails;
window.showPhotoUploadModal = showPhotoUploadModal;
window.uploadPhoto = uploadPhoto;
window.togglePhotoLike = togglePhotoLike;
window.viewPhotoDetail = viewPhotoDetail;