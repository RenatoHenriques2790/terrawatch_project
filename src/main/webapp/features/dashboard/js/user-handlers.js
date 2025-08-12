// User Functionality Handlers - Fixed and Enhanced

// Profile Dropdown Functionality
async function updateProfileDropdown() {
    try {
        const user = await auth.getCurrentUser();
        if (!user) {
            // Try to get user from token as fallback
            const tokenUser = auth.getCurrentUserFromToken();
            if (!tokenUser) {
                console.warn('No user data available for profile dropdown');
                return;
            }
            user = tokenUser;
        }

        // Update dropdown trigger elements
        const dropdownTrigger = document.getElementById('profileDropdownTrigger');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userRole = document.getElementById('userRole');

        if (dropdownTrigger && userAvatar && userName && userRole) {
            // Update avatar
            userAvatar.textContent = profile.generateInitials(user.name || user.username);
            userAvatar.style.background = profile.generateAvatarColor(user.username);

            // Update name and role with proper greeting format
            userName.textContent = `Olá, ${user.name || user.username}!`;
            userRole.textContent = roles.getDisplayName(user.role);
        }
    } catch (error) {
        console.error('Error updating profile dropdown:', error);
        // Don't show alert for connection errors as it might be annoying
        if (!error.message.includes('Failed to fetch')) {
            ui.showAlert('Error updating profile: ' + error.message, 'error');
        }
    }
}

// Handle Profile View/Edit - MAIN PROFILE FUNCTION
async function handleProfile() {
    console.log('Handling profile...');

    try {
        let user = await auth.getCurrentUser();
        if (!user) {
            // Try to get user from token as fallback
            user = auth.getCurrentUserFromToken();
            if (!user) {
                throw new Error('Failed to get user data');
            }
        }

        console.log('Loading profile for user:', user.username);

        // Update profile overview
        updateProfileOverview(user);

        // Update profile form
        updateProfileForm(user);

        // Setup security actions
        setupSecurityActions();

    } catch (error) {
        console.error('Error handling profile:', error);
        if (error.message.includes('Failed to fetch')) {
            ui.showAlert('Erro de conexão ao carregar perfil. Alguns dados podem estar indisponíveis.', 'warning');
        } else {
            ui.showAlert('Erro ao carregar perfil: ' + error.message, 'error');
        }
    }
}

// Update profile overview section
function updateProfileOverview(user) {
    // Update avatar
    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) {
        profileAvatar.textContent = profile.generateInitials(user.name || user.username);
        profileAvatar.style.background = profile.generateAvatarColor(user.username);
    }

    // Update name and email
    const profileName = document.getElementById('profileName');
    if (profileName) {
        profileName.textContent = user.name || user.username;
    }

    const profileEmail = document.getElementById('profileEmail');
    if (profileEmail) {
        profileEmail.textContent = user.email || 'Email não informado';
    }

    // Update role and state badges
    const profileRole = document.getElementById('profileRole');
    if (profileRole) {
        profileRole.textContent = roles.getDisplayName(user.role);
        profileRole.className = 'badge role';
    }

    const profileState = document.getElementById('profileState');
    if (profileState) {
        profileState.textContent = profile.getStateDisplayName(user.state || 'ATIVADO');
        profileState.className = `badge state ${profile.getStateColor(user.state || 'ATIVADO')}`;
    }
}

// Update profile form
function updateProfileForm(user) {
    const form = document.getElementById('updateProfileForm');
    if (form) {
        form.innerHTML = `
            <div class="form-group">
                <label for="name">Nome</label>
                <input type="text" id="name" name="name" class="form-control" value="${user.name || ''}" placeholder="ex: António José dos Santos Sydney">
            </div>
            <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" name="email" class="form-control" value="${user.email || ''}" readonly>
                <span class="form-help">O email não pode ser alterado</span>
            </div>
            <div class="form-group">
                <label for="phone1">Telefone 1</label>
                <input type="tel" id="phone1" name="phone1" class="form-control" value="${user.phone1 || ''}" placeholder="ex: +351 912345678">
            </div>
            <div class="form-group">
                <label for="phone2">Telefone 2</label>
                <input type="tel" id="phone2" name="phone2" class="form-control" value="${user.phone2 || ''}" placeholder="ex: +351 217982630">
            </div>
            <div class="form-group">
                <label for="pn">País de Nacionalidade</label>
                <input type="text" id="pn" name="pn" class="form-control" value="${user.pn || ''}" placeholder="ex: Portugal">
            </div>
            <div class="form-group">
                <label for="pr">País de Residência</label>
                <input type="text" id="pr" name="pr" class="form-control" value="${user.pr || ''}" placeholder="ex: Portugal">
            </div>
            <div class="form-group">
                <label for="end">Morada</label>
                <input type="text" id="end" name="end" class="form-control" value="${user.end || ''}" placeholder="ex: Rua Francisco Costa 23, 2. DTO">
            </div>
            <div class="form-group">
                <label for="endcp">Código Postal</label>
                <input type="text" id="endcp" name="endcp" class="form-control" value="${user.endcp || ''}" placeholder="ex: 2829516 Caparica">
            </div>
            <div class="form-group">
                <label for="nif">NIF</label>
                <input type="text" id="nif" name="nif" class="form-control" value="${user.nif || ''}" placeholder="ex: 178654267">
            </div>
            <div class="form-group">
                <label for="cc">Cartão de Cidadão</label>
                <input type="text" id="cc" name="cc" class="form-control" value="${user.cc || ''}" placeholder="ex: 9456723">
            </div>
            <div class="form-group">
                <label for="ccde">Data de Emissão do CC</label>
                <input type="text" id="ccde" name="ccde" class="form-control" value="${user.ccde || ''}" placeholder="ex: 24/12/2018">
            </div>
            <div class="form-group">
                <label for="ccle">Local de Emissão do CC</label>
                <input type="text" id="ccle" name="ccle" class="form-control" value="${user.ccle || ''}" placeholder="ex: Lisboa">
            </div>
            <div class="form-group">
                <label for="ccv">Validade do Cartão de Cidadão</label>
                <input type="text" id="ccv" name="ccv" class="form-control" value="${user.ccv || ''}" placeholder="ex: 24/12/2028">
            </div>
            <div class="form-group">
                <label for="dnasc">Data de Nascimento</label>
                <input type="text" id="dnasc" name="dnasc" class="form-control" value="${user.cc || ''}" placeholder="ex: 23/09/1991">
            </div>
             ${user.partner ? `
                <div class="form-group">
                    <label for="partner">Empresa</label>
                    <input type="text" id="partner" name="partner" class="form-control" value="${user.partner}" readonly>
                    <span class="form-help">A empresa a que pertence não pode ser alterada</span>
                </div>
            ` : ''}
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">
                    <i class="ri-save-line"></i>
                    Atualizar Perfil
                </button>
            </div>
        `;

        // Handle form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await updateProfile(e.target, user);
        });
    }
}

// Update profile function
async function updateProfile(form, currentUserData) {
    const formData = new FormData(form);

    try {
        ui.showLoading(true, 'Atualizando perfil...');

        const currentUser = auth.getCurrentUserFromToken();
        if (!currentUser || !currentUser.username) {
            throw new Error('Usuário não autenticado');
        }

        const updates = [];
        for (let [key, value] of formData.entries()) {
            key = "user_" + key;
            if (key !== 'user_email' && value.trim() !== (currentUserData[key] || '')) {
                console.log(key);
                updates.push({ key, value: value.trim() });
            }
        }

        if (updates.length === 0) {
            ui.showAlert('Nenhuma alteração detectada', 'info');
            return;
        }

        for (const update of updates) {
            const resp = await auth.fetch('/rest/utils/changeattribute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: currentUser.username,
                    targetUsername: currentUser.username,
                    attributeName: update.key,
                    newValue: update.value
                })
            });

            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(errText || `Erro ao atualizar ${update.key}`);
            }
        }

        ui.showAlert('Perfil atualizado com sucesso!', 'success');

        // Refresh the profile view and global user data
        setTimeout(async () => {
            await handleProfile();
            if (typeof updateUserInterface === 'function' && window.currentUser) {
                // Update global user data
                const updatedUser = await auth.getCurrentUser();
                if (updatedUser) {
                    window.currentUser = updatedUser;
                    updateUserInterface(updatedUser);
                }
            }
        }, 500);

    } catch (err) {
        console.error('Erro ao atualizar perfil:', err);
        if (err.message.includes('401') || err.message.includes('403')) {
            ui.showAlert('Você não tem permissão para atualizar estes dados', 'error');
        } else if (err.message.includes('Failed to fetch')) {
            ui.showAlert('Erro de conexão ao atualizar perfil. Tente novamente mais tarde.', 'error');
        } else {
            ui.showAlert('Erro ao atualizar perfil: ' + err.message, 'error');
        }
    } finally {
        ui.showLoading(false);
    }
}

// Setup security actions
function setupSecurityActions() {
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    const togglePrivacyBtn = document.getElementById('togglePrivacyBtn');
    const requestRemovalBtn = document.getElementById('requestRemovalBtn');

    if (changePasswordBtn) {
        changePasswordBtn.replaceWith(changePasswordBtn.cloneNode(true));
        document.getElementById('changePasswordBtn').addEventListener('click', handleChangePassword);
    }

    if (togglePrivacyBtn) {
        togglePrivacyBtn.replaceWith(togglePrivacyBtn.cloneNode(true));
        document.getElementById('togglePrivacyBtn').addEventListener('click', handleTogglePrivacy);
    }

    if (requestRemovalBtn) {
        requestRemovalBtn.replaceWith(requestRemovalBtn.cloneNode(true));
        document.getElementById('requestRemovalBtn').addEventListener('click', handleRequestRemoval);
    }
}

// Handle Password Change
function handleChangePassword() {
    console.log('Opening password change form...');
    const form = document.getElementById('changePasswordForm');
    if (!form) return;

    form.style.display = 'block';
    form.innerHTML = `
        <div class="form-group">
            <label for="currentPassword">Senha Atual</label>
            <div class="password-input">
                <input type="password" id="currentPassword" name="currentPassword" class="form-control" required>
                <button type="button" class="btn-icon toggle-password" tabindex="-1">
                    <i class="ri-eye-line"></i>
                </button>
            </div>
        </div>
        <div class="form-group">
            <label for="newPassword">Nova Senha</label>
            <div class="password-input">
                <input type="password" id="newPassword" name="newPassword" class="form-control" required>
                <button type="button" class="btn-icon toggle-password" tabindex="-1">
                    <i class="ri-eye-line"></i>
                </button>
            </div>
            <span class="form-help">A senha deve ter no mínimo 8 caracteres</span>
        </div>
        <div class="form-group">
            <label for="confirmPassword">Confirmar Nova Senha</label>
            <div class="password-input">
                <input type="password" id="confirmPassword" name="confirmPassword" class="form-control" required>
                <button type="button" class="btn-icon toggle-password" tabindex="-1">
                    <i class="ri-eye-line"></i>
                </button>
            </div>
        </div>
        <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('form').style.display='none'">
                <i class="ri-close-line"></i>
                Cancelar
            </button>
            <button type="submit" class="btn btn-primary">
                <i class="ri-key-line"></i>
                Alterar Senha
            </button>
        </div>
    `;

    // Setup password toggles
    form.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', () => {
            const input = button.parentElement.querySelector('input');
            const icon = button.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'ri-eye-off-line';
            } else {
                input.type = 'password';
                icon.className = 'ri-eye-line';
            }
        });
    });

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const currentPassword = formData.get('currentPassword');
        const newPassword = formData.get('newPassword');
        const confirmPassword = formData.get('confirmPassword');

        if (newPassword !== confirmPassword) {
            ui.showAlert('As senhas não coincidem', 'error');
            return;
        }

        if (newPassword.length < 8) {
            ui.showAlert('A nova senha deve ter no mínimo 8 caracteres', 'error');
            return;
        }

        try {
            ui.showLoading(true, 'Alterando senha...');
            await auth.changePassword(currentPassword, newPassword);
            ui.showAlert('Senha alterada com sucesso!', 'success');
            form.reset();
            form.style.display = 'none';
        } catch (err) {
            ui.showAlert('Erro ao alterar senha: ' + err.message, 'error');
        } finally {
            ui.showLoading(false);
        }
    });
}

// Handle Privacy Toggle
async function handleTogglePrivacy() {
    try {
        ui.showLoading(true, 'Alterando privacidade...');

        const resp = await auth.fetch('/rest/utils/changeprivacy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({}) // Empty object but with proper content type
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(errText || `HTTP ${resp.status}`);
        }

        const result = await resp.json();
        if (result === true) {
            ui.showAlert('Privacidade alterada com sucesso', 'success');
            // Refresh profile to show new privacy setting
            setTimeout(() => handleProfile(), 500);
        } else {
            throw new Error('Resposta inesperada do servidor');
        }
    } catch (err) {
        console.error('Erro ao alterar privacidade:', err);
        if (err.message.includes('401') || err.message.includes('403')) {
            ui.showAlert('Você não tem permissão para alterar a privacidade', 'error');
        } else if (err.message.includes('Failed to fetch')) {
            ui.showAlert('Erro de conexão. Tente novamente mais tarde.', 'error');
        } else {
            ui.showAlert(`Falha: ${err.message}`, 'error');
        }
    } finally {
        ui.showLoading(false);
    }
}

// Handle Account Removal Request
function handleRequestRemoval() {
    if (confirm('Tem a certeza que quer solicitar remoção da sua conta?\n\nEsta ação não pode ser desfeita e a sua conta ficará marcada para remoção.')) {
        performAccountRemovalRequest();
    }
}

async function performAccountRemovalRequest() {
    try {
        ui.showLoading(true, 'Solicitando remoção...');

        const resp = await auth.fetch('/rest/utils/requestAccountRemoval', {
            method: 'POST'
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => null);
            throw new Error(errText || `HTTP ${resp.status}`);
        }

        const success = await resp.json();
        if (success === true) {
            ui.showAlert(
                'Requisição de remoção enviada com sucesso. O seu estado foi atualizado para "P-REMOVER".',
                'success'
            );
            // Refresh profile to show new state
            setTimeout(() => handleProfile(), 500);
        } else {
            throw new Error('Resposta inesperada do servidor');
        }

    } catch (err) {
        console.error('Erro ao solicitar remoção de conta:', err);
        ui.showAlert(`Falha ao solicitar remoção: ${err.message}`, 'error');
    } finally {
        ui.showLoading(false);
    }
}

// Handle logout with confirmation
function handleLogout() {
    if (confirm('Tem certeza que deseja sair?')) {
        auth.logout();
    }
}

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

// Export functions to global scope
window.handleLogout = handleLogout;
window.updateProfileDropdown = updateProfileDropdown;
window.handleProfile = handleProfile;
window.handleChangePassword = handleChangePassword;
window.handleTogglePrivacy = handleTogglePrivacy;
window.handleRequestRemoval = handleRequestRemoval;
window.loadProfileData = loadProfileData;
window.initializeProfileManagement = initializeProfileManagement;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeProfileManagement);
} else {
    initializeProfileManagement();
}