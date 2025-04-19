using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TennisMatchmakingSite2.Hubs;
using System.Text.Json;
using System.Threading.Tasks;
using System;
using System.Collections.Generic;

namespace TennisMatchmakingSite2.Controllers
{
    [Route("notificationsapi")]
    [ApiController]
    public class NotificationsApiController : ControllerBase
    {
        private readonly IHubContext<TennisMatchmakerHub> _hubContext;
        private readonly ILogger<NotificationsApiController> _logger;

        public NotificationsApiController(IHubContext<TennisMatchmakerHub> hubContext, ILogger<NotificationsApiController> logger)
        {
            _hubContext = hubContext;
            _logger = logger;
        }

        [HttpPost("message")]
        public async Task<IActionResult> PushMessageNotification([FromBody] MessageNotificationRequest request)
        {
            try
            {
                _logger.LogInformation($"Received message notification: {JsonSerializer.Serialize(request)}");

                // Create message notification object
                var notification = new
                {
                    conversationId = request.ConversationId,
                    senderId = request.SenderId,
                    senderName = request.SenderName,
                    content = request.Content,
                    timestamp = request.Timestamp
                };

                // Send to user's group
                await _hubContext.Clients.Group($"user_{request.RecipientId}").SendAsync("ReceiveMessage", notification);

                // Also try to send via the general notification channel
                await _hubContext.Clients.Group($"user_{request.RecipientId}").SendAsync("ReceiveNotification", new
                {
                    type = "message",
                    title = "New Message",
                    message = $"{request.SenderName}: {(request.Content?.Length > 30 ? request.Content.Substring(0, 27) + "..." : request.Content)}",
                    timestamp = request.Timestamp,
                    data = notification
                });

                _logger.LogInformation($"Successfully sent message notification to user {request.RecipientId}");
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending message notification");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("friend-request")]
        public async Task<IActionResult> PushFriendRequestNotification([FromBody] FriendRequestNotificationRequest request)
        {
            try
            {
                _logger.LogInformation($"Received friend request notification: {JsonSerializer.Serialize(request)}");

                // Create notification object
                var notification = new
                {
                    friendshipId = request.FriendshipId,
                    senderId = request.SenderId,
                    senderName = request.SenderName,
                    recipientId = request.RecipientId,
                    timestamp = request.Timestamp
                };

                // Send via the friend request specific channel
                await _hubContext.Clients.Group($"user_{request.RecipientId}").SendAsync("ReceiveFriendRequest", notification);

                // Also send via the general notification channel
                await _hubContext.Clients.Group($"user_{request.RecipientId}").SendAsync("ReceiveNotification", new
                {
                    type = "friend_request",
                    title = "Friend Request",
                    message = $"{request.SenderName} sent you a friend request",
                    timestamp = request.Timestamp,
                    data = notification
                });

                _logger.LogInformation($"Successfully sent friend request notification to user {request.RecipientId}");
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending friend request notification");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("generic")]
        public async Task<IActionResult> PushGenericNotification([FromBody] GenericNotificationRequest request)
        {
            try
            {
                _logger.LogInformation($"Received generic notification: {JsonSerializer.Serialize(request)}");

                // Create a title based on the notification type
                string title = GetTitleFromType(request.Type);

                // Send via the general notification channel
                await _hubContext.Clients.Group($"user_{request.UserId}").SendAsync("ReceiveNotification", new
                {
                    type = request.Type,
                    title = title,
                    message = request.Message,
                    timestamp = request.Timestamp ?? DateTime.UtcNow,
                    relatedItemId = request.RelatedItemId,
                    source = request.Source,
                    metadata = request.Metadata
                });

                // For specific notifications, also send via type-specific channels
                if (request.Type.StartsWith("match_"))
                {
                    await _hubContext.Clients.Group($"user_{request.UserId}").SendAsync("ReceiveMatchNotification", new
                    {
                        type = request.Type,
                        title = title,
                        message = request.Message,
                        matchId = request.RelatedItemId,
                        timestamp = request.Timestamp ?? DateTime.UtcNow,
                        source = request.Source
                    });
                }
                else if (request.Type.StartsWith("tournament_"))
                {
                    await _hubContext.Clients.Group($"user_{request.UserId}").SendAsync("ReceiveTournamentNotification", new
                    {
                        type = request.Type,
                        title = title,
                        message = request.Message,
                        tournamentId = request.RelatedItemId,
                        timestamp = request.Timestamp ?? DateTime.UtcNow,
                        source = request.Source
                    });
                }
                else if (request.Type.StartsWith("ladder_"))
                {
                    await _hubContext.Clients.Group($"user_{request.UserId}").SendAsync("ReceiveLadderNotification", new
                    {
                        type = request.Type,
                        title = title,
                        message = request.Message,
                        ladderId = request.RelatedItemId,
                        timestamp = request.Timestamp ?? DateTime.UtcNow,
                        source = request.Source
                    });
                }

                _logger.LogInformation($"Successfully sent {request.Type} notification to user {request.UserId}");
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending generic notification");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("refresh")]
        public async Task<IActionResult> RefreshNotifications([FromBody] RefreshNotificationRequest request)
        {
            try
            {
                _logger.LogInformation($"Refreshing notifications for user {request.UserId}");

                await _hubContext.Clients.Group($"user_{request.UserId}").SendAsync("RefreshNotifications");

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error refreshing notifications");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // Testing endpoint for direct notification
        [HttpGet("test/{userId}")]
        public async Task<IActionResult> TestNotification(string userId)
        {
            try
            {
                _logger.LogInformation($"Sending test notification to user {userId}");

                var notification = new
                {
                    friendshipId = "test-friendship",
                    senderId = "test-sender",
                    senderName = "Test User",
                    timestamp = DateTime.UtcNow
                };

                // Send via the general notification channel
                await _hubContext.Clients.All.SendAsync("ReceiveNotification", new
                {
                    type = "test",
                    title = "Test Notification",
                    message = "This is a test notification",
                    timestamp = DateTime.UtcNow,
                    data = notification
                });

                // Also try group
                await _hubContext.Clients.Group($"user_{userId}").SendAsync("ReceiveNotification", new
                {
                    type = "test",
                    title = "Test Notification (Group)",
                    message = $"This is a test notification sent to your user group",
                    timestamp = DateTime.UtcNow,
                    data = notification
                });

                return Ok(new
                {
                    success = true,
                    message = $"Test notification sent to ALL users and group user_{userId}"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending test notification");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // Added a direct toast test
        [HttpGet("test-toast/{userId}")]
        public IActionResult TestToast(string userId)
        {
            return Ok(new
            {
                success = true,
                html = @"
                <script>
                function showTestToast() {
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
                    toast.className = 'bg-white rounded-lg shadow-lg border border-gray-200 p-3';
                    toast.style.transform = 'translateX(0)';
                    toast.innerHTML = `
                        <div class='flex items-start'>
                            <div class='flex-shrink-0 text-green-500 mr-2'>
                                <i class='fas fa-bell'></i>
                            </div>
                            <div class='flex-1'>
                                <div class='font-medium'>Direct Test</div>
                                <div class='text-sm text-gray-600'>This is a direct test of the toast function</div>
                            </div>
                            <button class='ml-2 text-gray-400 hover:text-gray-600' onclick='this.parentElement.parentElement.remove()'>
                                <i class='fas fa-times'></i>
                            </button>
                        </div>
                    `;

                    // Add to container
                    toastContainer.appendChild(toast);
                }
                
                // Execute after slight delay
                setTimeout(function() {
                    showTestToast();
                    console.log('Direct toast test executed');
                }, 1000);
                </script>
                <div>Toast test initiated. Check the top-right corner for a notification.</div>
                "
            });
        }

        // Helper method to generate notification titles based on type
        private string GetTitleFromType(string type)
        {
            return type switch
            {
                "friend_request" => "Friend Request",
                "friend_accepted" => "Friend Request Accepted",
                "friend_rejected" => "Friend Request Declined",
                "message" => "New Message",
                "match_invite" => "Match Invitation",
                "match_edited" => "Match Updated",
                "match_deleted" => "Match Cancelled",
                "match_joined" => "Player Joined Match",
                "match_request" => "Match Join Request",
                "tournament_invite" => "Tournament Invitation",
                "tournament_match_scheduled" => "Tournament Match Scheduled",
                "tournament_match_result" => "Tournament Match Result",
                "tournament_completed" => "Tournament Completed",
                "ladder_challenge" => "Ladder Challenge",
                _ => "Notification"
            };
        }
    }

    public class MessageNotificationRequest
    {
        public string RecipientId { get; set; }
        public string SenderId { get; set; }
        public string SenderName { get; set; }
        public string ConversationId { get; set; }
        public string Content { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    public class FriendRequestNotificationRequest
    {
        public string RecipientId { get; set; }
        public string SenderId { get; set; }
        public string SenderName { get; set; }
        public string FriendshipId { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    public class GenericNotificationRequest
    {
        public string UserId { get; set; }
        public string Type { get; set; }
        public string Message { get; set; }
        public string RelatedItemId { get; set; }
        public SourceInfo Source { get; set; }
        public Dictionary<string, string> Metadata { get; set; }
        public DateTime? Timestamp { get; set; }
    }

    public class SourceInfo
    {
        public string UserId { get; set; }
        public string Name { get; set; }
    }

    public class RefreshNotificationRequest
    {
        public string UserId { get; set; }
    }
}