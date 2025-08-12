// Dashboard Initialization - Fixed and Enhanced version
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing dashboard...');
    // Initialize dashboard based on authentication state
    await initDashboard();
    // Initialize dashboard based on URL hash
    initializeDashboardFromHash();
});

// Global variables
let currentUser = null;
let terraWatchMap = null;
let terraWatchMapPreview = null;
let currentUsers = [];
let currentWorksheets = [];
let currentExecutionSheets = [];

// Global user cache for name mapping
let userNamesCache = new Map();
let userNamesCacheLoaded = false;

// Export currentUser to global scope for other modules
window.currentUser = null;

// Main dashboard initialization
async function initDashboard() {
    try {
        console.log('Dashboard initialization started...');

        // Check if user is authenticated
        const isAuthenticated = auth.isAuthenticated();
        console.log('User authenticated:', isAuthenticated);

        if (isAuthenticated) {
            // Authenticated user flow
            currentUser = await auth.getCurrentUser();
            if (!currentUser) {
                console.warn('Failed to get user data, falling back to token data');
                currentUser = auth.getCurrentUserFromToken();
            }

            if (currentUser) {
                console.log('Current user:', currentUser.username);

                // Export to global scope for other modules
                window.currentUser = currentUser;

                // Show authenticated sections
                showAuthenticatedSections();

                // Update UI with user data
                updateUserInterface(currentUser);

                // Setup role-based sections
                setupRoleBasedSections(currentUser);

                // Load user-specific data
                await loadDashboardData(currentUser);

                // Initialize user names cache for comments and social features
                await initializeUserNamesCache();
            } else {
                console.error('No user data available');
                showGuestSections();
            }
        } else {
            // Guest user flow
            console.log('Guest user detected');
            showGuestSections();

            // Update welcome message for guests
            const welcomeTitle = document.getElementById('welcomeTitle');
            const welcomeMsg = document.getElementById('welcomeMsg');
            if (welcomeTitle) welcomeTitle.textContent = 'Bem-vindo ao TerraWatch';
            if (welcomeMsg) welcomeMsg.textContent = 'Acesse informações públicas ou faça login para mais recursos';

            // Show public information section by default
            showSection('publicInfo');

            // Load public data
            await loadPublicData();
        }

        // Initialize common functionality (this is crucial - it was missing proper setup)
        await initializeCommonFeatures();

        console.log('Dashboard initialization completed');

    } catch (error) {
        console.error('Dashboard initialization error:', error);
        ui.showAlert('Falha ao carregar dashboard: ' + error.message, 'error');
    }
}

// Show sections for authenticated users
function showAuthenticatedSections() {
    const profileDropdown = document.getElementById('profileDropdownTrigger');
    const guestActions = document.getElementById('guestActions');
    const userSection = document.getElementById('userSection');
    const guestSection = document.getElementById('guestSection');

    console.log('Showing authenticated sections...');
    console.log('Profile dropdown element found:', !!profileDropdown);

    if (profileDropdown) {
        profileDropdown.style.display = 'flex';
        console.log('Profile dropdown display set to flex');
    }
    if (guestActions) guestActions.style.display = 'none';
    if (userSection) userSection.style.display = 'block';
    if (guestSection) guestSection.style.display = 'none';
}

// Show sections for guest users
function showGuestSections() {
    const profileDropdown = document.getElementById('profileDropdownTrigger');
    const guestActions = document.getElementById('guestActions');
    const userSection = document.getElementById('userSection');
    const guestSection = document.getElementById('guestSection');
    const profileNavItem = document.getElementById('profileNavItem');

    if (profileDropdown) profileDropdown.style.display = 'none';
    if (guestActions) guestActions.style.display = 'flex';
    if (userSection) userSection.style.display = 'none';
    if (guestSection) guestSection.style.display = 'block';
    if (profileNavItem) profileNavItem.style.display = 'none';
}

// Setup role-based sections
function setupRoleBasedSections(user) {
    const adminSection = document.getElementById('adminSection');
    const operatorSection = document.getElementById('operatorSection');

    if (adminSection && roles.canManageUsers(user.role)) {
        adminSection.style.display = 'block';
    }

    if (operatorSection && roles.canHandleWorksheets(user.role)) {
        operatorSection.style.display = 'block';
    }
}

// Load dashboard data for authenticated users
async function loadDashboardData(user) {
    try {
        console.log('Loading dashboard data for user:', user.username);

        // Load statistics
        await loadUserStatistics();

        // Load activities and social feed
        await Promise.all([
            loadRecentActivities(),
            loadActiveProjects(),
            loadSocialFeed()
        ]);

        // Initialize map preview
        await initMapPreview();

        // Load user-specific data based on role
        if (roles.canManageUsers(user.role)) {
            await loadUserManagementData();
        }

        if (roles.canHandleWorksheets(user.role)) {
            await loadWorksheetsData();
        }

        console.log('Dashboard data loaded successfully');

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        ui.showAlert('Erro ao carregar dados da dashboard', 'error');
    }
}

// Load public data for guest users
async function loadPublicData() {
    try {
        const response = await fetch('/rest/public/statistics');
        if (response.ok) {
            const stats = await response.json();
            const publicTerrenosCount = document.getElementById('publicTerrenosCount');
            const publicAreaTotal = document.getElementById('publicAreaTotal');

            if (publicTerrenosCount) publicTerrenosCount.textContent = stats.terrenos || '-';
            if (publicAreaTotal) publicAreaTotal.textContent = (stats.area || '-') + ' ha';
        }
    } catch (error) {
        console.error('Error loading public data:', error);
    }
}

// Load user statistics
async function loadUserStatistics() {
    try {
        // Load actual worksheets count
        const worksheetsResponse = await auth.fetch('/rest/worksheet/list');
        if (worksheetsResponse.ok) {
            const worksheetIds = await worksheetsResponse.json();
            const worksheetsCount = document.getElementById('worksheetsCount');
            if (worksheetsCount) worksheetsCount.textContent = worksheetIds.length || 0;
        }

        // Load actual users count
        const usersResponse = await auth.fetch('/rest/list/users', {
            method: 'POST',
            body: JSON.stringify({ username: '' })
        });
        if (usersResponse.ok) {
            const users = await usersResponse.json();
            const usersCount = document.getElementById('usersCount');
            if (usersCount) usersCount.textContent = users.length || 0;
        }

        // Load dashboard statistics for area (use new real calculation)
        const statsResponse = await auth.fetch('/rest/statistics/area');
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            const totalArea = document.getElementById('totalArea');
            if (totalArea) totalArea.textContent = (stats.area || '-') + ' ha';
        } else {
            // Fallback to dashboard statistics
            const fallbackResponse = await auth.fetch('/rest/statistics/dashboard');
            if (fallbackResponse.ok) {
                const stats = await fallbackResponse.json();
                const totalArea = document.getElementById('totalArea');
                if (totalArea) totalArea.textContent = (stats.area || '-') + ' ha';
            }
        }

        // Load user counter for admin users (detailed breakdown)
        if (currentUser && roles.canManageUsers(currentUser.role)) {
            const userStatsResponse = await auth.fetch('/rest/statistics/userscounter');
            if (userStatsResponse.ok) {
                const userStats = await userStatsResponse.json();
                const activeUsersCount = document.getElementById('activeUsersCount');
                const inactiveUsersCount = document.getElementById('inactiveUsersCount');
                const totalUsersCount = document.getElementById('totalUsersCount');

                if (activeUsersCount) activeUsersCount.textContent = userStats.active || 0;
                if (inactiveUsersCount) inactiveUsersCount.textContent = userStats.inactive || 0;
                if (totalUsersCount) totalUsersCount.textContent = userStats.total || 0;
            }
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Function to refresh area statistics
async function refreshAreaStatistics() {
    try {
        const statsResponse = await auth.fetch('/rest/statistics/area');
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            const totalArea = document.getElementById('totalArea');
            const publicAreaTotal = document.getElementById('publicAreaTotal');
            
            if (totalArea) totalArea.textContent = (stats.area || '-') + ' ha';
            if (publicAreaTotal) publicAreaTotal.textContent = (stats.area || '-') + ' ha';
            
            console.log('Area statistics updated:', stats);
        } else {
            console.warn('Failed to load area statistics:', statsResponse.status);
        }
    } catch (error) {
        console.error('Error refreshing area statistics:', error);
    }
}

// Load recent activities
async function loadRecentActivities() {
    try {
        console.log('Loading recent activities...');
        const response = await auth.fetch('/rest/activities/recent');
        if (response.ok) {
            const activities = await response.json();
            console.log('Activities loaded:', activities);
            displayActivities(activities);
        } else {
            console.warn('Failed to load activities:', response.status);
            displayActivities([]);
        }
    } catch (error) {
        console.error('Error loading activities:', error);
        displayActivities([]);
    }
}

// Display activities in the dashboard
function displayActivities(activities) {
    // Activities are now displayed in the social feed, so we don't need a separate activity list
    // The social feed will handle displaying activities
    console.log('Activities loaded:', activities.length);
}

// Load active projects (worksheets + execution sheets)
async function loadActiveProjects() {
    try {
        console.log('Loading active projects...');
        const projects = [];

        // Load recent worksheets
        try {
            const worksheetsResponse = await auth.fetch('/rest/worksheet/list');
            if (worksheetsResponse.ok) {
                const worksheetIds = await worksheetsResponse.json();

                // Get details for the most recent 3 worksheets
                const recentWorksheetIds = worksheetIds.slice(-3);
                for (const id of recentWorksheetIds) {
                    try {
                        const detailResponse = await auth.fetch(`/rest/worksheet/${id}/detailed`);
                        if (detailResponse.ok) {
                            const worksheet = await detailResponse.json();
                            projects.push({
                                id: worksheet.id,
                                type: 'worksheet',
                                title: `Worksheet #${worksheet.id}`,
                                subtitle: `Fornecedor: ${worksheet.service_provider_id || worksheet.serviceProviderId || 'N/A'}`,
                                date: worksheet.starting_date || worksheet.startingDate,
                                status: 'active',
                                icon: 'ri-file-list-3-line',
                                action: () => viewWorksheetDetails(worksheet.id)
                            });
                        }
                    } catch (err) {
                        console.warn(`Failed to load worksheet ${id}:`, err);
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load worksheets:', error);
        }

        // Load recent execution sheets
        try {
            const executionResponse = await auth.fetch('/rest/executionsheet/list');
            if (executionResponse.ok) {
                const executionSheets = await executionResponse.json();

                // Get the most recent 3 execution sheets
                const recentExecutions = executionSheets.slice(-3);
                recentExecutions.forEach(execution => {
                    projects.push({
                        id: execution.id,
                        type: 'execution',
                        title: `Execução #${execution.worksheetId || execution.id}`,
                        subtitle: `Progresso: ${Math.round(execution.progress || 0)}%`,
                        date: execution.startDateTime || execution.lastActivityDateTime,
                        status: execution.status || 'active',
                        icon: 'ri-clipboard-line',
                        action: () => viewExecutionSheetDetails(execution.id)
                    });
                });
            }
        } catch (error) {
            console.warn('Failed to load execution sheets:', error);
        }

        // Sort by date (most recent first)
        projects.sort((a, b) => {
            const dateA = new Date(a.date || 0).getTime();
            const dateB = new Date(b.date || 0).getTime();
            return dateB - dateA;
        });

        // Display only the most recent 5 projects
        displayActiveProjects(projects.slice(0, 5));

    } catch (error) {
        console.error('Error loading active projects:', error);
        displayActiveProjects([]);
    }
}

// Display active projects in the dashboard
function displayActiveProjects(projects) {
    const projectsList = document.getElementById('activeProjectsList');
    if (!projectsList) return;

    if (projects.length === 0) {
        projectsList.innerHTML = '<p class="text-center text-light">Nenhum projeto ativo</p>';
        return;
    }

    projectsList.innerHTML = projects.map(project => `
        <div class="activity-item" onclick="handleProjectClick('${project.type}', '${project.id}')">
            <div class="activity-icon">
                <i class="${project.icon}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-text">${project.title}</div>
                <div class="activity-time">${project.subtitle} - ${formatTimeAgo(new Date(project.date || Date.now()).getTime())}</div>
            </div>
            <div class="status-indicator ${project.status}"></div>
        </div>
    `).join('');
}

// Handle project click
function handleProjectClick(type, id) {
    if (type === 'worksheet') {
        viewWorksheetDetails(parseInt(id));
    } else if (type === 'execution') {
        viewExecutionSheetDetails(id);
    }
}

// Initialize map preview in dashboard
async function initMapPreview() {
    try {
        console.log('Initializing map preview...');

        // Wait for Google Maps to be available
        if (typeof google === 'undefined' || !google.maps) {
            console.log('Google Maps not available, retrying...');
            setTimeout(initMapPreview, 1000);
            return;
        }

        const mapPreviewElement = document.getElementById('mapPreview');
        if (!mapPreviewElement) {
            console.warn('Map preview element not found');
            return;
        }

        console.log('Creating map preview...');
        // Create small preview map
        const lisbon = { lat: 38.7223, lng: -9.1393 };

        terraWatchMapPreview = new google.maps.Map(mapPreviewElement, {
            center: lisbon,
            zoom: 10,
            mapTypeId: google.maps.MapTypeId.HYBRID,
            disableDefaultUI: true,
            gestureHandling: 'none',
            clickableIcons: false
        });

        mapPreviewElement.classList.add('loaded');
        console.log('Map preview created successfully');

        // Load preview data
        try {
            console.log('Loading worksheets for preview...');
            const worksheets = await loadWorksheets();
            console.log(`Loaded ${worksheets.length} worksheets for preview`);
            displayWorksheetsPreview(worksheets, terraWatchMapPreview);
        } catch (error) {
            console.error('Error loading worksheets for preview:', error);
        }

    } catch (error) {
        console.error('Error initializing map preview:', error);
    }
}

// Display worksheets on preview map
function displayWorksheetsPreview(worksheets, map) {
    const bounds = new google.maps.LatLngBounds();
    let hasValidPolygons = false;

    // Define CRS constants for coordinate transformation
    const CRS_SRC = "EPSG:3763", CRS_DST = "EPSG:4326";

    worksheets.forEach(worksheet => {
        if (worksheet.ruralProperties) {
            worksheet.ruralProperties.forEach(property => {
                if (property.geometry) {
                    try {
                        const geoJson = typeof property.geometry === 'string'
                            ? JSON.parse(property.geometry)
                            : property.geometry;

                        if (geoJson.type === 'Polygon') {
                            const paths = geoJson.coordinates[0]
                                .map(raw => {
                                    // raw = [Easting, Northing] em metros (EPSG:3763)
                                    const [lng, lat] = proj4(CRS_SRC, CRS_DST, raw);
                                    return { lat, lng };
                                })
                                .map(({ lat, lng }) => {
                                    const point = new google.maps.LatLng(lat, lng);
                                    bounds.extend(point);
                                    return point;
                                });

                            if (paths.length > 2) {
                                hasValidPolygons = true;

                                new google.maps.Polygon({
                                    paths: paths,
                                    strokeColor: '#9EF5CF',
                                    strokeOpacity: 0.8,
                                    strokeWeight: 1,
                                    fillColor: '#9EF5CF',
                                    fillOpacity: 0.3,
                                    map: map
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error displaying property in preview:', error);
                    }
                }
            });
        }
    });

    if (hasValidPolygons) {
        map.fitBounds(bounds);
        setTimeout(() => {
            if (map.getZoom() > 15) map.setZoom(15);
        }, 100);
    }
}

// Load worksheets from API
async function loadWorksheets() {
    const worksheets = [];
    const failedIds = [];

    try {
        console.log('Loading worksheets from API...');
        const listResp = await auth.fetch('/rest/worksheet/list', {
            method: 'GET'
        });

        if (!listResp.ok) {
            throw new Error(`Failed to fetch worksheet list: ${listResp.status}`);
        }

        const ids = await listResp.json();
        console.log('Loaded worksheet IDs:', ids);

        // Load detailed data for each worksheet with error handling
        for (const id of ids) {
            try {
                const detailResp = await auth.fetch(`/rest/worksheet/${id}/detailed`, {
                    method: 'GET'
                });

                if (detailResp.ok) {
                    const worksheet = await detailResp.json();
                    worksheets.push(worksheet);
                } else {
                    console.warn(`Failed to load details for worksheet ${id}: ${detailResp.status}`);
                    failedIds.push(id);
                }
            } catch (error) {
                console.warn(`Error loading worksheet ${id}:`, error);
                failedIds.push(id);
                // Continue with other worksheets even if one fails
            }
        }

        // Attempt to load genereic data in case user doesnt have permissions for detailed data
        if (failedIds.length > 0) {
            console.log(`Falling back to generic data for:`, failedIds);
            for (const id of failedIds) {
                try {
                    const genericResp = await auth.fetch(`/rest/worksheet/${id}`);
                    if (genericResp.ok) {
                        worksheets.push(await genericResp.json());
                    } else {
                        console.warn(`Failed generic load for ${id}: ${genericResp.status}`);
                    }
                } catch (e) {
                    console.warn(`Error loading generic for ${id}:`, e);
                }
            }
        }

        console.log(`Successfully loaded ${worksheets.length} worksheets`);
        return worksheets;

    } catch (error) {
        console.error('Error loading worksheets:', error);
        // Show user-friendly error message
        if (error.message.includes('conexão') || error.message.includes('indisponível')) {
            ui.showAlert('Erro de conexão ao carregar worksheets. Verifique sua conexão e tente novamente.', 'warning');
        } else {
            ui.showAlert('Erro ao carregar worksheets: ' + error.message, 'error');
        }
        return worksheets; // Return whatever we managed to load
    }
}

// Refresh worksheets list - MAIN FUNCTION
async function refreshWorksheetsList() {
    try {
        console.log('Refreshing worksheets list...');
        ui.showLoading(true, 'Carregando worksheets...');

        const worksheets = await loadWorksheets();
        currentWorksheets = worksheets;

        // Store globally for other modules
        window.currentWorksheets = worksheets;

        // Always try to display worksheets when refreshing
        displayWorksheetsList(worksheets);

        console.log(`Refreshed worksheets list with ${worksheets.length} items`);

    } catch (error) {
        console.error('Error refreshing worksheets list:', error);
        ui.showAlert('Erro ao atualizar lista de worksheets', 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Display worksheets list in the worksheets section
function displayWorksheetsList(worksheets) {
    const container = document.getElementById('worksheetsGrid');
    if (!container) {
        console.warn('Worksheets grid container not found');
        return;
    }

    console.log('Displaying worksheets:', worksheets);

    if (!Array.isArray(worksheets)) {
        console.error('Invalid worksheets data:', worksheets);
        worksheets = [];
    }

    if (worksheets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="ri-file-list-3-line" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
                <h3>Nenhuma worksheet encontrada</h3>
                <p>Crie uma nova worksheet para começar</p>
                <button class="btn btn-primary" onclick="handleCreateWorksheet()">
                    <i class="ri-add-line"></i>
                    Criar Worksheet
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = worksheets.map(ws => `
        <div class="worksheet-card" onclick="viewWorksheetDetails(${ws.id})">
            <div class="worksheet-card-header">
                <h3>
                    <i class="ri-file-list-3-line"></i>
                    Worksheet #${ws.id}
                </h3>
                <div class="worksheet-actions" onclick="event.stopPropagation()">
                    <button class="btn-icon" onclick="viewWorksheetDetails(${ws.id})" title="Ver Detalhes">
                        <i class="ri-eye-line"></i>
                    </button>
                    <button class="btn-icon" onclick="showWorksheetOnMap(${ws.id})" title="Ver no Mapa">
                        <i class="ri-map-pin-line"></i>
                    </button>
                    <button class="btn-sm btn-primary" onclick="createExecutionSheetFromWorksheet(${ws.id})" title="Executar Worksheet">
                        <i class="ri-play-line"></i>
                        Executar
                    </button>
                </div>
            </div>
            
            <div class="worksheet-info">
                <div class="info-item">
                    <span class="info-label">Data Início:</span>
                    <span class="info-value">${formatDate(ws.starting_date || ws.startingDate)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Data Fim:</span>
                    <span class="info-value">${formatDate(ws.finishing_date || ws.finishingDate)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Fornecedor:</span>
                    <span class="info-value">${ws.service_provider_id || ws.serviceProviderId || 'N/A'}</span>
                </div>
            </div>
            
            <div class="worksheet-footer">
                <div class="worksheet-status-section">
                    <span class="worksheet-status active">Ativa</span>
                    <span class="worksheet-properties">${(ws.ruralProperties || []).length} propriedades</span>
                </div>
            </div>
        </div>
    `).join('');

    // Update worksheets count in stats
    const worksheetsCount = document.getElementById('worksheetsCount');
    if (worksheetsCount) {
        worksheetsCount.textContent = worksheets.length;
    }
}

// Refresh users list - MAIN FUNCTION  
async function refreshUsersList() {
    try {
        console.log('Refreshing users list...');
        ui.showLoading(true, 'Carregando usuários...');

        const response = await auth.fetch('/rest/list/users', {
            method: 'POST',
            body: JSON.stringify({ username: '' })
        });

        if (!response.ok) {
            throw new Error(`Failed to load users: ${response.status}`);
        }

        const users = await response.json();
        currentUsers = users;

        // Store globally for other modules
        window.currentUsers = users;

        // Display users if in users section
        const usersSection = document.getElementById('usersSection');
        if (usersSection && usersSection.style.display !== 'none') {
            displayUsersList(users);
            updateUserStats(users);
        }

        console.log(`Refreshed users list with ${users.length} users`);

    } catch (error) {
        console.error('Error refreshing users list:', error);
        ui.showAlert('Erro ao carregar usuários: ' + error.message, 'error');
        displayUsersList([]);
    } finally {
        ui.showLoading(false);
    }
}

// Display users list
function displayUsersList(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) {
        console.warn('Users table body not found');
        return;
    }

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">
                    <div class="empty-state">
                        <i class="ri-user-line" style="font-size: 2rem; color: var(--text-light);"></i>
                        <p>Nenhum usuário encontrado</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>
                <div class="user-info">
                    <div class="user-avatar" style="background: ${profile.generateAvatarColor(user.username)}">
                        ${profile.generateInitials(user.name || user.username)}
                    </div>
                    <div class="user-details">
                        <div class="user-name">${user.name || user.username}</div>
                        <div class="user-email">${user.email || '-'}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="badge role">${roles.getDisplayName(user.role)}</span>
            </td>
            <td>
                <span class="badge state ${profile.getStateColor(user.state)}">
                    ${profile.getStateDisplayName(user.state)}
                </span>
            </td>
            <td>
                <span class="last-activity">Há 2 horas</span>
            </td>
            <td>
                <div class="user-actions">
                    <button class="btn-icon" onclick="openUserDetailModal('${user.username}')" title="Ver Detalhes">
                        <i class="ri-eye-line"></i>
                    </button>
                    <button class="btn-icon" onclick="editUser('${user.username}')" title="Editar">
                        <i class="ri-edit-line"></i>
                    </button>
                    <button class="btn-icon danger" onclick="confirmUserAction('suspend', '${user.username}')" title="Suspender">
                        <i class="ri-pause-line"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Update user statistics
function updateUserStats(users) {
    const activeCount = users.filter(u => u.state === 'ATIVADO').length;
    const inactiveCount = users.filter(u => u.state === 'DESATIVADO').length;
    const totalCount = users.length;

    const activeElement = document.getElementById('activeUsersCount');
    const inactiveElement = document.getElementById('inactiveUsersCount');
    const totalElement = document.getElementById('totalUsersCount');

    if (activeElement) activeElement.textContent = activeCount;
    if (inactiveElement) inactiveElement.textContent = inactiveCount;
    if (totalElement) totalElement.textContent = totalCount;
}

// Refresh execution sheets list - MAIN FUNCTION
async function refreshExecutionSheetsList() {
    try {
        console.log('Refreshing execution sheets list...');
        ui.showLoading(true, 'Carregando folhas de execução...');

        const response = await auth.fetch('/rest/executionsheet/list');

        if (!response.ok) {
            throw new Error(`Failed to load execution sheets: ${response.status}`);
        }

        const executionSheets = await response.json();
        console.log('Loaded execution sheets with social data:', executionSheets);

        currentExecutionSheets = executionSheets;

        // Store globally for other modules
        window.currentExecutionSheets = executionSheets;

        // Display execution sheets if in execution sheets section
        const executionSheetsSection = document.getElementById('executionsheetsSection');
        if (executionSheetsSection && executionSheetsSection.style.display !== 'none') {
            displayExecutionSheetsList(executionSheets);
        }

        console.log(`Refreshed execution sheets list with ${executionSheets.length} items`);

    } catch (error) {
        console.error('Error refreshing execution sheets list:', error);
        ui.showAlert('Erro ao carregar folhas de execução: ' + error.message, 'error');
        displayExecutionSheetsList([]);
    } finally {
        ui.showLoading(false);
    }
}

// Display execution sheets list
function displayExecutionSheetsList(executionSheets) {
    const container = document.getElementById('executionSheetsGrid');
    if (!container) {
        console.warn('Execution sheets grid container not found');
        return;
    }

    console.log('Displaying execution sheets with social data:', executionSheets);

    if (executionSheets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="ri-clipboard-line" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
                <h3>Nenhuma folha de execução encontrada</h3>
                <p>Crie uma nova folha de execução para começar</p>
                <button class="btn btn-primary" onclick="handleCreateExecutionSheet()">
                    <i class="ri-add-line"></i>
                    Criar Folha de Execução
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = executionSheets.map(es => {
        const lastActivity = es.lastActivityDateTime ? formatTimeAgo(new Date(es.lastActivityDateTime).getTime()) : 'Nenhuma';
        const progress = es.progress || 0;

        return `
            <div class="execution-sheet-card" onclick="viewExecutionSheetDetails('${es.id}')">
                <div class="execution-sheet-card-header">
                    <div class="execution-sheet-id">ES #${es.worksheetId || es.id}</div>
                    <div class="execution-sheet-status ${es.status || 'active'}">${getStatusDisplayName(es.status)}</div>
                </div>
                
                <div class="execution-sheet-info">
                    <div class="execution-sheet-info-item">
                        <span class="execution-sheet-info-label">Worksheet:</span>
                        <span>WS #${es.worksheetId || 'N/A'}</span>
                    </div>
                    <div class="execution-sheet-info-item">
                        <span class="execution-sheet-info-label">Última Atividade:</span>
                        <span>${lastActivity}</span>
                    </div>
                </div>

                <div class="execution-sheet-progress">
                    <div class="execution-sheet-progress-label">
                        <span>Progresso</span>
                        <span>${Math.round(progress)}%</span>
                    </div>
                    <div class="execution-sheet-progress-bar">
                        <div class="execution-sheet-progress-fill" style="width: ${progress}%"></div>
                    </div>
                </div>

                <div class="execution-sheet-social">
                    <div class="execution-sheet-social-item" onclick="event.stopPropagation(); toggleExecutionSheetLike('${es.id}')">
                        <i class="ri-heart-${es.userLiked ? 'fill' : 'line'}" style="color: ${es.userLiked ? '#ef4444' : '#64748b'}"></i>
                        <span>${es.likes || 0}</span>
                    </div>
                    <div class="execution-sheet-social-item">
                        <i class="ri-image-line"></i>
                        <span>${es.photos || 0}</span>
                    </div>
                    <div class="execution-sheet-social-item">
                        <i class="ri-chat-1-line"></i>
                        <span>${es.textPosts || 0}</span>
                    </div>
                    <div class="execution-sheet-social-item">
                        <i class="ri-time-line"></i>
                        <span>${es.activities || 0}</span>
                    </div>
                </div>

                <div class="execution-sheet-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-primary" onclick="viewExecutionSheetDetails('${es.id}')">
                        <i class="ri-eye-line"></i>
                        Ver
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="shareExecutionSheet('${es.id}')">
                        <i class="ri-share-line"></i>
                        Partilhar
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Get status display name
function getStatusDisplayName(status) {
    const statusNames = {
        'ACTIVE': 'Ativo',
        'COMPLETED': 'Completo',
        'PAUSED': 'Pausado',
        'CANCELLED': 'Cancelado'
    };
    return statusNames[status] || status || 'Ativo';
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

// View worksheet details - MAIN FUNCTION
async function viewWorksheetDetails(worksheetId) {
    console.log('Viewing worksheet details for ID:', worksheetId);

    try {
        ui.showLoading(true, 'Carregando detalhes...');

        // Close property popup if open
        if (window.currentPropertyPopup) {
            closePropertyPopup();
        }

        // Try to find in currentWorksheets first
        let worksheet = currentWorksheets?.find(w => w.id === worksheetId);

        // If not found, fetch from server
        if (!worksheet) {
            const response = await auth.fetch(`/rest/worksheet/${worksheetId}/detailed`);
            if (!response.ok) {
                throw new Error(`Failed to load worksheet details: ${response.status}`);
            }
            worksheet = await response.json();
        }

        if (!worksheet) {
            throw new Error('Worksheet não encontrada');
        }

        showWorksheetModal(worksheet);

    } catch (error) {
        console.error('Error viewing worksheet details:', error);
        ui.showAlert('Erro ao carregar detalhes da worksheet: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Show worksheet modal
function showWorksheetModal(worksheet) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('worksheetDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'worksheetDetailModal';
        modal.className = 'modal worksheet-detail-modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>
                    <i class="ri-file-list-3-line"></i>
                    Worksheet #${worksheet.id}
                </h3>
                <div class="modal-actions">
                    <button class="btn btn-outline-primary" onclick="showWorksheetOnMap(${worksheet.id})" title="Ver no Mapa">
                        <i class="ri-map-pin-line"></i>
                        Ver no Mapa
                    </button>
                    <button class="btn btn-primary" onclick="createExecutionSheetFromWorksheet(${worksheet.id})" title="Executar Worksheet">
                        <i class="ri-play-line"></i>
                        Executar
                    </button>
                    <button class="btn btn-danger" onclick="confirmDeleteWorksheet(${worksheet.id})" title="Excluir Worksheet">
                        <i class="ri-delete-bin-line"></i>
                        Excluir
                    </button>
                    <button class="close-modal" onclick="closeWorksheetModal()">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
            </div>
            <div class="modal-body">
                <div class="worksheet-details">
                    <div class="detail-section">
                        <h4>
                            <i class="ri-information-line"></i>
                            Informações Gerais
                        </h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <label>ID</label>
                                <span>${worksheet.id}</span>
                            </div>
                            <div class="detail-item">
                                <label>Data Início</label>
                                <span>${formatDate(worksheet.starting_date || worksheet.startingDate)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Data Fim</label>
                                <span>${formatDate(worksheet.finishing_date || worksheet.finishingDate)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Data de Emissão</label>
                                <span>${formatDate(worksheet.issue_date)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Data de Atribuição</label>
                                <span>${formatDate(worksheet.award_date)}</span>
                            </div>
                            <div class="detail-item">
                                <label>ID do Fornecedor</label>
                                <span>${worksheet.service_provider_id || worksheet.serviceProviderId || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>ID do Usuário Emissor</label>
                                <span>${worksheet.issuing_user_id || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Código POSA</label>
                                <span>${worksheet.posa_code || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Descrição POSA</label>
                                <span>${worksheet.posa_description || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Código POSP</label>
                                <span>${worksheet.posp_code || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Descrição POSP</label>
                                <span>${worksheet.posp_description || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>AIGP</label>
                                <span>${Array.isArray(worksheet.aigp) ? worksheet.aigp.join(', ') : 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    ${worksheet.operations ? `
                    <div class="detail-section">
                        <h4>
                            <i class="ri-tools-line"></i>
                            Operações
                        </h4>
                        <div class="operations-list">
                            ${worksheet.operations.map(op => `
                                <div class="operation-item">
                                    <span class="operation-code">${op.operation_code}</span>
                                    <span class="operation-description">${op.operation_description}</span>
                                    <span class="operation-area">${op.area_ha} ha</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${worksheet.ruralProperties ? `
                    <div class="detail-section">
                        <h4>
                            <i class="ri-map-pin-line"></i>
                            Propriedades Rurais
                        </h4>
                        <div class="rural-properties">
                            ${worksheet.ruralProperties.map(prop => `
                                <div class="property-item">
                                    <div class="property-info">
                                        <label>ID da Propriedade</label>
                                        <span>${prop.rural_property_id}</span>
                                    </div>
                                    <div class="property-info">
                                        <label>AIGP</label>
                                        <span>${prop.aigp}</span>
                                    </div>
                                    <div class="property-info">
                                        <label>ID do Polígono</label>
                                        <span>${prop.polygon_id}</span>
                                    </div>
                                    <div class="property-info">
                                        <label>ID UI</label>
                                        <span>${prop.UI_id}</span>
                                    </div>
                                    <div class="property-actions">
                                        <button class="btn-icon" onclick="showPropertyOnMap(${worksheet.id}, '${prop.rural_property_id}')" title="Ver no Mapa">
                                            <i class="ri-map-pin-line"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    // Show modal
    modal.style.display = 'flex';
}

// Close worksheet modal
function closeWorksheetModal() {
    const modal = document.getElementById('worksheetDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Show property on map
function showPropertyOnMap(worksheetId, propertyId) {
    closeWorksheetModal();
    showSection('map');

    // Wait for map to initialize
    setTimeout(async () => {
        try {
            // Get worksheet details if not already loaded
            let worksheet = currentWorksheets?.find(w => w.id === worksheetId);
            if (!worksheet) {
                const response = await auth.fetch(`/rest/worksheet/${worksheetId}/detailed`);
                if (response.ok) {
                    worksheet = await response.json();
                }
            }

            if (worksheet && terraWatchMap) {
                // Find the specific property
                const property = worksheet.ruralProperties?.find(p => p.rural_property_id === propertyId);
                if (property) {
                    highlightSpecificPropertyOnMap(property, worksheet);
                } else {
                    // Fallback to highlighting the entire worksheet
                    highlightWorksheetOnMap(worksheet);
                }
            }
        } catch (error) {
            console.error('Error showing property on map:', error);
            ui.showAlert('Erro ao exibir propriedade no mapa', 'error');
        }
    }, 500);
}

// Highlight specific property on map
function highlightSpecificPropertyOnMap(property, worksheet) {
    if (!terraWatchMap || !property.geometry) return;

    // Clear any existing highlights and popups
    if (window.currentHighlights) {
        window.currentHighlights.forEach(polygon => polygon.setMap(null));
    }
    window.currentHighlights = [];

    // Close any existing popup
    if (window.currentPropertyPopup) {
        window.currentPropertyPopup.remove();
        window.currentPropertyPopup = null;
    }

    // Reset selected polygon
    if (window.currentSelectedPolygon) {
        window.currentSelectedPolygon.setOptions({
            fillOpacity: 0.3,
            strokeWeight: 3,
            zIndex: 1
        });
        window.currentSelectedPolygon = null;
    }

    try {
        const geoJson = typeof property.geometry === 'string'
            ? JSON.parse(property.geometry)
            : property.geometry;

        if (geoJson.type === 'Polygon') {
            const paths = geoJson.coordinates[0]
                .map(raw => {
                    // raw = [Easting, Northing] em metros (EPSG:3763)
                    const [lng, lat] = proj4(CRS_SRC, CRS_DST, raw);
                    return { lat, lng };
                })
                .map(({ lat, lng }) => new google.maps.LatLng(lat, lng));

            if (paths.length > 2) {
                const bounds = new google.maps.LatLngBounds();
                paths.forEach(point => bounds.extend(point));

                const polygon = new google.maps.Polygon({
                    paths: paths,
                    strokeColor: '#ff0000',
                    strokeOpacity: 1,
                    strokeWeight: 4,
                    fillColor: '#ff0000',
                    fillOpacity: 0.4,
                    map: terraWatchMap,
                    zIndex: 100
                });

                window.currentHighlights.push(polygon);

                // Store as selected polygon
                window.currentSelectedPolygon = polygon;

                // Fit map to the property bounds
                terraWatchMap.fitBounds(bounds);
                setTimeout(() => {
                    if (terraWatchMap.getZoom() > 16) terraWatchMap.setZoom(16);
                }, 100);

                    // Show property info popup with navigation if from property list
    if (window.currentPropertyWorksheet) {
        showPropertyInfoWithNavigation(property, worksheet, polygon, '#ff0000');
    } else {
        showPropertyInfo(property, worksheet, polygon, '#ff0000');
    }
            }
        }
    } catch (error) {
        console.error('Error highlighting specific property on map:', error);
    }
}

// Show worksheet on map
async function showWorksheetOnMap(worksheetId) {
    console.log('Showing worksheet on map:', worksheetId);

    // Close any open modals
    closeWorksheetModal();

    // Switch to map section
    showSection('map');

    // Wait for map to initialize
    setTimeout(async () => {
        try {
            // Get worksheet details if not already loaded
            let worksheet = currentWorksheets?.find(w => w.id === worksheetId);
            if (!worksheet) {
                const response = await auth.fetch(`/rest/worksheet/${worksheetId}/detailed`);
                if (response.ok) {
                    worksheet = await response.json();
                }
            }

            if (worksheet && terraWatchMap) {
                highlightWorksheetOnMap(worksheet);
            }
        } catch (error) {
            console.error('Error showing worksheet on map:', error);
            ui.showAlert('Erro ao exibir worksheet no mapa', 'error');
        }
    }, 500);
}

// Highlight worksheet on map
function highlightWorksheetOnMap(worksheet) {
    if (!terraWatchMap || !worksheet.ruralProperties) return;

    const bounds = new google.maps.LatLngBounds();
    let hasValidPolygons = false;

    // Clear any existing highlights and popups
    if (window.currentHighlights) {
        window.currentHighlights.forEach(polygon => polygon.setMap(null));
    }
    window.currentHighlights = [];

    // Close any existing popup
    if (window.currentPropertyPopup) {
        window.currentPropertyPopup.remove();
        window.currentPropertyPopup = null;
    }

    // Reset selected polygon
    if (window.currentSelectedPolygon) {
        window.currentSelectedPolygon.setOptions({
            fillOpacity: 0.3,
            strokeWeight: 3,
            zIndex: 1
        });
        window.currentSelectedPolygon = null;
    }

    worksheet.ruralProperties.forEach(property => {
        if (property.geometry) {
            try {
                const geoJson = typeof property.geometry === 'string'
                    ? JSON.parse(property.geometry)
                    : property.geometry;

                if (geoJson.type === 'Polygon') {
                    const paths = geoJson.coordinates[0]
                        .map(raw => {
                            // raw = [Easting, Northing] em metros (EPSG:3763)
                            const [lng, lat] = proj4(CRS_SRC, CRS_DST, raw);
                            return { lat, lng };
                        })
                        .map(({ lat, lng }) => {
                            const point = new google.maps.LatLng(lat, lng);
                            bounds.extend(point);
                            return point;
                        });

                    if (paths.length > 2) {
                        hasValidPolygons = true;

                        const polygon = new google.maps.Polygon({
                            paths: paths,
                            strokeColor: '#ff0000',
                            strokeOpacity: 1,
                            strokeWeight: 3,
                            fillColor: '#ff0000',
                            fillOpacity: 0.3,
                            map: terraWatchMap,
                            zIndex: 100
                        });

                        window.currentHighlights.push(polygon);

                        // Add click listener to the highlighted polygon
                        polygon.addListener('click', (event) => {
                            console.log('Highlighted polygon clicked:', property.rural_property_id, 'from worksheet:', worksheet.id);

                            // Clear any existing highlights first
                            if (window.currentHighlights) {
                                window.currentHighlights.forEach(poly => {
                                    if (poly !== polygon) {
                                        poly.setOptions({
                                            fillOpacity: 0.3,
                                            strokeWeight: 3,
                                            zIndex: 100
                                        });
                                    }
                                });
                            }

                            // Reset previously selected polygon if it exists
                            if (window.currentSelectedPolygon && window.currentSelectedPolygon !== polygon) {
                                window.currentSelectedPolygon.setOptions({
                                    fillOpacity: 0.3,
                                    strokeWeight: 3,
                                    zIndex: 100
                                });
                            }

                            // Highlight the clicked polygon with more prominent styling
                            polygon.setOptions({
                                fillOpacity: 0.7,
                                strokeWeight: 5,
                                strokeColor: '#ff0000',
                                zIndex: 110
                            });

                            // Store the currently selected polygon
                            window.currentSelectedPolygon = polygon;

                            // Show property info with navigation if from property list
                            if (window.currentPropertyWorksheet) {
                                showPropertyInfoWithNavigation(property, worksheet, polygon, '#ff0000');
                            } else {
                                showPropertyInfo(property, worksheet, polygon, '#ff0000');
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('Error highlighting property on map:', error);
            }
        }
    });

    if (hasValidPolygons) {
        terraWatchMap.fitBounds(bounds);
        setTimeout(() => {
            if (terraWatchMap.getZoom() > 16) terraWatchMap.setZoom(16);
        }, 100);
    }
}

// Create execution sheet from worksheet
async function createExecutionSheetFromWorksheet(worksheetId) {
    if (!worksheetId) {
        ui.showAlert('ID da worksheet inválido', 'error');
        return;
    }

    try {
        ui.showLoading(true, 'Verificando folha de execução...');

        // Check if execution sheet exists using status endpoint
        let checkResponse;
        try {
            checkResponse = await auth.fetch(`/rest/executionsheet/status/execution_${worksheetId}`);
        } catch (error) {
            // If 404, it doesn't exist
            if (error.message.includes('404')) {
                checkResponse = { ok: false, status: 404 };
            } else {
                throw error;
            }
        }

        if (checkResponse.ok) {
            // Execution sheet exists
            ui.showAlert('Esta worksheet já possui uma folha de execução.', 'info');
            closeWorksheetModal();
            showSection('executionsheets');
            setTimeout(() => refreshExecutionSheetsList(), 500);
            return;
        } else if (checkResponse.status !== 404) {
            // Other errors
            const errorText = await checkResponse.text();
            throw new Error(errorText || 'Erro ao verificar existência');
        }

        // Create if doesn't exist
        ui.showLoading(true, 'Criando folha de execução...');

        const response = await auth.fetch(`/rest/executionsheet/create/${worksheetId}`, { method: 'POST' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Falha ao criar folha de execução');
        }

        ui.showAlert('Folha de execução criada com sucesso!', 'success');
        closeWorksheetModal();
        showSection('executionsheets');
        setTimeout(() => refreshExecutionSheetsList(), 500);

    } catch (error) {
        console.error('Error creating execution sheet:', error);
        ui.showAlert('Erro ao criar folha de execução: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Load user management data
async function loadUserManagementData() {
    if (typeof refreshUsersList === 'function') {
        await refreshUsersList();
    }
}

// Load worksheets data
async function loadWorksheetsData() {
    try {
        console.log('Loading worksheets data...');
        if (typeof refreshWorksheetsList === 'function') {
            await refreshWorksheetsList();
        }

        // Make sure worksheets section is properly initialized
        const worksheetsSection = document.getElementById('worksheetsSection');
        if (worksheetsSection) {
            // Ensure the section is visible if we're on the worksheets page
            const isWorksheetPage = window.location.hash === '#worksheets';
            if (isWorksheetPage) {
                worksheetsSection.style.display = 'block';
                worksheetsSection.classList.add('active');
            }
        }
    } catch (error) {
        console.error('Error in loadWorksheetsData:', error);
    }
}

// Initialize common features - THIS IS THE KEY FIX
async function initializeCommonFeatures() {
    console.log('Initializing common features...');

    // Setup navigation
    setupNavigation();

    // Setup sidebar (FIXED)
    setupSidebar();

    // Setup profile dropdown (FIXED)
    if (currentUser) {
        setupProfileDropdown();
    }

    // Setup search functionality
    setupGlobalSearch();

    // Setup user management (if admin)
    if (currentUser && roles.canManageUsers(currentUser.role)) {
        setupUserManagement();
    }

    // Setup worksheet management (if operator)
    if (currentUser && roles.canHandleWorksheets(currentUser.role)) {
        if (typeof setupWorksheetManagement === 'function') {
            setupWorksheetManagement();
        }
    }

    // Setup execution sheet management (if operator)
    if (currentUser && roles.canHandleExecutionSheets(currentUser.role)) {
        if (typeof setupExecutionSheetManagement === 'function') {
            console.log("DASHBOARD: setting up execution sheet management")
            setupExecutionSheetManagement();
        }
    }

    // Initialize notifications system (if authenticated)
    if (currentUser && typeof initializeNotifications === 'function') {
        initializeNotifications();
    }

    // Initialize map when needed
    initializeMapWhenNeeded();

    console.log('Common features initialized');
}

// Setup navigation
function setupNavigation() {
    console.log('Setting up navigation...');
    document.querySelectorAll('.nav-item').forEach(item => {
        const section = item.dataset.section;
        if (section) {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Navigation clicked:', section);
                showSection(section);
            });
        }
    });
}

// Setup sidebar - FIXED VERSION
function setupSidebar() {
    console.log('Setting up sidebar...');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarBrand = document.querySelector('.sidebar-brand');
    const dashboardContainer = document.querySelector('.dashboard-container');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.querySelector('.dashboard-sidebar');

    const toggleSidebar = (e) => {
        if (e) e.preventDefault();
        console.log('Toggling sidebar...');

        if (dashboardContainer) {
            dashboardContainer.classList.toggle('sidebar-collapsed');

            // Update the toggle icon
            const icon = sidebarToggle?.querySelector('i');
            if (icon) {
                if (dashboardContainer.classList.contains('sidebar-collapsed')) {
                    icon.classList.remove('ri-menu-fold-line');
                    icon.classList.add('ri-menu-unfold-line');
                } else {
                    icon.classList.remove('ri-menu-unfold-line');
                    icon.classList.add('ri-menu-fold-line');
                }
            }

            console.log('Sidebar toggled. Collapsed:', dashboardContainer.classList.contains('sidebar-collapsed'));
        }
    };

    // Add event listeners
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
        console.log('Sidebar toggle button listener added');
    }

    if (sidebarBrand) {
        sidebarBrand.addEventListener('click', toggleSidebar);
        console.log('Sidebar brand listener added');
    }

    // Mobile menu toggle
    if (mobileMenuToggle && sidebar) {
        mobileMenuToggle.addEventListener('click', () => {
            console.log('Mobile menu toggled');
            sidebar.classList.toggle('mobile-open');
        });
    }
}

// Setup profile dropdown - FIXED VERSION
function setupProfileDropdown() {
    console.log('Setting up profile dropdown...');
    const profileDropdownTrigger = document.getElementById('profileDropdownTrigger');
    const profileDropdown = document.getElementById('profileDropdown');
    const logoutBtn = document.getElementById('logoutBtn');

    console.log('Profile dropdown trigger found:', !!profileDropdownTrigger);
    console.log('Profile dropdown found:', !!profileDropdown);

    // Debug: Log the actual elements
    if (profileDropdownTrigger) {
        console.log('Profile dropdown trigger element:', profileDropdownTrigger);
        console.log('Profile dropdown trigger display:', profileDropdownTrigger.style.display);
    }
    if (profileDropdown) {
        console.log('Profile dropdown element:', profileDropdown);
    }

    if (profileDropdownTrigger && profileDropdown) {
        // Remove any existing listeners
        profileDropdownTrigger.replaceWith(profileDropdownTrigger.cloneNode(true));
        const newTrigger = document.getElementById('profileDropdownTrigger');

        newTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Profile dropdown clicked');

            const isVisible = profileDropdown.classList.contains('show');
            console.log('Dropdown currently visible:', isVisible);

            // Close any other open dropdowns first
            document.querySelectorAll('.profile-dropdown.show').forEach(dropdown => {
                if (dropdown !== profileDropdown) {
                    dropdown.classList.remove('show');
                }
            });

            profileDropdown.classList.toggle('show');
            newTrigger.classList.toggle('open');

            console.log('Dropdown visibility after toggle:', profileDropdown.classList.contains('show'));
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!newTrigger.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileDropdown.classList.remove('show');
                newTrigger.classList.remove('open');
            }
        });

        // Close dropdown when pressing Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                profileDropdown.classList.remove('show');
                newTrigger.classList.remove('open');
            }
        });

        console.log('Profile dropdown listeners added');

    } else {
        console.warn('Profile dropdown elements not found');
    }

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Logout clicked');
            if (confirm('Tem certeza que deseja sair?')) {
                auth.logout();
            }
        });
    }
}

// Setup global search
function setupGlobalSearch() {
    const globalSearch = document.getElementById('globalSearch');
    if (globalSearch) {
        let searchTimeout;
        
        globalSearch.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            // Clear previous timeout
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            // Clear search results if query is empty
            if (!query) {
                hideSearchResults();
                return;
            }
            
            // Debounce search to avoid too many requests
            searchTimeout = setTimeout(() => {
                performGlobalSearch(query);
            }, 300);
        });
        
        // Handle Enter key to select first result
        globalSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const firstResult = document.querySelector('.search-result-item');
                if (firstResult) {
                    firstResult.click();
                }
            }
        });
        
        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.header-search') && !e.target.closest('.search-results')) {
                hideSearchResults();
            }
        });
    }
}

// Perform global search
async function performGlobalSearch(query) {
    try {
        ui.showLoading(true, 'Pesquisando...');
        
        const response = await auth.fetch(`/rest/utils/search?q=${encodeURIComponent(query)}&limit=10`);
        
        if (!response.ok) {
            throw new Error('Falha na pesquisa');
        }
        
        const results = await response.json();
        displaySearchResults(results, query);
        
    } catch (error) {
        console.error('Search error:', error);
        ui.showAlert('Erro na pesquisa: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Display search results
function displaySearchResults(results, query) {
    // Remove existing search results
    hideSearchResults();
    
    // Get the search input element
    const searchInput = document.getElementById('globalSearch');
    const headerSearch = document.querySelector('.header-search');
    
    if (!searchInput || !headerSearch) {
        console.error('Search elements not found');
        return;
    }
    
    // Create search results container
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-results';
    searchContainer.innerHTML = `
        <div class="search-results-header">
            <span>Resultados para "${query}"</span>
            <button class="close-search" onclick="hideSearchResults()">
                <i class="ri-close-line"></i>
            </button>
        </div>
        <div class="search-results-content"></div>
    `;
    
    const resultsContent = searchContainer.querySelector('.search-results-content');
    let hasResults = false;
    
    // Display users
    if (results.users && results.users.length > 0) {
        hasResults = true;
        const usersSection = createSearchSection('Usuários', results.users, 'user');
        resultsContent.appendChild(usersSection);
    }
    
    // Display worksheets
    if (results.worksheets && results.worksheets.length > 0) {
        hasResults = true;
        const worksheetsSection = createSearchSection('Worksheets', results.worksheets, 'worksheet');
        resultsContent.appendChild(worksheetsSection);
    }
    
    // Display execution sheets
    if (results.executionSheets && results.executionSheets.length > 0) {
        hasResults = true;
        const execSheetsSection = createSearchSection('Folhas de Execução', results.executionSheets, 'executionSheet');
        resultsContent.appendChild(execSheetsSection);
    }
    
    // Display activities
    if (results.activities && results.activities.length > 0) {
        hasResults = true;
        const activitiesSection = createSearchSection('Atividades', results.activities, 'activity');
        resultsContent.appendChild(activitiesSection);
    }
    
    // Display posts
    if (results.posts && results.posts.length > 0) {
        hasResults = true;
        const postsSection = createSearchSection('Posts', results.posts, 'post');
        resultsContent.appendChild(postsSection);
    }
    
    if (!hasResults) {
        resultsContent.innerHTML = `
            <div class="no-results">
                <i class="ri-search-line"></i>
                <p>Nenhum resultado encontrado para "${query}"</p>
            </div>
        `;
    }
    
    // Add the results to the header search container
    headerSearch.appendChild(searchContainer);
}

// Create search section
function createSearchSection(title, items, type) {
    const section = document.createElement('div');
    section.className = 'search-section';
    section.innerHTML = `
        <h4 class="search-section-title">${title}</h4>
        <div class="search-section-items"></div>
    `;
    
    const itemsContainer = section.querySelector('.search-section-items');
    
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'search-result-item';
        itemElement.innerHTML = `
            <div class="search-item-icon">
                <i class="${getSearchItemIcon(type, item)}"></i>
            </div>
            <div class="search-item-content">
                <div class="search-item-title">${item.displayName}</div>
                <div class="search-item-subtitle">${getSearchItemSubtitle(item, type)}</div>
            </div>
        `;
        
        itemElement.addEventListener('click', () => {
            handleSearchResultClick(item, type);
        });
        
        itemsContainer.appendChild(itemElement);
    });
    
    return section;
}

// Get icon for search item
function getSearchItemIcon(type, item) {
    switch (type) {
        case 'user':
            return 'ri-user-line';
        case 'worksheet':
            return 'ri-file-list-3-line';
        case 'executionSheet':
            return 'ri-clipboard-line';
        case 'activity':
            return item.activityType === 'photo' ? 'ri-image-line' : 'ri-video-line';
        case 'post':
            return 'ri-chat-3-line';
        default:
            return 'ri-file-line';
    }
}

// Get subtitle for search item
function getSearchItemSubtitle(item, type) {
    switch (type) {
        case 'user':
            return `${item.role} • ${item.email}`;
        case 'worksheet':
            return `ID: ${item.id}`;
        case 'executionSheet':
            return `ID: ${item.id.replace('execution_', '')}`;
        case 'activity':
            return `${item.activityType} • ${item.executionSheetId || 'N/A'}`;
        case 'post':
            return `${item.postType} • ${item.executionSheetId || 'N/A'}`;
        default:
            return '';
    }
}

// Handle search result click
function handleSearchResultClick(item, type) {
    hideSearchResults();
    
    switch (type) {
        case 'user':
            if (currentUser && roles.canManageUsers(currentUser.role)) {
                showSection('users');
                // Could implement user detail view here
                ui.showAlert(`Visualizando usuário: ${item.name}`, 'info');
            }
            break;
        case 'worksheet':
            if (currentUser && roles.canHandleWorksheets(currentUser.role)) {
                showSection('worksheets');
                // Could implement worksheet detail view here
                ui.showAlert(`Visualizando worksheet: ${item.name}`, 'info');
            }
            break;
        case 'executionSheet':
            if (currentUser && roles.canHandleExecutionSheets(currentUser.role)) {
                showSection('executionsheets');
                // Could implement execution sheet detail view here
                ui.showAlert(`Visualizando folha de execução: ${item.name}`, 'info');
            }
            break;
        case 'activity':
            if (item.executionSheetId) {
                showSection('executionsheets');
                // Could implement activity detail view here
                ui.showAlert(`Visualizando atividade: ${item.name}`, 'info');
            }
            break;
        case 'post':
            showSection('socialfeed');
            // Could implement post detail view here
            ui.showAlert(`Visualizando post: ${item.name}`, 'info');
            break;
    }
}

// Hide search results
function hideSearchResults() {
    const existingResults = document.querySelector('.search-results');
    if (existingResults) {
        existingResults.remove();
    }
}

// Update UI with user data
function updateUserInterface(user) {
    console.log('Updating UI with user data:', user);

    // Update welcome message
    const welcomeMsg = document.getElementById('welcomeMsg');
    if (welcomeMsg) {
        welcomeMsg.textContent = `Olá, ${user.name || user.username}!`;
    }

    // Update user info in header
    const userName = document.getElementById('userName');
    if (userName) {
        userName.textContent = `Olá, ${user.name || user.username}!`;
    }

    const userRole = document.getElementById('userRole');
    if (userRole) {
        userRole.textContent = roles.getDisplayName(user.role);
    }

    // Update user avatar
    const avatar = document.getElementById('userAvatar');
    if (avatar) {
        avatar.textContent = profile.generateInitials(user.name || user.username);
        avatar.style.background = profile.generateAvatarColor(user.username);
    }

    // Update role and state badges
    const userRoleBadge = document.getElementById('userRoleBadge');
    if (userRoleBadge) {
        userRoleBadge.textContent = roles.getDisplayName(user.role);
        userRoleBadge.style.display = 'inline-flex';
    }

    const userStateBadge = document.getElementById('userStateBadge');
    if (userStateBadge) {
        userStateBadge.textContent = profile.getStateDisplayName(user.state);
        userStateBadge.className = `status-badge state ${profile.getStateColor(user.state)}`;
        userStateBadge.style.display = 'inline-flex';
    }
}

// Navigation - FIXED VERSION
function showSection(sectionId) {
    console.log('Showing section:', sectionId);

    // Close any open modals
    closeWorksheetModal();
    closeExecutionSheetModal();
    closePropertyInfoModal();
    closePropertyPopup();

    // Hide all sections
    document.querySelectorAll('.dashboard-section').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });

    // Show selected section
    const targetSection = document.getElementById(sectionId + 'Section');
    if (targetSection) {
        targetSection.style.display = 'block';
        targetSection.classList.add('active');

        // Update URL hash
        window.location.hash = sectionId;
    }

    // Initialize section-specific functionality
    if (sectionId === 'map') {
        // Reset map focus when switching to map section
        window.mapAlreadyFocused = false;
        // Initialize map immediately when switching to map section
        setTimeout(() => {
            ensureMapInitialized();
        }, 100);
    } else if (sectionId === 'users' && currentUser && roles.canManageUsers(currentUser.role)) {
        if (typeof refreshUsersList === 'function') {
            refreshUsersList();
        }
    } else if (sectionId === 'worksheets' && currentUser && roles.canHandleWorksheets(currentUser.role)) {
        console.log('Initializing worksheets section...');
        // First ensure the management is set up
        if (typeof setupWorksheetManagement === 'function') {
            setupWorksheetManagement();
        }
        // Then refresh the list
        if (typeof refreshWorksheetsList === 'function') {
            refreshWorksheetsList();
        }
    } else if (sectionId === 'executionsheets' && currentUser && roles.canHandleExecutionSheets(currentUser.role)) {
        if (typeof setupExecutionSheetManagement === 'function') {
            setupExecutionSheetManagement();
        }
        if (typeof refreshExecutionSheetsList === 'function') {
            refreshExecutionSheetsList();
        }
        // Clear detail view when going back to list
        const executionSheetContent = document.getElementById('executionSheetContent');
        if (executionSheetContent) {
            executionSheetContent.innerHTML = '';
        }
    } else if (sectionId === 'socialfeed') {
        if (typeof refreshFullSocialFeed === 'function') {
            refreshFullSocialFeed();
        } else {
            loadSocialFeed();
        }
        // Setup filter tabs for social feed
        setTimeout(() => {
            setupSocialFeedFilters();
        }, 500);
    } else if (sectionId === 'profile' && currentUser) {
        loadProfileData();
    }

    // Update header
    updateHeader(sectionId);

    // Update navigation
    updateNavigation(sectionId);
}

// Initialize dashboard based on URL hash
function initializeDashboardFromHash() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    showSection(hash);
}

// Add hash change listener
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1) || 'dashboard';
    showSection(hash);
});

// Update header for current section
function updateHeader(sectionId) {
    const headerTitle = document.querySelector('.header-title');
    const headerIcon = document.querySelector('.header-section-icon');

    const sectionData = {
        dashboard: { title: 'Dashboard', icon: 'dashboard-line' },
        users: { title: 'Gestão de Usuários', icon: 'user-settings-line' },
        worksheets: { title: 'Worksheets', icon: 'file-list-3-line' },
        executionsheets: { title: 'Folhas de Execução', icon: 'clipboard-line' },
        map: { title: 'Mapa Interativo', icon: 'map-2-line' },
        socialfeed: { title: 'Feed Social', icon: 'chat-3-line' },
        profile: { title: 'Meu Perfil', icon: 'user-line' },
        settings: { title: 'Configurações', icon: 'settings-4-line' },
        analytics: { title: 'Analytics', icon: 'bar-chart-box-line' },
        'publicInfo': { title: 'Informações Públicas', icon: 'information-line' }
    };

    const section = sectionData[sectionId] || sectionData.dashboard;
    if (headerTitle) headerTitle.textContent = section.title;
    if (headerIcon) headerIcon.className = `ri-${section.icon} header-section-icon`;
}

// Update navigation state
function updateNavigation(sectionId) {
    // Remove active class from all items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Add active class to current section
    const activeItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
}

// Initialize Google Maps
async function initMap() {
    console.log('initMap called');
    try {
        // Check if Google Maps is loaded
        if (typeof google === 'undefined' || !google.maps) {
            console.warn('Google Maps not loaded yet, retrying in 1 second...');
            setTimeout(initMap, 1000);
            return;
        }

        const lisbon = { lat: 38.7223, lng: -9.1393 };

        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.warn('Map container not found');
            return;
        }

        terraWatchMap = new google.maps.Map(mapElement, {
            center: lisbon,
            zoom: 10, // Better default zoom
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                position: google.maps.ControlPosition.TOP_RIGHT,
                mapTypeIds: [
                    google.maps.MapTypeId.ROADMAP,
                    google.maps.MapTypeId.SATELLITE,
                    google.maps.MapTypeId.HYBRID,
                    google.maps.MapTypeId.TERRAIN
                ]
            },
            zoomControl: true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.RIGHT_CENTER
            },
            scaleControl: true,
            streetViewControl: true,
            streetViewControlOptions: {
                position: google.maps.ControlPosition.RIGHT_CENTER
            },
            fullscreenControl: true,
            gestureHandling: 'cooperative' // Better touch handling
        });

        mapElement.classList.add('loaded');

        // Setup map type selector
        setupMapTypeSelector();

        // Setup map filters
        setupMapFilters();

        // Setup worksheet list sidebar
        setupWorksheetListSidebar();

        // Load and display worksheets
        try {
            const worksheets = await loadWorksheets();
            displayWorksheets(worksheets, terraWatchMap);
        } catch (error) {
            console.error('Error loading worksheets:', error);
            ui.showAlert('Erro ao carregar áreas do mapa', 'error');
        }

    } catch (error) {
        console.error('Error initializing map:', error);
        if (!error.message.includes('CSP') && !error.message.includes('blocked')) {
            ui.showAlert('Failed to initialize map', 'error');
        }
    }
}

// Setup map type selector
function setupMapTypeSelector() {
    const mapTypeSelect = document.getElementById('mapTypeSelect');
    if (mapTypeSelect && terraWatchMap) {
        mapTypeSelect.addEventListener('change', (e) => {
            const mapType = e.target.value;
            terraWatchMap.setMapTypeId(mapType);
        });
    }
}

// Setup map filters
function setupMapFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');

            const filter = btn.dataset.filter;
            applyMapFilter(filter);
        });
    });
}

// Apply map filter
function applyMapFilter(filter) {
    // Implementation for filtering map data
    console.log('Applying map filter:', filter);
    // This would filter the displayed polygons based on the selected filter
}

// Display worksheets on the map - IMPROVED VERSION
function displayWorksheets(worksheets, map) {
    // Clear any existing polygons
    if (window.currentMapPolygons) {
        window.currentMapPolygons.forEach(polygon => polygon.setMap(null));
    }
    window.currentMapPolygons = [];

    // Define CRS once
    const CRS_SRC = "EPSG:3763", CRS_DST = "EPSG:4326";

    const bounds = new google.maps.LatLngBounds();
    let hasValidPolygons = false;

    // Better color scheme for worksheets
    const getWorksheetColor = (worksheetId) => {
        const colors = [
            '#9EF5CF', '#7ad4ae', '#22c55e', '#16a34a',
            '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
            '#ec4899', '#f43f5e', '#ef4444', '#f97316',
            '#f59e0b', '#eab308', '#84cc16', '#65a30d'
        ];
        return colors[worksheetId % colors.length];
    };

    worksheets.forEach(worksheet => {
        const worksheetColor = getWorksheetColor(worksheet.id);

        if (worksheet.ruralProperties) {
            worksheet.ruralProperties.forEach(property => {
                if (property.geometry) {
                    try {
                        const geoJson = typeof property.geometry === 'string'
                            ? JSON.parse(property.geometry)
                            : property.geometry;

                        if (geoJson.type === 'Polygon') {
                            const paths = geoJson.coordinates[0]
                                .map(raw => {
                                    // raw = [Easting, Northing] em metros (EPSG:3763)
                                    const [lng, lat] = proj4(CRS_SRC, CRS_DST, raw);
                                    return { lat, lng };
                                })
                                .map(({ lat, lng }) => {
                                    const point = new google.maps.LatLng(lat, lng);
                                    bounds.extend(point);
                                    return point;
                                });

                            if (paths.length > 2) {
                                hasValidPolygons = true;
                                console.log('Creating polygon for property:', property.rural_property_id, 'from worksheet:', worksheet.id);

                                const polygon = new google.maps.Polygon({
                                    paths: paths,
                                    strokeColor: worksheetColor,
                                    strokeOpacity: 0.9,
                                    strokeWeight: 3,
                                    fillColor: worksheetColor,
                                    fillOpacity: 0.3,
                                    map: map,
                                    zIndex: 1
                                });

                                // Store polygon reference
                                if (!window.currentMapPolygons) {
                                    window.currentMapPolygons = [];
                                }
                                window.currentMapPolygons.push(polygon);

                                // Add worksheet info to polygon
                                polygon.worksheetId = worksheet.id;
                                polygon.propertyId = property.rural_property_id;

                                polygon.addListener('mouseover', () => {
                                    polygon.setOptions({
                                        fillOpacity: 0.5,
                                        strokeWeight: 4,
                                        zIndex: 2
                                    });
                                });

                                polygon.addListener('mouseout', () => {
                                    polygon.setOptions({
                                        fillOpacity: 0.3,
                                        strokeWeight: 3,
                                        zIndex: 1
                                    });
                                });

                                polygon.addListener('click', (event) => {
                                    console.log('Polygon clicked:', property.rural_property_id, 'from worksheet:', worksheet.id);
                                    console.log('Event details:', event);

                                    // Clear any existing highlights first
                                    if (window.currentHighlights) {
                                        window.currentHighlights.forEach(poly => {
                                            if (poly !== polygon) {
                                                poly.setOptions({
                                                    fillOpacity: 0.3,
                                                    strokeWeight: 3,
                                                    zIndex: 1
                                                });
                                            }
                                        });
                                    }

                                    // Reset previously selected polygon if it exists
                                    if (window.currentSelectedPolygon && window.currentSelectedPolygon !== polygon) {
                                        window.currentSelectedPolygon.setOptions({
                                            fillOpacity: 0.3,
                                            strokeWeight: 3,
                                            zIndex: 1
                                        });
                                    }

                                    // Highlight the clicked polygon with more prominent styling
                                    polygon.setOptions({
                                        fillOpacity: 0.7,
                                        strokeWeight: 5,
                                        strokeColor: '#ff0000',
                                        zIndex: 10
                                    });

                                                                // Store the currently selected polygon
                            window.currentSelectedPolygon = polygon;

                            // Show property info with navigation if from property list
                            if (window.currentPropertyWorksheet) {
                                showPropertyInfoWithNavigation(property, worksheet, polygon, worksheetColor);
                            } else {
                                showPropertyInfo(property, worksheet, polygon, worksheetColor);
                            }
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error displaying property:', error);
                    }
                }
            });
        }
    });

    // Only fit bounds if we have valid polygons and the map is not already focused
    if (hasValidPolygons && !window.mapAlreadyFocused) {
        // Set a reasonable zoom level instead of always fitting bounds
        const center = bounds.getCenter();
        map.setCenter(center);

        // Calculate appropriate zoom level
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const latDiff = Math.abs(ne.lat() - sw.lat());
        const lngDiff = Math.abs(ne.lng() - sw.lng());

        // Set zoom based on the larger dimension
        const maxDiff = Math.max(latDiff, lngDiff);
        let zoom = 10; // Default zoom

        if (maxDiff > 0.1) zoom = 8;
        else if (maxDiff > 0.05) zoom = 9;
        else if (maxDiff > 0.02) zoom = 10;
        else if (maxDiff > 0.01) zoom = 11;
        else if (maxDiff > 0.005) zoom = 12;
        else zoom = 13;

        map.setZoom(zoom);
        window.mapAlreadyFocused = true;
    }
}

// Show property information in a popup - FIXED VERSION
function showPropertyInfo(property, worksheet, polygon, color) {
    console.log('showPropertyInfo called with:', { property, worksheet: worksheet.id, color });

    // Close any existing popups
    if (window.currentPropertyPopup) {
        window.currentPropertyPopup.remove();
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'property-popup';

    // Get property name/identifier
    const propertyName = property.aigp || property.rural_property_id || `Propriedade ${property.UI_id || 'N/A'}`;
    const worksheetName = `Worksheet #${worksheet.id}`;

    popup.innerHTML = `
        <div class="popup-header">
            <h4><i class="ri-map-pin-line"></i> ${propertyName}</h4>
            <button class="popup-close" onclick="closePropertyPopup()">
                <i class="ri-close-line"></i>
            </button>
        </div>
        <div class="popup-content">
            <div class="popup-info">
                <div class="info-row">
                    <span class="label">Propriedade:</span>
                    <span class="value">${propertyName}</span>
                </div>
                <div class="info-row">
                    <span class="label">AIGP:</span>
                    <span class="value">${property.aigp || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">ID:</span>
                    <span class="value">${property.rural_property_id || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">UI ID:</span>
                    <span class="value">${property.UI_id || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Worksheet:</span>
                    <span class="value">${worksheetName}</span>
                </div>
            </div>
            <div class="popup-actions">
                <button class="btn btn-sm btn-primary" onclick="viewWorksheetDetails(${worksheet.id})">
                    <i class="ri-file-list-3-line"></i>
                    Ver Worksheet
                </button>
            </div>
        </div>
    `;

    // Position popup near the clicked polygon
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    // Get map bounds and center for positioning
    const mapBounds = terraWatchMap.getBounds();
    const mapCenter = terraWatchMap.getCenter();
    const mapDiv = terraWatchMap.getDiv();
    const mapRect = mapDiv.getBoundingClientRect();

    // Position popup on the left side of the map
    popup.style.position = 'absolute';
    popup.style.left = '20px';
    popup.style.top = '50%';
    popup.style.transform = 'translateY(-50%)';
    popup.style.zIndex = '2000';
    popup.style.pointerEvents = 'auto';
    popup.style.backgroundColor = '#ffffff';
    popup.style.border = '2px solid #e2e8f0';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.15)';
    popup.style.padding = '0';
    popup.style.minWidth = '300px';
    popup.style.maxWidth = '350px';
    popup.style.fontFamily = 'Inter, sans-serif';
    popup.style.color = '#1f2937';

    // Add to map container
    mapContainer.appendChild(popup);

    console.log('Property popup added to map container');

    // Store reference
    window.currentPropertyPopup = popup;

    // Auto-close after 15 seconds
    setTimeout(() => {
        if (popup.parentElement) {
            closePropertyPopup();
        }
    }, 15000);
}

// Close property info modal
function closePropertyInfoModal() {
    const modal = document.getElementById('propertyInfoModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Initialize map when section is shown
function initializeMapWhenNeeded() {
    const mapSection = document.getElementById('mapSection');
    if (mapSection && mapSection.style.display !== 'none') {
        setTimeout(() => {
            initMap();
        }, 100);
    }
}

// Ensure map is initialized when switching to map section
function ensureMapInitialized() {
    if (!terraWatchMap) {
        console.log('Map not initialized, initializing now...');
        setTimeout(() => {
            initMap();
        }, 500);
    }
}

// Utility functions
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} dia${days > 1 ? 's' : ''} atrás`;
    if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''} atrás`;
    if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''} atrás`;
    return 'Agora mesmo';
}

// Load social feed using new unified system
async function loadSocialFeed() {
    try {
        // Use the new unified social feed system
        const posts = await loadUnifiedSocialFeed();

        if (posts.length > 0) {
            // Take the most recent 10 posts for dashboard preview
            const recentPosts = posts.slice(0, 10);
            await displayDashboardSocialFeed(recentPosts);
        } else {
            // Generate sample activities for development
            const sampleActivities = await generateSampleSocialActivities();
            await displaySocialFeed(sampleActivities);
        }
    } catch (error) {
        console.error('Error loading social feed:', error);
        // Display sample activities as fallback
        const sampleActivities = await generateSampleSocialActivities();
        await displaySocialFeed(sampleActivities);
    }
}

async function loadExecutionSheetActivities() {
    try {
        const response = await auth.fetch('/rest/executionsheet/recent-activities');
        if (response.ok) {
            const activities = await response.json();
            return activities.map(activity => ({
                id: activity.id,
                type: activity.type,
                username: activity.fromUser || activity.username,
                worksheetId: activity.worksheetId,
                description: activity.description,
                timestamp: activity.timestamp,
                photoUrl: activity.photoUrl,
                likes: activity.likes || 0,
                comments: activity.comments || 0,
                userLiked: activity.userLiked || false
            }));
        }
    } catch (error) {
        console.error('Error loading execution activities:', error);
    }
    return [];
}

async function loadRecentPhotoActivities() {
    try {
        const response = await auth.fetch('/rest/executionsheet/recent-photos');
        if (response.ok) {
            const photos = await response.json();
            return photos.map(photo => ({
                id: photo.id,
                type: 'photo',
                username: photo.uploadedBy,
                description: `adicionou uma foto ${photo.description ? ': ' + photo.description : ''}`,
                timestamp: photo.uploadTimestamp,
                photoUrl: `https://storage.googleapis.com/terra-watch-photos/${photo.id}.jpg`,
                thumbnailUrl: `https://storage.googleapis.com/terra-watch-photos/${photo.id}.jpg`,
                photoId: photo.id,
                activityId: photo.activityId,
                worksheetId: photo.worksheetId,
                likes: photo.likes || 0,
                userLiked: photo.userLiked || false
            }));
        }
    } catch (error) {
        console.error('Error loading photo activities:', error);
    }
    return [];
}

async function loadRecentVideoActivities() {
    try {
        const response = await auth.fetch('/rest/executionsheet/recent-videos');
        if (response.ok) {
            const videos = await response.json();
            return videos.map(video => ({
                id: video.id,
                type: 'video',
                username: video.uploadedBy,
                description: `adicionou um vídeo ${video.description ? ': ' + video.description : ''}`,
                timestamp: video.uploadTimestamp,
                videoUrl: `https://storage.googleapis.com/terra-watch-videos/${video.id}.mp4`,
                thumbnailUrl: `https://storage.googleapis.com/terra-watch-photos/video-placeholder.png`,
                videoId: video.id,
                activityId: video.activityId,
                worksheetId: video.worksheetId,
                likes: video.likes || 0,
                userLiked: video.userLiked || false
            }));
        }
    } catch (error) {
        console.error('Error loading video activities:', error);
    }
    return [];
}

// Generate sample social activities based on real data
async function generateSampleSocialActivities() {
    const activities = [];

    try {
        // Get real user data if available
        let users = [currentUser?.username || 'Usuário'];
        try {
            if (roles.canManageUsers(currentUser?.role)) {
                const userResponse = await auth.fetch('/rest/list/users');
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    users = userData.map(u => u.username || 'Usuário').slice(0, 5);
                }
            }
        } catch (e) {
            users = ['João Silva', 'Maria Santos', 'Pedro Costa', 'Ana Oliveira', currentUser?.username || 'Você'].filter(Boolean);
        }

        // Get real worksheet data if available
        let worksheets = [];
        try {
            const wsResponse = await auth.fetch('/rest/worksheet/list');
            if (wsResponse.ok) {
                const wsIds = await wsResponse.json();
                worksheets = wsIds.slice(0, 5);
            }
        } catch (e) {
            worksheets = [101, 102, 103, 104, 105];
        }

        const activityTypes = [
            {
                type: 'worksheet_created',
                action: 'criou uma nova worksheet',
                icon: 'ri-file-add-line',
                color: 'var(--success-color)'
            },
            {
                type: 'worksheet_viewed',
                action: 'visualizou a worksheet',
                icon: 'ri-eye-line',
                color: 'var(--primary-dark)'
            },
            {
                type: 'execution_started',
                action: 'iniciou a execução da worksheet',
                icon: 'ri-play-line',
                color: 'var(--warning-color)'
            },
            {
                type: 'execution_completed',
                action: 'completou a execução da worksheet',
                icon: 'ri-check-line',
                color: 'var(--success-color)'
            },
            {
                type: 'comment_added',
                action: 'comentou na worksheet',
                icon: 'ri-chat-3-line',
                color: 'var(--primary-color)'
            },
            {
                type: 'like_added',
                action: 'curtiu a worksheet',
                icon: 'ri-heart-line',
                color: 'var(--error-color)'
            }
        ];

        // Generate activities for the last 24 hours
        const now = Date.now();
        const activitiesCount = Math.min(8, users.length * 2);

        for (let i = 0; i < activitiesCount; i++) {
            const user = users[Math.floor(Math.random() * users.length)];
            const worksheet = worksheets[Math.floor(Math.random() * worksheets.length)];
            const activityType = activityTypes[Math.floor(Math.random() * activityTypes.length)];
            const timeAgo = Math.floor(Math.random() * 24 * 60 * 60 * 1000); // Random time in last 24h

            activities.push({
                id: `activity_${i + 1}`,
                type: activityType.type,
                fromUser: user,
                message: `${activityType.action} #${worksheet}`,
                worksheet_id: worksheet,
                icon: activityType.icon,
                color: activityType.color,
                timestamp: new Date(now - timeAgo).toISOString()
            });
        }

        // Sort by timestamp (newest first)
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    } catch (error) {
        console.error('Error generating sample activities:', error);
    }

    return activities;
}

// Display social feed
async function displaySocialFeed(activities) {
    const socialFeed = document.getElementById('socialFeed');
    if (!socialFeed) return;

    if (activities.length === 0) {
        socialFeed.innerHTML = '<p class="text-center text-light">Nenhuma atividade recente no feed</p>';
        return;
    }

    // Use the cached user names instead of fetching them individually
    // The cache is loaded once when the dashboard initializes

    socialFeed.innerHTML = activities.map(activity => {
        const username = activity.fromUser || activity.username || 'Usuário';
        const displayName = getUserDisplayName(username);
        const avatarColor = '#C2F6E1'; // Fixed color as requested
        const timeAgo = formatTimeAgo(activity.timestamp);

        let activityContent = '';

        // Check if activity has photo
        if (activity.photoUrl || activity.thumbnailUrl) {
            activityContent = `
                <div class="activity-with-photo">
                    <div class="activity-header">
                        <div class="activity-avatar" style="background: ${avatarColor};">
                            ${displayName.charAt(0).toUpperCase()}
                        </div>
                        <div class="activity-info">
                            <div class="activity-text">
                                <strong>${displayName}</strong> ${activity.description}
                            </div>
                            <div class="activity-meta">
                                <span class="activity-time">
                                    <i class="ri-time-line"></i> ${timeAgo}
                                </span>
                                ${activity.worksheetId ? `
                                    <span class="activity-worksheet">
                                        <i class="ri-file-list-3-line"></i> WS #${activity.worksheetId}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    
                    ${activity.photoUrl ? `
                        <div class="activity-photo" onclick="viewPhotoInGallery('${activity.photoUrl}', '${activity.description || ''}')">
                            <img src="https://storage.googleapis.com/terra-watch-photos/${activity.photoId || 'unknown'}.jpg" alt="${activity.description || 'Foto da atividade'}" 
                                 onerror="this.style.display='none'; console.warn('Failed to load image:', this.src);">
                            <div class="photo-overlay">
                                <i class="ri-zoom-in-line"></i>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="activity-actions">
                        <button class="activity-action-btn ${activity.userLiked ? 'liked' : ''}" 
                                onclick="toggleActivityLike('${activity.id}', '${activity.type}')">
                            <i class="ri-heart-${activity.userLiked ? 'fill' : 'line'}"></i>
                            <span>${activity.likes || 0}</span>
                        </button>
                        ${activity.type === 'execution' ? `
                            <button class="activity-action-btn" 
                                    onclick="openActivityComments('${activity.id}')">
                                <i class="ri-chat-3-line"></i>
                                <span>${activity.comments || 0}</span>
                            </button>
                        ` : ''}
                        ${activity.activityId ? `
                            <button class="activity-action-btn" 
                                    onclick="viewActivityDetails('${activity.activityId}', '${activity.worksheetId}')">
                                <i class="ri-eye-line"></i>
                                <span>Ver Detalhes</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        } else {
            // Regular activity without photo
            activityContent = `
                <div class="activity-avatar" style="background: ${avatarColor};">
                    ${displayName.charAt(0).toUpperCase()}
                </div>
                <div class="activity-content">
                    <div class="activity-text">
                        <strong>${displayName}</strong> ${activity.description}
                    </div>
                    <div class="activity-meta">
                        <span class="activity-time">
                            <i class="ri-time-line"></i> ${timeAgo}
                        </span>
                        ${activity.worksheetId ? `
                            <a href="#" onclick="event.preventDefault(); handleActivityClick('${activity.type}', '${activity.worksheetId}')" 
                               class="activity-link">
                                <i class="ri-file-list-3-line"></i> WS #${activity.worksheetId}
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        return `
            <div class="activity-item ${activity.photoUrl ? 'with-photo' : ''}" data-activity-id="${activity.id}">
                ${activityContent}
            </div>
        `;
    }).join('');
}

// Generate avatar color based on username
function generateAvatarColor(username) {
    const colors = [
        '#9EF5CF', '#7ad4ae', '#22c55e', '#16a34a',
        '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
        '#ec4899', '#f43f5e', '#ef4444', '#f97316',
        '#f59e0b', '#eab308', '#84cc16', '#65a30d'
    ];

    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
}

// Handle activity click for navigation
function handleActivityClick(activityType, worksheetId) {
    console.log('Activity clicked:', activityType, worksheetId);

    switch (activityType) {
        case 'worksheet_created':
        case 'worksheet_viewed':
            if (worksheetId && typeof viewWorksheetDetails === 'function') {
                viewWorksheetDetails(parseInt(worksheetId));
            } else if (typeof showSection === 'function') {
                showSection('worksheets');
            }
            break;
        case 'execution_started':
        case 'execution_completed':
            if (typeof showSection === 'function') {
                showSection('executionsheets');
            }
            break;
        default:
            // Default action - just show worksheets
            if (typeof showSection === 'function') {
                showSection('worksheets');
            }
    }
}

// Toggle activity like
async function toggleActivityLike(activityId, activityType) {
    try {
        let url;
        if (activityType === 'photo') {
            url = `/rest/executionsheet/photo/${activityId}/like`;
        } else {
            url = `/rest/executionsheet/${activityId}/like`;
        }

        const response = await auth.fetch(url, {
            method: 'POST'
        });

        if (response.ok) {
            // Refresh the social feed
            await refreshSocialFeed();
        } else {
            ui.showAlert('Erro ao curtir atividade', 'error');
        }
    } catch (error) {
        console.error('Error toggling activity like:', error);
        ui.showAlert('Erro ao curtir atividade: ' + error.message, 'error');
    }
}

// Open activity comments
function openActivityComments(activityId) {
    // For now, just show the execution sheets section
    // In the future, this could open a modal with comments
    if (typeof showSection === 'function') {
        showSection('executionsheets');
    }
}

// View activity details
async function viewActivityDetails(activityId, worksheetId) {
    try {
        // For now, just show the execution sheets section
        // In the future, this could show detailed activity information
        if (typeof showSection === 'function') {
            showSection('executionsheets');
        }
    } catch (error) {
        console.error('Error viewing activity details:', error);
        ui.showAlert('Erro ao visualizar detalhes da atividade', 'error');
    }
}

// View photo in gallery
function viewPhotoInGallery(photoUrl, description) {
    // Use the photo URL directly since it's now a direct GCS URL
    if (typeof viewPhotoModal === 'function') {
        viewPhotoModal(photoUrl, description);
    } else {
        // Fallback: open in new tab
        window.open(photoUrl, '_blank');
    }
}

// Refresh functions
function refreshActivities() {
    if (currentUser) {
        loadRecentActivities();
    }
}

function refreshActiveProjects() {
    if (currentUser) {
        loadActiveProjects();
    }
}

async function refreshSocialFeed() {
    if (currentUser) {
        await loadSocialFeed();
    }
}

// Wrapper function for HTML onclick handlers
async function handleRefreshSocialFeed() {
    try {
        await refreshSocialFeed();
    } catch (error) {
        console.error('Error refreshing social feed:', error);
        ui.showAlert('Erro ao atualizar feed social', 'error');
    }
}

// Load profile data - FIXED VERSION
async function loadProfileData() {
    try {
        if (!currentUser) {
            currentUser = await auth.getCurrentUser();
        }

        if (!currentUser) {
            ui.showAlert('Erro ao carregar dados do perfil', 'error');
            return;
        }

        // Use the profile handler from user-handlers.js if available
        if (typeof handleProfile === 'function') {
            await handleProfile();
        } else {
            // Fallback profile loading
            console.log('Loading profile data for:', currentUser.username);
            // Basic profile loading implementation
        }

    } catch (error) {
        console.error('Error loading profile data:', error);
        ui.showAlert('Erro ao carregar perfil: ' + error.message, 'error');
    }
}

// Setup user management - FIXED VERSION
function setupUserManagement() {
    console.log('Setting up user management...');

    // Setup refresh button
    const refreshBtn = document.getElementById('refreshUsersBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshUsersList();
        });
    }

    // Setup filters
    setupUserFilters();

    // Load initial user list
    refreshUsersList();
}

// Setup user filters
function setupUserFilters() {
    const searchInput = document.getElementById('userSearch');
    const roleFilter = document.getElementById('roleFilter');
    const stateFilter = document.getElementById('stateFilter');

    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterUsers, 300));
    }

    if (roleFilter) {
        roleFilter.addEventListener('change', filterUsers);
    }

    if (stateFilter) {
        stateFilter.addEventListener('change', filterUsers);
    }
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Filter users
function filterUsers() {
    const searchTerm = document.getElementById('userSearch')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('roleFilter')?.value || '';
    const stateFilter = document.getElementById('stateFilter')?.value || '';

    const rows = document.querySelectorAll('#usersTable tbody tr');

    rows.forEach(row => {
        const userName = row.querySelector('.user-name')?.textContent.toLowerCase() || '';
        const userEmail = row.querySelector('.user-email')?.textContent.toLowerCase() || '';
        const userRole = row.querySelector('.badge.role')?.textContent || '';
        const userState = row.querySelector('.badge.state')?.textContent || '';

        const matchesSearch = userName.includes(searchTerm) || userEmail.includes(searchTerm);
        const matchesRole = !roleFilter || userRole.includes(roleFilter);
        const matchesState = !stateFilter || userState.includes(stateFilter);

        row.style.display = (matchesSearch && matchesRole && matchesState) ? '' : 'none';
    });
}

// Open user detail modal
function openUserDetailModal(username) {
    console.log('Opening user detail modal for:', username);
    // Implementation for user detail modal
    ui.showAlert(`Detalhes do usuário ${username} - Funcionalidade a ser implementada`, 'info');
}

// Edit user
function editUser(username) {
    console.log('Editing user:', username);
    // Implementation for user editing
    ui.showAlert(`Editar usuário ${username} - Funcionalidade a ser implementada`, 'info');
}

// Confirm user action
function confirmUserAction(action, username) {
    const actionNames = {
        'suspend': 'suspender',
        'activate': 'ativar',
        'remove': 'remover'
    };

    const actionName = actionNames[action] || action;

    if (confirm(`Tem certeza que deseja ${actionName} o usuário ${username}?`)) {
        switch (action) {
            case 'suspender':
                suspendUser(username);
                break;
            case 'ativar':
                activateUser(username);
                break;
            case 'remover':
                removeUser(username);
                break;
        }
    }
}

// Suspend user
async function suspendUser(username) {
    try {
        ui.showLoading(true, 'Suspendendo usuário...');

        const response = await auth.fetch('/rest/utils/changeattribute', {
            method: 'POST',
            body: JSON.stringify({
                username: auth.getCurrentUserFromToken().username,
                targetUsername: username,
                attributeName: 'state',
                newValue: 'SUSPENSO'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Erro ao suspender usuário');
        }

        ui.showAlert(`Usuário ${username} suspenso com sucesso`, 'success');
        refreshUsersList();

    } catch (error) {
        console.error('Error suspending user:', error);
        ui.showAlert('Erro ao suspender usuário: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Activate user
async function activateUser(username) {
    try {
        ui.showLoading(true, 'Ativando usuário...');

        const response = await auth.fetch('/rest/utils/activateaccount', {
            method: 'POST',
            body: JSON.stringify({
                username: auth.getCurrentUserFromToken().username,
                targetUsername: username,
                state: ""
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Erro ao ativar usuário');
        }

        const success = await response.json();
        if (success === true) {
            ui.showAlert(`Usuário ${username} ativado com sucesso`, 'success');
            refreshUsersList();
        } else {
            throw new Error('Resposta inesperada do servidor');
        }

    } catch (error) {
        console.error('Error activating user:', error);
        ui.showAlert('Erro ao ativar usuário: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Remove user
async function removeUser(username) {
    try {
        ui.showLoading(true, 'Removendo usuário...');

        const response = await auth.fetch('/rest/utils/removeaccount', {
            method: 'POST',
            body: JSON.stringify({
                username: auth.getCurrentUserFromToken().username,
                targetUsername: username
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Erro ao remover usuário');
        }

        const success = await response.json();
        if (success === true) {
            ui.showAlert(`Usuário ${username} removido com sucesso`, 'success');
            refreshUsersList();
        } else {
            throw new Error('Resposta inesperada do servidor');
        }

    } catch (error) {
        console.error('Error removing user:', error);
        ui.showAlert('Erro ao remover usuário: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Social Features Implementation

// Toggle like for execution sheet
async function toggleExecutionSheetLike(executionSheetId) {
    try {
        const response = await auth.fetch(`/rest/executionsheet/${executionSheetId}/like`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Falha ao processar curtida');
        }

        const result = await response.json();
        ui.showAlert(result.message || (result.liked ? 'Curtida adicionada!' : 'Curtida removida!'),
            result.liked ? 'success' : 'info');

        // Refresh the execution sheets list to update like counts
        refreshExecutionSheetsList();

        // Refresh the modal view if open
        const modal = document.getElementById('executionSheetDetailModal');
        if (modal && modal.style.display !== 'none') {
            viewExecutionSheetDetails(executionSheetId);
        }

        // Also refresh social feed
        loadSocialFeed();

    } catch (error) {
        console.error('Error toggling like:', error);
        ui.showAlert('Erro ao processar curtida: ' + error.message, 'error');
    }
}

// View execution sheet details with social features
async function viewExecutionSheetDetails(executionSheetId) {
    try {
        ui.showLoading(true, 'Carregando detalhes da folha de execução...');

        console.log(`Loading details for execution sheet: ${executionSheetId}`);

        // First, try to get social data from the current execution sheets list
        let socialData = { totalLikes: 0, userLiked: false, comments: [] };
        const currentExecutionSheet = currentExecutionSheets?.find(es => es.id === executionSheetId);

        if (currentExecutionSheet) {
            console.log('Found execution sheet in current list:', currentExecutionSheet);
            // Use the social data from the list - this already contains likes, comments count, photos count, etc.
            socialData = {
                totalLikes: currentExecutionSheet.likes || 0,
                userLiked: currentExecutionSheet.userLiked || false,
                comments: [], // We'll try to load comments separately, but use list data as fallback
                photosCount: currentExecutionSheet.photos || 0,
                commentsCount: currentExecutionSheet.comments || 0
            };
            console.log('Using social data from list:', socialData);
        }

        // Get execution sheet details
        const detailsResponse = await auth.fetch(`/rest/executionsheet/status/${executionSheetId}`);
        if (!detailsResponse.ok) {
            throw new Error('Falha ao carregar detalhes da folha de execução');
        }

        const details = await detailsResponse.json();
        console.log('Execution sheet details:', details);

        // Try to load social data (comments, likes, etc.) - but don't fail if it doesn't work
        try {
            console.log(`Loading social data for execution sheet: ${executionSheetId}`);
            const socialResponse = await auth.fetch(`/rest/executionsheet/${executionSheetId}/social`);
            console.log('Social response status:', socialResponse.status);
            if (socialResponse.ok) {
                const fullSocialData = await socialResponse.json();
                console.log('Full social data loaded:', fullSocialData);

                // Merge with existing social data
                socialData = {
                    totalLikes: fullSocialData.totalLikes !== undefined ? fullSocialData.totalLikes : socialData.totalLikes,
                    userLiked: fullSocialData.userLiked !== undefined ? fullSocialData.userLiked : socialData.userLiked,
                    comments: Array.isArray(fullSocialData.comments) ? fullSocialData.comments : [],
                    photosCount: fullSocialData.photosCount !== undefined ? fullSocialData.photosCount : socialData.photosCount,
                    commentsCount: fullSocialData.commentsCount !== undefined ? fullSocialData.commentsCount : socialData.commentsCount
                };
            } else {
                const errorText = await socialResponse.text();
                console.warn(`Failed to load social data: ${socialResponse.status} - ${errorText}`);
                console.log('Using list data as fallback for social information');
            }
        } catch (error) {
            console.warn('Failed to load social data:', error);
            console.log('Using list data as fallback for social information');
        }

        console.log('Final social data for modal:', socialData);

        // Use the dashboard.js function to display
        if (typeof showExecutionSheetModal === 'function') {
            await showExecutionSheetModal(executionSheetId, details, socialData);
        } else {
            // Fallback - just show an alert
            ui.showAlert('Função de exibição não disponível', 'warning');
        }

    } catch (error) {
        console.error('Error loading execution sheet details:', error);
        ui.showAlert('Erro ao carregar detalhes: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Show execution sheet modal
async function showExecutionSheetModal(executionSheetId, details, socialData) {
    console.log('Showing execution sheet modal with data:', { executionSheetId, details, socialData });

    // Create modal if it doesn't exist
    let modal = document.getElementById('executionSheetDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'executionSheetDetailModal';
        modal.className = 'modal execution-sheet-detail-modal';
        document.body.appendChild(modal);
    }

    // Ensure we have valid social data
    const safeSocialData = {
        totalLikes: socialData?.totalLikes || 0,
        userLiked: socialData?.userLiked || false,
        comments: Array.isArray(socialData?.comments) ? socialData.comments : [],
        commentsCount: socialData?.commentsCount || 0,
        photosCount: socialData?.photosCount || 0
    };

    console.log('Safe social data for modal:', safeSocialData);

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>
                    <i class="ri-clipboard-line"></i>
                    Folha de Execução: ${executionSheetId}
                </h3>
                <div class="modal-actions">
                    <button class="btn btn-outline-primary" onclick="shareExecutionSheet('${executionSheetId}')" title="Partilhar">
                        <i class="ri-share-line"></i>
                        Partilhar
                    </button>
                    <button class="btn btn-primary" onclick="showPostingModalForSheet('${executionSheetId}')" title="Nova Postagem">
                        <i class="ri-add-circle-line"></i>
                        Nova Postagem
                    </button>
                    <button class="close-modal" onclick="closeExecutionSheetModal()">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
            </div>
            <div class="modal-body">
                <div class="execution-sheet-details">
                    <div class="detail-section">
                        <h4>
                            <i class="ri-information-line"></i>
                            Informações Gerais
                        </h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <label>ID da Folha de Execução</label>
                                <span>${executionSheetId}</span>
                            </div>
                            <div class="detail-item">
                                <label>Código da Operação</label>
                                <span>${details?.operationCode || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Área Total (ha)</label>
                                <span>${details?.totalAreaHa || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <label>Progresso</label>
                                <span>${Math.round(details?.totalAreaPercent || 0)}%</span>
                            </div>
                            <div class="detail-item">
                                <label>Status</label>
                                <span class="status-badge ${(details?.totalAreaPercent || 0) >= 100 ? 'EXECUTADO' : 'EM_EXECUCAO'}">
                                    ${(details?.totalAreaPercent || 0) >= 100 ? 'Completo' : 'Em Progresso'}
                                </span>
                            </div>
                            <div class="detail-item">
                                <label>Data de Criação</label>
                                <span>${formatDate(details?.creationDate || new Date())}</span>
                            </div>
                            <div class="detail-item">
                                <label>Última Atividade</label>
                                <span>${formatDate(details?.lastActivityDate || new Date())}</span>
                            </div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <h4>
                            <i class="ri-heart-line"></i>
                            Interação Social
                        </h4>
                        <div class="social-interaction">
                            <div class="social-stats" id="socialStats_${executionSheetId}">
                                <div class="social-stat-item">
                                    <button class="like-button ${safeSocialData.userLiked ? 'liked' : ''}" onclick="toggleExecutionSheetLike('${executionSheetId}')">
                                        <i class="ri-heart-${safeSocialData.userLiked ? 'fill' : 'line'}"></i>
                                        <span>${safeSocialData.totalLikes} Curtida${safeSocialData.totalLikes !== 1 ? 's' : ''}</span>
                                    </button>
                                </div>
                                <div class="social-stat-item">
                                    <span class="social-stat">
                                        <i class="ri-image-line"></i>
                                        <span id="mediaCount_${executionSheetId}">0</span> Mídia
                                    </span>
                                </div>
                                <div class="social-stat-item">
                                    <span class="social-stat">
                                        <i class="ri-chat-1-line"></i>
                                        <span id="textPostsCount_${executionSheetId}">0</span> Textos
                                    </span>
                                </div>
                                <div class="social-stat-item">
                                    <span class="social-stat">
                                        <i class="ri-time-line"></i>
                                        <span id="activitiesCount_${executionSheetId}">0</span> Atividades
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <h4>
                            <i class="ri-time-line"></i>
                            Timeline da Execução
                        </h4>
                        <div class="timeline-section">
                            <div class="timeline-content" id="timelineContent_${executionSheetId}">
                                <div style="text-align: center; padding: 20px; color: #666;">
                                    <i class="ri-loader-4-line" style="font-size: 2rem; animation: spin 1s linear infinite;"></i>
                                    <p>Carregando timeline...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Show modal
    modal.style.display = 'flex';

    // Add CSS for loading animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // Load social feed and update statistics
    console.log(`Loading social feed for execution sheet: ${executionSheetId}`);
    await loadExecutionSheetTimelineAndStats(executionSheetId);

    // Also try to reload social data to ensure we have the latest
    setTimeout(async () => {
        try {
            console.log(`Reloading social data for execution sheet: ${executionSheetId}`);
            const socialResponse = await auth.fetch(`/rest/executionsheet/${executionSheetId}/social`);
            if (socialResponse.ok) {
                const freshSocialData = await socialResponse.json();
                console.log('Fresh social data loaded:', freshSocialData);

                // Update like count if available
                if (freshSocialData.totalLikes !== undefined) {
                    const likeButton = modal.querySelector('.like-button span');
                    if (likeButton) {
                        likeButton.textContent = `${freshSocialData.totalLikes} Curtida${freshSocialData.totalLikes !== 1 ? 's' : ''}`;
                    }
                }
            } else {
                console.warn(`Failed to reload social data: ${socialResponse.status}`);
            }
        } catch (error) {
            console.warn('Failed to reload social data:', error);
        }
    }, 1000);
}



// Close execution sheet modal
function closeExecutionSheetModal() {
    const modal = document.getElementById('executionSheetDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Upload media (photos/videos) to execution sheet with description
function uploadExecutionSheetPhoto(executionSheetId) {
    // Create modal for media upload with description
    const modal = document.createElement('div');
    modal.className = 'media-upload-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Adicionar Fotos e Vídeos</h3>
                <button class="close-modal" onclick="this.closest('.media-upload-modal').remove()">
                    <i class="ri-close-line"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="upload-area" id="uploadArea">
                    <div class="upload-placeholder">
                        <i class="ri-image-add-line"></i>
                        <p>Clique para selecionar fotos/vídeos ou arraste aqui</p>
                        <small>Suporte para múltiplos arquivos (JPG, PNG, MP4, MOV, AVI)</small>
                    </div>
                    <input type="file" id="mediaInput" accept="image/*,video/*" multiple style="display: none;">
                </div>
                <div class="upload-description">
                    <label for="mediaDescription">Descrição (opcional):</label>
                    <textarea id="mediaDescription" placeholder="Descreva o que está acontecendo na mídia..."></textarea>
                </div>
                <div class="selected-files" id="selectedFiles" style="display: none;">
                    <h4>Arquivos selecionados:</h4>
                    <div class="files-preview" id="filesPreview"></div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.media-upload-modal').remove()">
                    Cancelar
                </button>
                <button class="btn btn-primary" id="uploadMediaBtn" disabled onclick="processMediaUpload('${executionSheetId}')">
                    <i class="ri-upload-line"></i>
                    Enviar Arquivos
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // Setup file input handlers
    const uploadArea = document.getElementById('uploadArea');
    const mediaInput = document.getElementById('mediaInput');
    const uploadBtn = document.getElementById('uploadMediaBtn');
    const selectedFiles = document.getElementById('selectedFiles');
    const filesPreview = document.getElementById('filesPreview');

    uploadArea.onclick = () => mediaInput.click();

    mediaInput.onchange = (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            uploadBtn.disabled = false;
            selectedFiles.style.display = 'block';

            filesPreview.innerHTML = Array.from(files).map((file, index) => {
                const isVideo = file.type.startsWith('video/');
                const icon = isVideo ? 'ri-video-line' : 'ri-image-line';
                const type = isVideo ? 'Vídeo' : 'Foto';

                return `
                    <div class="file-preview">
                        <i class="${icon}"></i>
                        <div class="file-info">
                            <span>${file.name}</span>
                            <small>${type} - ${(file.size / 1024 / 1024).toFixed(2)} MB</small>
                        </div>
                    </div>
                `;
            }).join('');
        }
    };

    // Drag and drop support
    uploadArea.ondragover = (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    };

    uploadArea.ondragleave = () => {
        uploadArea.classList.remove('drag-over');
    };

    uploadArea.ondrop = (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        photoInput.files = e.dataTransfer.files;
        photoInput.onchange({ target: { files: e.dataTransfer.files } });
    };
}

// Process media upload with description (photos and videos)
async function processMediaUpload(executionSheetId) {
    const mediaInput = document.getElementById('mediaInput');
    const mediaDescription = document.getElementById('mediaDescription');
    const files = mediaInput.files;

    if (files.length === 0) {
        ui.showAlert('Por favor, selecione pelo menos um arquivo', 'warning');
        return;
    }

    try {
        ui.showLoading(true, 'Enviando arquivo(s)...');

        const description = mediaDescription.value.trim() || 'Mídia da execução';

        for (let file of files) {
            const isVideo = file.type.startsWith('video/');
            if (isVideo) {
                await uploadSingleVideoWithDescription(executionSheetId, file, description);
            } else {
                await uploadSinglePhotoWithDescription(executionSheetId, file, description);
            }
        }

        const photoCount = Array.from(files).filter(f => !f.type.startsWith('video/')).length;
        const videoCount = Array.from(files).filter(f => f.type.startsWith('video/')).length;

        let message = '';
        if (photoCount > 0 && videoCount > 0) {
            message = `${photoCount} foto(s) e ${videoCount} vídeo(s) enviado(s) com sucesso!`;
        } else if (photoCount > 0) {
            message = `${photoCount} foto(s) enviada(s) com sucesso!`;
        } else if (videoCount > 0) {
            message = `${videoCount} vídeo(s) enviado(s) com sucesso!`;
        }

        ui.showAlert(message, 'success');

        // Close modal
        document.querySelector('.media-upload-modal')?.remove();

        // Refresh the execution sheets list to update media counts
        refreshExecutionSheetsList();

        // Refresh the modal view if open
        const modal = document.getElementById('executionSheetDetailModal');
        if (modal && modal.style.display !== 'none') {
            viewExecutionSheetDetails(executionSheetId);
        }

        // Refresh social feed
        loadSocialFeed();

    } catch (error) {
        console.error('Error uploading media:', error);
        ui.showAlert('Erro ao enviar arquivo(s): ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Keep the old function for backward compatibility
async function processPhotoUpload(executionSheetId) {
    await processMediaUpload(executionSheetId);
}

// Upload single photo with description
async function uploadSinglePhotoWithDescription(executionSheetId, file, description) {
    console.log(`Uploading photo for execution sheet: ${executionSheetId}`, file);

    const formData = new FormData();
    formData.append('photo', file);
    formData.append('description', description);

    try {
        const response = await auth.fetch(`/rest/executionsheet/${executionSheetId}/photo`, {
            method: 'POST',
            headers: {
                // Don't set Content-Type for FormData, let browser set it with boundary
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Upload failed with status ${response.status}:`, errorText);
            throw new Error(`Failed to upload photo: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Upload result:', result);
        return result;
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// Upload single video with description
async function uploadSingleVideoWithDescription(executionSheetId, file, description) {
    console.log(`Uploading video for execution sheet: ${executionSheetId}`, file);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('description', description);

    try {
        const response = await auth.fetch(`/rest/executionsheet/${executionSheetId}/video`, {
            method: 'POST',
            headers: {
                // Don't set Content-Type for FormData, let browser set it with boundary
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Video upload failed with status ${response.status}:`, errorText);
            throw new Error(`Failed to upload video: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Video upload result:', result);
        return result;
    } catch (error) {
        console.error('Video upload error:', error);
        throw error;
    }
}

// Upload single photo
async function uploadSinglePhoto(executionSheetId, file) {
    console.log(`Uploading photo for execution sheet: ${executionSheetId}`, file);

    const formData = new FormData();
    formData.append('photo', file);

    try {
        const response = await auth.fetch(`/rest/executionsheet/${executionSheetId}/photo`, {
            method: 'POST',
            headers: {
                // Don't set Content-Type for FormData, let browser set it with boundary
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Upload failed with status ${response.status}:`, errorText);
            throw new Error(`Failed to upload photo: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Upload result:', result);
        return result;
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// Load media (photos and videos) for execution sheet
async function loadExecutionSheetMedia(executionSheetId) {
    try {
        console.log(`Loading media for execution sheet: ${executionSheetId}`);

        // Load both photos and videos
        const [photosResponse, videosResponse] = await Promise.all([
            auth.fetch(`/rest/executionsheet/${executionSheetId}/photos`),
            auth.fetch(`/rest/executionsheet/${executionSheetId}/videos`)
        ]);

        const mediaItems = [];

        // Process photos
        if (photosResponse.ok) {
            const photosResult = await photosResponse.json();
            const photos = photosResult.photos || [];
            photos.forEach(photo => {
                mediaItems.push({
                    ...photo,
                    type: 'photo',
                    mediaType: 'image'
                });
            });
        }

        // Process videos
        if (videosResponse.ok) {
            const videosResult = await videosResponse.json();
            const videos = videosResult.videos || [];
            videos.forEach(video => {
                mediaItems.push({
                    ...video,
                    type: 'video',
                    mediaType: 'video'
                });
            });
        }

        console.log(`Found ${mediaItems.length} media items for execution sheet: ${executionSheetId}`);

        // Ensure user names cache is loaded before displaying media
        if (!userNamesCacheLoaded) {
            console.log('User names cache not loaded, loading now...');
            await loadUserNamesCache();
        }

        await displayExecutionSheetMedia(executionSheetId, mediaItems);

    } catch (error) {
        console.warn('Failed to load media:', error);
        console.log('Media loading failed, will use count from list data');
        // Still call display function with empty array to handle the display properly
        await displayExecutionSheetMedia(executionSheetId, []);
    }
}

// Keep old function for backward compatibility
async function loadExecutionSheetPhotos(executionSheetId) {
    await loadExecutionSheetMedia(executionSheetId);
}

// Display media (photos and videos)
async function displayExecutionSheetMedia(executionSheetId, mediaItems) {
    const mediaGrid = document.getElementById(`photosGrid_${executionSheetId}`);
    if (!mediaGrid) {
        console.warn(`Media grid not found for execution sheet: ${executionSheetId}`);
        return;
    }

    console.log(`Displaying ${mediaItems.length} media items for execution sheet: ${executionSheetId}`, mediaItems);
    console.log('User names cache status:', { loaded: userNamesCacheLoaded, size: userNamesCache.size });

    // Ensure mediaItems is an array
    if (!Array.isArray(mediaItems)) {
        console.warn('Media items is not an array:', mediaItems);
        mediaItems = [];
    }

    if (mediaItems.length === 0) {
        // Check if we have a media count from the list data
        const mediaCount = parseInt(mediaGrid.getAttribute('data-photo-count') || '0');

        if (mediaCount > 0) {
            mediaGrid.innerHTML = `
                <div class="media-unavailable">
                    <i class="ri-image-line"></i>
                    <p>${mediaCount} arquivo${mediaCount !== 1 ? 's' : ''} disponível${mediaCount !== 1 ? 'is' : ''}</p>
                    <p>Detalhes da mídia temporariamente indisponíveis</p>
                    <button class="btn btn-outline" onclick="uploadExecutionSheetPhoto('${executionSheetId}')">
                        <i class="ri-camera-line"></i>
                        Adicionar Mídia
                    </button>
                </div>
            `;
        } else {
            mediaGrid.innerHTML = `
                <div class="no-media">
                    <i class="ri-image-line"></i>
                    <p>Nenhuma mídia adicionada</p>
                    <button class="btn btn-outline" onclick="uploadExecutionSheetPhoto('${executionSheetId}')">
                        <i class="ri-camera-line"></i>
                        Adicionar Primeira Mídia
                    </button>
                </div>
            `;
        }
        return;
    }

    // Sort media by timestamp (newest first) since backend doesn't sort them
    const sortedMedia = mediaItems.sort((a, b) => {
        const timestampA = new Date(a.uploadTimestamp || a.createdAt || 0).getTime();
        const timestampB = new Date(b.uploadTimestamp || b.createdAt || 0).getTime();
        return timestampB - timestampA; // Descending order (newest first)
    });

    // Use the cached user names instead of fetching them individually
    // The cache is loaded once when the dashboard initializes

    mediaGrid.innerHTML = sortedMedia.map(media => {
        // Ensure media has required fields
        const safeMedia = {
            id: media.id || media.photoId || media.videoId || 'unknown',
            description: media.description || media.caption || `${media.type === 'video' ? 'Vídeo' : 'Foto'} da execução`,
            uploadedBy: media.uploadedBy || media.user || 'Usuário',
            uploadTimestamp: media.uploadTimestamp || media.createdAt || Date.now(),
            likes: media.likes || 0,
            userLiked: media.userLiked || false,
            type: media.type || 'photo',
            mediaType: media.mediaType || 'image'
        };

        // Get display name from cache
        const displayName = getUserDisplayName(safeMedia.uploadedBy);

        const isVideo = safeMedia.type === 'video';
        let mediaUrl, thumbnailUrl;

        if (isVideo) {
            // Use direct GCS URLs for videos
            mediaUrl = `https://storage.googleapis.com/terra-watch-videos/${safeMedia.id}.mp4`;
            thumbnailUrl = `https://storage.googleapis.com/terra-watch-video-thumbnails/${safeMedia.id}.jpg`;
        } else {
            // Use direct GCS URLs for photos
            mediaUrl = `https://storage.googleapis.com/terra-watch-photos/${safeMedia.id}.jpg`;
            thumbnailUrl = mediaUrl;
        }

        return `
            <div class="media-item ${isVideo ? 'video-item' : 'photo-item'}">
                <div class="media-preview" onclick="${isVideo ? `viewVideoModal('${mediaUrl}', '${safeMedia.description.replace(/'/g, "\\'")}')`
                : `viewPhotoModal('${mediaUrl}', '${safeMedia.description.replace(/'/g, "\\'")}')`}">
                    ${isVideo ? `
                        <div class="video-thumbnail">
                            <img src="${thumbnailUrl}" alt="${safeMedia.description}" loading="lazy" 
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'; console.warn('Failed to load video thumbnail:', this.src);">
                            <div class="video-play-overlay">
                                <i class="ri-play-circle-fill"></i>
                            </div>
                        </div>
                    ` : `
                        <img src="${thumbnailUrl}" alt="${safeMedia.description}" loading="lazy" 
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'; console.warn('Failed to load image:', this.src);">
                    `}
                    <div class="media-overlay">
                        <div class="media-info">
                            <span class="media-uploader">${displayName}</span>
                            <span class="media-date">${formatTimeAgo(new Date(safeMedia.uploadTimestamp).getTime())}</span>
                        </div>
                        <div class="media-actions">
                            <i class="${isVideo ? 'ri-play-line' : 'ri-eye-line'}"></i>
                        </div>
                    </div>
                </div>
                
                <div class="media-details">
                    ${safeMedia.description && safeMedia.description !== `${safeMedia.type === 'video' ? 'Vídeo' : 'Foto'} da execução` ? `
                        <div class="media-description">${safeMedia.description}</div>
                    ` : ''}
                    
                    <div class="media-interactions">
                        <button class="media-like-btn ${safeMedia.userLiked ? 'liked' : ''}" 
                                onclick="${isVideo ? `toggleVideoLike('${safeMedia.id}', '${executionSheetId}')`
                : `togglePhotoLike('${safeMedia.id}', '${executionSheetId}')`}">
                            <i class="ri-heart-${safeMedia.userLiked ? 'fill' : 'line'}"></i>
                            <span>${safeMedia.likes} curtida${safeMedia.likes !== 1 ? 's' : ''}</span>
                        </button>
                        <span class="media-type-badge">
                            <i class="${isVideo ? 'ri-video-line' : 'ri-image-line'}"></i>
                            ${isVideo ? 'Vídeo' : 'Foto'}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Keep old function for backward compatibility
async function displayExecutionSheetPhotos(executionSheetId, photos) {
    await displayExecutionSheetMedia(executionSheetId, photos.map(photo => ({
        ...photo,
        type: 'photo',
        mediaType: 'image'
    })));
}

// View photo in modal
function viewPhotoModal(photoUrl, description) {
    console.log('Opening photo modal:', { photoUrl, description });

    const modal = document.createElement('div');
    modal.className = 'media-modal photo-modal';
    modal.innerHTML = `
        <div class="media-modal-content">
            <button class="media-modal-close" onclick="this.closest('.media-modal').remove()">
                <i class="ri-close-line"></i>
            </button>
            <img src="${photoUrl}" alt="${description}" onerror="console.error('Failed to load photo:', this.src)">
            ${description ? `<div class="media-description">${description}</div>` : ''}
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

// View video in modal
function viewVideoModal(videoUrl, description) {
    console.log('Opening video modal:', { videoUrl, description });

    const modal = document.createElement('div');
    modal.className = 'media-modal video-modal';
    modal.innerHTML = `
        <div class="media-modal-content">
            <button class="media-modal-close" onclick="this.closest('.media-modal').remove()">
                <i class="ri-close-line"></i>
            </button>
            <video controls preload="metadata" onerror="console.error('Failed to load video:', this.src)">
                <source src="${videoUrl}" type="video/mp4">
                <p>Seu navegador não suporta a reprodução de vídeo.</p>
            </video>
            ${description ? `<div class="media-description">${description}</div>` : ''}
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

// Share execution sheet
function shareExecutionSheet(executionSheetId) {
    if (navigator.share) {
        navigator.share({
            title: `Folha de Execução ${executionSheetId}`,
            text: 'Confira esta folha de execução no TerraWatch',
            url: `${window.location.origin}/features/dashboard?section=executionsheets&id=${executionSheetId}`
        }).catch(err => console.log('Error sharing:', err));
    } else {
        // Fallback - copy to clipboard
        const url = `${window.location.origin}/features/dashboard?section=executionsheets&id=${executionSheetId}`;
        navigator.clipboard.writeText(url).then(() => {
            ui.showAlert('Link copiado para a área de transferência!', 'success');
        }).catch(() => {
            ui.showAlert('Não foi possível copiar o link', 'error');
        });
    }
}

// Handle create execution sheet
async function handleCreateExecutionSheet() {
    try {
        // Get current user - try multiple sources
        let user = window.currentUser || currentUser;
        if (!user) {
            user = await auth.getCurrentUser();
        }
        if (!user) {
            user = auth.getCurrentUserFromToken();
        }

        if (!user) {
            ui.showAlert('Erro: Usuário não autenticado. Faça login novamente.', 'error');
            return;
        }

        // Check user permissions
        if (!roles.canCreateExecutionSheets(user.role)) {
            ui.showAlert('Você não tem permissão para criar folhas de execução', 'error');
            return;
        }

        ui.showLoading(true, 'Carregando worksheets disponíveis...');

        // Get available worksheets
        const response = await auth.fetch('/rest/executionsheet/available-worksheets');

        if (!response.ok) {
            throw new Error(`Falha ao carregar worksheets disponíveis: ${response.status}`);
        }

        const availableWorksheets = await response.json();

        if (availableWorksheets.length === 0) {
            ui.showAlert('Não há worksheets disponíveis para criar folhas de execução', 'warning');
            return;
        }

        showWorksheetsSelectionModal(availableWorksheets);

    } catch (error) {
        console.error('Error loading available worksheets:', error);
        ui.showAlert('Erro ao carregar worksheets: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Show worksheets selection modal
function showWorksheetsSelectionModal(worksheets) {
    const existingModal = document.querySelector('.worksheets-modal');
    if (existingModal) {
        existingModal.remove();
    }

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
                        <p><strong>Data Início:</strong> ${formatDate(ws.startingDate || ws.starting_date)}</p>
                        <p><strong>Data Fim:</strong> ${formatDate(ws.finishingDate || ws.finishing_date)}</p>
                        <p><strong>Fornecedor:</strong> ${ws.serviceProviderId || ws.service_provider_id || 'N/A'}</p>
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


function setupExecutionSheetManagement() {
    console.log('Setting up execution sheet management...');

    // Setup refresh button
    const refreshBtn = document.getElementById('refreshExecutionSheetsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshExecutionSheetsList();
        });
    }

    // Setup create button
    const createBtn = document.getElementById('createExecutionSheetBtn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            handleCreateExecutionSheet();
        });
    }

    // Load initial execution sheets list
    refreshExecutionSheetsList();
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

// Global variable for selected worksheet
let selectedWorksheetForExecution = null;

// Export functions to global scope for HTML onclick handlers
window.refreshWorksheetsList = refreshWorksheetsList;
window.refreshUsersList = refreshUsersList;
window.refreshExecutionSheetsList = refreshExecutionSheetsList;
window.viewWorksheetDetails = viewWorksheetDetails;
window.showWorksheetOnMap = showWorksheetOnMap;
window.createExecutionSheetFromWorksheet = createExecutionSheetFromWorksheet;
window.toggleExecutionSheetLike = toggleExecutionSheetLike;
window.viewExecutionSheetDetails = viewExecutionSheetDetails;

window.uploadExecutionSheetPhoto = uploadExecutionSheetPhoto;
window.shareExecutionSheet = shareExecutionSheet;
window.handleCreateExecutionSheet = handleCreateExecutionSheet;
window.selectWorksheetForExecution = selectWorksheetForExecution;
window.createExecutionSheetFromSelected = createExecutionSheetFromSelected;
window.closeWorksheetModal = closeWorksheetModal;
window.closeExecutionSheetModal = closeExecutionSheetModal;
window.showExecutionSheetModal = showExecutionSheetModal;
window.toggleWorksheetSidebar = toggleWorksheetPanel;
window.focusWorksheetOnMap = focusWorksheetOnMap;
window.openUserDetailModal = openUserDetailModal;
window.editUser = editUser;
window.confirmUserAction = confirmUserAction;
window.filterUsers = filterUsers;
window.loadProfileData = loadProfileData;
window.refreshActivities = refreshActivities;
window.refreshActiveProjects = refreshActiveProjects;
window.refreshSocialFeed = refreshSocialFeed;
window.handleRefreshSocialFeed = handleRefreshSocialFeed;
window.refreshFullSocialFeed = refreshFullSocialFeed;
window.togglePhotoLike = togglePhotoLike;
window.toggleVideoLike = toggleVideoLike;
window.processPhotoUpload = processPhotoUpload;
window.processMediaUpload = processMediaUpload;
window.viewVideoModal = viewVideoModal;
window.viewPhotoModal = viewPhotoModal;
window.filterSocialFeed = filterSocialFeed;
window.handleProjectClick = handleProjectClick;
window.closePropertyInfoModal = closePropertyInfoModal;
window.closePropertyPopup = closePropertyPopup;
window.showPropertyOnMap = showPropertyOnMap;
window.highlightSpecificPropertyOnMap = highlightSpecificPropertyOnMap;
window.toggleWorksheetPanel = toggleWorksheetPanel;
window.selectPropertyFromList = selectPropertyFromList;
window.navigateToPreviousProperty = navigateToPreviousProperty;
window.navigateToNextProperty = navigateToNextProperty;
window.closePropertyListPanel = closePropertyListPanel;

// Test function for debugging polygon clicks
window.testPropertyPopup = function () {
    console.log('Testing property popup...');
    const testProperty = {
        rural_property_id: 'TEST001',
        aigp: 'TEST_AIGP',
        UI_id: 'TEST_UI',
        geometry: '{"type":"Polygon","coordinates":[[[-9.1393,38.7223],[-9.1393,38.7224],[-9.1394,38.7224],[-9.1394,38.7223],[-9.1393,38.7223]]]}'
    };
    const testWorksheet = { id: 999, ruralProperties: [testProperty] };
    showPropertyInfo(testProperty, testWorksheet, null, '#ff0000');
};

// Add new functions for worksheet management
async function confirmDeleteWorksheet(worksheetId) {
    event.stopPropagation(); // Prevent card click

    if (!confirm(`Tem certeza que deseja excluir a Worksheet #${worksheetId}? Esta ação não pode ser desfeita.`)) {
        return;
    }

    try {
        ui.showLoading(true, 'Excluindo worksheet...');

        const response = await auth.fetch(`/rest/worksheet/${worksheetId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`Failed to delete worksheet: ${response.status}`);
        }

        // Remove from current worksheets array
        currentWorksheets = currentWorksheets.filter(w => w.id !== worksheetId);

        // Refresh display
        displayWorksheetsList(currentWorksheets);

        ui.showAlert('Worksheet excluída com sucesso', 'success');

    } catch (error) {
        console.error('Error deleting worksheet:', error);
        ui.showAlert('Erro ao excluir worksheet: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

async function viewExecutionSheetForWorksheet(worksheetId) {
    event.stopPropagation(); // Prevent card click

    try {
        ui.showLoading(true, 'Carregando folha de execução...');

        // Switch to execution sheets section
        showSection('executionsheets');

        // Find and display the execution sheet
        if (typeof refreshExecutionSheetsList === 'function') {
            await refreshExecutionSheetsList();

            // The list will be filtered in the execution sheet handlers
            // to show only the relevant sheet for this worksheet
        }

    } catch (error) {
        console.error('Error viewing execution sheet:', error);
        ui.showAlert('Erro ao carregar folha de execução', 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Export new functions
window.confirmDeleteWorksheet = confirmDeleteWorksheet;
window.viewExecutionSheetForWorksheet = viewExecutionSheetForWorksheet;
window.testExecutionSheetCreation = testExecutionSheetCreation;
window.closePropertyInfoModal = closePropertyInfoModal;

// Test execution sheet creation endpoint
async function testExecutionSheetCreation(worksheetId) {
    try {
        console.log(`Testing execution sheet creation for worksheet ${worksheetId}...`);

        // First, test the data
        const testResponse = await auth.fetch(`/rest/executionsheet/test/${worksheetId}`, {
            method: 'GET'
        });

        if (!testResponse.ok) {
            const errorText = await testResponse.text();
            console.error('Test endpoint failed:', errorText);
            ui.showAlert('Erro ao testar dados: ' + errorText, 'error');
            return;
        }

        const testData = await testResponse.json();
        console.log('Test data:', testData);

        if (!testData.worksheetExists) {
            ui.showAlert('Worksheet não existe no banco de dados!', 'error');
            return;
        }

        if (testData.executionSheetExists) {
            ui.showAlert('Folha de execução já existe para este worksheet!', 'warning');
            return;
        }

        if (testData.operationCount === 0) {
            ui.showAlert('Worksheet não tem operações definidas!', 'error');
            return;
        }

        if (testData.propertyCount === 0) {
            ui.showAlert('Worksheet não tem propriedades definidas!', 'error');
            return;
        }

        // If all checks pass, try to create the execution sheet
        console.log('All checks passed, creating execution sheet...');
        await createExecutionSheetFromWorksheet(worksheetId);

    } catch (error) {
        console.error('Test execution sheet creation error:', error);
        ui.showAlert('Erro no teste: ' + error.message, 'error');
    }
}

// Load user management data



// Setup worksheet list sidebar - INTEGRATED INTO MAP
function setupWorksheetListSidebar() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    // Create worksheet list panel integrated into map
    const panel = document.createElement('div');
    panel.className = 'map-worksheet-panel';
    panel.innerHTML = `
        <div class="worksheet-panel-header">
            <h3><i class="ri-file-list-3-line"></i> Worksheets</h3>
            <button class="btn-icon" onclick="toggleWorksheetPanel()" title="Fechar">
                <i class="ri-close-line"></i>
            </button>
        </div>
        <div class="worksheet-panel-content" id="worksheetPanelContent">
            <div class="loading-worksheets">
                <i class="ri-loader-4-line"></i>
                <span>Carregando worksheets...</span>
            </div>
        </div>
    `;

    mapContainer.appendChild(panel);

    // Load worksheets for panel
    loadWorksheetsForPanel();
}

// Load worksheets for panel
async function loadWorksheetsForPanel() {
    try {
        const worksheets = await loadWorksheets();
        displayWorksheetsInPanel(worksheets);
    } catch (error) {
        console.error('Error loading worksheets for panel:', error);
        const panelContent = document.getElementById('worksheetPanelContent');
        if (panelContent) {
            panelContent.innerHTML = `
                <div class="error-state">
                    <i class="ri-error-warning-line"></i>
                    <span>Erro ao carregar worksheets</span>
                </div>
            `;
        }
    }
}

// Display worksheets in panel
function displayWorksheetsInPanel(worksheets) {
    const panelContent = document.getElementById('worksheetPanelContent');
    if (!panelContent) return;

    if (worksheets.length === 0) {
        panelContent.innerHTML = `
            <div class="empty-state">
                <i class="ri-file-list-3-line"></i>
                <span>Nenhuma worksheet encontrada</span>
            </div>
        `;
        return;
    }

    panelContent.innerHTML = worksheets.map(ws => `
        <div class="worksheet-panel-item" onclick="focusWorksheetOnMap(${ws.id})">
            <div class="worksheet-item-header">
                <h4>Worksheet #${ws.id}</h4>
                <span class="worksheet-status active">Ativa</span>
            </div>
            <div class="worksheet-item-details">
                <div class="detail-row">
                    <span class="label">Data:</span>
                    <span class="value">${formatDate(ws.starting_date || ws.startingDate)} - ${formatDate(ws.finishing_date || ws.finishingDate)}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Propriedades:</span>
                    <span class="value">${(ws.ruralProperties || []).length}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Fornecedor:</span>
                    <span class="value">${ws.service_provider_id || ws.serviceProviderId || 'N/A'}</span>
                </div>
            </div>
            <div class="worksheet-item-actions">
                <button class="btn-icon" onclick="event.stopPropagation(); viewWorksheetDetails(${ws.id})" title="Ver Detalhes">
                    <i class="ri-eye-line"></i>
                </button>
                <button class="btn-icon" onclick="event.stopPropagation(); showWorksheetOnMap(${ws.id})" title="Ver no Mapa">
                    <i class="ri-map-pin-line"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Toggle worksheet panel
function toggleWorksheetPanel() {
    const panel = document.querySelector('.map-worksheet-panel');
    if (panel) {
        panel.classList.toggle('collapsed');
    }
}

// Show property information as popup - ENHANCED VERSION
function showPropertyInfo(property, worksheet, polygon, color) {
    // Close any existing popups
    if (window.currentPropertyPopup) {
        window.currentPropertyPopup.remove();
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'property-popup';

    // Get property name/identifier
    const propertyName = property.aigp || property.rural_property_id || `Propriedade ${property.UI_id || 'N/A'}`;
    const worksheetName = `Worksheet #${worksheet.id}`;

    popup.innerHTML = `
        <div class="popup-header">
            <h4><i class="ri-map-pin-line"></i> ${propertyName}</h4>
            <button class="popup-close" onclick="closePropertyPopup()">
                <i class="ri-close-line"></i>
            </button>
        </div>
        <div class="popup-content">
            <div class="popup-info">
                <div class="info-row">
                    <span class="label">Propriedade:</span>
                    <span class="value">${propertyName}</span>
                </div>
                <div class="info-row">
                    <span class="label">AIGP:</span>
                    <span class="value">${property.aigp || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">ID:</span>
                    <span class="value">${property.rural_property_id || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">UI ID:</span>
                    <span class="value">${property.UI_id || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Worksheet:</span>
                    <span class="value">${worksheetName}</span>
                </div>
            </div>
            <div class="popup-actions">
                <button class="btn btn-sm btn-primary" onclick="viewWorksheetDetails(${worksheet.id})">
                    <i class="ri-file-list-3-line"></i>
                    Ver Worksheet
                </button>
            </div>
        </div>
    `;

    // Position popup on the left side of the map
    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();

    popup.style.position = 'absolute';
    popup.style.left = '20px';
    popup.style.top = '50%';
    popup.style.transform = 'translateY(-50%)';
    popup.style.zIndex = '2000';
    popup.style.backgroundColor = '#ffffff';
    popup.style.border = '2px solid #e2e8f0';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.15)';
    popup.style.padding = '0';
    popup.style.minWidth = '300px';
    popup.style.maxWidth = '350px';
    popup.style.fontFamily = 'Inter, sans-serif';
    popup.style.color = '#1f2937';

    // Add to map container
    mapContainer.appendChild(popup);

    // Store reference
    window.currentPropertyPopup = popup;

    // Auto-close after 10 seconds
    setTimeout(() => {
        if (popup.parentElement) {
            closePropertyPopup();
        }
    }, 10000);
}

// Close property popup
function closePropertyPopup() {
    console.log('closePropertyPopup called');
    if (window.currentPropertyPopup) {
        window.currentPropertyPopup.remove();
        window.currentPropertyPopup = null;
    }

    // Reset polygon highlighting
    if (window.currentSelectedPolygon) {
        window.currentSelectedPolygon.setOptions({
            fillOpacity: 0.3,
            strokeWeight: 3,
            zIndex: 1
        });
        window.currentSelectedPolygon = null;
    }
}

// Focus worksheet on map - ENHANCED VERSION
function focusWorksheetOnMap(worksheetId) {
    // Find the worksheet
    const worksheet = currentWorksheets?.find(w => w.id === worksheetId);
    if (!worksheet) {
        ui.showAlert('Worksheet não encontrada', 'error');
        return;
    }

    // Clear any existing highlights
    if (window.currentHighlights) {
        window.currentHighlights.forEach(polygon => polygon.setMap(null));
    }
    window.currentHighlights = [];

    // Close any existing popups
    if (window.currentPropertyPopup) {
        closePropertyPopup();
    }

    // Show property list panel on the left side
    showPropertyListPanel(worksheet);
}

// Show property list panel on the left side
function showPropertyListPanel(worksheet) {
    // Remove existing property panel if any
    const existingPanel = document.querySelector('.property-list-panel');
    if (existingPanel) {
        existingPanel.remove();
    }

    // Create property list panel
    const panel = document.createElement('div');
    panel.className = 'property-list-panel';
    
    const properties = worksheet.ruralProperties || [];
    
    panel.innerHTML = `
        <div class="property-panel-header">
            <h3>
                <i class="ri-map-pin-line"></i>
                Worksheet #${worksheet.id} - Propriedades
            </h3>
            <button class="btn-icon" onclick="closePropertyListPanel()" title="Fechar">
                <i class="ri-close-line"></i>
            </button>
        </div>
        <div class="property-panel-content">
            <div class="property-panel-info">
                <div class="info-row">
                    <span class="label">Total de Propriedades:</span>
                    <span class="value">${properties.length}</span>
                </div>
                <div class="info-row">
                    <span class="label">Data:</span>
                    <span class="value">${formatDate(worksheet.starting_date || worksheet.startingDate)} - ${formatDate(worksheet.finishing_date || worksheet.finishingDate)}</span>
                </div>
            </div>
            <div class="property-list">
                ${properties.length > 0 ? properties.map((property, index) => `
                    <div class="property-list-item" onclick="selectPropertyFromList(${worksheet.id}, '${property.rural_property_id}', ${index})">
                        <div class="property-item-header">
                            <h4>${property.aigp || property.rural_property_id || `Propriedade ${property.UI_id || index + 1}`}</h4>
                            <span class="property-index">${index + 1}/${properties.length}</span>
                        </div>
                        <div class="property-item-details">
                            <div class="detail-row">
                                <span class="label">AIGP:</span>
                                <span class="value">${property.aigp || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="label">ID:</span>
                                <span class="value">${property.rural_property_id || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="label">UI ID:</span>
                                <span class="value">${property.UI_id || 'N/A'}</span>
                            </div>
                        </div>
                        <div class="property-item-actions">
                            <button class="btn-icon" onclick="event.stopPropagation(); viewWorksheetDetails(${worksheet.id})" title="Ver Worksheet">
                                <i class="ri-file-list-3-line"></i>
                            </button>
                        </div>
                    </div>
                `).join('') : `
                    <div class="empty-properties">
                        <i class="ri-map-pin-line"></i>
                        <span>Nenhuma propriedade encontrada</span>
                    </div>
                `}
            </div>
        </div>
    `;

    // Add to map container
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        mapContainer.appendChild(panel);
    }

    // Store current worksheet for navigation
    window.currentPropertyWorksheet = worksheet;
    window.currentPropertyIndex = 0;

    // Highlight the first property by default
    if (properties.length > 0) {
        setTimeout(() => {
            selectPropertyFromList(worksheet.id, properties[0].rural_property_id, 0);
        }, 100);
    }
}

// Select property from the list
function selectPropertyFromList(worksheetId, propertyId, index) {
    const worksheet = window.currentPropertyWorksheet;
    if (!worksheet) return;

    const property = worksheet.ruralProperties?.find(p => p.rural_property_id === propertyId);
    if (!property) return;

    // Update current index
    window.currentPropertyIndex = index;

    // Update active state in the list
    document.querySelectorAll('.property-list-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });

    // Highlight the property on map
    highlightSpecificPropertyOnMap(property, worksheet);

    // Show property info popup
    showPropertyInfoWithNavigation(property, worksheet, null, '#ff0000');
}

// Show property info with navigation controls
function showPropertyInfoWithNavigation(property, worksheet, polygon, color) {
    // Close any existing popups
    if (window.currentPropertyPopup) {
        window.currentPropertyPopup.remove();
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'property-popup';

    const properties = worksheet.ruralProperties || [];
    const currentIndex = window.currentPropertyIndex || 0;
    const hasNext = currentIndex < properties.length - 1;
    const hasPrev = currentIndex > 0;

    // Get property name/identifier
    const propertyName = property.aigp || property.rural_property_id || `Propriedade ${property.UI_id || 'N/A'}`;
    const worksheetName = `Worksheet #${worksheet.id}`;

    popup.innerHTML = `
        <div class="popup-header">
            <h4><i class="ri-map-pin-line"></i> ${propertyName}</h4>
            <button class="popup-close" onclick="closePropertyPopup()">
                <i class="ri-close-line"></i>
            </button>
        </div>
        <div class="popup-content">
            <div class="popup-info">
                <div class="info-row">
                    <span class="label">Propriedade:</span>
                    <span class="value">${propertyName}</span>
                </div>
                <div class="info-row">
                    <span class="label">AIGP:</span>
                    <span class="value">${property.aigp || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">ID:</span>
                    <span class="value">${property.rural_property_id || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">UI ID:</span>
                    <span class="value">${property.UI_id || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Worksheet:</span>
                    <span class="value">${worksheetName}</span>
                </div>
                <div class="info-row">
                    <span class="label">Posição:</span>
                    <span class="value">${currentIndex + 1} de ${properties.length}</span>
                </div>
            </div>
            <div class="popup-navigation">
                <button class="btn btn-sm btn-outline" onclick="navigateToPreviousProperty()" ${!hasPrev ? 'disabled' : ''}>
                    <i class="ri-arrow-left-line"></i>
                    Anterior
                </button>
                <button class="btn btn-sm btn-outline" onclick="navigateToNextProperty()" ${!hasNext ? 'disabled' : ''}>
                    Próxima
                    <i class="ri-arrow-right-line"></i>
                </button>
            </div>
            <div class="popup-actions">
                <button class="btn btn-sm btn-primary" onclick="viewWorksheetDetails(${worksheet.id})">
                    <i class="ri-file-list-3-line"></i>
                    Ver Worksheet
                </button>
            </div>
        </div>
    `;

    // Position popup on the left side of the map
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    popup.style.position = 'absolute';
    popup.style.left = '20px';
    popup.style.top = '50%';
    popup.style.transform = 'translateY(-50%)';
    popup.style.zIndex = '2000';
    popup.style.pointerEvents = 'auto';
    popup.style.backgroundColor = '#ffffff';
    popup.style.border = '2px solid #e2e8f0';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.15)';
    popup.style.padding = '0';
    popup.style.minWidth = '300px';
    popup.style.maxWidth = '350px';
    popup.style.fontFamily = 'Inter, sans-serif';
    popup.style.color = '#1f2937';

    // Add to map container
    mapContainer.appendChild(popup);

    // Store reference
    window.currentPropertyPopup = popup;

    // Auto-close after 30 seconds
    setTimeout(() => {
        if (popup.parentElement) {
            closePropertyPopup();
        }
    }, 30000);
}

// Navigate to previous property
function navigateToPreviousProperty() {
    const worksheet = window.currentPropertyWorksheet;
    if (!worksheet) return;

    const properties = worksheet.ruralProperties || [];
    const currentIndex = window.currentPropertyIndex || 0;
    
    if (currentIndex > 0) {
        const prevProperty = properties[currentIndex - 1];
        selectPropertyFromList(worksheet.id, prevProperty.rural_property_id, currentIndex - 1);
    }
}

// Navigate to next property
function navigateToNextProperty() {
    const worksheet = window.currentPropertyWorksheet;
    if (!worksheet) return;

    const properties = worksheet.ruralProperties || [];
    const currentIndex = window.currentPropertyIndex || 0;
    
    if (currentIndex < properties.length - 1) {
        const nextProperty = properties[currentIndex + 1];
        selectPropertyFromList(worksheet.id, nextProperty.rural_property_id, currentIndex + 1);
    }
}

// Close property list panel
function closePropertyListPanel() {
    const panel = document.querySelector('.property-list-panel');
    if (panel) {
        panel.remove();
    }
    
    // Clear current worksheet
    window.currentPropertyWorksheet = null;
    window.currentPropertyIndex = 0;
    
    // Close property popup
    if (window.currentPropertyPopup) {
        closePropertyPopup();
    }
}

// Test function to verify endpoints are working
async function testExecutionSheetEndpoints() {
    try {
        console.log('Testing execution sheet endpoints...');

        // Test basic endpoint
        const testResponse = await auth.fetch('/rest/executionsheet/test-endpoint');
        if (testResponse.ok) {
            const testResult = await testResponse.json();
            console.log('Test endpoint result:', testResult);
        } else {
            console.error('Test endpoint failed:', testResponse.status);
        }

        // Test social endpoint
        const socialResponse = await auth.fetch('/rest/executionsheet/execution_1/social');
        if (socialResponse.ok) {
            const socialResult = await socialResponse.json();
            console.log('Social endpoint result:', socialResult);
        } else {
            console.error('Social endpoint failed:', socialResponse.status);
        }

        // Test photos endpoint
        const photosResponse = await auth.fetch('/rest/executionsheet/execution_1/photos');
        if (photosResponse.ok) {
            const photosResult = await photosResponse.json();
            console.log('Photos endpoint result:', photosResult);
        } else {
            console.error('Photos endpoint failed:', photosResponse.status);
        }

    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Comprehensive dashboard test function
async function testDashboardFunctionality() {
    try {
        console.log('=== TESTING DASHBOARD FUNCTIONALITY ===');

        // Test 1: Authentication
        console.log('1. Testing authentication...');
        const isAuthenticated = auth.isAuthenticated();
        console.log('User authenticated:', isAuthenticated);

        if (isAuthenticated) {
            const user = await auth.getCurrentUser();
            console.log('Current user:', user?.username);
        }

        // Test 2: Statistics loading
        console.log('2. Testing statistics loading...');
        try {
            const statsResponse = await auth.fetch('/rest/statistics/dashboard');
            if (statsResponse.ok) {
                const stats = await statsResponse.json();
                console.log('Dashboard statistics:', stats);
            } else {
                console.warn('Statistics loading failed:', statsResponse.status);
            }
        } catch (error) {
            console.error('Statistics error:', error);
        }

        // Test 3: Activities loading
        console.log('3. Testing activities loading...');
        try {
            const activitiesResponse = await auth.fetch('/rest/activities/recent');
            if (activitiesResponse.ok) {
                const activities = await activitiesResponse.json();
                console.log('Activities loaded:', activities.length);
            } else {
                console.warn('Activities loading failed:', activitiesResponse.status);
            }
        } catch (error) {
            console.error('Activities error:', error);
        }

        // Test 4: Interventions loading
        console.log('4. Testing interventions loading...');
        try {
            const interventionsResponse = await auth.fetch('/rest/interventions/recent');
            if (interventionsResponse.ok) {
                const interventions = await interventionsResponse.json();
                console.log('Interventions loaded:', interventions.length);
            } else {
                console.warn('Interventions loading failed:', interventionsResponse.status);
            }
        } catch (error) {
            console.error('Interventions error:', error);
        }

        // Test 5: Worksheets loading
        console.log('5. Testing worksheets loading...');
        try {
            const worksheetsResponse = await auth.fetch('/rest/worksheet/list');
            if (worksheetsResponse.ok) {
                const worksheets = await worksheetsResponse.json();
                console.log('Worksheets loaded:', worksheets.length);
            } else {
                console.warn('Worksheets loading failed:', worksheetsResponse.status);
            }
        } catch (error) {
            console.error('Worksheets error:', error);
        }

        // Test 6: Execution sheets loading
        console.log('6. Testing execution sheets loading...');
        try {
            const executionSheetsResponse = await auth.fetch('/rest/executionsheet/list');
            if (executionSheetsResponse.ok) {
                const executionSheets = await executionSheetsResponse.json();
                console.log('Execution sheets loaded:', executionSheets.length);
            } else {
                console.warn('Execution sheets loading failed:', executionSheetsResponse.status);
            }
        } catch (error) {
            console.error('Execution sheets error:', error);
        }

        // Test 7: Map functionality
        console.log('7. Testing map functionality...');
        console.log('Google Maps available:', typeof google !== 'undefined' && !!google.maps);
        console.log('Map preview element:', !!document.getElementById('mapPreview'));
        console.log('Main map element:', !!document.getElementById('map'));

        // Test 8: Social feed
        console.log('8. Testing social feed...');
        console.log('Social feed element:', !!document.getElementById('socialFeed'));

        console.log('=== DASHBOARD TEST COMPLETE ===');

        ui.showAlert('Dashboard functionality test completed. Check console for details.', 'info');

    } catch (error) {
        console.error('Dashboard test failed:', error);
        ui.showAlert('Dashboard test failed: ' + error.message, 'error');
    }
}

// Test function to create sample social data
async function createSampleSocialData(executionSheetId) {
    try {
        console.log(`Creating sample social data for execution sheet: ${executionSheetId}`);

        // Add a like
        const likeResponse = await auth.fetch(`/rest/executionsheet/${executionSheetId}/like`, {
            method: 'POST'
        });
        console.log('Like response:', likeResponse.status);

        // Add a comment
        const commentResponse = await auth.fetch(`/rest/executionsheet/${executionSheetId}/comment`, {
            method: 'POST',
            body: JSON.stringify({
                comment: "Este é um comentário de teste criado em " + new Date().toLocaleString()
            })
        });
        console.log('Comment response:', commentResponse.status);

        ui.showAlert('Dados de teste criados com sucesso!', 'success');

        // Refresh the execution sheets list
        refreshExecutionSheetsList();

    } catch (error) {
        console.error('Error creating sample data:', error);
        ui.showAlert('Erro ao criar dados de teste: ' + error.message, 'error');
    }
}

// Export for global access
window.testExecutionSheetEndpoints = testExecutionSheetEndpoints;
window.createSampleSocialData = createSampleSocialData;
window.viewExecutionSheetDetailsFromDashboard = viewExecutionSheetDetails;
window.showExecutionSheetModalFromDashboard = showExecutionSheetModal;
window.displayExecutionSheetsListFromDashboard = displayExecutionSheetsList;
window.refreshExecutionSheetsListFromDashboard = refreshExecutionSheetsList;
window.handleCreateExecutionSheetFromDashboard = handleCreateExecutionSheet;
window.setupExecutionSheetManagementFromDashboard = setupExecutionSheetManagement;
window.loadUserNamesCache = loadUserNamesCache;
window.refreshUserNamesCache = refreshUserNamesCache;
window.getUserDisplayName = getUserDisplayName;

// Test photo serving directly
window.testPhotoServing = async function (photoId) {
    try {
        console.log(`Testing photo serving for photo ID: ${photoId}`);

        // Test thumbnail endpoint
        const thumbnailResponse = await auth.fetch(`/rest/executionsheet/photo/${photoId}/thumbnail`);
        console.log('Thumbnail response status:', thumbnailResponse.status);

        if (thumbnailResponse.ok) {
            console.log('Thumbnail served successfully');
            // Try to create an image element to test if it loads
            const blob = await thumbnailResponse.blob();
            const url = URL.createObjectURL(blob);
            console.log('Thumbnail blob URL created:', url);

            // Test the image
            const img = new Image();
            img.onload = () => {
                console.log('Thumbnail image loaded successfully:', img.width, 'x', img.height);
                URL.revokeObjectURL(url);
            };
            img.onerror = () => {
                console.error('Thumbnail image failed to load');
                URL.revokeObjectURL(url);
            };
            img.src = url;
        } else {
            const errorText = await thumbnailResponse.text();
            console.error('Thumbnail serving failed:', errorText);
        }

        // Test full photo endpoint
        const photoResponse = await auth.fetch(`/rest/executionsheet/photo/${photoId}/serve`);
        console.log('Photo response status:', photoResponse.status);

        if (photoResponse.ok) {
            console.log('Photo served successfully');
            const blob = await photoResponse.blob();
            const url = URL.createObjectURL(blob);
            console.log('Photo blob URL created:', url);

            // Test the image
            const img = new Image();
            img.onload = () => {
                console.log('Photo image loaded successfully:', img.width, 'x', img.height);
                URL.revokeObjectURL(url);
            };
            img.onerror = () => {
                console.error('Photo image failed to load');
                URL.revokeObjectURL(url);
            };
            img.src = url;
        } else {
            const errorText = await photoResponse.text();
            console.error('Photo serving failed:', errorText);
        }

    } catch (error) {
        console.error('Photo serving test failed:', error);
    }
};

// Test function to manually test photo loading
window.testPhotoLoading = async function (executionSheetId) {
    try {
        console.log(`=== TESTING PHOTO LOADING FOR: ${executionSheetId} ===`);

        // Test 1: Check if user names cache is loaded
        console.log('1. User names cache status:', {
            loaded: userNamesCacheLoaded,
            size: userNamesCache.size
        });

        // Test 2: Load photos directly
        console.log('2. Loading photos...');
        const response = await auth.fetch(`/rest/executionsheet/${executionSheetId}/photos`);
        console.log('Photos response status:', response.status);

        if (response.ok) {
            const result = await response.json();
            console.log('Photos result:', result);
            console.log(`Found ${result.photos?.length || 0} photos`);

            // Test 3: Check each photo's URLs
            if (result.photos && result.photos.length > 0) {
                console.log('3. Checking photo URLs...');
                result.photos.forEach((photo, index) => {
                    console.log(`Photo ${index + 1}:`, {
                        id: photo.id,
                        url: photo.url,
                        thumbnailUrl: photo.thumbnailUrl,
                        description: photo.description,
                        uploadedBy: photo.uploadedBy
                    });
                });
            }

            // Test 4: Display photos
            console.log('4. Displaying photos...');
            await displayExecutionSheetPhotos(executionSheetId, result.photos || []);

            ui.showAlert(`Photo test completed! Found ${result.photos?.length || 0} photos`, 'success');
        } else {
            const errorText = await response.text();
            console.error('Photos loading failed:', errorText);
            ui.showAlert('Photo loading failed: ' + errorText, 'error');
        }

    } catch (error) {
        console.error('Photo test failed:', error);
        ui.showAlert('Photo test failed: ' + error.message, 'error');
    }
};

// Test function to manually refresh user names cache
window.testUserNamesCache = async function () {
    try {
        console.log('=== TESTING USER NAMES CACHE ===');
        console.log('Current cache size:', userNamesCache.size);
        console.log('Cache loaded:', userNamesCacheLoaded);

        // Force refresh
        await refreshUserNamesCache();

        console.log('Cache refreshed. New size:', userNamesCache.size);
        console.log('Sample entries:');
        let count = 0;
        for (const [username, name] of userNamesCache.entries()) {
            if (count < 5) {
                console.log(`  ${username} -> ${name}`);
                count++;
            }
        }

        ui.showAlert(`Cache refreshed! Loaded ${userNamesCache.size} users`, 'success');

    } catch (error) {
        console.error('Cache test failed:', error);
        ui.showAlert('Cache test failed: ' + error.message, 'error');
    }
};

// Test function to verify execution sheet modal with comments and photos
window.testExecutionSheetModal = async function (executionSheetId) {
    try {
        console.log(`Testing execution sheet modal for: ${executionSheetId}`);

        // Test social data loading
        const socialResponse = await auth.fetch(`/rest/executionsheet/${executionSheetId}/social`);
        console.log('Social test response:', socialResponse.status);
        if (socialResponse.ok) {
            const socialData = await socialResponse.json();
            console.log('Social test data:', socialData);
        }

        // Test photos loading
        const photosResponse = await auth.fetch(`/rest/executionsheet/${executionSheetId}/photos`);
        console.log('Photos test response:', photosResponse.status);
        if (photosResponse.ok) {
            const photosData = await photosResponse.json();
            console.log('Photos test data:', photosData);
        }

        // Test modal display
        if (typeof viewExecutionSheetDetails === 'function') {
            await viewExecutionSheetDetails(executionSheetId);
        } else {
            console.error('viewExecutionSheetDetails function not found');
        }

    } catch (error) {
        console.error('Test failed:', error);
        ui.showAlert('Test failed: ' + error.message, 'error');
    }
};

// Enhanced test function to debug modal issues
window.debugExecutionSheetModal = async function (executionSheetId) {
    try {
        console.log(`=== DEBUGGING EXECUTION SHEET MODAL FOR: ${executionSheetId} ===`);

        // Test 1: Check if execution sheet exists in current list
        console.log('1. Checking current execution sheets list...');
        const currentES = currentExecutionSheets?.find(es => es.id === executionSheetId);
        console.log('Current execution sheet found:', currentES);

        // Test 2: Check details endpoint
        console.log('2. Testing details endpoint...');
        const detailsResponse = await auth.fetch(`/rest/executionsheet/status/${executionSheetId}`);
        console.log('Details response status:', detailsResponse.status);
        if (detailsResponse.ok) {
            const details = await detailsResponse.json();
            console.log('Details data:', details);
        }

        // Test 3: Check social endpoint
        console.log('3. Testing social endpoint...');
        const socialResponse = await auth.fetch(`/rest/executionsheet/${executionSheetId}/social`);
        console.log('Social response status:', socialResponse.status);
        if (socialResponse.ok) {
            const socialData = await socialResponse.json();
            console.log('Social data:', socialData);
        }

        // Test 4: Check photos endpoint
        console.log('4. Testing photos endpoint...');
        const photosResponse = await auth.fetch(`/rest/executionsheet/${executionSheetId}/photos`);
        console.log('Photos response status:', photosResponse.status);
        if (photosResponse.ok) {
            const photosData = await photosResponse.json();
            console.log('Photos data:', photosData);
        }

        // Test 5: Test modal creation
        console.log('5. Testing modal creation...');
        const testDetails = { operationCode: 'TEST', totalAreaHa: 10, totalAreaPercent: 50 };
        const testSocialData = {
            totalLikes: 5, userLiked: true, comments: [
                { username: 'Test User', comment: 'Test comment', timestamp: Date.now() }
            ]
        };

        if (typeof showExecutionSheetModal === 'function') {
            await showExecutionSheetModal(executionSheetId, testDetails, testSocialData);
            console.log('Modal created successfully');
        } else {
            console.error('showExecutionSheetModal function not found');
        }

        console.log('=== DEBUG COMPLETE ===');

    } catch (error) {
        console.error('Debug failed:', error);
        ui.showAlert('Debug failed: ' + error.message, 'error');
    }
};

// New debug function to test the backend debug endpoint
window.debugBackendSocial = async function (executionSheetId) {
    try {
        console.log(`=== DEBUGGING BACKEND SOCIAL ENDPOINT FOR: ${executionSheetId} ===`);

        const debugResponse = await auth.fetch(`/rest/executionsheet/debug-social/${executionSheetId}`);
        console.log('Debug response status:', debugResponse.status);

        if (debugResponse.ok) {
            const debugData = await debugResponse.json();
            console.log('Backend debug data:', debugData);

            // Show results in alert for easy reading
            let message = `Backend Debug Results:\n`;
            message += `Execution Sheet ID: ${debugData.executionSheetId}\n`;
            message += `User: ${debugData.user || 'N/A'}\n`;
            message += `Role: ${debugData.role || 'N/A'}\n`;
            message += `Execution Sheet Exists: ${debugData.executionSheetExists || 'N/A'}\n`;
            message += `Likes Count: ${debugData.likesCount || 'N/A'}\n`;
            message += `Comments Count: ${debugData.commentsCount || 'N/A'}\n`;
            message += `Photos Count: ${debugData.photosCount || 'N/A'}\n`;

            // Add photo details if available
            if (debugData.photos && debugData.photos.length > 0) {
                message += `\n\nPhoto Details:\n`;
                debugData.photos.forEach((photo, index) => {
                    message += `${index + 1}. ID: ${photo.id}\n`;
                    message += `   URL: ${photo.url}\n`;
                    message += `   Thumbnail: ${photo.thumbnailUrl}\n`;
                    message += `   Description: ${photo.description}\n`;
                    message += `   Uploaded by: ${photo.uploadedBy}\n\n`;
                });
            }

            if (debugData.authError) message += `\nAuth Error: ${debugData.authError}`;
            if (debugData.executionSheetError) message += `\nExecution Sheet Error: ${debugData.executionSheetError}`;
            if (debugData.likesError) message += `\nLikes Error: ${debugData.likesError}`;
            if (debugData.commentsError) message += `\nComments Error: ${debugData.commentsError}`;
            if (debugData.photosError) message += `\nPhotos Error: ${debugData.photosError}`;

            alert(message);
        } else {
            const errorText = await debugResponse.text();
            console.error('Debug endpoint failed:', errorText);
            alert(`Debug endpoint failed: ${debugResponse.status} - ${errorText}`);
        }

    } catch (error) {
        console.error('Backend debug failed:', error);
        alert('Backend debug failed: ' + error.message);
    }
};



// Load user names cache once
async function loadUserNamesCache() {
    if (userNamesCacheLoaded) {
        return;
    }

    // Initialize cache if not already done
    if (!userNamesCache) {
        userNamesCache = new Map();
    }

    try {
        console.log('Loading user names cache...');
        const response = await auth.fetch('/rest/list/users', {
            method: 'POST',
            body: JSON.stringify({ username: '' })
        });

        if (response.ok) {
            const users = await response.json();
            userNamesCache.clear();

            users.forEach(user => {
                if (user.username && user.name) {
                    userNamesCache.set(user.username, user.name);
                    console.log(`Cached: ${user.username} -> ${user.name}`);
                }
            });

            userNamesCacheLoaded = true;
            console.log(`User names cache loaded with ${userNamesCache.size} users`);
        } else {
            console.warn('Failed to load user names cache:', response.status);
        }
    } catch (error) {
        console.warn('Error loading user names cache:', error);
    }
}

// Get user display name from cache
function getUserDisplayName(username) {
    if (!username || username === 'Usuário') {
        return 'Usuário';
    }

    // Check if cache is available
    if (!userNamesCache) {
        console.warn('User names cache not initialized, using username as fallback');
        return username;
    }

    // Try to get from cache first
    const cachedName = userNamesCache.get(username);
    console.log(`Getting display name for ${username}: cached=${cachedName}, cacheSize=${userNamesCache.size}`);

    if (cachedName && cachedName !== 'NOT DEFINED') {
        return cachedName;
    }

    // Fallback to username if not found or if it's "NOT DEFINED"
    return username;
}

// Initialize user names cache when dashboard loads
async function initializeUserNamesCache() {
    try {
        await loadUserNamesCache();
    } catch (error) {
        console.warn('Failed to initialize user names cache:', error);
    }
}

// Refresh user names cache (useful when new users are added)
async function refreshUserNamesCache() {
    userNamesCacheLoaded = false;
    await loadUserNamesCache();
}

// Toggle photo like
async function togglePhotoLike(photoId, executionSheetId) {
    try {
        const response = await auth.fetch(`/rest/executionsheet/photo/${photoId}/like`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Falha ao processar curtida da foto');
        }

        const result = await response.json();
        ui.showAlert(result.message || (result.liked ? 'Foto curtida!' : 'Curtida removida!'),
            result.liked ? 'success' : 'info');

        // Refresh the execution sheets list to update photo counts
        refreshExecutionSheetsList();

        // Refresh the modal view if open
        const modal = document.getElementById('executionSheetDetailModal');
        if (modal && modal.style.display !== 'none') {
            viewExecutionSheetDetails(executionSheetId);
        }

        // Refresh social feed
        loadSocialFeed();

    } catch (error) {
        console.error('Error toggling photo like:', error);
        ui.showAlert('Erro ao processar curtida da foto: ' + error.message, 'error');
    }
}

// Toggle video like
async function toggleVideoLike(videoId, executionSheetId) {
    try {
        const response = await auth.fetch(`/rest/executionsheet/video/${videoId}/like`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Falha ao processar curtida do vídeo');
        }

        const result = await response.json();
        ui.showAlert(result.message || (result.liked ? 'Vídeo curtido!' : 'Curtida removida!'),
            result.liked ? 'success' : 'info');

        // Refresh the execution sheets list to update video counts
        refreshExecutionSheetsList();

        // Refresh the modal view if open
        const modal = document.getElementById('executionSheetDetailModal');
        if (modal && modal.style.display !== 'none') {
            viewExecutionSheetDetails(executionSheetId);
        }

        // Refresh social feed
        loadSocialFeed();

    } catch (error) {
        console.error('Error toggling video like:', error);
        ui.showAlert('Erro ao processar curtida do vídeo: ' + error.message, 'error');
    }
}

// Full social feed functions (using unified social system)
async function refreshFullSocialFeed() {
    try {
        console.log('Refreshing unified social feed...');
        ui.showLoading(true, 'Carregando feed social...');

        await refreshUnifiedSocialFeed();

    } catch (error) {
        console.error('Error refreshing unified social feed:', error);
        ui.showAlert('Erro ao carregar feed social: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

async function loadFullSocialFeedData() {
    const activities = [];

    try {
        // Load execution sheet activities, photos, and videos
        const [executionActivities, photoActivities, videoActivities] = await Promise.all([
            loadExecutionSheetActivities(),
            loadRecentPhotoActivities(),
            loadRecentVideoActivities()
        ]);

        // Combine all activities
        activities.push(...executionActivities, ...photoActivities, ...videoActivities);

        // Sort by timestamp (most recent first)
        activities.sort((a, b) => {
            const timestampA = new Date(a.timestamp || 0).getTime();
            const timestampB = new Date(b.timestamp || 0).getTime();
            return timestampB - timestampA;
        });

    } catch (error) {
        console.error('Error loading full social feed data:', error);
    }

    return activities;
}

function displayFullSocialFeed(activities) {
    const fullSocialFeed = document.getElementById('fullSocialFeed');
    if (!fullSocialFeed) return;

    if (activities.length === 0) {
        fullSocialFeed.innerHTML = `
            <div class="empty-social-feed">
                <i class="ri-chat-3-line" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
                <h3>Nenhuma atividade social ainda</h3>
                <p>Seja o primeiro a interagir! Adicione fotos, curta projetos ou comente em execuções.</p>
            </div>
        `;
        return;
    }

    fullSocialFeed.innerHTML = activities.map(activity => {
        const username = activity.fromUser || activity.username || 'Usuário';
        const displayName = getUserDisplayName(username);
        const avatarColor = '#C2F6E1';
        const timeAgo = formatTimeAgo(new Date(activity.timestamp || Date.now()).getTime());

        if (activity.photoUrl || activity.videoUrl || activity.thumbnailUrl) {
            // Media activity (photo or video)
            const isVideo = activity.type === 'video';
            const mediaUrl = isVideo ? activity.videoUrl : activity.photoUrl;
            const mediaId = isVideo ? activity.videoId : activity.photoId;
            const mediaThumbnail = activity.thumbnailUrl || mediaUrl;

            return `
                <div class="social-post ${isVideo ? 'video-post' : 'photo-post'}" data-activity-id="${activity.id}">
                    <div class="post-header">
                        <div class="post-avatar" style="background: ${avatarColor};">
                            ${displayName.charAt(0).toUpperCase()}
                        </div>
                        <div class="post-info">
                            <div class="post-author">${displayName}</div>
                            <div class="post-meta">
                                <span class="post-time">
                                    <i class="ri-time-line"></i> ${timeAgo}
                                </span>
                                ${activity.worksheetId ? `
                                    <span class="post-worksheet" onclick="showSection('worksheets')">
                                        <i class="ri-file-list-3-line"></i> WS #${activity.worksheetId}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="post-content">
                        <p>${activity.description}</p>
                        <div class="post-media ${isVideo ? 'post-video' : 'post-photo'}" 
                             onclick="${isVideo ? `event.stopPropagation(); viewVideoModal('${mediaUrl}', '${activity.description || ''}')`
                    : `event.stopPropagation(); viewPhotoModal('${mediaUrl}', '${activity.description || ''}')`}">
                            <img src="${mediaThumbnail}" 
                                 alt="${activity.description || (isVideo ? 'Vídeo da atividade' : 'Foto da atividade')}" 
                                 onerror="this.style.display='none'; console.warn('Failed to load ${isVideo ? 'video thumbnail' : 'image'}:', this.src);">
                            <div class="media-overlay">
                                <i class="${isVideo ? 'ri-play-circle-fill' : 'ri-zoom-in-line'}"></i>
                            </div>
                            ${isVideo ? `<div class="video-indicator"><i class="ri-video-line"></i></div>` : ''}
                        </div>
                    </div>
                    
                    <div class="post-actions">
                        <button class="post-action-btn ${activity.userLiked ? 'liked' : ''}" 
                                onclick="${isVideo ? `event.stopPropagation(); toggleVideoLike('${mediaId}', '${activity.worksheetId}')`
                    : `event.stopPropagation(); togglePhotoLike('${mediaId}', '${activity.worksheetId}')`}">
                            <i class="ri-heart-${activity.userLiked ? 'fill' : 'line'}"></i>
                            <span>${activity.likes || 0} curtidas</span>
                        </button>
                        <button class="post-action-btn" onclick="event.stopPropagation(); showSection('executionsheets')">
                            <i class="ri-eye-line"></i>
                            <span>Ver Execução</span>
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Regular activity
            return `
                <div class="social-post activity-post" data-activity-id="${activity.id}">
                    <div class="post-header">
                        <div class="post-avatar" style="background: ${avatarColor};">
                            ${displayName.charAt(0).toUpperCase()}
                        </div>
                        <div class="post-info">
                            <div class="post-author">${displayName}</div>
                            <div class="post-meta">
                                <span class="post-time">
                                    <i class="ri-time-line"></i> ${timeAgo}
                                </span>
                                ${activity.worksheetId ? `
                                    <span class="post-worksheet" onclick="handleActivityClick('${activity.type}', '${activity.worksheetId}')">
                                        <i class="ri-file-list-3-line"></i> WS #${activity.worksheetId}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="post-content">
                        <p>${activity.description}</p>
                    </div>
                    
                    <div class="post-actions">
                        ${activity.type === 'execution' ? `
                            <button class="post-action-btn ${activity.userLiked ? 'liked' : ''}" 
                                    onclick="toggleActivityLike('${activity.id}', '${activity.type}')">
                                <i class="ri-heart-${activity.userLiked ? 'fill' : 'line'}"></i>
                                <span>${activity.likes || 0} curtidas</span>
                            </button>
                            <button class="post-action-btn" onclick="openActivityComments('${activity.id}')">
                                <i class="ri-chat-3-line"></i>
                                <span>${activity.comments || 0} comentários</span>
                            </button>
                        ` : ''}
                        <button class="post-action-btn" onclick="handleActivityClick('${activity.type}', '${activity.worksheetId}')">
                            <i class="ri-eye-line"></i>
                            <span>Ver Detalhes</span>
                        </button>
                    </div>
                </div>
            `;
        }
    }).join('');
}

// Filter social feed
function filterSocialFeed(filter) {
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => tab.classList.remove('active'));

    const activeTab = document.querySelector(`[data-filter="${filter}"]`);
    if (activeTab) activeTab.classList.add('active');

    const posts = document.querySelectorAll('.social-post');
    posts.forEach(post => {
        const isPhotoPost = post.classList.contains('photo-post');
        const isVideoPost = post.classList.contains('video-post');
        const isActivityPost = post.classList.contains('activity-post');
        const hasLikes = post.querySelector('.liked');

        let show = false;
        switch (filter) {
            case 'all':
                show = true;
                break;
            case 'photos':
                show = isPhotoPost || isVideoPost; // Include both photos and videos in media filter
                break;
            case 'activities':
                show = isActivityPost;
                break;
            case 'likes':
                show = hasLikes;
                break;
        }

        post.style.display = show ? 'block' : 'none';
    });
}

// Setup social feed filter tabs
function setupSocialFeedFilters() {
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const filter = tab.dataset.filter;
            filterSocialFeed(filter);
        });
    });
}

// === UNIFIED SOCIAL SYSTEM ===

// Load unified social feed (main or filtered for execution sheet)
async function loadUnifiedSocialFeed(executionSheetId = null) {
    try {
        const url = executionSheetId
            ? `/rest/executionsheet/social-feed?executionSheetId=${executionSheetId}&limit=50`
            : `/rest/executionsheet/social-feed?limit=50`;

        const response = await auth.fetch(url);
        if (response.ok) {
            const posts = await response.json();
            return posts;
        }
    } catch (error) {
        console.error('Error loading unified social feed:', error);
    }
    return [];
}

// Display unified social feed
async function displayUnifiedSocialFeed(posts, containerId, executionSheetId = null) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Social feed container not found: ${containerId}`);
        return;
    }

    if (posts.length === 0) {
        container.innerHTML = `
            <div class="empty-social-feed">
                <i class="ri-chat-3-line" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
                <h3>${executionSheetId ? 'Nenhuma atividade nesta execução' : 'Nenhuma atividade social ainda'}</h3>
                <p>${executionSheetId ? 'Seja o primeiro a adicionar mídia ou comentar!' : 'Seja o primeiro a interagir! Adicione fotos, curta projetos ou comente em execuções.'}</p>
                ${executionSheetId ? `
                    <button class="btn btn-primary" onclick="uploadExecutionSheetPhoto('${executionSheetId}')">
                        <i class="ri-camera-line"></i>
                        Adicionar Mídia
                    </button>
                    <button class="btn btn-outline" onclick="showCommentForm('${executionSheetId}')">
                        <i class="ri-chat-1-line"></i>
                        Adicionar Comentário
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }

    // Sort posts by timestamp (newest first)
    const sortedPosts = posts.sort((a, b) => {
        const timestampA = new Date(a.timestamp).getTime();
        const timestampB = new Date(b.timestamp).getTime();
        return timestampB - timestampA;
    });

    container.innerHTML = sortedPosts.map(post => createSocialPostHTML(post, executionSheetId)).join('');
}

// Create HTML for a social post
function createSocialPostHTML(post, inExecutionSheet = null) {
    const username = post.uploadedBy || 'Usuário';
    const displayName = getUserDisplayName(username);
    const avatarColor = '#C2F6E1';
    const timeAgo = formatTimeAgo(new Date(post.timestamp).getTime());
    const isVideo = post.type === 'video';
    const isMedia = post.type === 'photo' || post.type === 'video';

    return `
        <div class="social-post ${post.type}-post" data-activity-id="${post.id}" data-post-id="${post.id}">
            <div class="post-header">
                <div class="post-avatar" style="background: ${avatarColor};">
                    ${displayName.charAt(0).toUpperCase()}
                </div>
                <div class="post-info">
                    <div class="post-author">${displayName}</div>
                    <div class="post-meta">
                        <span class="post-time">
                            <i class="ri-time-line"></i> ${timeAgo}
                        </span>
                        ${!inExecutionSheet && post.executionSheetId ? `
                            <span class="post-worksheet" onclick="event.stopPropagation(); showExecutionSheetModal('${post.executionSheetId}')">
                                <i class="ri-file-list-3-line"></i> Execução #${post.executionSheetId}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
            
            <div class="post-content">
                <p>${post.description}</p>
                ${isMedia ? `
                    <div class="post-media ${isVideo ? 'post-video' : 'post-photo'}" 
                         onclick="event.stopPropagation(); ${isVideo ? `viewVideoModal('${post.videoUrl}', '${post.description || ''}')`
                : `viewPhotoModal('${post.photoUrl}', '${post.description || ''}')`}">
                        <img src="${post.thumbnailUrl || post.photoUrl}" 
                             alt="${post.description || (isVideo ? 'Vídeo da atividade' : 'Foto da atividade')}" 
                             onerror="this.style.display='none'; console.warn('Failed to load ${isVideo ? 'video thumbnail' : 'image'}:', this.src);">
                        <div class="media-overlay">
                            <i class="${isVideo ? 'ri-play-circle-fill' : 'ri-zoom-in-line'}"></i>
                        </div>
                        ${isVideo ? `<div class="video-indicator"><i class="ri-video-line"></i></div>` : ''}
                    </div>
                ` : ''}
            </div>
            
            <div class="post-actions">
                <button class="post-action-btn ${post.userLiked ? 'liked' : ''}" 
                        onclick="event.stopPropagation(); togglePostLike('${post.id}', '${post.type}')">
                    <i class="ri-heart-${post.userLiked ? 'fill' : 'line'}"></i>
                    <span>${post.likes || 0} curtidas</span>
                </button>
                <button class="post-action-btn" onclick="event.stopPropagation(); toggleComments('${post.id}')">
                    <i class="ri-chat-1-line"></i>
                    <span>${post.comments || 0} comentários</span>
                </button>
                <button class="post-action-btn" onclick="event.stopPropagation(); showCommentForm('${post.id}')">
                    <i class="ri-add-line"></i>
                    <span>Comentar</span>
                </button>
            </div>
            
            <!-- Comments Section -->
            <div class="post-comments" id="comments_${post.id}" style="display: none;">
                <div class="comments-list" id="comments_list_${post.id}">
                    <!-- Comments will be loaded here -->
                </div>
                <div class="comment-form" id="comment_form_${post.id}" style="display: none;">
                    <div class="comment-input-group">
                        <textarea id="comment_text_${post.id}" placeholder="Escreva um comentário..." rows="2"></textarea>
                        <button onclick="submitComment('${post.id}')" class="btn btn-primary btn-sm">
                            <i class="ri-send-plane-fill"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Toggle post likes (unified for all post types)
async function togglePostLike(postId, postType) {
    try {
        let endpoint;
        if (postType === 'photo') {
            const photoId = postId.replace('photo_', '');
            endpoint = `/rest/executionsheet/photo/${photoId}/like`;
        } else if (postType === 'video') {
            const videoId = postId.replace('video_', '');
            endpoint = `/rest/executionsheet/video/${videoId}/like`;
        } else if (postType === 'activity') {
            const activityPostId = postId.replace('activity_', '');
            endpoint = `/rest/executionsheet/social/activity-post/${activityPostId}/like`;
        } else {
            // Text post
            const textPostId = postId.replace('post_', '');
            endpoint = `/rest/executionsheet/social/text-post/${textPostId}/like`;
        }

        const response = await auth.fetch(endpoint, {
            method: 'POST'
        });

        if (response.ok) {
            const result = await response.json();

            // Update UI
            const postElement = document.querySelector(`[data-post-id="${postId}"]`);
            if (postElement) {
                const likeButton = postElement.querySelector('.post-action-btn');
                const heartIcon = likeButton.querySelector('i');
                const likeText = likeButton.querySelector('span');

                if (result.liked) {
                    likeButton.classList.add('liked');
                    heartIcon.className = 'ri-heart-fill';
                } else {
                    likeButton.classList.remove('liked');
                    heartIcon.className = 'ri-heart-line';
                }

                likeText.textContent = `${result.likeCount} curtidas`;
            }

            ui.showAlert(result.liked ? 'Curtiu!' : 'Descurtiu!', 'success');
        }
    } catch (error) {
        console.error('Error toggling like:', error);
        ui.showAlert('Erro ao curtir', 'error');
    }
}

// Toggle comments visibility
async function toggleComments(postId) {
    const commentsSection = document.getElementById(`comments_${postId}`);
    const commentsList = document.getElementById(`comments_list_${postId}`);

    if (commentsSection.style.display === 'none') {
        commentsSection.style.display = 'block';
        await loadPostComments(postId);
    } else {
        commentsSection.style.display = 'none';
    }
}

// Show comment form
function showCommentForm(postId) {
    const commentsSection = document.getElementById(`comments_${postId}`);
    const commentForm = document.getElementById(`comment_form_${postId}`);

    if (commentsSection) {
        commentsSection.style.display = 'block';
        commentForm.style.display = 'block';

        // Focus the textarea
        const textarea = document.getElementById(`comment_text_${postId}`);
        if (textarea) {
            textarea.focus();
        }
    }
}

// Load comments for a post
async function loadPostComments(postId) {
    try {
        const response = await auth.fetch(`/rest/executionsheet/social/comments/${postId}`);
        if (response.ok) {
            const comments = await response.json();
            displayPostComments(postId, comments);
        }
    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

// Display comments for a post
function displayPostComments(postId, comments) {
    const commentsList = document.getElementById(`comments_list_${postId}`);
    if (!commentsList) return;

    if (comments.length === 0) {
        commentsList.innerHTML = '<p class="no-comments">Nenhum comentário ainda.</p>';
        return;
    }

    // Organize comments by parent/child relationship
    const topLevelComments = comments.filter(c => !c.parentCommentId);
    const replies = comments.filter(c => c.parentCommentId);

    commentsList.innerHTML = topLevelComments.map(comment => {
        const commentReplies = replies.filter(r => r.parentCommentId === comment.id);
        return createCommentHTML(comment, commentReplies);
    }).join('');
}

// Create HTML for a comment
function createCommentHTML(comment, replies = []) {
    const displayName = getUserDisplayName(comment.author);
    const timeAgo = formatTimeAgo(new Date(comment.timestamp).getTime());
    const avatarColor = '#E3F2FD';

    return `
        <div class="comment" data-comment-id="${comment.id}">
            <div class="comment-header">
                <div class="comment-avatar" style="background: ${avatarColor};">
                    ${displayName.charAt(0).toUpperCase()}
                </div>
                <div class="comment-info">
                    <div class="comment-author">${displayName}</div>
                    <div class="comment-time">
                        <i class="ri-time-line"></i> ${timeAgo}
                    </div>
                </div>
            </div>
            <div class="comment-content">
                <p>${comment.content}</p>
            </div>
            <div class="comment-actions">
                <button class="comment-action-btn ${comment.userLiked ? 'liked' : ''}" 
                        onclick="toggleCommentLike('${comment.id}')">
                    <i class="ri-heart-${comment.userLiked ? 'fill' : 'line'}"></i>
                    <span>${comment.likes || 0}</span>
                </button>
                <button class="comment-action-btn" onclick="showReplyForm('${comment.id}')">
                    <i class="ri-reply-line"></i>
                    <span>Responder</span>
                </button>
            </div>
            
            <!-- Reply form -->
            <div class="reply-form" id="reply_form_${comment.id}" style="display: none;">
                <div class="comment-input-group">
                    <textarea id="reply_text_${comment.id}" placeholder="Responder a ${displayName}..." rows="2"></textarea>
                    <button onclick="submitReply('${comment.postId}', '${comment.id}')" class="btn btn-primary btn-sm">
                        <i class="ri-send-plane-fill"></i>
                    </button>
                </div>
            </div>
            
            <!-- Replies -->
            ${replies.length > 0 ? `
                <div class="comment-replies">
                    ${replies.map(reply => createReplyHTML(reply)).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

// Create HTML for a reply
function createReplyHTML(reply) {
    const displayName = getUserDisplayName(reply.author);
    const timeAgo = formatTimeAgo(new Date(reply.timestamp).getTime());
    const avatarColor = '#FFF3E0';

    return `
        <div class="comment-reply" data-comment-id="${reply.id}">
            <div class="comment-header">
                <div class="comment-avatar" style="background: ${avatarColor};">
                    ${displayName.charAt(0).toUpperCase()}
                </div>
                <div class="comment-info">
                    <div class="comment-author">${displayName}</div>
                    <div class="comment-time">
                        <i class="ri-time-line"></i> ${timeAgo}
                    </div>
                </div>
            </div>
            <div class="comment-content">
                <p>${reply.content}</p>
            </div>
            <div class="comment-actions">
                <button class="comment-action-btn ${reply.userLiked ? 'liked' : ''}" 
                        onclick="toggleCommentLike('${reply.id}')">
                    <i class="ri-heart-${reply.userLiked ? 'fill' : 'line'}"></i>
                    <span>${reply.likes || 0}</span>
                </button>
            </div>
        </div>
    `;
}

// Submit a comment
async function submitComment(postId) {
    const textarea = document.getElementById(`comment_text_${postId}`);
    const content = textarea.value.trim();

    if (!content) {
        ui.showAlert('Digite um comentário', 'warning');
        return;
    }

    try {
        const response = await auth.fetch('/rest/executionsheet/social/comment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                postId: postId,
                content: content
            })
        });

        if (response.ok) {
            textarea.value = '';
            await loadPostComments(postId);
            ui.showAlert('Comentário adicionado!', 'success');
        }
    } catch (error) {
        console.error('Error submitting comment:', error);
        ui.showAlert('Erro ao enviar comentário', 'error');
    }
}

// Submit a reply
async function submitReply(postId, parentCommentId) {
    const textarea = document.getElementById(`reply_text_${parentCommentId}`);
    const content = textarea.value.trim();

    if (!content) {
        ui.showAlert('Digite uma resposta', 'warning');
        return;
    }

    try {
        const response = await auth.fetch('/rest/executionsheet/social/comment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                postId: postId,
                content: content,
                parentCommentId: parentCommentId
            })
        });

        if (response.ok) {
            textarea.value = '';
            const replyForm = document.getElementById(`reply_form_${parentCommentId}`);
            replyForm.style.display = 'none';
            await loadPostComments(postId);
            ui.showAlert('Resposta adicionada!', 'success');
        }
    } catch (error) {
        console.error('Error submitting reply:', error);
        ui.showAlert('Erro ao enviar resposta', 'error');
    }
}

// Show reply form
function showReplyForm(commentId) {
    const replyForm = document.getElementById(`reply_form_${commentId}`);
    if (replyForm) {
        replyForm.style.display = replyForm.style.display === 'none' ? 'block' : 'none';

        if (replyForm.style.display === 'block') {
            const textarea = document.getElementById(`reply_text_${commentId}`);
            if (textarea) {
                textarea.focus();
            }
        }
    }
}

// Toggle comment like
async function toggleCommentLike(commentId) {
    try {
        const response = await auth.fetch(`/rest/executionsheet/social/comment/${commentId}/like`, {
            method: 'POST'
        });

        if (response.ok) {
            const result = await response.json();

            // Update UI
            const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
            if (commentElement) {
                const likeButton = commentElement.querySelector('.comment-action-btn');
                const heartIcon = likeButton.querySelector('i');
                const likeText = likeButton.querySelector('span');

                if (result.liked) {
                    likeButton.classList.add('liked');
                    heartIcon.className = 'ri-heart-fill';
                } else {
                    likeButton.classList.remove('liked');
                    heartIcon.className = 'ri-heart-line';
                }

                likeText.textContent = result.likeCount;
            }
        }
    } catch (error) {
        console.error('Error toggling comment like:', error);
        ui.showAlert('Erro ao curtir comentário', 'error');
    }
}

// Update main social feed to use unified system
async function refreshUnifiedSocialFeed() {
    try {
        const posts = await loadUnifiedSocialFeed();
        await displayUnifiedSocialFeed(posts, 'fullSocialFeed');
    } catch (error) {
        console.error('Error refreshing unified social feed:', error);
    }
}

// Update execution sheet modal to show social feed instead of media
async function showExecutionSheetSocialFeed(executionSheetId) {
    try {
        const posts = await loadUnifiedSocialFeed(executionSheetId);

        // Find the media section in the execution sheet modal
        const mediaSection = document.querySelector(`#photosGrid_${executionSheetId}`);
        if (mediaSection) {
            // Replace the media grid with social feed
            mediaSection.outerHTML = `
                <div class="execution-social-feed" id="execution_social_${executionSheetId}">
                    <div class="social-feed-header">
                        <h4>Atividade Social desta Execução</h4>
                        <div class="social-actions">
                            <button class="btn btn-primary btn-sm" onclick="uploadExecutionSheetPhoto('${executionSheetId}')">
                                <i class="ri-camera-line"></i>
                                Adicionar Mídia
                            </button>
                            <button class="btn btn-outline btn-sm" onclick="showTextPostForm('${executionSheetId}')">
                                <i class="ri-chat-1-line"></i>
                                Comentar
                            </button>
                        </div>
                    </div>
                    <div class="social-feed-content" id="execution_social_content_${executionSheetId}">
                        <!-- Social feed content will be loaded here -->
                    </div>
                </div>
            `;

            await displayUnifiedSocialFeed(posts, `execution_social_content_${executionSheetId}`, executionSheetId);
        }
    } catch (error) {
        console.error('Error showing execution sheet social feed:', error);
    }
}

// === POSTING MODAL SYSTEM ===

// Show posting modal
async function showPostingModal() {
    try {
        // Load available execution sheets
        await loadExecutionSheetsForPosting();

        // Reset form
        document.getElementById('postingForm').reset();
        document.getElementById('postContent').required = true;
        document.getElementById('postMediaDescription').required = false;
        selectPostType('text');

        // Setup progress slider
        setupProgressSlider();

        // Add event listener for execution sheet selection
        const executionSheetSelect = document.getElementById('postExecutionSheet');
        executionSheetSelect.addEventListener('change', function() {
            const activeType = document.querySelector('.post-type-btn.active').dataset.type;
            if (activeType === 'activity' && this.value) {
                loadOperationsForExecutionSheet(this.value);
            }
        });

        // Show modal
        document.getElementById('postingModal').style.display = 'flex';

        // Focus on content field
        setTimeout(() => {
            document.getElementById('postContent').focus();
        }, 100);

    } catch (error) {
        console.error('Error showing posting modal:', error);
        ui.showAlert('Erro ao abrir modal de postagem', 'error');
    }
}

// Setup progress slider functionality
function setupProgressSlider() {
    const progressSlider = document.getElementById('postActivityProgress');
    const progressValue = document.getElementById('progressValue');
    const areaValue = document.getElementById('areaValue');
    
    if (progressSlider && progressValue && areaValue) {
        // Update display when slider changes
        progressSlider.addEventListener('input', function() {
            const percentage = parseInt(this.value);
            
            progressValue.textContent = percentage + '%';
            
            // Calculate area based on selected operation
            const operationSelect = document.getElementById('postActivityOperation');
            const selectedOption = operationSelect.options[operationSelect.selectedIndex];
            
            if (selectedOption && selectedOption.dataset.areaHa) {
                const totalAreaHa = parseFloat(selectedOption.dataset.areaHa);
                const areaHa = (totalAreaHa * percentage) / 100.0;
                areaValue.textContent = `(${areaHa.toFixed(2)} ha)`;
            } else {
                areaValue.textContent = '(0 ha)';
            }
            
            // Update slider visual appearance
            updateSliderAppearance(this, 0);
        });
        
        // Initialize display
        progressValue.textContent = progressSlider.value + '%';
        areaValue.textContent = '(0 ha)';
    }
}

// Update slider visual appearance to show current progress
function updateSliderAppearance(slider, minProgress) {
    const percentage = slider.value;
    const minPercentage = slider.min || 0;
    
    // Create CSS custom properties for the slider
    const trackColor = '#e0e0e0';
    const activeColor = '#F57C00';
    const completedColor = '#4CAF50'; // Green for completed portion
    
    // Calculate the gradient based on current progress
    let gradient;
    if (minPercentage > 0) {
        // Show completed portion in green, new progress in orange
        gradient = `
            linear-gradient(to right, 
                ${completedColor} 0%, 
                ${completedColor} ${minPercentage}%, 
                ${activeColor} ${minPercentage}%, 
                ${activeColor} ${percentage}%, 
                ${trackColor} ${percentage}%, 
                ${trackColor} 100%
            )
        `;
    } else {
        // Standard gradient for no previous progress
        gradient = `
            linear-gradient(to right, 
                ${activeColor} 0%, 
                ${activeColor} ${percentage}%, 
                ${trackColor} ${percentage}%, 
                ${trackColor} 100%
            )
        `;
    }
    
    slider.style.background = gradient;
}

// Load current progress for the selected operation
async function loadCurrentOperationProgress(operationCode) {
    const executionSheetId = document.getElementById('postExecutionSheet').value;
    if (!executionSheetId || !operationCode) return;
    
    try {
        const response = await auth.fetch(`/rest/executionsheet/${executionSheetId}/operations`, {
            method: 'GET'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.operations) {
                const operation = data.operations.find(op => op.code === operationCode);
                const progressSlider = document.getElementById('postActivityProgress');
                const progressValue = document.getElementById('progressValue');
                const areaValue = document.getElementById('areaValue');
                
                if (progressSlider && progressValue && areaValue && operation) {
                    const currentProgress = operation.progressPercentage || 0;
                    
                    // Check if operation is already completed (100%)
                    if (currentProgress >= 100) {
                        ui.showAlert('Esta operação já foi concluída (100%). Não é possível adicionar mais atividades.', 'warning');
                        return;
                    }
                    
                    // Set minimum progress to current progress
                    progressSlider.min = currentProgress;
                    progressSlider.value = currentProgress;
                    progressSlider.setAttribute('data-min-progress', currentProgress);
                    
                    // Calculate area based on current progress
                    const totalAreaHa = operation.areaHa || 0;
                    const currentAreaHa = (totalAreaHa * currentProgress) / 100.0;
                    
                    // Update display
                    progressValue.textContent = `${currentProgress}%`;
                    areaValue.textContent = `(${currentAreaHa.toFixed(2)} ha)`;
                    
                    // Update slider appearance
                    updateSliderAppearance(progressSlider, currentProgress);
                    
                    // Update help text
                    const helpText = document.querySelector('.progress-help small');
                    if (helpText) {
                        helpText.textContent = `Progresso atual: ${currentProgress}%. Deslize para indicar o progresso adicional desta atividade (${currentProgress}-100%)`;
                    }
                    
                    // Add event listener for slider changes
                    progressSlider.addEventListener('input', function() {
                        const sliderValue = parseFloat(this.value);
                        const additionalProgress = sliderValue - currentProgress;
                        const totalAreaHa = operation.areaHa || 0;
                        const additionalAreaHa = (totalAreaHa * additionalProgress) / 100.0;
                        
                        progressValue.textContent = `${sliderValue}%`;
                        areaValue.textContent = `(${additionalAreaHa.toFixed(2)} ha)`;
                        updateSliderAppearance(this, currentProgress);
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error loading operation progress:', error);
    }
}

// Close posting modal
function closePostingModal() {
    document.getElementById('postingModal').style.display = 'none';
    document.getElementById('postingForm').reset();
}

// Load execution sheets for posting
async function loadExecutionSheetsForPosting() {
    try {
        const response = await auth.fetch('/rest/executionsheet/list');
        if (response.ok) {
            const executionSheets = await response.json();
            const select = document.getElementById('postExecutionSheet');

            select.innerHTML = '<option value="">Selecione uma folha de execução...</option>';

            if (executionSheets.length === 0) {
                select.innerHTML = '<option value="">Nenhuma folha de execução disponível</option>';
                return;
            }

            executionSheets.forEach(sheet => {
                const option = document.createElement('option');
                option.value = sheet.id;
                option.textContent = `${sheet.id} - ${sheet.worksheetId ? `WS #${sheet.worksheetId}` : 'Execução'}`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading execution sheets:', error);
        const select = document.getElementById('postExecutionSheet');
        select.innerHTML = '<option value="">Erro ao carregar folhas de execução</option>';
    }
}

// Load operations for a specific execution sheet
async function loadOperationsForExecutionSheet(executionSheetId) {
    try {
        const response = await auth.fetch(`/rest/executionsheet/${executionSheetId}/operations`);
        if (response.ok) {
            const data = await response.json();
            const select = document.getElementById('postActivityOperation');

            select.innerHTML = '<option value="">Selecione uma operação...</option>';

            if (data.operations && data.operations.length > 0) {
                // Filter out completed operations
                const availableOperations = data.operations.filter(operation => !operation.isCompleted);
                
                if (availableOperations.length > 0) {
                    availableOperations.forEach(operation => {
                        const option = document.createElement('option');
                        option.value = operation.code;
                        const progressText = operation.progressPercentage > 0 ? ` (${operation.progressPercentage}% concluído)` : '';
                        option.textContent = `${operation.code} - ${operation.description} (${operation.areaHa} ha)${progressText}`;
                        option.dataset.description = operation.description;
                        option.dataset.areaHa = operation.areaHa;
                        option.dataset.progress = operation.progressPercentage || 0;
                        select.appendChild(option);
                    });
                } else {
                    select.innerHTML = '<option value="">Todas as operações já foram concluídas</option>';
                }
            } else {
                select.innerHTML = '<option value="">Nenhuma operação disponível</option>';
            }
        }
    } catch (error) {
        console.error('Error loading operations:', error);
        const select = document.getElementById('postActivityOperation');
        select.innerHTML = '<option value="">Erro ao carregar operações</option>';
    }
}

// Select post type
function selectPostType(type) {
    // Update buttons
    document.querySelectorAll('.post-type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-type="${type}"]`).classList.add('active');

    // Show/hide sections
    const textSection = document.getElementById('textPostSection');
    const mediaSection = document.getElementById('mediaPostSection');
    const activitySection = document.getElementById('activityPostSection');
    const postContent = document.getElementById('postContent');
    const postMediaDescription = document.getElementById('postMediaDescription');
    const postActivityOperation = document.getElementById('postActivityOperation');

    // Hide all sections first
    textSection.style.display = 'none';
    mediaSection.style.display = 'none';
    activitySection.style.display = 'none';

    // Reset required fields
    postContent.required = false;
    postMediaDescription.required = false;
    postActivityOperation.required = false;

    if (type === 'text') {
        textSection.style.display = 'block';
        postContent.required = true;
    } else if (type === 'media') {
        mediaSection.style.display = 'block';
        postMediaDescription.required = true;
    } else if (type === 'activity') {
        activitySection.style.display = 'block';
        postActivityOperation.required = true;
        
        // Load operations for the selected execution sheet
        const executionSheetId = document.getElementById('postExecutionSheet').value;
        if (executionSheetId) {
            loadOperationsForExecutionSheet(executionSheetId);
        }
        
        // Add event listener for operation selection
        const operationSelect = document.getElementById('postActivityOperation');
        if (operationSelect) {
            operationSelect.addEventListener('change', function() {
                const progressSlider = document.getElementById('postActivityProgress');
                if (progressSlider) {
                    // Reset slider first
                    progressSlider.min = 0;
                    progressSlider.value = 0;
                    progressSlider.removeAttribute('data-min-progress');
                    updateSliderAppearance(progressSlider, 0);
                    
                    // Load current progress for the selected operation
                    loadCurrentOperationProgress(operationSelect.value);
                }
            });
        }
    }
}

// Handle posting form submission
async function handlePostSubmission(event) {
    event.preventDefault();

    const executionSheetId = document.getElementById('postExecutionSheet').value;
    const activeType = document.querySelector('.post-type-btn.active').dataset.type;

    if (!executionSheetId) {
        ui.showAlert('Por favor, selecione uma folha de execução', 'warning');
        return;
    }

    try {
        ui.showLoading(true, 'Publicando...');

        if (activeType === 'text') {
            await handleTextPostSubmission(executionSheetId);
        } else if (activeType === 'media') {
            await handleMediaPostSubmission(executionSheetId);
        } else if (activeType === 'activity') {
            await handleActivityPostSubmission(executionSheetId);
        }

        closePostingModal();
        ui.showAlert('Postagem publicada com sucesso!', 'success');

        // Refresh the social feed
        await refreshUnifiedSocialFeed();
        
        // Wait a moment for the backend to process the update
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Refresh dashboard statistics
        await refreshAreaStatistics();

    } catch (error) {
        console.error('Error submitting post:', error);
        ui.showAlert('Erro ao publicar: ' + error.message, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Handle text post submission
async function handleTextPostSubmission(executionSheetId) {
    const content = document.getElementById('postContent').value.trim();

    if (!content) {
        throw new Error('Conteúdo não pode estar vazio');
    }

    const response = await auth.fetch('/rest/executionsheet/social/text-post', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            content: content,
            executionSheetId: executionSheetId
        })
    });

    if (!response.ok) {
        throw new Error('Falha ao criar postagem de texto');
    }
}

// Handle media post submission
async function handleMediaPostSubmission(executionSheetId) {
    const mediaInput = document.getElementById('postMediaInput');
    const description = document.getElementById('postMediaDescription').value.trim();

    if (!mediaInput.files || mediaInput.files.length === 0) {
        throw new Error('Por favor, selecione pelo menos um arquivo de mídia');
    }

    if (!description) {
        throw new Error('Descrição da mídia é obrigatória');
    }

    // Upload each file
    for (let file of mediaInput.files) {
        const isVideo = file.type.startsWith('video/');

        const formData = new FormData();
        formData.append(isVideo ? 'video' : 'photo', file);
        formData.append('description', description);

        const endpoint = isVideo
            ? `/rest/executionsheet/${executionSheetId}/video`
            : `/rest/executionsheet/${executionSheetId}/photo`;

        const response = await auth.fetch(endpoint, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Falha ao enviar ${isVideo ? 'vídeo' : 'foto'}`);
        }
    }
}

// Handle activity post submission
async function handleActivityPostSubmission(executionSheetId) {
    const operationSelect = document.getElementById('postActivityOperation');
    const content = document.getElementById('postActivityContent').value.trim();
    const mediaInput = document.getElementById('postActivityMedia');
    const progressSlider = document.getElementById('postActivityProgress');

    if (!operationSelect.value) {
        throw new Error('Por favor, selecione uma operação');
    }

    const operationCode = operationSelect.value;
    const operationDescription = operationSelect.options[operationSelect.selectedIndex].dataset.description;
    const currentProgress = parseFloat(operationSelect.options[operationSelect.selectedIndex].dataset.progress) || 0;
    const sliderValue = parseFloat(progressSlider.value);
    
    // Calculate the additional progress (not the total)
    const additionalProgress = sliderValue - currentProgress;
    
    if (additionalProgress <= 0) {
        throw new Error('O progresso deve ser maior que o progresso atual da operação');
    }

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('content', content);
    formData.append('executionSheetId', executionSheetId);
    formData.append('operationCode', operationCode);
    formData.append('operationDescription', operationDescription);
    formData.append('progressPercentage', additionalProgress.toString());

    // Add media files if any
    if (mediaInput.files && mediaInput.files.length > 0) {
        for (let file of mediaInput.files) {
            formData.append('media', file);
        }
    }

    // Create activity post with media
    const response = await auth.fetch('/rest/executionsheet/social/activity-post', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error('Falha ao criar postagem de atividade');
    }
}

// Load execution sheet timeline and calculate statistics
async function loadExecutionSheetTimelineAndStats(executionSheetId) {
    try {
        const posts = await loadUnifiedSocialFeed(executionSheetId);
        
        // Calculate statistics from timeline data
        const stats = calculateTimelineStats(posts);
        
        // Update statistics in the modal
        updateTimelineStats(executionSheetId, stats);
        
        // Display timeline in the modal
        await displayTimelineInModal(executionSheetId, posts);
        
    } catch (error) {
        console.error('Error loading execution sheet timeline and stats:', error);
    }
}

// Calculate statistics from timeline posts
function calculateTimelineStats(posts) {
    const stats = {
        mediaCount: 0,
        textPostsCount: 0,
        activitiesCount: 0,
        totalLikes: 0,
        totalComments: 0
    };
    
    posts.forEach(post => {
        // Count media (photos and videos)
        if (post.type === 'photo' || post.type === 'video') {
            stats.mediaCount++;
        }
        
        // Count text posts
        if (post.type === 'text') {
            stats.textPostsCount++;
        }
        
        // Count activities (for future implementation)
        if (post.type === 'activity') {
            stats.activitiesCount++;
        }
        
        // Sum up likes and comments
        stats.totalLikes += (post.likes || 0);
        stats.totalComments += (post.comments || 0);
    });
    
    return stats;
}

// Update timeline statistics in the modal
function updateTimelineStats(executionSheetId, stats) {
    const mediaCountElement = document.getElementById(`mediaCount_${executionSheetId}`);
    const textPostsCountElement = document.getElementById(`textPostsCount_${executionSheetId}`);
    const activitiesCountElement = document.getElementById(`activitiesCount_${executionSheetId}`);
    
    if (mediaCountElement) {
        mediaCountElement.textContent = stats.mediaCount;
    }
    
    if (textPostsCountElement) {
        textPostsCountElement.textContent = stats.textPostsCount;
    }
    
    if (activitiesCountElement) {
        activitiesCountElement.textContent = stats.activitiesCount;
    }
}

// Display timeline in the execution sheet modal
async function displayTimelineInModal(executionSheetId, posts) {
    const timelineContent = document.getElementById(`timelineContent_${executionSheetId}`);
    if (!timelineContent) {
        console.warn(`Timeline content not found for execution sheet: ${executionSheetId}`);
        return;
    }
    
    if (posts.length === 0) {
        timelineContent.innerHTML = `
            <div class="empty-timeline">
                <i class="ri-time-line" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
                <h3>Nenhuma atividade nesta execução</h3>
                <p>Seja o primeiro a adicionar mídia ou comentar!</p>
                <div class="timeline-actions">
                    <button class="btn btn-primary" onclick="showPostingModalForSheet('${executionSheetId}')">
                        <i class="ri-add-circle-line"></i>
                        Nova Postagem
                    </button>
                </div>
            </div>
        `;
        return;
    }
    
    // Create timeline container
    timelineContent.innerHTML = `
        <div class="execution-timeline" id="execution_timeline_${executionSheetId}">
            <div class="timeline-header">
                <div class="timeline-actions">
                    <button class="btn btn-success btn-sm" onclick="showPostingModalForSheet('${executionSheetId}')">
                        <i class="ri-add-circle-line"></i>
                        Nova Postagem
                    </button>
                </div>
            </div>
            <div class="timeline-content" id="timeline_posts_${executionSheetId}">
                <!-- Timeline posts will be loaded here -->
            </div>
        </div>
    `;
    
    // Display posts in timeline
    await displayUnifiedSocialFeed(posts, `timeline_posts_${executionSheetId}`, executionSheetId);
}

// Update execution sheet modal to show unified posts instead of just media
async function showExecutionSheetSocialFeed(executionSheetId) {
    try {
        const posts = await loadUnifiedSocialFeed(executionSheetId);

        // Find the media section in the execution sheet modal
        const mediaSection = document.querySelector(`#photosGrid_${executionSheetId}`);
        if (mediaSection) {
            // Replace the media grid with social feed
            mediaSection.outerHTML = `
                <div class="execution-social-feed" id="execution_social_${executionSheetId}">
                    <div class="social-feed-header">
                        <h4>Timeline da Execução</h4>
                        <div class="social-actions">
                            <button class="btn btn-success btn-sm" onclick="showPostingModalForSheet('${executionSheetId}')">
                                <i class="ri-add-circle-line"></i>
                                Nova Postagem
                            </button>
                        </div>
                    </div>
                    <div class="social-feed-content" id="execution_social_content_${executionSheetId}">
                        <!-- Social feed content will be loaded here -->
                    </div>
                </div>
            `;

            await displayUnifiedSocialFeed(posts, `execution_social_content_${executionSheetId}`, executionSheetId);
        }
    } catch (error) {
        console.error('Error showing execution sheet social feed:', error);
    }
}

// Show posting modal pre-filled for specific execution sheet
async function showPostingModalForSheet(executionSheetId) {
    await showPostingModal();

    // Pre-select the execution sheet
    const select = document.getElementById('postExecutionSheet');
    select.value = executionSheetId;
}

// Initialize posting modal form handler
document.addEventListener('DOMContentLoaded', function () {
    const postingForm = document.getElementById('postingForm');
    if (postingForm) {
        postingForm.addEventListener('submit', handlePostSubmission);
    }
});

// Update unified social feed to show all types of posts correctly
async function loadUnifiedSocialFeed(executionSheetId = null) {
    try {
        const url = executionSheetId
            ? `/rest/executionsheet/social-feed?executionSheetId=${executionSheetId}&limit=50`
            : `/rest/executionsheet/social-feed?limit=50`;

        const response = await auth.fetch(url);
        if (response.ok) {
            const posts = await response.json();

            // Sort posts by timestamp (newest first)
            return posts.sort((a, b) => {
                const timestampA = new Date(a.timestamp).getTime();
                const timestampB = new Date(b.timestamp).getTime();
                return timestampB - timestampA;
            });
        }
    } catch (error) {
        console.error('Error loading unified social feed:', error);
    }
    return [];
}

// Enhanced post HTML creation with better text post support
function createSocialPostHTML(post, inExecutionSheet = null) {
    const username = post.uploadedBy || 'Usuário';
    const displayName = getUserDisplayName(username);
    const avatarColor = getAvatarColor(username);
    const timeAgo = formatTimeAgo(new Date(post.timestamp).getTime());
    const isVideo = post.type === 'video';
    const isMedia = post.type === 'photo' || post.type === 'video';
    const isTextPost = post.type === 'text';
    const isActivityPost = post.type === 'activity';

    return `
        <div class="social-post ${post.type}-post" data-activity-id="${post.id}" data-post-id="${post.id}">
            <div class="post-header">
                <div class="post-avatar" style="background: ${avatarColor};">
                    ${displayName.charAt(0).toUpperCase()}
                </div>
                <div class="post-info">
                    <div class="post-author">${displayName}</div>
                    <div class="post-meta">
                        <span class="post-time">
                            <i class="ri-time-line"></i> ${timeAgo}
                        </span>
                        ${!inExecutionSheet && post.executionSheetId ? `
                            <span class="post-worksheet" onclick="event.stopPropagation(); showExecutionSheetModal('${post.executionSheetId}')">
                                <i class="ri-file-list-3-line"></i> Execução #${post.executionSheetId}
                            </span>
                        ` : ''}
                        <span class="post-type-indicator ${post.type}">
                            <i class="${getPostTypeIcon(post.type)}"></i>
                            ${getPostTypeLabel(post.type)}
                        </span>
                    </div>
                </div>
            </div>
            
            <div class="post-content">
                ${isActivityPost ? `
                    <div class="activity-operation">
                        <i class="ri-tools-line"></i>
                        <strong>${post.operationCode}</strong> - ${post.operationDescription}
                        ${post.totalProgressPercentage ? `
                            <div class="activity-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${post.totalProgressPercentage}%"></div>
                                </div>
                                <span class="progress-text">
                                    ${post.totalProgressPercentage}% concluído
                                    ${post.areaHa ? ` (${post.areaHa.toFixed(2)} ha)` : ''}
                                </span>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                <p>${post.description}</p>
                ${isActivityPost && post.media && post.media.length > 0 ? `
                    <div class="activity-media-grid">
                        ${post.media.map(media => `
                            <div class="activity-media-item ${media.type === 'video' ? 'video' : 'photo'}" 
                                 onclick="event.stopPropagation(); ${media.type === 'video' ? 
                                     `viewVideoModal('${media.url}', '${media.description || ''}')` : 
                                     `viewPhotoModal('${media.url}', '${media.description || ''}')`}">
                                <img src="${media.thumbnailUrl || media.url}" 
                                     alt="${media.description || 'Mídia da atividade'}" 
                                     onerror="this.style.display='none';">
                                <div class="media-overlay">
                                    <i class="${media.type === 'video' ? 'ri-play-circle-fill' : 'ri-zoom-in-line'}"></i>
                                </div>
                                ${media.type === 'video' ? `<div class="video-indicator"><i class="ri-video-line"></i></div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${isMedia ? `
                    <div class="post-media ${isVideo ? 'post-video' : 'post-photo'}" 
                         onclick="event.stopPropagation(); ${isVideo ? `viewVideoModal('${post.videoUrl}', '${post.description || ''}')`
                : `viewPhotoModal('${post.photoUrl}', '${post.description || ''}')`}">
                        <img src="${post.thumbnailUrl || post.photoUrl}" 
                             alt="${post.description || (isVideo ? 'Vídeo da atividade' : 'Foto da atividade')}" 
                             onerror="this.style.display='none'; console.warn('Failed to load ${isVideo ? 'video thumbnail' : 'image'}:', this.src);">
                        <div class="media-overlay">
                            <i class="${isVideo ? 'ri-play-circle-fill' : 'ri-zoom-in-line'}"></i>
                        </div>
                        ${isVideo ? `<div class="video-indicator"><i class="ri-video-line"></i></div>` : ''}
                    </div>
                ` : ''}
            </div>
            
            <div class="post-actions">
                <button class="post-action-btn ${post.userLiked ? 'liked' : ''}" 
                        onclick="event.stopPropagation(); togglePostLike('${post.id}', '${post.type}')">
                    <i class="ri-heart-${post.userLiked ? 'fill' : 'line'}"></i>
                    <span>${post.likes || 0} curtidas</span>
                </button>
                <button class="post-action-btn" onclick="event.stopPropagation(); toggleComments('${post.id}')">
                    <i class="ri-chat-1-line"></i>
                    <span>${post.comments || 0} comentários</span>
                </button>
                <button class="post-action-btn" onclick="event.stopPropagation(); showCommentForm('${post.id}')">
                    <i class="ri-add-line"></i>
                    <span>Comentar</span>
                </button>
            </div>
            
            <!-- Comments Section -->
            <div class="post-comments" id="comments_${post.id}" style="display: none;">
                <div class="comments-list" id="comments_list_${post.id}">
                    <!-- Comments will be loaded here -->
                </div>
                <div class="comment-form" id="comment_form_${post.id}" style="display: none;">
                    <div class="comment-input-group">
                        <textarea id="comment_text_${post.id}" placeholder="Escreva um comentário..." rows="2"></textarea>
                        <button onclick="submitComment('${post.id}')" class="btn btn-primary btn-sm">
                            <i class="ri-send-plane-fill"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Helper functions for post types
function getPostTypeIcon(type) {
    switch (type) {
        case 'photo': return 'ri-image-line';
        case 'video': return 'ri-video-line';
        case 'text': return 'ri-chat-1-line';
        case 'activity': return 'ri-tools-line';
        default: return 'ri-file-text-line';
    }
}

function getPostTypeLabel(type) {
    switch (type) {
        case 'photo': return 'Foto';
        case 'video': return 'Vídeo';
        case 'text': return 'Texto';
        case 'activity': return 'Atividade';
        default: return 'Post';
    }
}

function getAvatarColor(username) {
    const colors = ['#C2F6E1', '#D5F4E1', '#E8F6ED', '#A7F0BA', '#B9F2C4', '#C8F7D2'];
    const index = username.charCodeAt(0) % colors.length;
    return colors[index];
}

// Display unified social feed on dashboard initial page
async function displayDashboardSocialFeed(posts) {
    const socialFeed = document.getElementById('socialFeed');
    if (!socialFeed) return;

    if (posts.length === 0) {
        socialFeed.innerHTML = '<p class="text-center text-light">Nenhuma atividade recente no feed</p>';
        return;
    }

    socialFeed.innerHTML = posts.map(post => {
        const username = post.uploadedBy || 'Usuário';
        const displayName = getUserDisplayName(username);
        const avatarColor = getAvatarColor(username);
        const timeAgo = formatTimeAgo(new Date(post.timestamp).getTime());
        const isVideo = post.type === 'video';
        const isMedia = post.type === 'photo' || post.type === 'video';

        return `
            <div class="activity-item ${post.type}-activity" data-post-id="${post.id}">
                <!-- Header com Avatar e Info do Usuário -->
                <div class="activity-header">
                    <div class="activity-avatar" style="background: ${avatarColor};">
                        ${displayName.charAt(0).toUpperCase()}
                    </div>
                    <div class="activity-info">
                        <div class="activity-user">${displayName}</div>
                        <div class="activity-time">
                            <i class="ri-time-line"></i> ${timeAgo}
                        </div>
                    </div>
                </div>
                
                <!-- Badge do Tipo de Atividade -->
                <div class="activity-type-badge">
                    <span class="activity-type ${post.type}">
                        <i class="${getPostTypeIcon(post.type)}"></i>
                        ${getPostTypeLabel(post.type)}
                    </span>
                </div>
                
                <!-- Conteúdo da Atividade -->
                <div class="activity-content">
                    ${post.type === 'activity' && post.progressPercentage ? `
                        <div class="activity-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${post.progressPercentage}%"></div>
                            </div>
                            <span class="progress-text">
                                ${post.progressPercentage}% concluído
                                ${post.areaHa ? ` (${post.areaHa.toFixed(2)} ha)` : ''}
                            </span>
                        </div>
                    ` : ''}
                    <p>${post.description}</p>
                    ${isMedia ? `
                        <div class="activity-media ${isVideo ? 'activity-video' : 'activity-photo'}" 
                             onclick="event.stopPropagation(); ${isVideo ? `viewVideoModal('${post.videoUrl}', '${post.description || ''}')`
                    : `viewPhotoModal('${post.photoUrl}', '${post.description || ''}')`}">
                            <img src="${post.thumbnailUrl || post.photoUrl}" 
                                 alt="${post.description || (isVideo ? 'Vídeo' : 'Foto')}" 
                                 onerror="this.style.display='none';">
                            <div class="media-overlay">
                                <i class="${isVideo ? 'ri-play-circle-fill' : 'ri-zoom-in-line'}"></i>
                            </div>
                            ${isVideo ? `<div class="video-badge"><i class="ri-video-line"></i></div>` : ''}
                        </div>
                    ` : ''}
                </div>
                
                <!-- Ações -->
                <div class="activity-actions">
                    <button class="activity-action-btn ${post.userLiked ? 'liked' : ''}" 
                            onclick="event.stopPropagation(); togglePostLike('${post.id}', '${post.type}')">
                        <i class="ri-heart-${post.userLiked ? 'fill' : 'line'}"></i>
                        <span>${post.likes || 0}</span>
                    </button>
                    <button class="activity-action-btn" 
                            onclick="event.stopPropagation(); showSection('social')">
                        <i class="ri-chat-1-line"></i>
                        <span>${post.comments || 0}</span>
                    </button>
                    ${post.executionSheetId ? `
                        <button class="activity-action-btn" 
                                onclick="event.stopPropagation(); showExecutionSheetModal('${post.executionSheetId}')">
                            <i class="ri-file-list-3-line"></i>
                            <span>Ver Execução</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Redirect inactive users to the profile page
window.addEventListener('hashchange', () => {
    if ((currentUser?.state === 'DESATIVADO' || currentUser?.state === 'SUSPENSO') && window.location.hash !== '#profile') {
        window.location.hash = '#profile';
        ui.showAlert('A sua conta está Inativa/Suspensa, por favor aguarde enquanto ativamos a sua conta.');
    }
});