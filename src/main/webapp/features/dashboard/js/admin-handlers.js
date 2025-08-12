 // Admin Functionality Handlers - Fixed and Enhanced

// List Users Handler
async function handleListUsers() {
    const container = document.getElementById('adminContent');
    if (!container) {
        console.warn('Admin content container not found');
        return;
    }
    
    container.innerHTML = '<p>A carregar utilizadores...</p>';

    try {
        const resp = await auth.fetch('/rest/list/users', {
            method: 'POST',
            body: JSON.stringify({ username: '' })
        });

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }

        const users = await resp.json();

        let html = `
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Nome</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Perfil</th>
                            <th>Estado</th>
                            <th>País de Nacionalidade</th>
                            <th>País de Residência</th>
                            <th>Morada</th>
                            <th>Código Postal</th>
                            <th>Telefone 1</th>
                            <th>Telefone 2</th>
                            <th>NIF</th>
                            <th>CC</th>
                            <th>CC Data Emissão</th>
                            <th>CC Local Emissão</th>
                            <th>CC Validade</th>
                            <th>Data Nascimento</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td>${u.username}</td>
                                <td>${u.name || '-'}</td>
                                <td>${u.email || '-'}</td>
                                <td><span class="badge role">${u.role || '-'}</span></td>
                                <td>${u.profile || '-'}</td>
                                <td><span class="badge state ${profile.getStateColor(u.state)}">${profile.getStateDisplayName(u.state) || '-'}</span></td>
                                <td>${u.pn || '-'}</td>
                                <td>${u.pr || '-'}</td>
                                <td>${u.end || '-'}</td>
                                <td>${u.endcp || '-'}</td>
                                <td>${u.phone1 || '-'}</td>
                                <td>${u.phone2 || '-'}</td>
                                <td>${u.nif || '-'}</td>
                                <td>${u.cc || '-'}</td>
                                <td>${u.ccde || '-'}</td>
                                <td>${u.ccle || '-'}</td>
                                <td>${u.ccv || '-'}</td>
                                <td>${u.dnasc || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = html;

    } catch (err) {
        console.error('Erro ao listar utilizadores:', err);
        container.innerHTML = `<p class="text-error">Falha ao carregar utilizadores: ${err.message}</p>`;
    }
}

// Update Attribute Handler
function handleUpdateAttribute() {
    const container = document.getElementById('adminContent');
    if (!container) return;
    
    container.innerHTML = `
        <div class="form-section">
            <form id="attrForm" class="form-vertical">
                <div class="form-group">
                    <label for="targetUsername">Utilizador</label>
                    <input id="targetUsername" name="targetUsername" class="form-control" placeholder="Username" required>
                </div>
                <div class="form-group">
                    <label for="attributeName">Atributo</label>
                    <select id="attributeName" name="attributeName" class="form-control">
                        <option value="user_state">Estado</option>
                        <option value="user_role">Função</option>
                        <option value="user_name">Nome</option>
                        <option value="user_email">Email</option>
                        <option value="user_phone1">Telefone 1</option>
                        <option value="user_phone2">Telefone 2</option>
                        <option value="user_end">Morada</option>
                        <option value="user_endcp">Código Postal</option>
                        <option value="user_nif">NIF</option>
                        <option value="user_cc">Cartão de Cidadão</option>
                        <option value="user_profile">Perfil</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="newValue">Novo Valor</label>
                    <input id="newValue" name="newValue" class="form-control" placeholder="Novo valor" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        <i class="ri-save-line"></i>
                        Atualizar
                    </button>
                </div>
            </form>
            <div id="updateAttrResult"></div>
        </div>
    `;

    document.getElementById('attrForm').addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target;
        const resultDiv = document.getElementById('updateAttrResult');
        resultDiv.textContent = 'Processando...';

        try {
            const resp = await auth.fetch('/rest/utils/changeattribute', {
                method: 'POST',
                body: JSON.stringify({
                    username: auth.getCurrentUserFromToken().username,
                    targetUsername: f.targetUsername.value,
                    attributeName: f.attributeName.value,
                    newValue: f.newValue.value
                })
            });

            if (!resp.ok) {
                const errorText = await resp.text();
                throw new Error(errorText || 'Erro ao atualizar atributo');
            }

            ui.showAlert('Atributo atualizado com sucesso', 'success');
            resultDiv.textContent = '';
            f.reset();
        } catch (err) {
            ui.showAlert(err.message, 'error');
            resultDiv.textContent = '';
        }
    });
}

// Activate Account Handler
function handleActivateAccount() {
    const container = document.getElementById('adminContent');
    if (!container) return;
    
    container.innerHTML = `
        <div class="form-section">
            <form id="activateForm" class="form-vertical">
                <div class="form-group">
                    <label for="activateUsername">Username a ativar</label>
                    <input id="activateUsername" name="targetUsername" class="form-control" placeholder="Username" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        <i class="ri-check-line"></i>
                        Ativar
                    </button>
                </div>
            </form>
            <div id="activateResult"></div>
        </div>
    `;

    document.getElementById('activateForm').addEventListener('submit', async e => {
        e.preventDefault();
        const username = e.target.targetUsername.value.trim();
        const resultDiv = document.getElementById('activateResult');
        resultDiv.textContent = 'Processando…';

        try {
            const resp = await auth.fetch('/rest/utils/activateaccount', {
                method: 'POST',
                body: JSON.stringify({
                    targetUsername: username,
                    state: "ATIVADO"
                })
            });

            if (!resp.ok) {
                const err = await resp.text();
                throw new Error(err || `HTTP ${resp.status}`);
            }

            const success = await resp.json();
            if (success === true) {
                ui.showAlert(`Conta "${username}" ativada com sucesso!`, 'success');
                resultDiv.textContent = '';
            } else {
                throw new Error('Resposta inesperada do servidor');
            }

        } catch (err) {
            console.error('Erro ao ativar conta:', err);
            ui.showAlert(`Falha: ${err.message}`, 'error');
            resultDiv.textContent = '';
        }
    });
}

// Deactivate Account Handler
function handleDeactivateAccount() {
    const container = document.getElementById('adminContent');
    if (!container) return;
    
    container.innerHTML = `
        <div class="form-section">
            <form id="deactivateForm" class="form-vertical">
                <div class="form-group">
                    <label for="deactivateUsername">Username a desativar</label>
                    <input id="deactivateUsername" name="targetUsername" class="form-control" placeholder="Username" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-danger">
                        <i class="ri-close-line"></i>
                        Desativar
                    </button>
                </div>
            </form>
            <div id="deactivateResult"></div>
        </div>
    `;

    document.getElementById('deactivateForm').addEventListener('submit', async e => {
        e.preventDefault();
        const username = e.target.targetUsername.value.trim();
        const resultDiv = document.getElementById('deactivateResult');
        resultDiv.textContent = 'Processando…';

        const ok = await changeAccountState(username, 'DESATIVADO');
        if (ok) {
            ui.showAlert(`Conta "${username}" desativada.`, 'success');
        }
        resultDiv.textContent = '';
    });
}

// Remove Account Handler
function handleRemoveAccount() {
    const container = document.getElementById('adminContent');
    if (!container) return;
    
    container.innerHTML = `
        <div class="form-section">
            <form id="removeForm" class="form-vertical">
                <div class="form-group">
                    <label for="removeUsername">Username a remover</label>
                    <input id="removeUsername" name="targetUsername" class="form-control" placeholder="Username" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-danger">
                        <i class="ri-delete-bin-line"></i>
                        Remover
                    </button>
                </div>
            </form>
            <div id="removeResult"></div>
        </div>
    `;

    document.getElementById('removeForm').addEventListener('submit', async e => {
        e.preventDefault();
        const username = e.target.targetUsername.value.trim();
        const resultDiv = document.getElementById('removeResult');
        
        if (!confirm(`Tem a certeza que quer remover a conta "${username}"? Esta ação não pode ser desfeita.`)) {
            return;
        }
        
        resultDiv.textContent = 'Processando…';

        try {
            const resp = await auth.fetch('/rest/utils/removeaccount', {
                method: 'POST',
                body: JSON.stringify({
                    username: auth.getCurrentUserFromToken().username,
                    targetUsername: username
                })
            });

            if (!resp.ok) {
                const errMsg = await resp.text();
                throw new Error(errMsg || `HTTP ${resp.status}`);
            }

            const success = await resp.json();
            if (success === true) {
                ui.showAlert(`Conta "${username}" removida com sucesso!`, 'success');
                resultDiv.textContent = '';
            } else {
                throw new Error('Resposta inesperada do servidor');
            }
        } catch (err) {
            console.error('Erro ao remover conta:', err);
            ui.showAlert(`Falha ao remover: ${err.message}`, 'error');
            resultDiv.textContent = '';
        }
    });
}

// Suspend Account Handler
function handleSuspendAccount() {
    const container = document.getElementById('adminContent');
    if (!container) return;
    
    container.innerHTML = `
        <div class="form-section">
            <form id="suspendForm" class="form-vertical">
                <div class="form-group">
                    <label for="suspendUsername">Username a suspender</label>
                    <input id="suspendUsername" name="targetUsername" class="form-control" placeholder="Username" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-warning">
                        <i class="ri-pause-line"></i>
                        Suspender
                    </button>
                </div>
            </form>
            <div id="suspendResult"></div>
        </div>
    `;

    document.getElementById('suspendForm').addEventListener('submit', async e => {
        e.preventDefault();
        const username = e.target.targetUsername.value.trim();
        const resultDiv = document.getElementById('suspendResult');
        resultDiv.textContent = 'Processando…';

        const ok = await changeAccountState(username, 'SUSPENSO');
        if (ok) {
            ui.showAlert(`Conta "${username}" suspendida.`, 'success');
        }
        resultDiv.textContent = '';
    });
}

// Helper function to change account state
async function changeAccountState(username, newState) {
    try {
        const resp = await auth.fetch('/rest/utils/changestate', {
            method: 'POST',
            body: JSON.stringify({
                targetUsername: username,
                attributeName: 'user_state',
                newValue: newState
            })
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(errText || `HTTP ${resp.status}`);
        }

        return true;
    } catch (err) {
        console.error('Erro ao alterar estado:', err);
        ui.showAlert(`Falha ao alterar estado: ${err.message}`, 'error');
        return false;
    }
}

// Users to Remove Handler
async function handleUsersToRemove() {
    const container = document.getElementById('adminContent');
    if (!container) return;
    
    container.innerHTML = '<p>Carregando utilizadores a remover…</p>';

    try {
        const resp = await auth.fetch('/rest/list/usersToRemove', {
            method: 'POST',
            body: JSON.stringify({ username: '' })
        });

        if (!resp.ok) {
            const text = await resp.text().catch(() => `HTTP ${resp.status}`);
            throw new Error(text);
        }

        const users = await resp.json();

        const html = `
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Nome</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Perfil</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td>${u.username}</td>
                                <td>${u.name || '-'}</td>
                                <td>${u.email || '-'}</td>
                                <td><span class="badge role">${u.role || '-'}</span></td>
                                <td>${u.profile || '-'}</td>
                                <td><span class="badge state danger">${u.state || '-'}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;

    } catch (err) {
        console.error('Erro ao listar utilizadores para remover:', err);
        container.innerHTML = `<p class="text-error">Falha: ${err.message}</p>`;
        ui.showAlert(`Erro: ${err.message}`, 'error');
    }
}

// View State Handler
function handleViewState() {
    const container = document.getElementById('adminContent');
    if (!container) return;
    
    container.innerHTML = `
        <div class="form-section">
            <form id="viewStateForm" class="form-vertical">
                <div class="form-group">
                    <label for="viewStateUsername">Username a consultar</label>
                    <input id="viewStateUsername" name="targetUsername" class="form-control" placeholder="Username" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        <i class="ri-eye-line"></i>
                        Ver Estado
                    </button>
                </div>
            </form>
            <div id="viewStateResult" class="mt-2"></div>
        </div>
    `;

    document.getElementById('viewStateForm').addEventListener('submit', async e => {
        e.preventDefault();
        const username = e.target.targetUsername.value.trim();
        const resultDiv = document.getElementById('viewStateResult');
        resultDiv.textContent = 'Consultando…';

        try {
            const resp = await auth.fetch('/rest/utils/viewState', {
                method: 'POST',
                body: JSON.stringify({ targetUsername: username })
            });

            if (!resp.ok) {
                const err = await resp.text();
                throw new Error(err || `HTTP ${resp.status}`);
            }

            const state = await resp.json();
            resultDiv.innerHTML = `
                <div class="status-display">
                    <p>Utilizador <strong>${username}</strong> está em estado:</p>
                    <span class="badge state ${profile.getStateColor(state)}">
                        ${profile.getStateDisplayName(state)}
                    </span>
                </div>
            `;
        } catch (err) {
            console.error('Erro ao ver estado:', err);
            ui.showAlert(`Falha: ${err.message}`, 'error');
            resultDiv.textContent = '';
        }
    });
}

// Enhanced User Management for Dashboard

// Setup user management functionality
function setupUserManagement() {
    console.log('Setting up user management...');
    
    // Setup search and filters
    setupUserFilters();
    
    // Load initial user list
    if (typeof refreshUsersList === 'function') {
        refreshUsersList();
    } else {
        console.warn('refreshUsersList function not available');
    }
}

// Setup user filters and search
function setupUserFilters() {
    const userSearch = document.getElementById('userSearch');
    const roleFilter = document.getElementById('roleFilter');
    const stateFilter = document.getElementById('stateFilter');

    if (userSearch) {
        userSearch.addEventListener('input', debounce(filterUsers, 300));
    }

    if (roleFilter) {
        roleFilter.addEventListener('change', filterUsers);
    }

    if (stateFilter) {
        stateFilter.addEventListener('change', filterUsers);
    }
}

// Debounce function for search
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

// Refresh users list
async function refreshUsersList() {
    try {
        console.log('Refreshing users list...');
        ui.showLoading(true, 'Carregando usuários...');
        
        const response = await auth.fetch('/rest/list/users', {
            method: 'POST',
            body: JSON.stringify({})
        });

        if (!response.ok) {
            throw new Error('Falha ao carregar usuários');
        }

        const users = await response.json();
        currentUsers = users;
        displayUsersList(users);
        updateUserStats(users);

        console.log(`Loaded ${users.length} users`);

    } catch (error) {
        console.error('Error loading users:', error);
        ui.showAlert('Erro ao carregar usuários: ' + error.message, 'error');
        displayUsersList([]);
    } finally {
        ui.showLoading(false);
    }
}

// Display users list
function displayUsersList(users) {
    const usersTableBody = document.getElementById('usersTableBody');
    if (!usersTableBody) {
        console.warn('Users table body not found');
        return;
    }

    if (users.length === 0) {
        usersTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-light);">
                    <i class="ri-user-line" style="font-size: 2rem; display: block; margin-bottom: 1rem;"></i>
                    Nenhum usuário encontrado
                </td>
            </tr>
        `;
        return;
    }

    usersTableBody.innerHTML = users.map(user => `
        <tr>
            <td>
                <div class="user-info">
                    <div class="user-avatar">
                        ${profile.generateInitials(user.name || user.username)}
                    </div>
                    <div class="user-details">
                        <div class="user-name">${user.name || user.username}</div>
                        <div class="user-email">${user.email || 'Sem email'}</div>
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
                <span class="user-last-activity">-</span>
            </td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline" onclick="openUserDetailModal('${user.username}')">
                        <i class="ri-eye-line"></i>
                        Ver
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="editUserAttribute('${user.username}')">
                        <i class="ri-edit-line"></i>
                        Editar
                    </button>
                    ${user.state === 'ATIVADO' ? 
                        `<button class="btn btn-sm btn-warning" onclick="suspendUser('${user.username}')">
                            <i class="ri-pause-line"></i>
                            Suspender
                        </button>` :
                        `<button class="btn btn-sm btn-success" onclick="activateUser('${user.username}')">
                            <i class="ri-check-line"></i>
                            Ativar
                        </button>`
                    }
                </div>
            </td>
        </tr>
    `).join('');
}

// Update user statistics
function updateUserStats(users) {
    const activeUsers = users.filter(u => u.state === 'ATIVADO').length;
    const inactiveUsers = users.filter(u => u.state !== 'ATIVADO').length;
    
    const activeUsersCount = document.getElementById('activeUsersCount');
    const inactiveUsersCount = document.getElementById('inactiveUsersCount');
    const totalUsersCount = document.getElementById('totalUsersCount');
    
    if (activeUsersCount) activeUsersCount.textContent = activeUsers;
    if (inactiveUsersCount) inactiveUsersCount.textContent = inactiveUsers;
    if (totalUsersCount) totalUsersCount.textContent = users.length;
}

// Filter users
function filterUsers() {
    const searchTerm = document.getElementById('userSearch')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('roleFilter')?.value || '';
    const stateFilter = document.getElementById('stateFilter')?.value || '';

    if (!currentUsers) return;

    const filteredUsers = currentUsers.filter(user => {
        const matchesSearch = !searchTerm || 
            (user.name && user.name.toLowerCase().includes(searchTerm)) ||
            (user.username && user.username.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm));
        
        const matchesRole = !roleFilter || user.role === roleFilter;
        const matchesState = !stateFilter || user.state === stateFilter;
        
        return matchesSearch && matchesRole && matchesState;
    });

    displayUsersList(filteredUsers);
}

// User detail modal functions
async function openUserDetailModal(username) {
    const user = currentUsers.find(u => u.username === username);
    if (!user) {
        ui.showAlert('Usuário não encontrado', 'error');
        return;
    }

    const modal = document.getElementById('userDetailModal');
    const modalTitle = document.getElementById('userDetailTitle');
    const modalContent = document.getElementById('userDetailContent');
    
    if (!modal || !modalTitle || !modalContent) {
        ui.showAlert('Erro ao abrir modal de detalhes', 'error');
        return;
    }

    // Set modal title
    modalTitle.textContent = `Detalhes do Usuário: ${user.name || user.username}`;

    // Get additional user data (posts count, last activity, etc.)
    let postsCount = 0;
    let lastActivity = 'Nunca';
    
    try {
        // Mock data for now - in real implementation, you'd fetch from API
        postsCount = Math.floor(Math.random() * 50) + 1;
        const lastActivityTime = Date.now() - (Math.random() * 7 * 24 * 60 * 60 * 1000);
        lastActivity = new Date(lastActivityTime).toLocaleString('pt-BR');
    } catch (error) {
        console.warn('Error fetching additional user data:', error);
    }

    // Create user details content with clean, read-only information
    const userDetails = `
        <div class="user-profile-header">
            <div class="user-avatar-large">
                ${profile.generateInitials(user.name || user.username)}
            </div>
            <div class="user-profile-info">
                <h3 class="user-profile-name">${user.name || user.username}</h3>
                <p class="user-profile-username">@${user.username}</p>
                <div class="user-profile-stats">
                    <div class="stat-item">
                        <span class="stat-value">${postsCount}</span>
                        <span class="stat-label">Publicações</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${lastActivity}</span>
                        <span class="stat-label">Última Atividade</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="user-detail-grid">
            <div class="detail-section">
                <h3>Informações Básicas</h3>
                <div class="detail-item">
                    <label>Nome:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.name || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Email:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.email || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Username:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.username}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Role:</label>
                    <div class="detail-value">
                        <span class="badge role">${roles.getDisplayName(user.role)}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Estado:</label>
                    <div class="detail-value">
                        <span class="badge state ${profile.getStateColor(user.state)}">
                            ${profile.getStateDisplayName(user.state)}
                        </span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Perfil:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.profile || 'Não informado'}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h3>Informações de Contato</h3>
                <div class="detail-item">
                    <label>Telefone 1:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.phone1 || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Telefone 2:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.phone2 || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Morada:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.end || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Código Postal:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.endcp || 'Não informado'}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h3>Informações Pessoais</h3>
                <div class="detail-item">
                    <label>NIF:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.nif || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Cartão de Cidadão:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.cc || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Data de Emissão CC:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.ccde || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Local de Emissão CC:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.ccle || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Validade CC:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.ccv || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>Data de Nascimento:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.dnasc || 'Não informado'}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h3>Informações de Nacionalidade</h3>
                <div class="detail-item">
                    <label>País de Nacionalidade:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.pn || 'Não informado'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <label>País de Residência:</label>
                    <div class="detail-value">
                        <span class="detail-text">${user.pr || 'Não informado'}</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal-actions">
            <button class="btn btn-primary" onclick="editUserAttribute('${user.username}')">
                <i class="ri-edit-line"></i>
                Editar Completo
            </button>
            ${user.state === 'ATIVADO' ? 
                `<button class="btn btn-warning" onclick="suspendUser('${user.username}')">
                    <i class="ri-pause-line"></i>
                    Suspender
                </button>` :
                `<button class="btn btn-success" onclick="activateUser('${user.username}')">
                    <i class="ri-check-line"></i>
                    Ativar
                </button>`
            }
            <button class="btn btn-danger" onclick="removeUser('${user.username}')">
                <i class="ri-delete-bin-line"></i>
                Remover
            </button>
        </div>
    `;

    modalContent.innerHTML = userDetails;
    modal.style.display = 'block';
}

function closeUserDetailModal() {
    const modal = document.getElementById('userDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// User management functions
async function toggleUserState(username, currentState) {
    const newState = currentState === 'ATIVADO' ? 'DESATIVADO' : 'ATIVADO';
    const action = newState === 'ATIVADO' ? 'ativar' : 'desativar';
    
    if (confirm(`Tem certeza que deseja ${action} o usuário "${username}"?`)) {
        try {
            ui.showLoading(true, `${action.charAt(0).toUpperCase() + action.slice(1)}ando usuário...`);
            
            const success = await changeAccountState(username, newState);
            if (success) {
                ui.showAlert(`Usuário ${action}do com sucesso`, 'success');
                await refreshUsersList();
                closeUserDetailModal();
            }
        } catch (error) {
            ui.showAlert(`Erro ao ${action} usuário: ${error.message}`, 'error');
        } finally {
            ui.showLoading(false);
        }
    }
}

async function suspendUser(username) {
    if (confirm(`Tem certeza que deseja suspender o usuário "${username}"?`)) {
        try {
            ui.showLoading(true, 'Suspendendo usuário...');
            
            const success = await changeAccountState(username, 'SUSPENSO');
            if (success) {
                ui.showAlert('Usuário suspenso com sucesso', 'success');
                await refreshUsersList();
                closeUserDetailModal();
            }
        } catch (error) {
            ui.showAlert(`Erro ao suspender usuário: ${error.message}`, 'error');
        } finally {
            ui.showLoading(false);
        }
    }
}

async function activateUser(username) {
    try {
        ui.showLoading(true, 'Ativando usuário...');
        
        const resp = await auth.fetch('/rest/utils/activateaccount', {
            method: 'POST',
            body: JSON.stringify({
                targetUsername: username,
                state: "ATIVADO"
            })
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(errorText || 'Erro ao ativar usuário');
        }

        const result = await resp.json();
        if (result === true) {
            ui.showAlert('Usuário ativado com sucesso', 'success');
            await refreshUsersList();
            closeUserDetailModal();
        } else {
            throw new Error('Resposta inesperada do servidor');
        }
    } catch (error) {
        ui.showAlert(`Erro ao ativar usuário: ${error.message}`, 'error');
    } finally {
        ui.showLoading(false);
    }
}

async function removeUser(username) {
    if (confirm(`Tem certeza que deseja remover permanentemente o usuário "${username}"?\n\nEsta ação não pode ser desfeita!`)) {
        try {
            ui.showLoading(true, 'Removendo usuário...');
            
            const resp = await auth.fetch('/rest/utils/removeaccount', {
                method: 'POST',
                body: JSON.stringify({
                    username: auth.getCurrentUserFromToken().username,
                    targetUsername: username
                })
            });

            if (!resp.ok) {
                const errMsg = await resp.text();
                throw new Error(errMsg || `HTTP ${resp.status}`);
            }

            const success = await resp.json();
            if (success === true) {
                ui.showAlert('Usuário removido com sucesso', 'success');
                await refreshUsersList();
                closeUserDetailModal();
            } else {
                throw new Error('Resposta inesperada do servidor');
            }
        } catch (error) {
            ui.showAlert(`Erro ao remover usuário: ${error.message}`, 'error');
        } finally {
            ui.showLoading(false);
        }
    }
}

async function changeAccountState(username, newState) {
    try {
        const resp = await auth.fetch('/rest/utils/changestate', {
            method: 'POST',
            body: JSON.stringify({
                targetUsername: username,
                state: newState
            })
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(errorText || 'Erro ao alterar estado do usuário');
        }

        const result = await resp.json();
        return result === true;
    } catch (error) {
        console.error('Error changing account state:', error);
        throw error;
    }
}

function editUserAttribute(username) {
    const user = currentUsers.find(u => u.username === username);
    if (!user) {
        ui.showAlert('Usuário não encontrado', 'error');
        return;
    }

    const modal = document.getElementById('userEditModal');
    const modalTitle = document.getElementById('userEditTitle');
    const form = document.getElementById('userEditForm');
    
    if (!modal || !modalTitle || !form) {
        ui.showAlert('Erro ao abrir modal de edição', 'error');
        return;
    }

    // Set modal title
    modalTitle.textContent = `Editar Usuário: ${user.name || user.username}`;

    // Populate form fields
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editName').value = user.name || '';
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editRole').value = user.role || '';
    document.getElementById('editState').value = user.state || '';
    document.getElementById('editProfile').value = user.profile || '';
    document.getElementById('editPhone1').value = user.phone1 || '';
    document.getElementById('editPhone2').value = user.phone2 || '';
    document.getElementById('editEnd').value = user.end || '';
    document.getElementById('editEndcp').value = user.endcp || '';
    document.getElementById('editNif').value = user.nif || '';
    document.getElementById('editCc').value = user.cc || '';
    document.getElementById('editCcde').value = user.ccde || '';
    document.getElementById('editCcle').value = user.ccle || '';
    document.getElementById('editCcv').value = user.ccv || '';
    document.getElementById('editDnasc').value = user.dnasc || '';
    document.getElementById('editPn').value = user.pn || '';
    document.getElementById('editPr').value = user.pr || '';

    // Show modal
    modal.style.display = 'block';

    // Handle form submission
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        try {
            ui.showLoading(true, 'Salvando alterações...');
            
            // Collect form data
            const formData = {
                username: document.getElementById('editUsername').value,
                name: document.getElementById('editName').value,
                email: document.getElementById('editEmail').value,
                role: document.getElementById('editRole').value,
                state: document.getElementById('editState').value,
                profile: document.getElementById('editProfile').value,
                phone1: document.getElementById('editPhone1').value,
                phone2: document.getElementById('editPhone2').value,
                end: document.getElementById('editEnd').value,
                endcp: document.getElementById('editEndcp').value,
                nif: document.getElementById('editNif').value,
                cc: document.getElementById('editCc').value,
                ccde: document.getElementById('editCcde').value,
                ccle: document.getElementById('editCcle').value,
                ccv: document.getElementById('editCcv').value,
                dnasc: document.getElementById('editDnasc').value,
                pn: document.getElementById('editPn').value,
                pr: document.getElementById('editPr').value
            };

            // Update each attribute that has changed using ComputationResource
            const originalUser = currentUsers.find(u => u.username === username);
            const updates = [];

            // Map frontend attribute names to backend attribute names
            const attributeMapping = {
                'name': 'user_name',
                'email': 'user_email',
                'role': 'user_role',
                'state': 'user_state',
                'profile': 'user_profile',
                'phone1': 'user_phone1',
                'phone2': 'user_phone2',
                'end': 'user_end',
                'endcp': 'user_endcp',
                'nif': 'user_nif',
                'cc': 'user_cc',
                'ccde': 'user_ccde',
                'ccle': 'user_ccle',
                'ccv': 'user_ccv',
                'dnasc': 'user_dnasc',
                'pn': 'user_pn',
                'pr': 'user_pr'
            };

            for (const [key, value] of Object.entries(formData)) {
                if (key === 'username') continue; // Skip username as it's readonly
                if (originalUser[key] !== value && value !== '') {
                    const backendAttribute = attributeMapping[key];
                    if (backendAttribute) {
                        updates.push({ attribute: backendAttribute, value: value });
                    }
                }
            }

            // Apply updates using the changeattribute endpoint
            for (const update of updates) {
                const success = await updateUserAttribute(username, update.attribute, update.value);
                if (!success) {
                    throw new Error(`Falha ao atualizar ${update.attribute}`);
                }
            }

            ui.showAlert('Usuário atualizado com sucesso', 'success');
            closeUserEditModal();
            
            // Refresh both the users list and the detail modal
            await refreshUsersList();
            
            // If the detail modal is open, refresh it with updated data
            const detailModal = document.getElementById('userDetailModal');
            if (detailModal && detailModal.style.display === 'block') {
                await refreshUserDetailModal(username);
            }
            
        } catch (error) {
            ui.showAlert(`Erro ao atualizar usuário: ${error.message}`, 'error');
        } finally {
            ui.showLoading(false);
        }
    };
}

function closeUserEditModal() {
    const modal = document.getElementById('userEditModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function updateUserAttribute(username, attributeName, newValue) {
    try {
        const resp = await auth.fetch('/rest/utils/changeattribute', {
            method: 'POST',
            body: JSON.stringify({
                username: auth.getCurrentUserFromToken().username,
                targetUsername: username,
                attributeName: attributeName,
                newValue: newValue
            })
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(errorText || 'Erro ao atualizar atributo');
        }

        const result = await resp.json();
        return result === true;
    } catch (error) {
        console.error('Error updating user attribute:', error);
        throw error;
    }
}

async function viewUserState(username) {
    try {
        const resp = await auth.fetch('/rest/utils/viewState', {
            method: 'POST',
            body: JSON.stringify({ targetUsername: username })
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(err || `HTTP ${resp.status}`);
        }

        const state = await resp.json();
        ui.showAlert(`Estado do usuário ${username}: ${profile.getStateDisplayName(state)}`, 'info');
    } catch (error) {
        ui.showAlert(`Erro ao consultar estado: ${error.message}`, 'error');
    }
}

function editUser(username) {
    editUserAttribute(username);
}

// Helper function to validate email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Function to refresh the user detail modal with updated data
async function refreshUserDetailModal(username) {
    try {
        // Re-fetch user data to ensure we have the latest information
        const resp = await auth.fetch('/rest/list/users', {
            method: 'POST',
            body: JSON.stringify({ username: '' })
        });

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }

        const users = await resp.json();
        const updatedUser = users.find(u => u.username === username);
        
        if (updatedUser) {
            // Update the current users list
            const userIndex = currentUsers.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                currentUsers[userIndex] = updatedUser;
            } else {
                currentUsers.push(updatedUser);
            }
            
            // Re-open the modal with updated data
            await openUserDetailModal(username);
        }
    } catch (error) {
        console.error('Error refreshing user detail modal:', error);
        // If refresh fails, just show a warning but don't break the UI
        ui.showAlert('Dados atualizados localmente. Recarregue para ver todas as mudanças.', 'warning');
    }
}

// Export functions to global scope
window.handleListUsers = handleListUsers;
window.handleUpdateAttribute = handleUpdateAttribute;
window.handleActivateAccount = handleActivateAccount;
window.handleDeactivateAccount = handleDeactivateAccount;
window.handleRemoveAccount = handleRemoveAccount;
window.handleSuspendAccount = handleSuspendAccount;
window.handleUsersToRemove = handleUsersToRemove;
window.handleViewState = handleViewState;
window.setupUserManagement = setupUserManagement;
window.setupUserFilters = setupUserFilters;
window.refreshUsersList = refreshUsersList;
window.openUserDetailModal = openUserDetailModal;
window.closeUserDetailModal = closeUserDetailModal;
window.closeUserEditModal = closeUserEditModal;
window.suspendUser = suspendUser;
window.activateUser = activateUser;
window.removeUser = removeUser;
window.editUserAttribute = editUserAttribute;
window.editUser = editUser;
window.refreshUserDetailModal = refreshUserDetailModal;
window.isValidEmail = isValidEmail;