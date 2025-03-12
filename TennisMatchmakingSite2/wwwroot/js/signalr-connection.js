// signalr-connection.js - Enhanced logging version with fixed variable references
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/tennisMatchmakerHub")
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000]) // Retry with backoff
    .configureLogging(signalR.LogLevel.Information)
    .build();

// Connection state
let isConnected = false;
let notificationCount = 0;
let originalTitle = document.title;

// Add a global window function to display notifications (for testing)
window.displayTestNotification = function (title, message) {
    console.log("Test notification triggered:", title, message);
    showToast(title, message);
    return "Toast displayed";
};

// Helper function to safely get the current user ID
function getCurrentUserId() {
    // Try to get it from window
    if (window.currentUserId) {
        return window.currentUserId;
    }

    // Try to get it from data attribute
    const dataElement = document.querySelector('[data-current-user-id]');
    if (dataElement) {
        return dataElement.getAttribute('data-current-user-id');
    }

    // Try to get it from session storage as fallback
    return sessionStorage.getItem('userId');
}

// Start the connection
async function startConnection() {
    try {
        if (connection.state === signalR.HubConnectionState.Disconnected) {
            console.log("Attempting to establish SignalR connection...");
            await connection.start();
            console.log("SignalR Connected successfully.");
            isConnected = true;

            // Update connection status indicator if it exists
            const statusElement = document.getElementById("connection-status");
            if (statusElement) {
                statusElement.textContent = "Connected";
                statusElement.className = "text-green-500";
            }

            // Log registered handlers
            console.log("Connection has these handlers registered:",
                "ReceiveMessage", "MessageSent", "MessageFailed",
                "ReceiveFriendRequest", "FriendRequestSent", "FriendRequestFailed",
                "ReceiveMatchInvite", "ReceiveNotification");
        }
    } catch (err) {
        console.error("SignalR Connection failed: ", err);
        isConnected = false;

        // Update connection status indicator if it exists
        const statusElement = document.getElementById("connection-status");
        if (statusElement) {
            statusElement.textContent = "Disconnected";
            statusElement.className = "text-red-500";
        }

        // Try to reconnect in 5 seconds
        setTimeout(startConnection, 5000);
    }
}

// Connection event handlers
connection.onclose(async () => {
    console.log("SignalR Connection closed.");
    isConnected = false;

    // Update connection status indicator if it exists
    const statusElement = document.getElementById("connection-status");
    if (statusElement) {
        statusElement.textContent = "Disconnected";
        statusElement.className = "text-red-500";
    }

    await startConnection();
});

connection.onreconnecting(error => {
    console.log("SignalR Connection reconnecting:", error);
    isConnected = false;

    // Update connection status indicator if it exists
    const statusElement = document.getElementById("connection-status");
    if (statusElement) {
        statusElement.textContent = "Reconnecting...";
        statusElement.className = "text-yellow-500";
    }
});

connection.onreconnected(connectionId => {
    console.log("SignalR Connection reconnected with ID:", connectionId);
    isConnected = true;

    // Update connection status indicator if it exists
    const statusElement = document.getElementById("connection-status");
    if (statusElement) {
        statusElement.textContent = "Connected";
        statusElement.className = "text-green-500";
    }
});

// Handle incoming messages
connection.on("ReceiveMessage", (message) => {
    console.log("RECEIVED MESSAGE:", message);

    // Update UI if in conversation view
    const messagesContainer = document.getElementById("messagesContainer");
    const conversationId = document.querySelector('input[name="conversationId"]')?.value;

    if (messagesContainer && message.conversationId === conversationId) {
        // Add message to conversation
        const userId = getCurrentUserId();
        const isCurrentUser = message.senderId === userId;

        const messageDiv = document.createElement("div");
        messageDiv.className = `flex ${isCurrentUser ? "justify-end" : "justify-start"} mb-3`;

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

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } else {
        // Show notification for new message
        showToast("New Message", `${message.senderName} sent you a message`);
        updateNotificationBadge();
        updateTitleNotification();
    }

    // Play notification sound
    playNotificationSound();
});

// Message status handlers
connection.on("MessageSent", (message) => {
    console.log("MESSAGE SENT SUCCESSFULLY:", message);
});

connection.on("MessageFailed", (error) => {
    console.error("MESSAGE FAILED:", error);
});

// Friend request handlers
connection.on("ReceiveFriendRequest", (request) => {
    console.log("FRIEND REQUEST RECEIVED:", request);

    try {
        // Show notification
        showToast("Friend Request", `${request.senderName || 'Someone'} sent you a friend request`);
        updateNotificationBadge();
        updateTitleNotification();
        playNotificationSound();

        // If on friend requests page, update the UI
        const requestsContainer = document.querySelector('.space-y-4');
        if (requestsContainer && window.location.href.includes("/Social/FriendRequests")) {
            // Refresh the page to show new request
            window.location.reload();
        }

        console.log("Friend request notification displayed successfully");
    } catch (error) {
        console.error("Error displaying friend request notification:", error);
    }
});

connection.on("FriendRequestSent", (request) => {
    console.log("FRIEND REQUEST SENT:", request);
});

connection.on("FriendRequestFailed", (error) => {
    console.error("FRIEND REQUEST FAILED:", error);
});

// Match invite handlers
connection.on("ReceiveMatchInvite", (invite) => {
    console.log("MATCH INVITE RECEIVED:", invite);

    // Show notification
    showToast("Match Invitation", `${invite.senderName} invited you to a match`);
    updateNotificationBadge();
    updateTitleNotification();
    playNotificationSound();
});

// General notification handler
connection.on("ReceiveNotification", (notification) => {
    console.log("NOTIFICATION RECEIVED:", notification);

    // Show notification based on type
    showToast(notification.type || "Notification", notification.message || "You have a new notification");
    updateNotificationBadge();
    updateTitleNotification();
    playNotificationSound();
});

// User online/offline status
connection.on("UserOnline", (userId) => {
    console.log("User online:", userId);
    // Update UI to show user is online
    updateFriendStatus(userId, true);
});

connection.on("UserOffline", (userId) => {
    console.log("User offline:", userId);
    // Update UI to show user is offline
    updateFriendStatus(userId, false);
});

// Method to refresh notifications
connection.on("RefreshNotifications", () => {
    console.log("REFRESHING NOTIFICATIONS");
    // Reload notifications page if we're on it
    if (window.location.href.includes("/Social/Index")) {
        window.location.reload();
    }
});

// Helper functions
function updateFriendStatus(userId, isOnline) {
    const friendElements = document.querySelectorAll(`[data-friend-id="${userId}"]`);
    friendElements.forEach(element => {
        const statusIndicator = element.querySelector(".status-indicator");
        if (statusIndicator) {
            statusIndicator.className = `status-indicator w-3 h-3 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-400"}`;
            statusIndicator.title = isOnline ? "Online" : "Offline";
        }
    });
}

function updateTitleNotification() {
    // Only update if not in active tab
    if (!document.hasFocus()) {
        notificationCount++;
        document.title = `(${notificationCount}) ${originalTitle}`;
    }
}

// Reset notification count when tab becomes active
window.addEventListener('focus', () => {
    notificationCount = 0;
    document.title = originalTitle;
});

function playNotificationSound() {
    const audio = document.getElementById("notification-sound");
    if (audio) {
        audio.play().catch(err => {
            console.log('Could not play notification sound:', err);
        });
    }
}

function updateNotificationBadge() {
    const notificationBadge = document.getElementById("notification-badge");
    if (notificationBadge) {
        // Get current count or default to 0
        const currentCount = parseInt(notificationBadge.textContent || '0');
        // Increment and update
        notificationBadge.textContent = currentCount + 1;
        notificationBadge.classList.remove("hidden");
    }
}

// Toast notification function
function showToast(title, message) {
    console.log("Showing toast:", title, message);

    // Create container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col space-y-2 max-w-xs';
        document.body.appendChild(toastContainer);
        console.log("Created toast container");
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'bg-white rounded-lg shadow-lg border border-gray-200 p-3';
    toast.style.transform = 'translateX(0)'; // Override the transform initially
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

    // Add to container
    toastContainer.appendChild(toast);
    console.log("Toast appended to container");

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
            console.log("Toast auto-removed after timeout");
        }
    }, 5000);
}

// Start connection when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    // Save original title
    originalTitle = document.title;
    console.log("Document ready, initializing SignalR connection...");
    console.log("Current user ID:", getCurrentUserId());

    // Check if the showToast function is accessible
    if (typeof showToast === 'function') {
        console.log("showToast function is accessible");
        // Try displaying a test toast on page load
        setTimeout(() => {
            showToast("Page Load Test", "This is a test notification on page load");
            console.log("Page load test toast triggered");
        }, 2000);
    } else {
        console.error("showToast function is NOT accessible");
    }

    // Start connection
    startConnection();

    // Add notification sound if not already present
    if (!document.getElementById('notification-sound')) {
        const audio = document.createElement('audio');
        audio.id = 'notification-sound';
        audio.src = '/sounds/notification.mp3';
        audio.preload = 'auto';
        document.body.appendChild(audio);
    }
});

// Global functions for message sending with enhanced logging
window.sendDirectMessage = async (recipientId, message, conversationId) => {
    try {
        console.log("SENDING DIRECT MESSAGE:", { recipientId, message, conversationId });

        if (!isConnected) {
            console.log("Connection not established, reconnecting...");
            await startConnection();
        }

        if (!recipientId || !message || !conversationId) {
            console.error("Missing required parameters:", { recipientId, message, conversationId });
            return false;
        }

        await connection.invoke("SendDirectMessage", recipientId, message, conversationId);
        console.log("Direct message invocation successful");
        return true;
    } catch (err) {
        console.error("Error sending direct message:", err);
        return false;
    }
};

window.sendFriendRequest = async (recipientId) => {
    try {
        console.log("SENDING FRIEND REQUEST to:", recipientId);

        if (!isConnected) {
            console.log("Connection not established, reconnecting...");
            await startConnection();
        }

        if (!recipientId) {
            console.error("Missing recipient ID for friend request");
            return false;
        }

        await connection.invoke("SendFriendRequest", recipientId);
        console.log("Friend request sent successfully");
        return true;
    } catch (err) {
        console.error("Error sending friend request:", err);
        return false;
    }
};

window.sendMatchInvite = async (recipientId, matchId) => {
    try {
        console.log("SENDING MATCH INVITE:", { recipientId, matchId });

        if (!isConnected) {
            console.log("Connection not established, reconnecting...");
            await startConnection();
        }

        if (!recipientId || !matchId) {
            console.error("Missing required parameters for match invite:", { recipientId, matchId });
            return false;
        }

        await connection.invoke("SendMatchInvite", recipientId, matchId);
        console.log("Match invite sent successfully");
        return true;
    } catch (err) {
        console.error("Error sending match invite:", err);
        return false;
    }
};

// Debug function to test the connection
window.testSignalR = () => {
    console.log("SignalR connection state:", connection.state);
    console.log("Is connected (local variable):", isConnected);
    console.log("Current user ID:", getCurrentUserId());

    // Try displaying a test toast directly
    showToast("Test Notification", "This is from the testSignalR function");
    console.log("Test toast triggered from testSignalR");

    return {
        state: connection.state,
        isConnected: isConnected,
        connectionId: connection.connectionId,
        userId: getCurrentUserId()
    };
};

// Add a manual test function directly accessible from browser console
window.testToast = () => {
    showToast("Manual Test", "This is a manually triggered test notification");
    return "Manual test toast triggered";
};