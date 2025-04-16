// notification-labels.js - Complete updated version with deduplication
document.addEventListener('DOMContentLoaded', function () {
    const isOnSocialPage = window.location.pathname.includes('/Social');
    const newBadges = document.querySelectorAll('.new-badge');
    const notificationItems = document.querySelectorAll('.notification-item');

    // Store recently processed notifications to prevent duplicates
    const recentNotifications = new Map();

    // IMPORTANT: Always fetch the notification count on initial page load
    // This ensures the badge is correct on every page, not just after visiting Social
    if (!isOnSocialPage) {
        fetchNotificationCount();
    }

    // If we're on the social page, fade out the "New" labels after a delay
    if (isOnSocialPage && newBadges.length > 0) {
        console.log("Social page loaded, will remove 'New' labels after delay");

        setTimeout(() => {
            console.log("Removing 'New' labels");
            newBadges.forEach(badge => {
                badge.classList.add('fading');
                setTimeout(() => {
                    badge.classList.add('hidden');
                }, 500);
            });

            // Only reset if we've viewed all notifications
            if (notificationItems.length === newBadges.length) {
                fetchNotificationCount();
            }
        }, 3000); // 3 second delay before fading out
    }

    // If returning from social page, check if we need to refresh the notification count
    if (sessionStorage.getItem('refreshNotificationCount') === 'true') {
        sessionStorage.removeItem('refreshNotificationCount');
        fetchNotificationCount();
    }

    // Set up SignalR event handlers if connection exists
    setupSignalRHandlers();

    // Function to fetch the current notification count via AJAX
    function fetchNotificationCount() {
        console.log("Fetching notification count via AJAX");
        fetch('/Social/GetUnreadCount')
            .then(response => response.json())
            .then(data => {
                console.log("Notification count received:", data.count);
                window.updateNotificationBadge(data.count);
            })
            .catch(error => console.error('Error fetching notification count:', error));
    }

    // Standardized function to update notification badge
    window.updateNotificationBadge = function (count) {
        const notificationBadge = document.getElementById('notification-badge');
        const notificationCount = document.getElementById('notification-count');

        console.log("Updating notification badge with count:", count);

        if (notificationBadge && notificationCount) {
            // If count is specified, use it directly
            if (count !== undefined) {
                if (count > 0) {
                    notificationCount.textContent = count;
                    notificationBadge.classList.remove('hidden');
                } else {
                    notificationCount.textContent = '0';
                    notificationBadge.classList.add('hidden');
                }
            }
            // Otherwise, increment current count
            else {
                let currentCount = parseInt(notificationCount.textContent || '0') + 1;
                notificationCount.textContent = currentCount;
                notificationBadge.classList.remove('hidden');
            }

            // Add pulse animation for visual feedback
            notificationBadge.classList.add('pulse-animation');
            setTimeout(() => {
                notificationBadge.classList.remove('pulse-animation');
            }, 500);
        } else {
            console.warn("Notification badge elements not found");
        }
    };

    // Helper function to increment the notification badge count (convenience function)
    window.incrementNotificationBadge = function () {
        window.updateNotificationBadge(); // Calling without count will increment
    };

    // Notification dismiss function
    window.dismissNotification = function (notificationId) {
        console.log('Dismissing notification:', notificationId);

        const card = document.getElementById('notification-' + notificationId);
        if (!card) return;

        // Visual feedback
        card.style.opacity = '0.5';

        // Send the request to delete the notification
        fetch('/Social/DeleteNotification?notificationId=' + notificationId, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Animate out the card
                    card.style.opacity = '0';
                    card.style.transform = 'translateX(100%)';

                    // Remove after animation
                    setTimeout(() => {
                        card.remove();

                        // Check if container is empty
                        const container = document.getElementById('notifications-container');
                        if (container && container.children.length === 0) {
                            container.innerHTML = '<div class="bg-blue-50 text-blue-700 p-3 rounded-md">No notifications yet.</div>';
                        }

                        // Update notification count if not on social page
                        if (!isOnSocialPage) {
                            fetchNotificationCount();
                        }
                    }, 300);
                } else {
                    // Restore on error
                    card.style.opacity = '1';
                    card.style.transform = 'none';
                    console.error('Failed to dismiss notification:', data.message);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                // Restore on error
                card.style.opacity = '1';
                card.style.transform = 'none';
            });
    };

    // Set up handlers for SignalR events
    function setupSignalRHandlers() {
        // Check if SignalR connection exists
        if (typeof connection === 'undefined') {
            console.warn("SignalR connection not found - notification updates will rely on page refresh only");
            return;
        }

        console.log("Setting up SignalR notification handlers");

        // Handle RefreshNotifications event - reloads notification data
        connection.on("RefreshNotifications", function () {
            console.log("Received SignalR notification refresh event");
            if (!isOnSocialPage) {
                fetchNotificationCount();
            } else {
                console.log("On Social page, won't refresh notification count");
            }
        });

        // Handle general notifications with deduplication
        connection.on("ReceiveNotification", function (notification) {
            console.log("RECEIVED NOTIFICATION EVENT:", notification);

            // Create a deduplication key based on notification properties
            const dedupeKey = `notif_${notification.type}_${notification.relatedItemId || ''}_${new Date().getTime()}`;

            // Check if we've seen this notification recently (within 2 seconds)
            if (recentNotifications.has(dedupeKey)) {
                console.log("Ignoring duplicate notification:", dedupeKey);
                return;
            }

            // Add to recent notifications and clean up after 2 seconds
            recentNotifications.set(dedupeKey, true);
            setTimeout(() => recentNotifications.delete(dedupeKey), 2000);

            // Skip updating notifications if we're already on the Social page
            if (!isOnSocialPage) {
                window.incrementNotificationBadge();

                // Show toast for the notification
                const title = notification.title || getNotificationTitle(notification.type);
                const message = notification.message || "You have a new notification";
                showToast(title, message);
            } else {
                console.log("On Social page, not showing toast notification");
            }
        });

        // Handle message-specific notifications with deduplication
        connection.on("ReceiveMessage", function (message) {
            console.log("RECEIVED MESSAGE EVENT:", message);

            // Create a deduplication key based on message properties
            const dedupeKey = `msg_${message.senderId}_${message.conversationId}_${new Date().getTime()}`;

            // Check if we've seen this message recently
            if (recentNotifications.has(dedupeKey)) {
                console.log("Ignoring duplicate message notification:", dedupeKey);
                return;
            }

            // Add to recent notifications and clean up after 2 seconds
            recentNotifications.set(dedupeKey, true);
            setTimeout(() => recentNotifications.delete(dedupeKey), 2000);

            // If not in the conversation view for this specific conversation, show notification
            const conversationId = document.querySelector('input[name="conversationId"]')?.value;

            if (!conversationId || message.conversationId !== conversationId) {
                if (!isOnSocialPage) {
                    window.incrementNotificationBadge();
                    const sender = message.senderName || "Someone";
                    showToast("New Message", `${sender}: ${message.content}`);
                }
            }
        });

        // Handle friend request notifications with deduplication
        connection.on("ReceiveFriendRequest", function (request) {
            console.log("RECEIVED FRIEND REQUEST EVENT:", request);

            // Create a deduplication key
            const dedupeKey = `friend_${request.senderId}_${new Date().getTime()}`;

            // Check for duplicates
            if (recentNotifications.has(dedupeKey)) {
                console.log("Ignoring duplicate friend request:", dedupeKey);
                return;
            }

            // Add to recent notifications
            recentNotifications.set(dedupeKey, true);
            setTimeout(() => recentNotifications.delete(dedupeKey), 2000);

            if (!isOnSocialPage) {
                window.incrementNotificationBadge();
                const sender = request.senderName || "Someone";
                showToast("Friend Request", `${sender} sent you a friend request`);
            }
        });

        // Apply similar deduplication to other notification types
        // Other event handlers remain the same
        connection.on("ReceiveMatchNotification", function (notification) {
            console.log("RECEIVED MATCH NOTIFICATION EVENT:", notification);

            // Deduplication logic
            const dedupeKey = `match_${notification.relatedItemId || ''}_${new Date().getTime()}`;
            if (recentNotifications.has(dedupeKey)) {
                console.log("Ignoring duplicate match notification");
                return;
            }
            recentNotifications.set(dedupeKey, true);
            setTimeout(() => recentNotifications.delete(dedupeKey), 2000);

            if (!isOnSocialPage) {
                window.incrementNotificationBadge();
                const title = notification.title || "Match Update";
                const message = notification.message || "There's an update to one of your matches";
                showToast(title, message);
            }
        });

        connection.on("ReceiveTournamentNotification", function (notification) {
            console.log("RECEIVED TOURNAMENT NOTIFICATION EVENT:", notification);

            // Deduplication logic
            const dedupeKey = `tournament_${notification.relatedItemId || ''}_${new Date().getTime()}`;
            if (recentNotifications.has(dedupeKey)) return;
            recentNotifications.set(dedupeKey, true);
            setTimeout(() => recentNotifications.delete(dedupeKey), 2000);

            if (!isOnSocialPage) {
                window.incrementNotificationBadge();
                const title = notification.title || "Tournament Update";
                const message = notification.message || "There's an update to one of your tournaments";
                showToast(title, message);
            }
        });

        connection.on("ReceiveLadderNotification", function (notification) {
            console.log("RECEIVED LADDER NOTIFICATION EVENT:", notification);

            // Deduplication logic
            const dedupeKey = `ladder_${notification.relatedItemId || ''}_${new Date().getTime()}`;
            if (recentNotifications.has(dedupeKey)) return;
            recentNotifications.set(dedupeKey, true);
            setTimeout(() => recentNotifications.delete(dedupeKey), 2000);

            if (!isOnSocialPage) {
                window.incrementNotificationBadge();
                const title = notification.title || "Ladder Update";
                const message = notification.message || "There's an update to one of your ladders";
                showToast(title, message);
            }
        });
    }

    // Helper function to get a friendly title based on notification type
    function getNotificationTitle(type) {
        if (!type) return "Notification";

        if (type.startsWith("friend_")) return "Friend Update";
        if (type.startsWith("message")) return "New Message";
        if (type.startsWith("match_")) return "Match Update";
        if (type.startsWith("tournament_")) return "Tournament Update";
        if (type.startsWith("ladder_")) return "Ladder Update";

        return "Notification";
    }

