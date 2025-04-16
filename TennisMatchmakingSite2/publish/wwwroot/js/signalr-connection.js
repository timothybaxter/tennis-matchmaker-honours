
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

// Build the connection with explicit querystring for user identification
const userId = getCurrentUserId() || sessionStorage.getItem('userId') || '';
const connectionUrl = '/tennisMatchmakerHub' + (userId ? `?userId=${userId}` : '');

const connection = new signalR.HubConnectionBuilder()
    .withUrl(connectionUrl, {
        // Add logging query parameter
        withCredentials: true, // Use credentials (cookies/session)
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling, // Try WebSockets first, fallback to long polling
        skipNegotiation: false, // Don't skip negotiation
        accessTokenFactory: () => {
            // Try to get JWT token for authorization
            const token = sessionStorage.getItem('JWTToken');
            if (token) {
                console.log("Using token from session storage for SignalR connection");
                return token;
            }
            return null;
        }
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000]) // Retry with backoff
    .configureLogging(signalR.LogLevel.Information)
    .build();

// Connection state
let isConnected = false;
let connectionStartPromise = null;
let isConnecting = false;
let connectionStatus = "disconnected"; // disconnected, connecting, connected, reconnecting

// Add a global window function to display notifications (for testing)
window.displayTestNotification = function (title, message) {
    console.log("Test notification triggered:", title, message);
    if (typeof window.showToast === 'function') {
        window.showToast(title, message);
    } else {
        alert(`${title}: ${message}`);
    }
    return "Toast displayed";
};

// Improved connection function with promise caching
async function startConnection() {
    // If already connecting, return the existing promise
    if (isConnecting && connectionStartPromise) {
        console.log("Connection already in progress, reusing promise");
        return connectionStartPromise;
    }

    // If already connected, just return a resolved promise
    if (connection.state === signalR.HubConnectionState.Connected) {
        console.log("Connection already established");
        connectionStatus = "connected";
        updateConnectionStatus("Connected", "text-green-500");
        return Promise.resolve();
    }

    // Start a new connection attempt
    isConnecting = true;
    connectionStatus = "connecting";
    console.log("Starting new connection attempt...");
    updateConnectionStatus("Connecting...", "text-yellow-500");

    // Create a new promise to track this connection attempt
    connectionStartPromise = new Promise((resolve, reject) => {
        connection.start()
            .then(() => {
                console.log("SignalR Connected successfully!");
                isConnected = true;
                connectionStatus = "connected";
                updateConnectionStatus("Connected", "text-green-500");

                // Add user to their user group for more reliable targeting
                const userId = getCurrentUserId();
                if (userId) {
                    console.log(`Joining user group: user_${userId}`);
                    // No direct way to add to group from client, but the hub will handle this
                }

                isConnecting = false;
                resolve();
            })
            .catch(err => {
                console.error("SignalR Connection failed: ", err);
                isConnected = false;
                connectionStatus = "disconnected";
                updateConnectionStatus("Disconnected", "text-red-500");
                isConnecting = false;
                reject(err);

                // Schedule reconnect
                setTimeout(() => {
                    connectionStartPromise = null; // Clear the failed promise
                    console.log("Attempting reconnection after failure...");
                    startConnection();
                }, 5000);
            });
    });

    return connectionStartPromise;
}

// Helper function to update the connection status UI
function updateConnectionStatus(text, className) {
    const statusElement = document.getElementById("connection-status");
    if (statusElement) {
        statusElement.textContent = text;

        // Remove all color classes and add the new one
        statusElement.className = className;
    }

    // Also update the tooltip/hover text for more detail
    const indicatorElement = document.getElementById("connection-status-indicator");
    if (indicatorElement) {
        if (connection.connectionId) {
            indicatorElement.title = `Connected (ID: ${connection.connectionId})`;
        } else {
            indicatorElement.title = `${text} - Last attempt: ${new Date().toLocaleTimeString()}`;
        }
    }
}

// Connection event handlers
connection.onclose(async error => {
    console.log("SignalR Connection closed:", error);
    isConnected = false;
    connectionStatus = "disconnected";
    updateConnectionStatus("Disconnected", "text-red-500");

    // Log detailed diagnostics
    console.log("Close reason:", error?.message || "Unknown");
    console.log("Connection state at close:", connection.state);
    console.log("Connection ID at close:", connection.connectionId || "None");

    // Update UI indicators
    if (document.getElementById('debug-last-event')) {
        document.getElementById('debug-last-event').textContent = `Connection closed: ${error?.message || 'Unknown reason'}`;
    }

    // Schedule restart after a short delay
    console.log("Scheduling connection restart after closure...");
    setTimeout(() => {
        connectionStartPromise = null; // Clear any existing promises
        console.log("Attempting to restart connection after closure...");
        startConnection().catch(err => {
            console.error("Failed to restart connection after closure:", err);
        });
    }, 3000);
});

connection.onreconnecting(error => {
    console.log("SignalR Connection reconnecting:", error);
    isConnected = false;
    connectionStatus = "reconnecting";
    updateConnectionStatus("Reconnecting...", "text-yellow-500");

    // Log detailed info
    console.log(`Connection state: ${connection.state}`);
    console.log(`Connection ID: ${connection.connectionId || 'None'}`);
    console.log(`Last error: ${error?.message || 'Unknown'}`);

    // Update any UI indicators
    if (document.getElementById('debug-last-event')) {
        document.getElementById('debug-last-event').textContent = `Reconnecting: ${error?.message}`;
    }
});

connection.onreconnected(connectionId => {
    console.log("SignalR Connection reconnected with ID:", connectionId);
    isConnected = true;
    connectionStatus = "connected";
    updateConnectionStatus("Connected", "text-green-500");

    // Force joining the user group again
    const userId = getCurrentUserId();
    if (userId) {
        connection.invoke("JoinUserGroup", userId)
            .then(() => console.log(`Rejoined user group user_${userId} after reconnection`))
            .catch(err => console.error(`Error rejoining user group: ${err.message}`));
    }

    // Update any UI indicators
    if (document.getElementById('debug-last-event')) {
        document.getElementById('debug-last-event').textContent = `Reconnected: ${new Date().toLocaleTimeString()}`;
    }
});

// Start connection when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log("Document ready, initializing SignalR connection...");
    console.log("Current user ID:", getCurrentUserId());

    // Start connection
    startConnection().catch(err => {
        console.error("Initial connection attempt failed:", err);
    });

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
        console.log("SENDING DIRECT MESSAGE:", { recipientId, message, conversationId });

        if (connection.state !== signalR.HubConnectionState.Connected) {
            console.log("Connection not established, connecting...");
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

        if (connection.state !== signalR.HubConnectionState.Connected) {
            console.log("Connection not established, connecting...");
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

        if (connection.state !== signalR.HubConnectionState.Connected) {
            console.log("Connection not established, connecting...");
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
window.checkSignalRConnection = function () {
    return {
        connectionState: connection.state,
        statusText: connectionStatus,
        isConnected: isConnected,
        connectionId: connection.connectionId,
        userId: getCurrentUserId(),
        reconnectAttempts: connection.reconnectRetryCount || 0,
        serverTimeoutInMs: connection.serverTimeoutInMilliseconds,
        lastMessageAt: connection.lastMessageAt || 'Never',
        groups: [`user_${getCurrentUserId()}`]
    };
};

// Add a manual test function directly accessible from browser console
window.testSignalRConnection = async function () {
    try {
        await startConnection();
        console.log("SignalR connection test successful");
        return {
            success: true,
            connectionId: connection.connectionId,
            state: connection.state
        };
    } catch (error) {
        console.error("SignalR connection test failed:", error);
        return {
            success: false,
            error: error.message
        };
    }
};