using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Generic;
using System;
using System.Text.Json;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Threading.Tasks;
using TennisMatchmakingSite2.Hubs;
using TennisMatchmakingSite2.Models;
using TennisMatchmakingSite2.Services;

namespace TennisMatchmakingSite2.Controllers
{
    public class SocialController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<SocialController> _logger;
        private readonly IHubContext<TennisMatchmakerHub> _hubContext;
        private readonly NotificationService _notificationService;

        public SocialController(
            IConfiguration configuration,
            ILogger<SocialController> logger,
            IHubContext<TennisMatchmakerHub> hubContext,
            NotificationService notificationService)
        {
            _configuration = configuration;
            _logger = logger;
            _hubContext = hubContext;
            _notificationService = notificationService;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_configuration["ApiBaseUrl"] ?? throw new InvalidOperationException("ApiBaseUrl not configured"))
            };
        }

        [HttpGet]
        public async Task<IActionResult> Index()
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Get recent notifications
                var request = new HttpRequestMessage(HttpMethod.Get, "notifications?limit=10");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    var notificationsResponse = await response.Content.ReadFromJsonAsync<NotificationsResponse>();
                    var notificationsList = notificationsResponse?.Notifications ?? new List<NotificationModel>();

                    // Count only unread notifications
                    var unreadNotifications = notificationsList.Where(n => !n.IsRead).ToList();
                    var unreadCount = unreadNotifications.Count;
                    ViewBag.UnreadNotificationCount = unreadCount;

                    _logger.LogInformation($"Found {unreadCount} unread notifications out of {notificationsList.Count} total");

                    // IMMEDIATELY mark each unread notification as read one by one
                    // This is a more direct approach than the background task
                    if (unreadCount > 0)
                    {
                        _logger.LogInformation($"Marking {unreadCount} notifications as read");

                        foreach (var notification in unreadNotifications)
                        {
                            try
                            {
                                // Create a direct request for each notification
                                var markReadRequest = new HttpRequestMessage(HttpMethod.Post, "notifications/read");
                                markReadRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                                // Use stringContent to ensure proper JSON formatting
                                var jsonString = $"{{\"notificationId\":\"{notification.Id}\"}}";
                                markReadRequest.Content = new StringContent(jsonString, System.Text.Encoding.UTF8, "application/json");

                                var markReadResponse = await _httpClient.SendAsync(markReadRequest);
                                var responseContent = await markReadResponse.Content.ReadAsStringAsync();

                                if (markReadResponse.IsSuccessStatusCode)
                                {
                                    _logger.LogInformation($"Successfully marked notification {notification.Id} as read");
                                }
                                else
                                {
                                    _logger.LogWarning($"Failed to mark notification {notification.Id} as read: {markReadResponse.StatusCode}, {responseContent}");
                                }
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, $"Error marking notification {notification.Id} as read");
                            }
                        }

                        // Send update to clients after we've processed everything
                        var userId = HttpContext.Session.GetString("UserId");
                        if (!string.IsNullOrEmpty(userId))
                        {
                            try
                            {
                                await _hubContext.Clients.Group($"user_{userId}")
                                    .SendAsync("RefreshNotifications");
                                _logger.LogInformation("Sent notification refresh signal to user");
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, "Error sending SignalR notification");
                            }
                        }
                    }

                    return View(notificationsList);
                }

                // Return empty list if there's an error
                _logger.LogError($"Error getting notifications: {response.StatusCode}");
                return View(new List<NotificationModel>());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Social Index action");
                return View(new List<NotificationModel>());
            }
        }

        // Modified helper method - doesn't access HttpContext
        private async Task MarkNotificationAsReadWithoutContext(string notificationId, string token)
        {
            try
            {
                _logger.LogInformation($"Marking notification {notificationId} as read");

                // Create a new HttpClient instance to avoid thread safety issues
                using (var client = new HttpClient())
                {
                    client.BaseAddress = new Uri(_configuration["ApiBaseUrl"]);

                    // Use POST request with proper headers
                    var request = new HttpRequestMessage(HttpMethod.Post, "notifications/read");
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                    // Create request body with the notification ID
                    var jsonString = $"{{\"notificationId\":\"{notificationId}\"}}";
                    request.Content = new StringContent(jsonString, System.Text.Encoding.UTF8, "application/json");

                    // Send the request
                    var response = await client.SendAsync(request);
                    var responseContent = await response.Content.ReadAsStringAsync();

                    if (response.IsSuccessStatusCode)
                    {
                        _logger.LogInformation($"Successfully marked notification {notificationId} as read");
                    }
                    else
                    {
                        _logger.LogWarning($"Failed to mark notification {notificationId} as read: {response.StatusCode}, {responseContent}");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error marking notification {notificationId} as read");
            }
        }
        [HttpGet]
        public async Task<IActionResult> GetUnreadCount()
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { count = 0 });
                }

                // Get unread notifications count - explicitly request only unread
                var request = new HttpRequestMessage(HttpMethod.Get, "notifications?unread=true");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Unread count response: {response.StatusCode}, {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    var notificationsResponse = await response.Content.ReadFromJsonAsync<NotificationsResponse>();
                    int count = notificationsResponse?.Notifications?.Count ?? 0;

                    _logger.LogInformation($"Unread notification count: {count}");

                    // Update ViewBag for use in views
                    ViewBag.UnreadNotificationCount = count;

                    return Json(new { count });
                }

                _logger.LogWarning($"Error getting unread notification count: {response.StatusCode}");
                return Json(new { count = 0 });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in GetUnreadCount action");
                return Json(new { count = 0 });
            }
        }

        [HttpGet]
        public async Task<IActionResult> Friends()
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Get friends list
                var request = new HttpRequestMessage(HttpMethod.Get, "friends");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    var friendsResponse = await response.Content.ReadFromJsonAsync<FriendsResponse>();
                    return View(friendsResponse?.Friends ?? new List<UserModel>());
                }

                // Return empty list if there's an error
                _logger.LogError($"Error getting friends: {response.StatusCode}");
                return View(new List<UserModel>());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Social Friends action");
                return View(new List<UserModel>());
            }
        }

        [HttpGet]
        public async Task<IActionResult> FriendRequests()
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var userId = HttpContext.Session.GetString("UserId");

                if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(userId))
                {
                    return RedirectToAction("Login", "Account");
                }

                _logger.LogInformation($"Getting friend requests for user: {userId}");

                // Get friend requests
                var request = new HttpRequestMessage(HttpMethod.Get, "friends/requests");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Friend requests response: {response.StatusCode}, {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    var requestsResponse = await response.Content.ReadFromJsonAsync<FriendRequestsResponse>();
                    return View(requestsResponse?.FriendRequests ?? new List<FriendRequestModel>());
                }

                // Return empty list if there's an error
                _logger.LogError($"Error getting friend requests: {response.StatusCode}");
                return View(new List<FriendRequestModel>());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in FriendRequests action");
                return View(new List<FriendRequestModel>());
            }
        }

        [HttpGet]
        public async Task<IActionResult> Messages()
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Get conversations
                var request = new HttpRequestMessage(HttpMethod.Get, "messages/conversations");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    var conversationsResponse = await response.Content.ReadFromJsonAsync<ConversationsResponse>();
                    return View(conversationsResponse?.Conversations ?? new List<ConversationModel>());
                }

                // Return empty list if there's an error
                _logger.LogError($"Error getting conversations: {response.StatusCode}");
                return View(new List<ConversationModel>());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Social Messages action");
                return View(new List<ConversationModel>());
            }
        }


        [HttpGet]
        public async Task<IActionResult> NewConversation(string userId, string userName)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(userId))
                {
                    TempData["ErrorMessage"] = "Recipient user ID is required to start a conversation";
                    return RedirectToAction("Friends");
                }

                _logger.LogInformation($"NewConversation called with userId: '{userId}', userName: '{userName}'");

                // Check if a conversation already exists between these users
                var request = new HttpRequestMessage(HttpMethod.Get, "messages/conversations");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Conversations response: {response.StatusCode}, Content: {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    try
                    {
                        // Parse JSON directly using JsonDocument
                        using (JsonDocument doc = JsonDocument.Parse(responseContent))
                        {
                            if (doc.RootElement.TryGetProperty("conversations", out JsonElement conversationsElement) &&
                                conversationsElement.ValueKind == JsonValueKind.Array)
                            {
                                _logger.LogInformation($"Found {conversationsElement.GetArrayLength()} conversations");

                                foreach (JsonElement conv in conversationsElement.EnumerateArray())
                                {
                                    if (conv.TryGetProperty("conversationId", out JsonElement idElement) &&
                                        conv.TryGetProperty("otherUser", out JsonElement otherUserElement) &&
                                        otherUserElement.TryGetProperty("id", out JsonElement otherUserIdElement))
                                    {
                                        string conversationId = idElement.GetString();
                                        string otherUserId = otherUserIdElement.GetString();
                                        string otherUserName = otherUserElement.TryGetProperty("name", out var nameElement) ?
                                            nameElement.GetString() : "Unknown";

                                        _logger.LogInformation($"Conversation {conversationId} - OtherUser ID: '{otherUserId}', Name: '{otherUserName}'");

                                        if (string.Equals(otherUserId, userId, StringComparison.OrdinalIgnoreCase))
                                        {
                                            _logger.LogInformation($"MATCH! Redirecting to existing conversation: {conversationId}");
                                            return RedirectToAction("Conversation", new { id = conversationId });
                                        }
                                    }
                                }
                            }

                            _logger.LogInformation("No matching conversation found");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error processing conversations response");
                    }
                }
                else
                {
                    _logger.LogWarning($"Failed to fetch conversations: {response.StatusCode}");
                }

                // No matching conversation found, create a new one
                _logger.LogInformation($"Creating new conversation with user {userId} ({userName})");

                ViewBag.ConversationId = "new";
                ViewBag.RecipientId = userId;
                ViewBag.RecipientName = userName ?? "User";

                return View("Conversation", new List<MessageModel>());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in NewConversation action");
                TempData["ErrorMessage"] = "An error occurred while creating the conversation";
                return RedirectToAction("Friends");
            }
        }

        [HttpGet]
        public async Task<IActionResult> Conversation(string id)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Improved debugging
                _logger.LogInformation($"Conversation method called with id: '{id}'");

                if (string.IsNullOrEmpty(id))
                {
                    TempData["ErrorMessage"] = "Conversation ID is required";
                    return RedirectToAction("Messages");
                }

                // Sanitize and log the ID
                id = id.Trim();
                _logger.LogInformation($"Using conversation ID: '{id}'");

                // Get messages for conversation
                var request = new HttpRequestMessage(HttpMethod.Get, $"messages/{Uri.EscapeDataString(id)}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Messages response: {response.StatusCode}, Content: {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    var messagesResponse = await response.Content.ReadFromJsonAsync<MessagesResponse>();
                    ViewBag.ConversationId = id;

                    return View(messagesResponse?.Messages ?? new List<MessageModel>());
                }

                // Handle errors
                TempData["ErrorMessage"] = $"Failed to load conversation: {response.StatusCode}";
                return RedirectToAction("Messages");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Conversation action");
                TempData["ErrorMessage"] = "An error occurred while loading the conversation";
                return RedirectToAction("Messages");
            }
        }

        [HttpPost]
        public async Task<IActionResult> SendMessage(string conversationId, string content, string recipientId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var currentUserId = HttpContext.Session.GetString("UserId");
                var currentUserName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Log all parameters for debugging
                _logger.LogInformation($"Sending message - ConversationId: {conversationId}, Content: {content?.Substring(0, Math.Min(content?.Length ?? 0, 20))}, RecipientId: {recipientId}");

                // Validate input
                if (string.IsNullOrEmpty(content))
                {
                    TempData["ErrorMessage"] = "Message content cannot be empty";
                    return RedirectToAction("Conversation", new { id = conversationId });
                }

                // Create request with proper authorization
                var request = new HttpRequestMessage(HttpMethod.Post, "messages");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Prepare request body based on whether it's a new or existing conversation
                object requestBody;
                if (conversationId == "new")
                {
                    if (string.IsNullOrEmpty(recipientId))
                    {
                        TempData["ErrorMessage"] = "Recipient ID is required for a new conversation";
                        return RedirectToAction("Messages");
                    }

                    requestBody = new { conversationId, content, recipientId };
                }
                else
                {
                    requestBody = new { conversationId, content };
                }

                request.Content = JsonContent.Create(requestBody);

                // Log the exact request body
                _logger.LogInformation($"Request body: {System.Text.Json.JsonSerializer.Serialize(requestBody)}");

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Response: {response.StatusCode}, Content: {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    // Message was successfully saved in the database
                    string actualConversationId = conversationId;
                    string actualRecipientId = recipientId;

                    // For new conversations, extract the conversation ID from response
                    if (conversationId == "new")
                    {
                        try
                        {
                            var responseObj = JsonSerializer.Deserialize<JsonDocument>(responseContent);
                            actualConversationId = responseObj.RootElement.GetProperty("conversationId").GetString();
                            _logger.LogInformation($"Got conversation ID from response: {actualConversationId}");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error extracting conversation ID from response");
                        }
                    }

                    // If we don't have a recipient ID or need to confirm it, make an API call to get conversation details
                    if (string.IsNullOrEmpty(actualRecipientId) || conversationId != "new")
                    {
                        try
                        {
                            _logger.LogInformation($"Making additional call to get conversation details for {actualConversationId}");

                            // Get conversation details to find the other participant
                            var conversationRequest = new HttpRequestMessage(HttpMethod.Get, $"messages/{Uri.EscapeDataString(actualConversationId)}");
                            conversationRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                            var conversationResponse = await _httpClient.SendAsync(conversationRequest);
                            if (conversationResponse.IsSuccessStatusCode)
                            {
                                var conversationContent = await conversationResponse.Content.ReadAsStringAsync();
                                _logger.LogInformation($"Conversation details response: {conversationContent}");

                                using var doc = JsonDocument.Parse(conversationContent);

                                // Try to find conversation in the response
                                if (doc.RootElement.TryGetProperty("conversation", out var convElement))
                                {
                                    if (convElement.TryGetProperty("participants", out var participantsElement) &&
                                        participantsElement.ValueKind == JsonValueKind.Array)
                                    {
                                        foreach (var participantElement in participantsElement.EnumerateArray())
                                        {
                                            string participantId = participantElement.GetString();
                                            _logger.LogInformation($"Found participant: {participantId}");

                                            if (participantId != currentUserId)
                                            {
                                                actualRecipientId = participantId;
                                                _logger.LogInformation($"Found recipient ID: {actualRecipientId}");
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            else
                            {
                                _logger.LogWarning($"Failed to get conversation details: {conversationResponse.StatusCode}");
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error fetching conversation details for notification");
                        }
                    }

                    // Send notification using the notification service
                    if (!string.IsNullOrEmpty(actualRecipientId))
                    {
                        try
                        {
                            // Get a preview of the content for the notification
                            string messagePreview = content;
                            if (content.Length > 50)
                            {
                                messagePreview = content.Substring(0, 47) + "...";
                            }

                            _logger.LogInformation($"Sending message notification: RecipientId={actualRecipientId}, SenderName={currentUserName}, ConversationId={actualConversationId}");

                            var notificationResult = await _notificationService.SendMessageNotification(
                                actualRecipientId,
                                currentUserName,
                                actualConversationId,
                                messagePreview
                            );

                            _logger.LogInformation($"Message notification result: {notificationResult}");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error sending message notification");
                        }
                    }
                    else
                    {
                        _logger.LogWarning("Cannot send notification - recipient ID is missing or empty");
                    }

                    // Redirect to the conversation
                    if (conversationId == "new")
                    {
                        return RedirectToAction("Conversation", new { id = actualConversationId });
                    }

                    return RedirectToAction("Conversation", new { id = conversationId });
                }

                TempData["ErrorMessage"] = $"Failed to send message: {response.StatusCode}";
                return RedirectToAction("Conversation", new { id = conversationId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in SendMessage action");
                TempData["ErrorMessage"] = "An error occurred while sending the message";
                return RedirectToAction("Conversation", new { id = conversationId });
            }
        }

        [HttpPost]
        public async Task<IActionResult> SendFriendRequest(string userId)
        {
            try
            {
                // Add validation for userId
                if (string.IsNullOrEmpty(userId) || userId == "undefined")
                {
                    TempData["ErrorMessage"] = "Invalid user ID provided";
                    return RedirectToAction("Friends");
                }

                var token = HttpContext.Session.GetString("JWTToken");
                var currentUserId = HttpContext.Session.GetString("UserId");
                var currentUserName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Send friend request through API
                var request = new HttpRequestMessage(HttpMethod.Post, "friends/request");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Content = JsonContent.Create(new
                {
                    recipientId = userId
                });

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    // Extract friendship ID if available
                    string friendshipId = null;
                    try
                    {
                        using (JsonDocument doc = JsonDocument.Parse(responseContent))
                        {
                            if (doc.RootElement.TryGetProperty("friendshipId", out JsonElement idElement))
                            {
                                friendshipId = idElement.GetString();
                                _logger.LogInformation($"Extracted friendshipId: {friendshipId}");
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error extracting friendshipId from response");
                    }

                    // Send notification using the notification service
                    try
                    {
                        await _notificationService.SendFriendRequestNotification(
                            userId,
                            currentUserName,
                            friendshipId
                        );
                        _logger.LogInformation($"Sent friend request notification to user {userId}");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error sending friend request notification");
                    }

                    TempData["SuccessMessage"] = "Friend request sent successfully";
                }
                else
                {
                    _logger.LogError($"Error sending friend request: {response.StatusCode}, {responseContent}");
                    TempData["ErrorMessage"] = "Failed to send friend request";
                }

                return RedirectToAction("Friends");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in SendFriendRequest action");
                TempData["ErrorMessage"] = "An error occurred while sending the friend request";
                return RedirectToAction("Friends");
            }
        }

        [HttpPost]
        public async Task<IActionResult> RespondToFriendRequest(string requestId, bool accept)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var userId = HttpContext.Session.GetString("UserId");
                var userName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(userId))
                {
                    return RedirectToAction("Login", "Account");
                }

                _logger.LogInformation($"Responding to friend request: {requestId}, Accept: {accept}, User: {userId}");

                // First, get request details before responding
                string requesterId = null;
                string requesterName = null;

                try
                {
                    var friendRequestsRequest = new HttpRequestMessage(HttpMethod.Get, "friends/requests");
                    friendRequestsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                    var friendRequestsResponse = await _httpClient.SendAsync(friendRequestsRequest);

                    if (friendRequestsResponse.IsSuccessStatusCode)
                    {
                        var requestsResponse = await friendRequestsResponse.Content.ReadFromJsonAsync<FriendRequestsResponse>();
                        var request = requestsResponse?.FriendRequests?.FirstOrDefault(r => r.FriendshipId.ToString() == requestId);

                        if (request != null && request.Requester != null)
                        {
                            requesterId = request.Requester.Id?.ToString();
                            requesterName = request.Requester.Name;
                            _logger.LogInformation($"Found requester details: ID={requesterId}, Name={requesterName}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error getting friend request details");
                    // Continue even if we can't get the requester details
                }

                // Respond to friend request
                var respondRequest = new HttpRequestMessage(HttpMethod.Post, "friends/respond");
                respondRequest.Headers.Add("Authorization", "Bearer " + token);
                respondRequest.Content = JsonContent.Create(new
                {
                    friendshipId = requestId,
                    accept
                });

                var response = await _httpClient.SendAsync(respondRequest);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Response to friend request: {response.StatusCode}, {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    // Send notifications based on response
                    if (!string.IsNullOrEmpty(requesterId))
                    {
                        try
                        {
                            if (accept)
                            {
                                await _notificationService.SendFriendRequestAcceptedNotification(
                                    requesterId,
                                    userName,
                                    requestId
                                );
                                _logger.LogInformation($"Sent friend request accepted notification to user {requesterId}");
                            }
                            else
                            {
                                await _notificationService.SendFriendRequestDeclinedNotification(
                                    requesterId,
                                    userName
                                );
                                _logger.LogInformation($"Sent friend request declined notification to user {requesterId}");
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error sending friend request response notification");
                        }
                    }

                    // Delete the original notification for the current user
                    try
                    {
                        var getNotificationsRequest = new HttpRequestMessage(HttpMethod.Get, "notifications");
                        getNotificationsRequest.Headers.Add("Authorization", "Bearer " + token);
                        var getNotificationsResponse = await _httpClient.SendAsync(getNotificationsRequest);

                        if (getNotificationsResponse.IsSuccessStatusCode)
                        {
                            var notificationsResponse = await getNotificationsResponse.Content.ReadFromJsonAsync<NotificationsResponse>();

                            if (notificationsResponse?.Notifications != null)
                            {
                                // Find the notification related to this friendship
                                var relatedNotification = notificationsResponse.Notifications
                                    .FirstOrDefault(n => n.Type == "friend_request" && n.RelatedItemId == requestId);

                                if (relatedNotification != null)
                                {
                                    // Delete the original notification
                                    var deleteRequest = new HttpRequestMessage(HttpMethod.Delete, $"notifications/{relatedNotification.Id}");
                                    deleteRequest.Headers.Add("Authorization", "Bearer " + token);
                                    await _httpClient.SendAsync(deleteRequest);
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error cleaning up friend request notifications");
                    }

                    TempData["SuccessMessage"] = accept ? "Friend request accepted" : "Friend request declined";
                }
                else
                {
                    _logger.LogError($"Error responding to friend request: {response.StatusCode}, {responseContent}");
                    TempData["ErrorMessage"] = "Failed to respond to friend request";
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in RespondToFriendRequest action");
                TempData["ErrorMessage"] = "An error occurred while responding to the friend request";
            }

            return RedirectToAction("FriendRequests");
        }

        [HttpPost]
        public async Task<IActionResult> MarkNotificationRead(string notificationId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Mark notification as read
                var request = new HttpRequestMessage(HttpMethod.Post, "notifications/read");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Content = JsonContent.Create(new
                {
                    notificationId
                });

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogError($"Error marking notification as read: {response.StatusCode}, {errorContent}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in MarkNotificationRead action");
            }

            return RedirectToAction("Index");
        }

        [HttpPost]
        public async Task<IActionResult> DeleteNotification(string notificationId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Not authenticated" });
                }

                _logger.LogInformation("Deleting notification: {NotificationId}", notificationId);

                // Create DELETE request
                var request = new HttpRequestMessage(HttpMethod.Delete, $"notifications/{notificationId}");
                request.Headers.Add("Authorization", "Bearer " + token);

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();

                _logger.LogInformation("Delete response: {StatusCode}, Content: {Content}",
                    response.StatusCode, responseContent);

                if (response.IsSuccessStatusCode)
                {
                    // If we're on the social page, update the unread count viewbag
                    if (Request.Path.Value?.Contains("/Social") == true)
                    {
                        // Get new unread count after deletion
                        var countRequest = new HttpRequestMessage(HttpMethod.Get, "notifications?unread=true");
                        countRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                        var countResponse = await _httpClient.SendAsync(countRequest);

                        if (countResponse.IsSuccessStatusCode)
                        {
                            var notificationsResponse = await countResponse.Content.ReadFromJsonAsync<NotificationsResponse>();
                            ViewBag.UnreadNotificationCount = notificationsResponse?.Notifications?.Count ?? 0;
                        }
                    }

                    return Json(new { success = true });
                }
                else
                {
                    _logger.LogError("Error deleting notification: {StatusCode}, {Content}",
                        response.StatusCode, responseContent);
                    return Json(new { success = false, message = "Failed to delete notification" });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in DeleteNotification action");
                return Json(new { success = false, message = "An error occurred" });
            }
        }

        [HttpGet]
        public async Task<IActionResult> SearchUsers(string query)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Not authenticated" });
                }

                if (string.IsNullOrEmpty(query) || query.Length < 2)
                {
                    return Json(new { success = false, message = "Search query must be at least 2 characters" });
                }

                // Call the friends/search endpoint in the Lambda function
                var request = new HttpRequestMessage(HttpMethod.Get, $"friends/search?query={Uri.EscapeDataString(query)}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                _logger.LogInformation($"Sending search request to Lambda: {request.RequestUri}");
                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();

                _logger.LogInformation($"Search response: {response.StatusCode}, Content: {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    // Deserialize using your existing SearchUsersResponse model
                    var searchResponse = await response.Content.ReadFromJsonAsync<SearchUsersResponse>();

                    // Return the response in the format your JavaScript expects
                    return Json(new
                    {
                        success = true,
                        users = searchResponse?.Users ?? new List<UserModel>()
                    });
                }
                else
                {
                    return Json(new
                    {
                        success = false,
                        message = $"Failed to search users: {response.StatusCode}"
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in SearchUsers action");
                return Json(new
                {
                    success = false,
                    message = "An error occurred during search: " + ex.Message
                });
            }
        }
        // Add this to your SocialController.cs

        [HttpPost]
        public async Task<IActionResult> MarkAllMessagesRead([FromBody] ConversationReadRequest requestData)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Not authenticated" });
                }

                // Validate the conversation ID
                if (string.IsNullOrEmpty(requestData?.ConversationId) || requestData.ConversationId == "&")
                {
                    _logger.LogWarning("Invalid conversation ID for marking as read: {ConversationId}", requestData?.ConversationId);
                    return Json(new { success = false, message = "Invalid conversation ID" });
                }

                _logger.LogInformation("Marking all messages as read in conversation: {ConversationId}", requestData.ConversationId);

                using (var client = new HttpClient())
                {
                    client.BaseAddress = new Uri(_configuration["ApiBaseUrl"]);

                    var httpRequest = new HttpRequestMessage(HttpMethod.Post, "messages/conversations/read");
                    httpRequest.Headers.Add("Authorization", "Bearer " + token);

                    var jsonString = $"{{\"conversationId\":\"{requestData.ConversationId}\"}}";
                    httpRequest.Content = new StringContent(jsonString, System.Text.Encoding.UTF8, "application/json");

                    var response = await client.SendAsync(httpRequest);
                    var responseContent = await response.Content.ReadAsStringAsync();

                    _logger.LogInformation("Mark conversation read response: {StatusCode}, Content: {Content}",
                        response.StatusCode, responseContent);

                    return Json(new { success = response.IsSuccessStatusCode });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error marking all messages as read");
                return Json(new { success = false, message = ex.Message });
            }
        }

        // Add this class to properly bind the request
        public class ConversationReadRequest
        {
            public string ConversationId { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> MarkMessageAsRead(string messageId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Not authenticated" });
                }

                _logger.LogInformation("Marking message as read: {MessageId}", messageId);

                // Create a completely new HttpClient for this request only
                using (var client = new HttpClient())
                {
                    client.BaseAddress = new Uri(_configuration["ApiBaseUrl"]);

                    // Create a new request message
                    var request = new HttpRequestMessage(HttpMethod.Post, "messages/read");

                    // Manually add the authorization header as a simple string
                    request.Headers.Add("Authorization", "Bearer " + token);

                    // Create simple string content instead of using JsonContent
                    var jsonString = $"{{\"messageId\":\"{messageId}\"}}";
                    request.Content = new StringContent(jsonString, System.Text.Encoding.UTF8, "application/json");

                    var response = await client.SendAsync(request);
                    var responseContent = await response.Content.ReadAsStringAsync();

                    _logger.LogInformation("Mark message read response: {StatusCode}, Content: {Content}",
                        response.StatusCode, responseContent);

                    if (response.IsSuccessStatusCode)
                    {
                        return Json(new { success = true });
                    }
                    else
                    {
                        _logger.LogError("Error marking message read: {StatusCode}, {Content}",
                            response.StatusCode, responseContent);
                        return Json(new { success = false, message = "Failed to mark message as read" });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in MarkMessageAsRead action");
                return Json(new { success = false, message = "An error occurred" });
            }
        }
    }
}