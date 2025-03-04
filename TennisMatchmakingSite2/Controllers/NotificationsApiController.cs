using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TennisMatchmakingSite2.Hubs;
using System.Text.Json;

namespace TennisMatchmakingSite2.Controllers.Api
{
    [Route("api/[controller]")]
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
                _logger.LogInformation($"Received message notification for user {request.RecipientId}");

                // Send notification via SignalR
                await _hubContext.Clients.User(request.RecipientId).SendAsync("ReceiveMessage", new
                {
                    conversationId = request.ConversationId,
                    senderId = request.SenderId,
                    senderName = request.SenderName,
                    content = request.Content,
                    timestamp = request.Timestamp
                });

                // Also send to user group as backup
                await _hubContext.Clients.Group($"user_{request.RecipientId}").SendAsync("ReceiveMessage", new
                {
                    conversationId = request.ConversationId,
                    senderId = request.SenderId,
                    senderName = request.SenderName,
                    content = request.Content,
                    timestamp = request.Timestamp
                });

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
                _logger.LogInformation($"Received friend request notification for user {request.RecipientId}");

                await _hubContext.Clients.User(request.RecipientId).SendAsync("ReceiveFriendRequest", new
                {
                    friendshipId = request.FriendshipId,
                    senderId = request.SenderId,
                    senderName = request.SenderName,
                    timestamp = request.Timestamp
                });

                // Also send to user group as backup
                await _hubContext.Clients.Group($"user_{request.RecipientId}").SendAsync("ReceiveFriendRequest", new
                {
                    friendshipId = request.FriendshipId,
                    senderId = request.SenderId,
                    senderName = request.SenderName,
                    timestamp = request.Timestamp
                });

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

                await _hubContext.Clients.User(request.UserId).SendAsync("RefreshNotifications");
                await _hubContext.Clients.Group($"user_{request.UserId}").SendAsync("RefreshNotifications");

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error refreshing notifications");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
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