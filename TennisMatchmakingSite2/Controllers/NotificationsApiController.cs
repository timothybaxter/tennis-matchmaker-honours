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

                // Send to everyone - for testing
                await _hubContext.Clients.All.SendAsync("ReceiveMessage", new
                {
                    conversationId = request.ConversationId,
                    senderId = request.SenderId,
                    senderName = request.SenderName,
                    content = request.Content,
                    timestamp = request.Timestamp
                });

                // Send to user group
                await _hubContext.Clients.Group($"user_{request.RecipientId}").SendAsync("ReceiveMessage", new
                {
                    conversationId = request.ConversationId,
                    senderId = request.SenderId,
                    senderName = request.SenderName,
                    content = request.Content,
                    timestamp = request.Timestamp
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

                // Send to all clients (for testing)
                await _hubContext.Clients.All.SendAsync("ReceiveFriendRequest", notification);

                // Also send to user group
                await _hubContext.Clients.Group($"user_{request.RecipientId}").SendAsync("ReceiveFriendRequest", notification);

                _logger.LogInformation($"Successfully sent friend request notification to user {request.RecipientId}");
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending friend request notification");
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

                // Send to ALL clients for testing
                await _hubContext.Clients.All.SendAsync("ReceiveFriendRequest", notification);

                // Also try via general notification
                await _hubContext.Clients.All.SendAsync("ReceiveNotification", new
                {
                    type = "Test",
                    message = "This is a test notification via ReceiveNotification",
                    timestamp = DateTime.UtcNow
                });

                // Also try group
                await _hubContext.Clients.Group($"user_{userId}").SendAsync("ReceiveFriendRequest", notification);

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

    public class RefreshNotificationRequest
    {
        public string UserId { get; set; }
    }
}