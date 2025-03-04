// signalr-connection.js - Fixed version
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/tennisMatchmakerHub")
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000]) // Retry with backoff
    .configureLogging(signalR.LogLevel.Information)
    .build();

// Connection state
let isConnected = false;
let notificationCount = 0;
let originalTitle = document.title;

// Start the connection
async function startConnection() {
    try {
        if (connection.state === signalR.HubConnectionState.Disconnected) {
            await connection.start();
            console.log("SignalR Connected successfully.");
            isConnected = true;

            // Update connection status indicator if it exists
            const statusElement = document.getElementById("connection-status");
            if (statusElement) {
                statusElement.textContent = "Connected";
                statusElement.className = "text-green-500";
            }
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
    console.log("New message received:", message);

    // Update UI if in conversation view
    const messagesContainer = document.getElementById("messagesContainer");
    const conversationId = document.querySelector('input[name="conversationId"]')?.value;

    if (messagesContainer && message.conversationId === conversationId) {
        // Add message to conversation
        const isCurrentUser = message.senderId === currentUserId;

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

// Friend request handlers
connection.on("ReceiveFriendRequest", (request) => {
    console.log("Friend request received:", request);

    // Show notification
    showToast("Friend Request", `${request.senderName} sent you a friend request`);
    updateNotificationBadge();
    updateTitleNotification();
    playNotificationSound();
});

// Match invite handlers
connection.on("ReceiveMatchInvite", (invite) => {
    console.log("Match invite received:", invite);

    // Show notification
    showToast("Match Invitation", `${invite.senderName} invited you to a match`);
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
    console.log("Refreshing notifications");
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
    // Create container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col space-y-2 max-w-xs';
        document.body.appendChild(toastContainer);
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'bg-white rounded-lg shadow-lg border border-gray-200 p-3 transform translate-x-full transition-transform duration-300';
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

    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 10);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }, 5000);
}

// Start connection when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    // Save original title
    originalTitle = document.title;

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

// Global functions for message sending
window.sendDirectMessage = async (recipientId, message, conversationId) => {
    try {
        if (!isConnected) {
            await startConnection();
        }

        await connection.invoke("SendDirectMessage", recipientId, message, conversationId);
        return true;
    } catch (err) {
        console.error("Error sending direct message:", err);
        return false;
    }
};