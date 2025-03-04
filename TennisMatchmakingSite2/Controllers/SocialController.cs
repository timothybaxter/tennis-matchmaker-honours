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

namespace TennisMatchmakingSite2.Controllers
{
    public class SocialController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<SocialController> _logger;
        private readonly IHubContext<TennisMatchmakerHub> _hubContext;

        public SocialController(
            IConfiguration configuration,
            ILogger<SocialController> logger,
            IHubContext<TennisMatchmakerHub> hubContext)
        {
            _configuration = configuration;
            _logger = logger;
            _hubContext = hubContext;
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
                    return View(notificationsResponse?.Notifications ?? new List<NotificationModel>());
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

                    // Determine the correct conversation ID and recipient ID
                    string actualConversationId = conversationId;
                    string actualRecipientId = recipientId;

                    // For new conversations, extract the conversation ID from response
                    if (conversationId == "new")
                    {
                        try
                        {
                            var responseObj = JsonSerializer.Deserialize<JsonDocument>(responseContent);
                            actualConversationId = responseObj.RootElement.GetProperty("conversationId").GetString();

                            // Recipient ID is already provided for new conversations
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error parsing new conversation response");
                        }
                    }
                    // For existing conversations, determine the recipient (the other user)
                    else
                    {
                        try
                        {
                            // Extract conversation info to find the other participant
                            using (JsonDocument doc = JsonDocument.Parse(responseContent))
                            {
                                if (doc.RootElement.TryGetProperty("conversation", out JsonElement convElement))
                                {
                                    if (convElement.TryGetProperty("participants", out JsonElement participantsElement) &&
                                        participantsElement.ValueKind == JsonValueKind.Array)
                                    {
                                        foreach (JsonElement participantElement in participantsElement.EnumerateArray())
                                        {
                                            string participantId = participantElement.GetString();
                                            if (participantId != currentUserId)
                                            {
                                                actualRecipientId = participantId;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error determining recipient ID from existing conversation");
                        }
                    }

                    // Send real-time notification via SignalR if we have the recipient ID
                    if (!string.IsNullOrEmpty(actualRecipientId))
                    {
                        try
                        {
                            // Create message object for real-time notification
                            var messageObj = new
                            {
                                senderId = currentUserId,
                                senderName = currentUserName,
                                recipientId = actualRecipientId,
                                content = content,
                                conversationId = actualConversationId,
                                timestamp = DateTime.UtcNow
                            };

                            // First try to send to specific user
                            await _hubContext.Clients.User(actualRecipientId).SendAsync("ReceiveMessage", messageObj);

                            // Also try sending to a group with the user's ID as fallback
                            await _hubContext.Clients.Group($"user_{actualRecipientId}").SendAsync("ReceiveMessage", messageObj);

                            _logger.LogInformation($"Sent real-time notification to user {actualRecipientId} for message in conversation {actualConversationId}");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error sending real-time notification via SignalR");
                        }
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
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Send friend request
                var request = new HttpRequestMessage(HttpMethod.Post, "friends/request");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Content = JsonContent.Create(new
                {
                    recipientId = userId
                });

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    TempData["SuccessMessage"] = "Friend request sent successfully";
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogError($"Error sending friend request: {response.StatusCode}, {errorContent}");
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

                if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(userId))
                {
                    return RedirectToAction("Login", "Account");
                }

                _logger.LogInformation($"Responding to friend request: {requestId}, Accept: {accept}, User: {userId}");

                // Respond to friend request
                var request = new HttpRequestMessage(HttpMethod.Post, "friends/respond");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Content = JsonContent.Create(new
                {
                    friendshipId = requestId,
                    accept,
                    userId // Include userId explicitly
                });

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Response to friend request: {response.StatusCode}, {responseContent}");

                if (response.IsSuccessStatusCode)
                {
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

        // In SocialController.cs
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

                _logger.LogInformation($"Searching users with query: {query}");

                // Search for users
                var request = new HttpRequestMessage(HttpMethod.Get, $"friends/search?query={Uri.EscapeDataString(query)}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                _logger.LogInformation($"Search response status: {response.StatusCode}");

                if (response.IsSuccessStatusCode)
                {
                    var searchResponse = await response.Content.ReadFromJsonAsync<SearchUsersResponse>();
                    return Json(new
                    {
                        success = true,
                        users = searchResponse?.Users ?? new List<UserModel>()
                    });
                }

                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError($"Error searching users: {response.StatusCode}, {errorContent}");
                return Json(new { success = false, message = "Failed to search users" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in SearchUsers action");
                return Json(new { success = false, message = "An error occurred while searching users" });
            }
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
        public async Task<IActionResult> MarkMessageAsRead(string messageId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Not authenticated" });
                }

                var request = new HttpRequestMessage(HttpMethod.Post, "messages/read");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Content = JsonContent.Create(new { messageId });

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    return Json(new { success = true });
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogError($"Error marking message read: {response.StatusCode}, {errorContent}");
                    return Json(new { success = false, message = "Failed to mark message as read" });
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

