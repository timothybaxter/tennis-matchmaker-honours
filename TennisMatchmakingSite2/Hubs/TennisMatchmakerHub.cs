using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System;

namespace TennisMatchmakingSite2.Hubs
{
    public class TennisMatchmakerHub : Hub
    {
        private static readonly ConcurrentDictionary<string, string> _userConnections = new ConcurrentDictionary<string, string>();
        private readonly ILogger<TennisMatchmakerHub> _logger;

        public TennisMatchmakerHub(ILogger<TennisMatchmakerHub> logger)
        {
            _logger = logger;
        }

        public override async Task OnConnectedAsync()
        {
            try
            {
                string userId = Context.GetHttpContext().Session.GetString("UserId");
                string userName = Context.GetHttpContext().Session.GetString("UserName");

                _logger.LogInformation($"SignalR connection attempt - User ID: {userId ?? "null"}, Name: {userName ?? "Unknown"}, Connection ID: {Context.ConnectionId}");

                if (!string.IsNullOrEmpty(userId))
                {
                    // Store the connection
                    _userConnections.TryAdd(userId, Context.ConnectionId);
                    _logger.LogInformation($"User {userId} ({userName}) connected with connection ID: {Context.ConnectionId}");

                    // Add the user to their own user group for easier targeting
                    await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");

                    // Notify friends that this user is online
                    await Clients.Others.SendAsync("UserOnline", userId);
                }
                else
                {
                    _logger.LogWarning($"Connection attempted without valid UserId in session. Connection ID: {Context.ConnectionId}");
                }

                await base.OnConnectedAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in OnConnectedAsync");
                throw;
            }
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            try
            {
                string userId = Context.GetHttpContext().Session.GetString("UserId");
                if (!string.IsNullOrEmpty(userId))
                {
                    // Remove the connection
                    _userConnections.TryRemove(userId, out _);
                    _logger.LogInformation($"User {userId} disconnected. Connection ID: {Context.ConnectionId}");

                    // Remove from user group
                    await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user_{userId}");

                    // Notify friends that this user is offline
                    await Clients.Others.SendAsync("UserOffline", userId);
                }

                await base.OnDisconnectedAsync(exception);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in OnDisconnectedAsync");
                throw;
            }
        }

        public async Task SendDirectMessage(string recipientId, string message, string conversationId)
        {
            try
            {
                string senderId = Context.GetHttpContext().Session.GetString("UserId");
                string senderName = Context.GetHttpContext().Session.GetString("UserName");

                if (string.IsNullOrEmpty(senderId))
                {
                    _logger.LogWarning("Attempted to send message without a valid user ID");
                    await Clients.Caller.SendAsync("MessageFailed", new { error = "Not authenticated" });
                    return;
                }

                if (string.IsNullOrEmpty(recipientId))
                {
                    _logger.LogWarning($"User {senderId} attempted to send message with empty recipient ID");
                    await Clients.Caller.SendAsync("MessageFailed", new { error = "Recipient ID is required" });
                    return;
                }

                if (string.IsNullOrEmpty(conversationId))
                {
                    _logger.LogWarning($"User {senderId} attempted to send message with empty conversation ID");
                    await Clients.Caller.SendAsync("MessageFailed", new { error = "Conversation ID is required" });
                    return;
                }

                _logger.LogInformation($"Processing direct message from {senderId} ({senderName}) to {recipientId} in conversation {conversationId}");

                // Create a message object with more information
                var messageObj = new
                {
                    senderId,
                    senderName,
                    recipientId,
                    content = message,
                    conversationId,
                    timestamp = DateTime.UtcNow
                };

                // Try both ways to reach the recipient - by connection ID and by group
                bool sentDirectly = false;
                if (_userConnections.TryGetValue(recipientId, out string connectionId))
                {
                    _logger.LogInformation($"Sending real-time message to user {recipientId} with connection {connectionId}");
                    await Clients.Client(connectionId).SendAsync("ReceiveMessage", messageObj);
                    sentDirectly = true;
                }

                // Also send to the user's group (more reliable in some scenarios)
                await Clients.Group($"user_{recipientId}").SendAsync("ReceiveMessage", messageObj);
                _logger.LogInformation($"Sent message to group user_{recipientId}");

                // Also send back to sender for immediate UI update
                await Clients.Caller.SendAsync("MessageSent", messageObj);

                _logger.LogInformation($"Message delivery status: {(sentDirectly ? "Sent directly and to group" : "Sent to group only")}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending direct message");
                // Notify sender of failure
                await Clients.Caller.SendAsync("MessageFailed", new { error = "Server error: " + ex.Message });
            }
        }

        public async Task SendFriendRequest(string recipientId)
        {
            try
            {
                string senderId = Context.GetHttpContext().Session.GetString("UserId");
                string senderName = Context.GetHttpContext().Session.GetString("UserName");

                if (string.IsNullOrEmpty(senderId))
                {
                    _logger.LogWarning("Attempted to send friend request without a valid user ID");
                    await Clients.Caller.SendAsync("FriendRequestFailed", new { error = "Not authenticated" });
                    return;
                }

                if (string.IsNullOrEmpty(recipientId))
                {
                    _logger.LogWarning($"User {senderId} attempted to send friend request with empty recipient ID");
                    await Clients.Caller.SendAsync("FriendRequestFailed", new { error = "Recipient ID is required" });
                    return;
                }

                _logger.LogInformation($"Processing friend request from {senderId} ({senderName}) to {recipientId}");

                // Create request object with friendship ID
                var requestObj = new
                {
                    senderId,
                    senderName,
                    recipientId,
                    friendshipId = Guid.NewGuid().ToString(), // This should be replaced with the actual ID from your database
                    timestamp = DateTime.UtcNow
                };

                // Try both ways to reach the recipient
                bool sentDirectly = false;
                if (_userConnections.TryGetValue(recipientId, out string connectionId))
                {
                    _logger.LogInformation($"Sending real-time friend request to user {recipientId} with connection {connectionId}");
                    await Clients.Client(connectionId).SendAsync("ReceiveFriendRequest", requestObj);
                    sentDirectly = true;
                }

                // Also send to the user's group
                await Clients.Group($"user_{recipientId}").SendAsync("ReceiveFriendRequest", requestObj);
                _logger.LogInformation($"Sent friend request to group user_{recipientId}");

                // Also notify sender that the request was sent successfully
                await Clients.Caller.SendAsync("FriendRequestSent", requestObj);

                _logger.LogInformation($"Friend request delivery status: {(sentDirectly ? "Sent directly and to group" : "Sent to group only")}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending friend request");
                // Notify sender of failure
                await Clients.Caller.SendAsync("FriendRequestFailed", new { error = "Server error: " + ex.Message });
            }
        }

        public async Task SendMatchInvite(string recipientId, string matchId)
        {
            try
            {
                string senderId = Context.GetHttpContext().Session.GetString("UserId");
                string senderName = Context.GetHttpContext().Session.GetString("UserName");

                if (string.IsNullOrEmpty(senderId))
                {
                    _logger.LogWarning("Attempted to send match invite without a valid user ID");
                    await Clients.Caller.SendAsync("MatchInviteFailed", new { error = "Not authenticated" });
                    return;
                }

                if (string.IsNullOrEmpty(recipientId) || string.IsNullOrEmpty(matchId))
                {
                    _logger.LogWarning($"User {senderId} attempted to send match invite with missing parameters");
                    await Clients.Caller.SendAsync("MatchInviteFailed", new { error = "Recipient ID and Match ID are required" });
                    return;
                }

                _logger.LogInformation($"Processing match invite from {senderId} ({senderName}) to {recipientId} for match {matchId}");

                // Create invite object with more details
                var inviteObj = new
                {
                    senderId,
                    senderName,
                    recipientId,
                    matchId,
                    inviteId = Guid.NewGuid().ToString(), // This should be replaced with the actual ID from your database
                    timestamp = DateTime.UtcNow
                };

                // Try both ways to reach the recipient
                bool sentDirectly = false;
                if (_userConnections.TryGetValue(recipientId, out string connectionId))
                {
                    _logger.LogInformation($"Sending real-time match invite to user {recipientId} with connection {connectionId}");
                    await Clients.Client(connectionId).SendAsync("ReceiveMatchInvite", inviteObj);
                    sentDirectly = true;
                }

                // Also send to the user's group
                await Clients.Group($"user_{recipientId}").SendAsync("ReceiveMatchInvite", inviteObj);
                _logger.LogInformation($"Sent match invite to group user_{recipientId}");

                // Also notify sender that the invite was sent successfully
                await Clients.Caller.SendAsync("MatchInviteSent", inviteObj);

                _logger.LogInformation($"Match invite delivery status: {(sentDirectly ? "Sent directly and to group" : "Sent to group only")}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending match invite");
                // Notify sender of failure
                await Clients.Caller.SendAsync("MatchInviteFailed", new { error = "Server error: " + ex.Message });
            }
        }

        // Method to refresh notifications for a user
        public async Task RefreshNotifications(string userId)
        {
            try
            {
                if (string.IsNullOrEmpty(userId))
                {
                    _logger.LogWarning("Refresh notifications called with empty user ID");
                    return;
                }

                _logger.LogInformation($"Refreshing notifications for user {userId}");

                // Try both ways to reach the user
                bool sentDirectly = false;
                if (_userConnections.TryGetValue(userId, out string connectionId))
                {
                    _logger.LogInformation($"Requesting notification refresh for user {userId} via connection {connectionId}");
                    await Clients.Client(connectionId).SendAsync("RefreshNotifications");
                    sentDirectly = true;
                }

                // Also send to the user's group
                await Clients.Group($"user_{userId}").SendAsync("RefreshNotifications");

                _logger.LogInformation($"Refresh notification status: {(sentDirectly ? "Sent directly and to group" : "Sent to group only")}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error refreshing notifications");
            }
        }

        // Method to notify when friend request is accepted
        public async Task NotifyFriendRequestAccepted(string recipientId, string message)
        {
            try
            {
                string senderId = Context.GetHttpContext().Session.GetString("UserId");
                string senderName = Context.GetHttpContext().Session.GetString("UserName");

                if (string.IsNullOrEmpty(senderId))
                {
                    _logger.LogWarning("Attempted to send friend acceptance without a valid user ID");
                    return;
                }

                if (string.IsNullOrEmpty(recipientId))
                {
                    _logger.LogWarning($"User {senderId} attempted to send friend acceptance with empty recipient ID");
                    return;
                }

                _logger.LogInformation($"Notifying {recipientId} that {senderId} ({senderName}) accepted their friend request");

                var acceptObj = new
                {
                    senderId,
                    senderName,
                    content = message ?? $"{senderName} accepted your friend request!",
                    timestamp = DateTime.UtcNow
                };

                // Try both ways to reach the recipient
                bool sentDirectly = false;
                if (_userConnections.TryGetValue(recipientId, out string connectionId))
                {
                    await Clients.Client(connectionId).SendAsync("FriendRequestAccepted", acceptObj);
                    sentDirectly = true;
                }

                // Also send to the user's group
                await Clients.Group($"user_{recipientId}").SendAsync("FriendRequestAccepted", acceptObj);

                _logger.LogInformation($"Friend acceptance notification status: {(sentDirectly ? "Sent directly and to group" : "Sent to group only")}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error notifying friend request acceptance");
            }
        }

        // Get online status of a user - for direct calls from controllers
        public bool IsUserOnline(string userId)
        {
            var isOnline = _userConnections.ContainsKey(userId);
            _logger.LogInformation($"Checking if user {userId} is online: {isOnline}");
            return isOnline;
        }

        // Get all online users (useful for admin tools)
        public List<string> GetOnlineUsers()
        {
            var onlineUsers = new List<string>(_userConnections.Keys);
            _logger.LogInformation($"Getting online users list: {onlineUsers.Count} users online");
            return onlineUsers;
        }

        // Method to directly message a user from outside the hub (e.g., from a controller)
        public async Task SendNotificationToUser(string userId, string type, string message)
        {
            try
            {
                if (string.IsNullOrEmpty(userId))
                {
                    _logger.LogWarning("SendNotificationToUser called with empty user ID");
                    return;
                }

                _logger.LogInformation($"Sending {type} notification to user {userId}");

                var notificationObject = new
                {
                    type,
                    message,
                    timestamp = DateTime.UtcNow
                };

                // Try both ways to reach the user
                bool sentDirectly = false;
                if (_userConnections.TryGetValue(userId, out string connectionId))
                {
                    await Clients.Client(connectionId).SendAsync("ReceiveNotification", notificationObject);
                    sentDirectly = true;
                }

                // Also send to the user's group
                await Clients.Group($"user_{userId}").SendAsync("ReceiveNotification", notificationObject);

                _logger.LogInformation($"Notification delivery status: {(sentDirectly ? "Sent directly and to group" : "Sent to group only")}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error sending notification to user {userId}");
            }
        }
    }
}