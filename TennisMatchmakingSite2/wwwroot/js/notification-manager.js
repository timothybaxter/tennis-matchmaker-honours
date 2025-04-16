(function () {
    // Track processed notifications to prevent duplicates
    const processedNotifications = new Map();
    let isInitialized = false;

    // Debug flag - set to true for verbose logging
    const DEBUG = true;

    function log(...args) {
        if (DEBUG) console.log("[NotificationManager]", ...args);
    }

    // Initialize when document is ready
    document.addEventListener('DOMContentLoaded', function () {
        initNotificationSystem();
    });

    // Initialize the notification system
    function initNotificationSystem() {
        log("Initializing notification system");

        if (isInitialized) {
            log("Already initialized, skipping");
            return;
        }

        // Function to fetch notification count via AJAX
        function fetchNotificationCount() {
            log("Fetching notification count");
            fetch('/Social/GetUnreadCount')
                .then(response => response.json())
                .then(data => {
                    log("Notification count received:", data.count);
                    updateNotificationBadge(data.count);
                })
                .catch(error => console.error('Error fetching notification count:', error));
        }

        // Initial fetch of notification count if not on Social page
        const isOnSocialPage = window.location.pathname.includes('/Social');
        if (!isOnSocialPage) {
            fetchNotificationCount();
        }

        // Make sure we have a SignalR connection
        if (typeof connection === 'undefined') {
            console.error("SignalR connection is not defined - notifications won't work");
            return;
        }

        // Wait for SignalR connection to be established
        function setupHandlers() {
            if (connection.state === signalR.HubConnectionState.Connected) {
                registerSignalRHandlers();
            } else {
                log("SignalR not connected yet, waiting...");
                // Try again after a short delay
                setTimeout(setupHandlers, 1000);
            }
        }

        // Start the setup process
        setupHandlers();

        // Set the initialization flag
        isInitialized = true;
    }

    // Register all SignalR event handlers
    function registerSignalRHandlers() {
        log("Registering SignalR handlers");

        // Remove existing handlers to prevent duplicates
        connection.off("ReceiveMessage");
        connection.off("ReceiveNotification");
        connection.off("ReceiveFriendRequest");

        // Message notifications and conversation updates
        connection.on("ReceiveMessage", function (message) {
            log("RECEIVED MESSAGE:", message);

            // Create a deduplication key
            const dedupeKey = `msg_${message.senderId}_${Date.now()}`;

            // Skip if already processed
            if (processedNotifications.has(dedupeKey)) {
                log("Duplicate message notification ignored");
                return;
            }

            // Mark as processed
            processedNotifications.set(dedupeKey, new Date());
            setTimeout(() => processedNotifications.delete(dedupeKey), 5000);

            // Check if we're in a conversation view
            const messagesContainer = document.getElementById("messagesContainer");
            const conversationId = document.querySelector('input[name="conversationId"]')?.value;

            // IMPORTANT: Update conversation view if this message belongs to current conversation
            if (messagesContainer && message.conversationId === conversationId) {
                log("Adding message to active conversation view");

                // Get current user ID for determining message alignment
                const currentUserId = getCurrentUserId();
                const isCurrentUser = message.senderId === currentUserId;

                // Create message element
                const messageDiv = document.createElement("div");
                messageDiv.className = `flex ${isCurrentUser ? "justify-end" : "justify-start"}`;
                messageDiv.setAttribute('data-message-id', message.id || Date.now());

                messageDiv.innerHTML = `
                    <div class="max-w-xs sm:max-w-md ${isCurrentUser ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"} p-3 rounded-lg">
                        <div class="text-sm font-medium">
                            ${isCurrentUser ? "You" : (message.senderName || "User")}
                        </div>
                        <div class="mt-1">${message.content}</div>
                        <div class="text-xs text-gray-500 mt-1 text-right">
                            ${new Date(message.timestamp).toLocaleString()}
                        </div>
                    </div>
                `;

                // Add to container and scroll
                messagesContainer.appendChild(messageDiv);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                return; // Don't show notification for messages in active conversation
            }

            // If not in the active conversation, show notification
            if (!window.location.pathname.includes('/Social/Conversation') || conversationId !== message.conversationId) {
                log("Showing notification for message from another conversation");
                incrementNotificationBadge();

                // FIXED: Check if content already includes sender name to avoid duplication
                let notificationContent = message.content;
                const senderPrefix = `${message.senderName}: `;

                // If the content already starts with the sender's name, don't prepend it again
                if (!notificationContent.startsWith(senderPrefix)) {
                    notificationContent = senderPrefix + notificationContent;
                }

                showToast("New Message", notificationContent);
            }
        });

        // General notifications
        connection.on("ReceiveNotification", function (notification) {
            log("RECEIVED NOTIFICATION:", notification);

            // Deduplication logic
            const dedupeKey = `notif_${notification.type}_${Date.now()}`;
            if (processedNotifications.has(dedupeKey)) {
                log("Duplicate general notification ignored");
                return;
            }

            processedNotifications.set(dedupeKey, new Date());
            setTimeout(() => processedNotifications.delete(dedupeKey), 5000);

            // Don't show notifications on Social page (they'll be marked read)
            if (window.location.pathname.includes('/Social/Index')) {
                log("On Social page, not showing notification");
                return;
            }

            // Show notification
            incrementNotificationBadge();
            showToast(notification.title || "Notification", notification.message);
        });

        // Friend request notifications
        connection.on("ReceiveFriendRequest", function (request) {
            log("RECEIVED FRIEND REQUEST:", request);

            // Deduplication logic
            const dedupeKey = `friend_${request.senderId}_${Date.now()}`;
            if (processedNotifications.has(dedupeKey)) {
                log("Duplicate friend request ignored");
                return;
            }

            processedNotifications.set(dedupeKey, new Date());
            setTimeout(() => processedNotifications.delete(dedupeKey), 5000);

            // Don't show notifications on Social page
            if (window.location.pathname.includes('/Social')) {
                log("On Social page, not showing friend notification");
                return;
            }

            // Show notification
            incrementNotificationBadge();
            showToast("Friend Request", `${request.senderName} sent you a friend request`);
        });

        log("✅ SignalR notification handlers registered successfully");
    }

    // Function to update notification badge with a specific count
    function updateNotificationBadge(count) {
        const notificationBadge = document.getElementById('notification-badge');
        const notificationCount = document.getElementById('notification-count');

        log("Updating notification badge with count:", count);

        if (!notificationBadge || !notificationCount) {
            console.error("Notification badge elements not found in DOM");
            return;
        }

        if (count > 0) {
            notificationCount.textContent = count;
            notificationBadge.classList.remove('hidden');

            // Add animation
            notificationBadge.classList.add('pulse-animation');
            setTimeout(() => {
                notificationBadge.classList.remove('pulse-animation');
            }, 500);
        } else {
            notificationCount.textContent = '0';
            notificationBadge.classList.add('hidden');
        }
    }

    // Function to increment notification badge
    function incrementNotificationBadge() {
        const notificationBadge = document.getElementById('notification-badge');
        const notificationCount = document.getElementById('notification-count');

        if (!notificationBadge || !notificationCount) {
            console.error("Notification badge elements not found in DOM");
            return;
        }

        const currentCount = parseInt(notificationCount.textContent || '0');
        updateNotificationBadge(currentCount + 1);

        log("Incremented notification badge to", currentCount + 1);
    }

    // Toast notification function
    function showToast(title, message) {
        log("Showing toast:", title, message);

        // Find or create toast container
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col space-y-2 max-w-xs';
            document.body.appendChild(toastContainer);
            log("Created new toast container");
        }

        // Create toast
        const toast = document.createElement('div');
        toast.className = 'bg-white rounded-lg shadow-lg border border-gray-200 p-3 pointer-events-auto transform transition-all duration-300 ease-in-out';
        toast.innerHTML = `
            <div class="flex items-start">
                <div class="flex-shrink-0 text-green-500 mr-2">
                    <i class="fas fa-bell"></i>
                </div>
                <div class="flex-1">
                    <div class="font-medium">${title}</div>
                    <div class="text-sm text-gray-600">${message}</div>
                </div>
                <button class="ml-2 text-gray-400 hover:text-gray-600" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Add with animation
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toastContainer.appendChild(toast);

        // Trigger animation
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';

            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }, 5000);
    }

    // Export functions to global scope
    window.updateNotificationBadge = updateNotificationBadge;
    window.incrementNotificationBadge = incrementNotificationBadge;
    window.showToast = showToast;
})();