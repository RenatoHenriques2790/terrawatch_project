// Auth utilities
const auth = {
    getToken() {
        // Check sessionStorage first (for current session), then localStorage (for remember me)
        return sessionStorage.getItem('token') || localStorage.getItem('token');
    },

    isAuthenticated() {
        const token = this.getToken();
        if (!token) return false;

        // Check if remember me is enabled
        const remember = localStorage.getItem('remember') === 'true';

        // Basic JWT token validation (check if it's expired)
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const now = Date.now() / 1000;

            // Check JWT expiration
            if (payload.exp <= now) {
                // Token is expired, clear auth
                this.clearAuth();
                return false;
            }

            return true;
        } catch (e) {
            this.clearAuth();
            return false;
        }
    },

    getCurrentUserFromToken() {
        const token = this.getToken();
        if (!token) return null;

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));

            // Get user data from storage first (this contains the full user data from backend)
            const cachedUser = this.getCurrentUserData();
            if (cachedUser) {
                return {
                    username: payload.sub || cachedUser.username,
                    role: payload.role || cachedUser.role,
                    email: payload.email || cachedUser.email,
                    name: payload.name || cachedUser.name,
                    state: payload.state || cachedUser.state,
                    profile: payload.profile || cachedUser.profile,
                    // Include all user data from backend
                    ...cachedUser
                };
            }

            // Fallback to token payload only
            return {
                username: payload.sub,
                role: payload.role,
                email: payload.email,
                name: payload.name,
                state: payload.state,
                profile: payload.profile
            };
        } catch (e) {
            return null;
        }
    },

    setToken(token, userData = null, remember = false) {
        if (token) {
            if (remember) {
                // Store in localStorage for persistent login
                localStorage.setItem('token', token);
                localStorage.setItem('remember', 'true');
            } else {
                // Store in sessionStorage for session-only login
                sessionStorage.setItem('token', token);
                localStorage.removeItem('remember');
            }
        }
        if (userData) {
            // Store user data based on remember preference
            if (remember) {
                localStorage.setItem('userData', JSON.stringify(userData));
            } else {
                sessionStorage.setItem('userData', JSON.stringify(userData));
            }
        }
    },

    clearAuth() {
        // Clear both session and local storage
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('userData');
        localStorage.removeItem('token');
        localStorage.removeItem('remember');
        localStorage.removeItem('userData');
        localStorage.removeItem('tokenExpiration');
    },

    async login(username, password, remember = false) {
        try {
            // Use the correct backend endpoint
            const response = await fetch('/rest/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Credenciais inválidas');
            }

            const data = await response.json();

            // Extract user data from response - the backend returns it in the 'user' field
            const userData = data.user || {
                username: data.username || username,
                role: data.role,
                email: data.email,
                name: data.name,
                state: data.state || 'ATIVADO',
                profile: data.profile || 'PRIVADO'
            };

            // Store token and user data with proper remember preference
            this.setToken(data.token, userData, remember);

            return userData;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    },

    async logout() {
        const token = this.getToken();

        // Stop notifications checking
        if (typeof stopNotificationChecking === 'function') {
            stopNotificationChecking();
        }

        try {
            if (token) {
                // Use the correct backend endpoint
                await fetch('/rest/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearAuth();
            window.location.href = '/';
        }
    },

    // Add Authorization header to fetch requests
    async fetch(url, options = {}) {
        const token = this.getToken();
        if (!token) {
            console.warn('No authentication token found, redirecting to login');
            this.clearAuth();
            window.location.href = '/features/auth/login';
            throw new Error('No authentication token found');
        }

        // Don't set Content-Type for FormData (multipart uploads)
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };

        // Only set Content-Type if not FormData and not already set
        if (!(options.body instanceof FormData) && !options.headers?.['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(url, { ...options, headers });

            // If token is invalid or expired, clear auth and redirect
            if (response.status === 401) {
                const bodyText = await response.text();
                console.warn('Authentication token expired or invalid');
                this.clearAuth();
                window.location.href = '/features/auth/login';
                throw new Error('Authentication failed: ' + bodyText);
            }

            // If server unavailable, show user-friendly error
            if (response.status >= 500) {
                const bodyText = await response.text();
                throw new Error('Servidor temporariamente indisponível. Tente novamente em alguns instantes. Detalhes: ' + bodyText);
            }

            return response;
        } catch (error) {
            // Network errors or connection issues
            if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                console.error('Network error - server may be unavailable:', error);
                throw new Error('Erro de conexão. Verifique sua internet ou se o servidor está disponível.');
            }

            console.error('API request failed:', error);
            throw error;
        }
    },

    // Get current user info from backend
    async getCurrentUser() {
        try {
            if (!this.isAuthenticated()) {
                return null;
            }

            // Try to get from backend first
            try {
                const response = await this.fetch('/rest/auth/me');
                if (response.ok) {
                    const userData = await response.json();

                    // Ensure role and other essential fields are present
                    const tokenData = this.getCurrentUserFromToken();
                    if (tokenData) {
                        userData.role = userData.role || tokenData.role;
                        userData.username = userData.username || tokenData.username;
                        userData.email = userData.email || tokenData.email;
                        userData.state = userData.state || tokenData.state || 'ATIVADO';
                        userData.profile = userData.profile || tokenData.profile || 'PRIVADO';
                    }

                    // Update cached data
                    this.updateUserData(userData);
                    return userData;
                }
            } catch (error) {
                console.warn('Failed to get user from backend, using cached data:', error.message);
            }

            // Fallback to cached data or token data
            const cachedData = this.getCurrentUserData();
            if (cachedData) {
                return cachedData;
            }

            // Final fallback to token data
            return this.getCurrentUserFromToken();
        } catch (error) {
            console.error('Failed to get user info:', error);
            return null;
        }
    },

    // Get current user data from storage (set during login)
    getCurrentUserData() {
        try {
            // Check session storage first, then local storage
            const cachedUser = sessionStorage.getItem('userData') || localStorage.getItem('userData');
            if (cachedUser) {
                return JSON.parse(cachedUser);
            }
            return this.getCurrentUserFromToken();
        } catch (error) {
            return null;
        }
    },

    // Update cached user data
    updateUserData(userData) {
        if (userData) {
            const remember = localStorage.getItem('remember') === 'true';
            if (remember) {
                localStorage.setItem('userData', JSON.stringify(userData));
            } else {
                sessionStorage.setItem('userData', JSON.stringify(userData));
            }
        }
    },

    // Update user profile attribute using correct backend endpoint
    async updateProfileAttribute(attributeName, newValue) {
        try {
            const username = this.getCurrentUserFromToken()?.username;
            if (!username) throw new Error('No username found');

            const response = await this.fetch('/rest/utils/changeattribute', {
                method: 'POST',
                body: JSON.stringify({
                    username: username,
                    targetUsername: username,
                    attributeName: attributeName,
                    newValue: newValue
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Erro ao atualizar perfil');
            }

            // Update local cached data if it's the current user
            const userData = this.getCurrentUserData();
            if (userData) {
                userData[attributeName] = newValue;
                this.updateUserData(userData);
            }

            return true;
        } catch (error) {
            console.error('Profile update error:', error);
            throw error;
        }
    },

    // Change password using correct backend endpoint
    async changePassword(oldPassword, newPassword) {
        try {
            const username = this.getCurrentUserFromToken()?.username;
            if (!username) throw new Error('No username found');

            const response = await this.fetch('/rest/utils/changepassword', {
                method: 'POST',
                body: JSON.stringify({
                    username: username,
                    oldPassword: oldPassword,
                    newPassword: newPassword
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Erro ao alterar senha');
            }

            return true;
        } catch (error) {
            console.error('Password change error:', error);
            throw error;
        }
    },

    // Request account removal using correct backend endpoint
    async requestAccountRemoval() {
        try {
            const response = await this.fetch('/rest/utils/requestAccountRemoval', {
                method: 'POST'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Erro ao solicitar remoção da conta');
            }

            return true;
        } catch (error) {
            console.error('Account removal request error:', error);
            throw error;
        }
    }
};

// Role utilities
const roles = {
    // Role hierarchy and permissions
    hierarchy: {
        'SYSADMIN': 10,
        'SYSBO': 9,
        'SMBO': 8,
        'SGVBO': 7,
        'SDVBO': 6,
        'PRBO': 5,
        'PO': 4,
        'ADLU': 3,
        'RU': 2,
        'VU': 1
    },

    displayNames: {
        'SYSADMIN': 'Administrador do Sistema',
        'SYSBO': 'Sistema Back Office',
        'SMBO': 'Gestor de Folhas Back Office',
        'SGVBO': 'Visualizador Geral Back Office',
        'SDVBO': 'Visualizador Detalhado Back Office',
        'PRBO': 'Representante Parceiro Back Office',
        'PO': 'Operador Parceiro',
        'ADLU': 'Proprietário Aderente',
        'RU': 'Utilizador Registado',
        'VU': 'Visitante'
    },

    getDisplayName(role) {
        return this.displayNames[role] || role;
    },

    hasPermission(userRole, requiredRole) {
        return (this.hierarchy[userRole] || 0) >= (this.hierarchy[requiredRole] || 0);
    },

    isAdmin(role) {
        return role === 'SYSADMIN' || role === 'SYSBO';
    },

    canViewAllData(role) {
        return this.hierarchy[role] >= this.hierarchy['SGVBO'];
    },

    // Check if a role can manage users
    canManageUsers(role) {
        const managementRoles = ['SYSADMIN', 'SYSBO'];
        return managementRoles.includes(role);
    },

    // Check if a role can manage system settings
    canManageSystem(role) {
        return role === 'SYSADMIN';
    },

    // Check if a role can manage worksheets
    canManageWorksheets(role) {
        const worksheetRoles = ['SMBO'];
        return worksheetRoles.includes(role);
    },

    // Check if a role can view reports
    canViewReports(role) {
        const reportRoles = ['SMBO', 'SGVBO', 'SDVBO', 'PRBO'];
        return reportRoles.includes(role);
    },

    // Get role hierarchy level (higher number = more permissions)
    getRoleLevel(role) {
        return this.hierarchy[role] || 0;
    },

    // Check if role A can manage role B
    canManageRole(roleA, roleB) {
        return this.getRoleLevel(roleA) > this.getRoleLevel(roleB);
    },

    // Check if a role can handle worksheets
    canHandleWorksheets(role) {
        const worksheetRoles = ['SMBO', 'SGVBO', 'SDVBO', 'PRBO', 'PO'];
        return worksheetRoles.includes(role);
    },

    // Check if a role can handle execution sheets
    canHandleExecutionSheets(role) {
        const executionSheetRoles = ['SMBO', 'SGVBO', 'SDVBO', 'PRBO', 'PO'];
        return executionSheetRoles.includes(role);
    },

    // Check if a role can create execution sheets
    canCreateExecutionSheets(role) {
        const createRoles = ['SMBO', 'PRBO'];
        return createRoles.includes(role);
    },

    // Check if a role can access available worksheets
    canAccessAvailableWorksheets(role) {
        const accessRoles = ['SMBO', 'SGVBO', 'SDVBO', 'PRBO'];
        return accessRoles.includes(role);
    },

    // Check if a role can interact socially (like, comment)
    canInteractSocially(role) {
        const socialRoles = ['SMBO', 'SGVBO', 'SDVBO', 'PRBO', 'PO', 'ADLU', 'RU'];
        return socialRoles.includes(role);
    },

    // Check if a role can view execution sheet details
    canViewExecutionSheetDetails(role) {
        const viewRoles = ['SMBO', 'SGVBO', 'SDVBO', 'PRBO', 'PO'];
        return viewRoles.includes(role);
    }
};

// User profile utilities
const profile = {
    generateInitials(name) {
        if (!name) return 'U';
        return name.split(' ')
            .map(word => word.charAt(0))
            .join('')
            .substring(0, 2)
            .toUpperCase();
    },

    generateAvatarColor(name) {
        if (!name) return '#9EF5CF';

        const colors = [
            '#9EF5CF', '#7ad4ae', '#c2f7e1', '#5ac18a',
            '#4a9c6f', '#3a7a56', '#2a5a3f', '#1a3a28'
        ];

        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }

        return colors[Math.abs(hash) % colors.length];
    },

    getStateDisplayName(state) {
        const stateNames = {
            'ATIVADO': 'Ativo',
            'DESATIVADO': 'Inativo',
            'SUSPENSO': 'Suspenso',
            'P-REMOVER': 'Pendente Remoção'
        };
        return stateNames[state] || state;
    },

    getStateColor(state) {
        const colors = {
            'ATIVADO': 'success',
            'DESATIVADO': 'secondary',
            'SUSPENSO': 'warning',
            'P-REMOVER': 'danger'
        };
        return colors[state] || 'secondary';
    }
};

// UI utilities
const ui = {
    showAlert(message, type = 'info', duration = 3000) {
        // Remove existing alerts
        document.querySelectorAll('.alert-floating').forEach(alert => alert.remove());

        const alertContainer = document.createElement('div');
        alertContainer.className = `alert alert-${type} alert-floating`;
        alertContainer.innerHTML = `
            <div class="alert-content">
                <i class="ri-${this.getAlertIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <button class="alert-close" onclick="this.parentElement.remove()">
                <i class="ri-close-line"></i>
            </button>
        `;

        document.body.appendChild(alertContainer);

        // Auto remove after duration
        setTimeout(() => {
            if (alertContainer.parentElement) {
                alertContainer.remove();
            }
        }, duration);
    },

    getAlertIcon(type) {
        const icons = {
            'success': 'check-line',
            'error': 'error-warning-line',
            'warning': 'alert-line',
            'info': 'information-line'
        };
        return icons[type] || 'information-line';
    },

    showLoading(show = true, message = 'Carregando...') {
        let loader = document.getElementById('loadingOverlay');

        if (show) {
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'loadingOverlay';
                loader.className = 'loading-overlay';
                loader.innerHTML = `
                    <div class="loading-content">
                        <div class="loading-spinner"></div>
                        <div class="loading-message">${message}</div>
                    </div>
                `;
                document.body.appendChild(loader);
            } else {
                const messageElement = loader.querySelector('.loading-message');
                if (messageElement) {
                    messageElement.textContent = message;
                }
            }
            loader.style.display = 'flex';
        } else if (loader) {
            loader.style.display = 'none';
        }
    },

    showConfirm(message, onConfirm, onCancel) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-body">
                    <i class="ri-question-line modal-icon"></i>
                    <p>${message}</p>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove(); ${onCancel ? 'onCancel()' : ''}">
                        Cancelar
                    </button>
                    <button class="btn btn-danger" onclick="this.closest('.modal-overlay').remove(); onConfirm()">
                        Confirmar
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Make onConfirm available globally temporarily
        window.tempConfirmAction = onConfirm;
        modal.querySelector('.btn-danger').onclick = () => {
            modal.remove();
            if (window.tempConfirmAction) {
                window.tempConfirmAction();
                delete window.tempConfirmAction;
            }
        };
    }
};

// Form utilities
const forms = {
    validate(form) {
        const errors = [];

        // Required fields
        form.querySelectorAll('[required]').forEach(field => {
            if (!field.value.trim()) {
                const label = field.previousElementSibling?.textContent || field.name || field.id;
                errors.push(`O campo ${label} é obrigatório`);
            }
        });

        // Email validation
        form.querySelectorAll('[type="email"]').forEach(field => {
            if (field.value && !this.isValidEmail(field.value)) {
                errors.push('Email inválido');
            }
        });

        // Password validation
        form.querySelectorAll('[data-password-confirm]').forEach(field => {
            const passwordField = form.querySelector(`[name="${field.dataset.passwordConfirm}"]`);
            if (passwordField && field.value !== passwordField.value) {
                errors.push('As senhas não coincidem');
            }
        });

        return errors;
    },

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    serializeForm(form) {
        const formData = new FormData(form);
        const data = {};

        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }

        return data;
    }
};

// Date formatting
const dateUtils = {
    formatDate(date) {
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(new Date(date));
    },

    formatDateTime(date) {
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date));
    },

    formatTimeAgo(date) {
        const now = new Date();
        const past = new Date(date);
        const diff = now - past;

        const minute = 60 * 1000;
        const hour = minute * 60;
        const day = hour * 24;
        const week = day * 7;
        const month = day * 30;

        if (diff < minute) return 'agora mesmo';
        if (diff < hour) return `${Math.floor(diff / minute)} min atrás`;
        if (diff < day) return `${Math.floor(diff / hour)} h atrás`;
        if (diff < week) return `${Math.floor(diff / day)} dia(s) atrás`;
        if (diff < month) return `${Math.floor(diff / week)} semana(s) atrás`;

        return this.formatDate(date);
    }
};

// Export utilities
window.auth = auth;
window.roles = roles;
window.profile = profile;
window.ui = ui;
window.forms = forms;
window.dateUtils = dateUtils; 