// Notifications System - Social Network Features

// Global variables
let notificationsCache = [];
let notificationCheckInterval = null;
let unreadCount = 0;

// Initialize notifications system
function initializeNotifications() {
    console.log('Initializing notifications system...');
    
    // Setup notification toggle
    const notificationsToggle = document.getElementById('notificationsToggle');
    if (notificationsToggle) {
        notificationsToggle.addEventListener('click', toggleNotificationsPanel);
    }

    // Start periodic check for new notifications
    startNotificationChecking();
    
    // Load initial notifications
    refreshNotifications();
}

// Start periodic notification checking
function startNotificationChecking() {
    // Check every 30 seconds
    notificationCheckInterval = setInterval(() => {
        if (auth.isAuthenticated()) {
            checkUnreadCount();
        }
    }, 30000);
    
    // Check immediately
    if (auth.isAuthenticated()) {
        checkUnreadCount();
    }
}

// Stop notification checking
function stopNotificationChecking() {
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
        notificationCheckInterval = null;
    }
}

// Check unread notification count
async function checkUnreadCount() {
    try {
        const response = await auth.fetch('/rest/notifications/count/unread');
        if (response.ok) {
            const data = await response.json();
            updateNotificationBadge(data.unreadCount);
        }
    } catch (error) {
        console.warn('Error checking unread count:', error);
    }
}

// Update notification badge
function updateNotificationBadge(count) {
    unreadCount = count;
    const badge = document.getElementById('notificationsBadge');
    
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count.toString();
            badge.style.display = 'inline-flex';
            badge.className = 'notifications-badge';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Toggle notifications panel
async function toggleNotificationsPanel() {
    let panel = document.getElementById('notificationsPanel');
    
    if (panel) {
        // Close panel
        panel.remove();
    } else {
        // Open panel
        await showNotificationsPanel();
    }
}

// Show notifications panel
async function showNotificationsPanel() {
    try {
        ui.showLoading(true, 'Carregando notificações...');
        
        const response = await auth.fetch('/rest/notifications');
        if (!response.ok) {
            throw new Error('Falha ao carregar notificações');
        }
        
        const notifications = await response.json();
        notificationsCache = notifications;
        
        createNotificationsPanel(notifications);
        
    } catch (error) {
        console.error('Error loading notifications:', error);
        ui.showAlert('Erro ao carregar notificações: ' + error.message, 'error');
        
        // Show error panel with retry option
        createErrorNotificationsPanel(error.message);
    } finally {
        ui.showLoading(false);
    }
}

// Create notifications panel
function createNotificationsPanel(notifications) {
    const panel = document.createElement('div');
    panel.id = 'notificationsPanel';
    panel.className = 'notifications-panel';
    
    panel.innerHTML = `
        <div class="notifications-panel-header">
            <h3>Notificações</h3>
            <div class="notifications-actions">
                <button class="btn-icon" onclick="markAllAsRead()" title="Marcar todas como lidas">
                    <i class="ri-check-double-line"></i>
                </button>
                <button class="btn-icon" onclick="clearAllNotifications()" title="Apagar todas">
                    <i class="ri-delete-bin-6-line"></i>
                </button>
                <button class="btn-icon" onclick="refreshNotifications()" title="Atualizar">
                    <i class="ri-refresh-line"></i>
                </button>
                <button class="btn-icon" onclick="closeNotificationsPanel()" title="Fechar">
                    <i class="ri-close-line"></i>
                </button>
            </div>
        </div>
        <div class="notifications-list" id="notificationsList">
            ${notifications.length === 0 ? `
                <div class="no-notifications">
                    <i class="ri-notification-off-line"></i>
                    <p>Nenhuma notificação</p>
                </div>
            ` : notifications.map(notification => createNotificationItem(notification)).join('')}
        </div>
    `;
    
    // Position panel
    const notificationsToggle = document.getElementById('notificationsToggle');
    const rect = notificationsToggle.getBoundingClientRect();
    
    panel.style.position = 'fixed';
    panel.style.top = (rect.bottom + 10) + 'px';
    panel.style.right = '20px';
    panel.style.zIndex = '10000';
    
    document.body.appendChild(panel);
    
    // Add click outside listener
    setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
    }, 100);
}

// Create error notifications panel
function createErrorNotificationsPanel(errorMessage) {
    const panel = document.createElement('div');
    panel.id = 'notificationsPanel';
    panel.className = 'notifications-panel';
    
    panel.innerHTML = `
        <div class="notifications-panel-header">
            <h3>Erro nas Notificações</h3>
            <div class="notifications-actions">
                <button class="btn-icon" onclick="closeNotificationsPanel()" title="Fechar">
                    <i class="ri-close-line"></i>
                </button>
            </div>
        </div>
        <div class="notifications-list" id="notificationsList">
            <div class="no-notifications">
                <i class="ri-error-warning-line" style="color: var(--error-color);"></i>
                <p>Erro ao carregar notificações</p>
                <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">${errorMessage}</p>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn btn-sm btn-primary" onclick="refreshNotifications()">
                        <i class="ri-refresh-line"></i> Tentar Novamente
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Position panel
    const notificationsToggle = document.getElementById('notificationsToggle');
    const rect = notificationsToggle.getBoundingClientRect();
    
    panel.style.position = 'fixed';
    panel.style.top = (rect.bottom + 10) + 'px';
    panel.style.right = '20px';
    panel.style.zIndex = '10000';
    
    document.body.appendChild(panel);
    
    // Add click outside listener
    setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
    }, 100);
}

// Create notification item HTML
function createNotificationItem(notification) {
    const timeAgo = dateUtils.formatTimeAgo(notification.timestamp);
    const isUnread = !notification.read;
    
    return `
        <div class="notification-item ${isUnread ? 'unread' : ''}" onclick="handleNotificationClick('${notification.id}', '${notification.relatedId || ''}', '${notification.type}')">
            <div class="notification-icon">
                <i class="${getNotificationIcon(notification.type)}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">${notification.title}</div>
                <div class="notification-message">${notification.message}</div>
                <div class="notification-meta">
                    <span class="notification-from">de ${notification.fromUser}</span>
                    <span class="notification-time">${timeAgo}</span>
                </div>
            </div>
            ${isUnread ? '<div class="notification-unread-dot"></div>' : ''}
        </div>
    `;
}

// Get notification icon based on type
function getNotificationIcon(type) {
    const icons = {
        'like': 'ri-heart-fill',
        'comment': 'ri-chat-3-fill',
        'execution': 'ri-clipboard-fill',
        'system': 'ri-information-fill',
        'worksheet_added': 'ri-file-list-3-fill',
        'worksheet_deleted': 'ri-delete-bin-6-fill',
        'execution_sheet_created': 'ri-clipboard-fill',
        'execution_sheet_completed': 'ri-check-double-fill',
        'execution_sheet_liked': 'ri-heart-fill',
        'execution_sheet_commented': 'ri-chat-3-fill',
        'photo_uploaded': 'ri-image-fill',
        'video_uploaded': 'ri-video-fill',
        'photo_liked': 'ri-heart-fill',
        'video_liked': 'ri-heart-fill',
        'social_post_created': 'ri-message-3-fill',
        'social_post_liked': 'ri-heart-fill',
        'social_post_commented': 'ri-chat-3-fill',
        'user_registered': 'ri-user-add-fill',
        'user_suspended': 'ri-user-forbid-fill',
        'user_activated': 'ri-user-settings-fill',
        'user_removed': 'ri-user-delete-fill',
        'activity_started': 'ri-play-circle-fill',
        'activity_completed': 'ri-check-circle-fill'
    };
    return icons[type] || 'ri-notification-3-fill';
}

// Handle notification click
async function handleNotificationClick(notificationId, relatedId, type) {
    try {
        // Mark as read
        const response = await auth.fetch(`/rest/notifications/${notificationId}/read`, {
            method: 'POST'
        });
        
        if (response.ok) {
            // Update UI
            const notificationElement = document.querySelector(`[onclick*="${notificationId}"]`);
            if (notificationElement) {
                notificationElement.classList.remove('unread');
                const dot = notificationElement.querySelector('.notification-unread-dot');
                if (dot) dot.remove();
            }
            
            // Update badge
            checkUnreadCount();
            
            // Navigate to related content
            if (relatedId) {
                navigateToRelatedContent(type, relatedId);
            }
        }
        
    } catch (error) {
        console.error('Error handling notification click:', error);
    }
}

// Navigate to related content
function navigateToRelatedContent(type, relatedId) {
    // Close notifications panel
    closeNotificationsPanel();
    
    switch (type) {
        case 'like':
        case 'comment':
        case 'execution':
        case 'execution_sheet_liked':
        case 'execution_sheet_commented':
        case 'execution_sheet_created':
        case 'execution_sheet_completed':
            showSection('executionsheets');
            // Try to navigate to specific execution sheet
            setTimeout(() => {
                if (typeof viewExecutionSheetDetails === 'function') {
                    viewExecutionSheetDetails(relatedId);
                }
            }, 500);
            break;
        case 'worksheet_added':
        case 'worksheet_deleted':
            showSection('worksheets');
            // Try to navigate to specific worksheet
            setTimeout(() => {
                if (typeof viewWorksheetDetails === 'function') {
                    viewWorksheetDetails(relatedId);
                }
            }, 500);
            break;
        case 'photo_uploaded':
        case 'video_uploaded':
        case 'photo_liked':
        case 'video_liked':
            showSection('executionsheets');
            // Try to navigate to specific execution sheet
            setTimeout(() => {
                if (typeof viewExecutionSheetDetails === 'function') {
                    viewExecutionSheetDetails(relatedId);
                }
            }, 500);
            break;
        case 'social_post_created':
        case 'social_post_liked':
        case 'social_post_commented':
            showSection('social');
            break;
        case 'user_registered':
        case 'user_suspended':
        case 'user_activated':
        case 'user_removed':
            showSection('users');
            break;
        case 'activity_started':
        case 'activity_completed':
            showSection('executionsheets');
            break;
        default:
            console.log('Unknown notification type for navigation:', type);
    }
}

// Close notifications panel
function closeNotificationsPanel() {
    const panel = document.getElementById('notificationsPanel');
    if (panel) {
        panel.remove();
        document.removeEventListener('click', handleClickOutside);
    }
}

// Handle click outside panel
function handleClickOutside(event) {
    const panel = document.getElementById('notificationsPanel');
    const toggle = document.getElementById('notificationsToggle');
    
    if (panel && !panel.contains(event.target) && !toggle.contains(event.target)) {
        closeNotificationsPanel();
    }
}

// Mark all notifications as read
async function markAllAsRead() {
    try {
        const response = await auth.fetch('/rest/notifications/mark-all-read', {
            method: 'POST'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Update UI
            const unreadItems = document.querySelectorAll('.notification-item.unread');
            unreadItems.forEach(item => {
                item.classList.remove('unread');
                const dot = item.querySelector('.notification-unread-dot');
                if (dot) dot.remove();
            });
            
            // Update badge
            updateNotificationBadge(0);
            
            // Show success message
            ui.showAlert(`${data.updatedCount} notificações marcadas como lidas`, 'success');
        }
        
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        ui.showAlert('Erro ao marcar notificações como lidas', 'error');
    }
}

// Clear all notifications
async function clearAllNotifications() {
    if (!confirm('Tem certeza que deseja apagar todas as notificações?')) {
        return;
    }
    
    try {
        const response = await auth.fetch('/rest/notifications/clear-all', {
            method: 'DELETE'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Update UI
            const notificationsList = document.getElementById('notificationsList');
            if (notificationsList) {
                notificationsList.innerHTML = `
                    <div class="no-notifications">
                        <i class="ri-notification-off-line"></i>
                        <p>Nenhuma notificação</p>
                    </div>
                `;
            }
            
            // Update badge
            updateNotificationBadge(0);
            
            // Show success message
            ui.showAlert(`${data.deletedCount} notificações apagadas`, 'success');
        }
        
    } catch (error) {
        console.error('Error clearing all notifications:', error);
        ui.showAlert('Erro ao apagar notificações', 'error');
    }
}

// Refresh notifications
async function refreshNotifications() {
    try {
        const response = await auth.fetch('/rest/notifications');
        if (response.ok) {
            const notifications = await response.json();
            notificationsCache = notifications;
            
            // Update panel if open
            const panel = document.getElementById('notificationsPanel');
            if (panel) {
                const list = document.getElementById('notificationsList');
                if (list) {
                    list.innerHTML = notifications.length === 0 ? `
                        <div class="no-notifications">
                            <i class="ri-notification-off-line"></i>
                            <p>Nenhuma notificação</p>
                        </div>
                    ` : notifications.map(notification => createNotificationItem(notification)).join('');
                }
            }
            
            // Update badge
            checkUnreadCount();
        }
    } catch (error) {
        console.error('Error refreshing notifications:', error);
    }
}

// Create real-time notification toast
function showNotificationToast(notification) {
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="${getNotificationIcon(notification.type)}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${notification.title}</div>
            <div class="toast-message">${notification.message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="ri-close-line"></i>
        </button>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
    
    // Update badge
    checkUnreadCount();
}

// Export functions for global access
window.initializeNotifications = initializeNotifications;
window.stopNotificationChecking = stopNotificationChecking;
window.toggleNotificationsPanel = toggleNotificationsPanel;
window.closeNotificationsPanel = closeNotificationsPanel;
window.markAllAsRead = markAllAsRead;
window.clearAllNotifications = clearAllNotifications;
window.refreshNotifications = refreshNotifications;
window.showNotificationToast = showNotificationToast;