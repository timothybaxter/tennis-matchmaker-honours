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
            string userId = Context.GetHttpContext().Session.GetString("UserId");
            if (!string.IsNullOrEmpty(userId))
            {
                // Store the connection
                _userConnections.TryAdd(userId, Context.ConnectionId);
                _logger.LogInformation($"User {userId} connected with connection ID: {Context.ConnectionId}");

                // Add the user to their own user group for easier targeting
                await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");

                // Notify friends that this user is online
                await Clients.Others.SendAsync("UserOnline", userId);
            }
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            string userId = Context.GetHttpContext().Session.GetString("UserId");
            if (!string.IsNullOrEmpty(userId))
            {
                // Remove the connection
                _userConnections.TryRemove(userId, out _);
                _logger.LogInformation($"User {userId} disconnected.");

                // Remove from user group
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user_{userId}");

                // Notify friends that this user is offline
                await Clients.Others.SendAsync("UserOffline", userId);
            }
            await base.OnDisconnectedAsync(exception);
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
                    return;
                }

                _logger.LogInformation($"Processing direct message from {senderId} to {recipientId} in conversation {conversationId}");

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
                if (_userConnections.TryGetValue(recipientId, out string connectionId))
                {
                    _logger.LogInformation($"Sending real-time message to user {recipientId} with connection {connectionId}");
                    await Clients.Client(connectionId).SendAsync("ReceiveMessage", messageObj);
                }

                // Also send to the user's group (more reliable in some scenarios)
                await Clients.Group($"user_{recipientId}").SendAsync("ReceiveMessage", messageObj);
                _logger.LogInformation($"Sent message to group user_{recipientId}");

                // Also send back to sender for immediate UI update
                await Clients.Caller.SendAsync("MessageSent", messageObj);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending direct message");
                // Notify sender of failure
                await Clients.Caller.SendAsync("MessageFailed", new { error = ex.Message });
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
                    return;
                }

                _logger.LogInformation($"Processing friend request from {senderId} to {recipientId}");

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
                if (_userConnections.TryGetValue(recipientId, out string connectionId))
                {
                    _logger.LogInformation($"Sending real-time friend request to user {recipientId} with connection {connectionId}");
                    await Clients.Client(connectionId).SendAsync("ReceiveFriendRequest", requestObj);
                }

                // Also send to the user's group
                await Clients.Group($"user_{recipientId}").SendAsync("ReceiveFriendRequest", requestObj);
                _logger.LogInformation($"Sent friend request to group user_{recipientId}");

                // Also notify sender that the request was sent successfully
                await Clients.Caller.SendAsync("FriendRequestSent", requestObj);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending friend request");
                // Notify sender of failure
                await Clients.Caller.SendAsync("FriendRequestFailed", new { error = ex.Message });
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
                    return;
                }

                _logger.LogInformation($"Processing match invite from {senderId} to {recipientId} for match {matchId}");

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
                if (_userConnections.TryGetValue(recipientId, out string connectionId))
                {
                    _logger.LogInformation($"Sending real-time match invite to user {recipientId} with connection {connectionId}");
                    await Clients.Client(connectionId).SendAsync("ReceiveMatchInvite", inviteObj);
                }

                // Also send to the user's group
                await Clients.Group($"user_{recipientId}").SendAsync("ReceiveMatchInvite", inviteObj);
                _logger.LogInformation($"Sent match invite to group user_{recipientId}");

                // Also notify sender that the invite was sent successfully
                await Clients.Caller.SendAsync("MatchInviteSent", inviteObj);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending match invite");
                // Notify sender of failure
                await Clients.Caller.SendAsync("MatchInviteFailed", new { error = ex.Message });
            }
        }

        // Method to refresh notifications for a user
        public async Task RefreshNotifications(string userId)
        {
            try
            {
                // Try both ways to reach the user
                if (_userConnections.TryGetValue(userId, out string connectionId))
                {
                    _logger.LogInformation($"Requesting notification refresh for user {userId}");
                    await Clients.Client(connectionId).SendAsync("RefreshNotifications");
                }

                // Also send to the user's group
                await Clients.Group($"user_{userId}").SendAsync("RefreshNotifications");
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

                _logger.LogInformation($"Notifying {recipientId} that {senderId} accepted their friend request");

                var acceptObj = new
                {
                    senderId,
                    senderName,
                    content = message ?? $"{senderName} accepted your friend request!",
                    timestamp = DateTime.UtcNow
                };

                // Try both ways to reach the recipient
                if (_userConnections.TryGetValue(recipientId, out string connectionId))
                {
                    await Clients.Client(connectionId).SendAsync("FriendRequestAccepted", acceptObj);
                }

                // Also send to the user's group
                await Clients.Group($"user_{recipientId}").SendAsync("FriendRequestAccepted", acceptObj);

                _logger.LogInformation($"Sent friend acceptance notification to user {recipientId}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error notifying friend request acceptance");
            }
        }

        // Get online status of a user
        public bool IsUserOnline(string userId)
        {
            return _userConnections.ContainsKey(userId);
        }

        // Get all online users (useful for admin tools)
        public List<string> GetOnlineUsers()
        {
            return new List<string>(_userConnections.Keys);
        }
    }
}