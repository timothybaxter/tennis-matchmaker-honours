using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using TennisMatchmakingSite2.Models;
using TennisMatchmakingSite2.Services;

namespace TennisMatchmakingSite2.Controllers
{
    public class MatchController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<MatchController> _logger;
        private readonly NotificationService _notificationService;

        public MatchController(
            IConfiguration configuration,
            ILogger<MatchController> logger,
            NotificationService notificationService)
        {
            _configuration = configuration;
            _logger = logger;
            _notificationService = notificationService;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_configuration["ApiBaseUrl"] ?? throw new InvalidOperationException("ApiBaseUrl not configured"))
            };
        }

        private void LogTokenDetails(string token)
        {
            try
            {
                var parts = token.Split('.');
                if (parts.Length > 1)
                {
                    var payload = parts[1];
                    var paddedPayload = payload.PadRight(4 * ((payload.Length + 3) / 4), '=');
                    var decodedBytes = Convert.FromBase64String(paddedPayload);
                    var decodedText = System.Text.Encoding.UTF8.GetString(decodedBytes);
                    _logger.LogInformation($"Token payload: {decodedText}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error decoding token: {ex.Message}");
            }
        }

        [HttpGet]
        public async Task<IActionResult> Index(string courtLocation = null, string matchType = null,
    string skillLevel = null, DateTime? matchDate = null, bool personal = false)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Store current userId in ViewBag for the view
                var userId = HttpContext.Session.GetString("UserId");
                ViewBag.CurrentUserId = userId;

                // Build query parameters
                var queryParams = new List<string>();

                // For personal view, include matches the user created OR is a participant in
                if (personal)
                {
                    queryParams.Add("personal=true");
                }
                else
                {
                    // For all matches view, only show open matches
                    queryParams.Add("status=open");
                }

                if (!string.IsNullOrEmpty(courtLocation)) queryParams.Add($"courtLocation={WebUtility.UrlEncode(courtLocation)}");
                if (!string.IsNullOrEmpty(matchType)) queryParams.Add($"matchType={WebUtility.UrlEncode(matchType)}");
                if (!string.IsNullOrEmpty(skillLevel)) queryParams.Add($"skillLevel={WebUtility.UrlEncode(skillLevel)}");
                if (matchDate.HasValue) queryParams.Add($"matchDate={matchDate.Value:yyyy-MM-dd}");

                var queryString = queryParams.Any() ? "?" + string.Join("&", queryParams) : "";
                _logger.LogInformation($"Query string: {queryString}");

                var request = new HttpRequestMessage(HttpMethod.Get, $"matches{queryString}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);
                _logger.LogInformation($"Response status: {response.StatusCode}");

                if (response.IsSuccessStatusCode)
                {
                    var wrapper = await response.Content.ReadFromJsonAsync<MatchResponseWrapper>();
                    var matches = wrapper?.Matches ?? new List<MatchData>();

                    // Filter matches on the client side to absolutely ensure closed matches don't appear
                    // in the "All Matches" view, and update visual status
                    if (!personal)
                    {
                        matches = matches.Where(m => m.Status?.ToLower() == "open").ToList();
                    }

                    // Update match status based on participants for display purposes
                    foreach (var match in matches)
                    {
                        if (match.Status?.ToLower() == "open" && match.IsFull)
                        {
                            match.Status = "closed";
                        }
                    }

                    // Collect all user IDs we need to look up
                    var userIds = new HashSet<string>();

                    foreach (var match in matches)
                    {
                        if (match.Participants != null)
                        {
                            foreach (var id in match.Participants.Where(id => !string.IsNullOrEmpty(id)))
                            {
                                userIds.Add(id);
                            }
                        }

                        if (!string.IsNullOrEmpty(match.CreatorId))
                        {
                            userIds.Add(match.CreatorId);
                        }

                        if (match.RequestedBy != null)
                        {
                            foreach (var id in match.RequestedBy.Where(id => !string.IsNullOrEmpty(id)))
                            {
                                userIds.Add(id);
                            }
                        }
                    }

                    // Only do the lookup if we have users to look up
                    if (userIds.Count > 0)
                    {
                        _logger.LogInformation($"Looking up details for {userIds.Count} users");

                        // Look up all user details at once using our improved method that calls the settings API
                        var userDetails = await GetUserDetailsByIds(userIds.ToList(), token);

                        // Update matches with user details
                        foreach (var match in matches)
                        {
                            match.EnsureParticipantDetails();

                            // First, handle creator details
                            if (!string.IsNullOrEmpty(match.CreatorId) && userDetails.TryGetValue(match.CreatorId, out var creatorDetails))
                            {
                                // If the creator was found but the poster name is empty, update it
                                if (string.IsNullOrEmpty(match.PosterName))
                                {
                                    match.PosterName = creatorDetails.Name;
                                }
                            }

                            // Now handle all participants
                            if (match.Participants != null)
                            {
                                foreach (var participantId in match.Participants)
                                {
                                    if (string.IsNullOrEmpty(participantId)) continue;

                                    // Remove existing entries for this user
                                    match.ParticipantDetails.RemoveAll(p => p.Id == participantId);

                                    // Get details from our lookup or create a default
                                    if (userDetails.TryGetValue(participantId, out var lookedUpDetails))
                                    {
                                        match.ParticipantDetails.Add(lookedUpDetails);
                                    }
                                    else
                                    {
                                        // Create default details
                                        var name = participantId == match.CreatorId ? match.PosterName : "Player";
                                        match.ParticipantDetails.Add(new ParticipantInfo
                                        {
                                            Id = participantId,
                                            Name = name ?? "Unknown Player",
                                            PlayerLevel = "Unknown"
                                        });
                                    }
                                }
                            }
                        }
                    }

                    ViewBag.IsPersonal = personal;
                    // Store the current filter values in ViewBag for the form
                    ViewBag.CurrentCourtLocation = courtLocation;
                    ViewBag.CurrentMatchType = matchType;
                    ViewBag.CurrentSkillLevel = skillLevel;
                    ViewBag.CurrentMatchDate = matchDate;

                    return View(matches);
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                ModelState.AddModelError("", error?.Message ?? "Failed to load matches");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while loading matches");
                ModelState.AddModelError("", "An error occurred while loading matches");
            }

            return View(new List<MatchData>());
        }


        private async Task<Dictionary<string, ParticipantInfo>> GetUserDetailsByIds(List<string> userIds, string token)
        {
            var result = new Dictionary<string, ParticipantInfo>();

            if (userIds == null || userIds.Count == 0 || string.IsNullOrEmpty(token))
                return result;

            try
            {
                _logger.LogInformation($"Getting details for {userIds.Count} users");

                foreach (var userId in userIds)
                {
                    try
                    {
                        var request = new HttpRequestMessage(HttpMethod.Get, $"settings/profile/{userId}");
                        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                        var response = await _httpClient.SendAsync(request);

                        if (response.IsSuccessStatusCode)
                        {
                            var content = await response.Content.ReadAsStringAsync();
                            _logger.LogInformation($"Profile response for {userId}: {content}");

                            var document = JsonDocument.Parse(content);

                            if (document.RootElement.TryGetProperty("profile", out var profileElement))
                            {
                                string name = "Unknown User";
                                string playerLevel = "Unknown";

                                if (profileElement.TryGetProperty("name", out var nameElement) &&
                                    !string.IsNullOrEmpty(nameElement.GetString()))
                                {
                                    name = nameElement.GetString();
                                }

                                if (profileElement.TryGetProperty("playerLevel", out var levelElement) &&
                                    !string.IsNullOrEmpty(levelElement.GetString()))
                                {
                                    playerLevel = levelElement.GetString();
                                }

                                // Log what we found
                                _logger.LogInformation($"Found user details - ID: {userId}, Name: {name}, Level: {playerLevel}");

                                result[userId] = new ParticipantInfo
                                {
                                    Id = userId,
                                    Name = name,
                                    PlayerLevel = playerLevel
                                };
                            }
                            else
                            {
                                _logger.LogWarning($"Profile data structure unexpected for user {userId}");
                            }
                        }
                        else
                        {
                            var errorContent = await response.Content.ReadAsStringAsync();
                            _logger.LogWarning($"Failed to get details for user {userId}: {response.StatusCode}, {errorContent}");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, $"Error fetching details for user {userId}");
                    }

                    // If we failed to get details, add a default entry
                    if (!result.ContainsKey(userId))
                    {
                        result[userId] = new ParticipantInfo
                        {
                            Id = userId,
                            Name = "Unknown User",
                            PlayerLevel = "Unknown"
                        };
                    }
                }

                _logger.LogInformation($"Successfully retrieved details for {result.Count} users");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user details by IDs");
            }

            return result;
        }

        private async Task<T> FetchDataFromApi<T>(string endpoint, string token) where T : class
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    // For collection endpoints (like users, tournaments, etc.)
                    var content = await response.Content.ReadAsStringAsync();
                    var wrapper = JsonDocument.Parse(content).RootElement;

                    // Handle different wrapper properties based on type
                    if (typeof(T) == typeof(List<UserSearchResult>) && wrapper.TryGetProperty("users", out var usersElement))
                    {
                        return JsonSerializer.Deserialize<T>(usersElement.ToString());
                    }

                    // Fallback to direct deserialization
                    return await response.Content.ReadFromJsonAsync<T>();
                }

                _logger.LogWarning("API request failed: {StatusCode} {ReasonPhrase}",
                    response.StatusCode, response.ReasonPhrase);
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching data from API endpoint {Endpoint}", endpoint);
                return null;
            }
        }

        [HttpPost]
        public async Task<IActionResult> Create(CreateMatchViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var posterName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                var request = new HttpRequestMessage(HttpMethod.Post, "matches");
                request.Headers.Add("Authorization", $"Bearer {token}");
                var skillLevel = HttpContext.Session.GetString("SkillLevel");

                // Add null checks for matchType
                var matchType = !string.IsNullOrEmpty(model.MatchType) ? model.MatchType.ToLower() : "singles"; // Default to singles

                var requestBody = new
                {
                    courtLocation = model.CourtLocation,
                    matchTime = model.MatchTime.ToUniversalTime().ToString("o"),
                    matchType = matchType,
                    skillLevel = skillLevel,
                    posterName = posterName
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to create match");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while creating match");
                ModelState.AddModelError("", "An error occurred while creating the match");
            }

            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> Delete(string matchId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var userId = HttpContext.Session.GetString("UserId");
                var userName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // First, get match details to obtain participant information for notifications
                MatchData matchData = null;
                try
                {
                    var detailsRequest = new HttpRequestMessage(HttpMethod.Get, $"matches/{matchId}");
                    detailsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                    var detailsResponse = await _httpClient.SendAsync(detailsRequest);

                    if (detailsResponse.IsSuccessStatusCode)
                    {
                        matchData = await detailsResponse.Content.ReadFromJsonAsync<MatchData>();
                        _logger.LogInformation($"Retrieved match details for deletion notification: {matchData?.CourtLocation}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error getting match details for deletion notification");
                    // Continue with the deletion process even if we couldn't get details for notification
                }

                var request = new HttpRequestMessage(HttpMethod.Delete, $"matches/{matchId}");

                // Add your base URL and endpoint to logs
                _logger.LogInformation($"Base URL: {_httpClient.BaseAddress}");
                _logger.LogInformation($"Endpoint: matches/{matchId}");

                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                // Log the full request URL
                _logger.LogInformation($"Full request URL: {response.RequestMessage.RequestUri}");

                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Delete response status: {response.StatusCode}");
                _logger.LogInformation($"Response content: {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    // Send notifications to all participants except the person who deleted the match
                    if (matchData != null && matchData.Participants != null)
                    {
                        _logger.LogInformation($"Sending deletion notifications to participants");

                        foreach (var participantId in matchData.Participants)
                        {
                            // Don't send notification to the person who deleted it
                            if (!string.IsNullOrEmpty(participantId) && participantId != userId)
                            {
                                try
                                {
                                    await _notificationService.SendMatchDeletedNotification(
                                        participantId,
                                        userName,
                                        matchData.CourtLocation
                                    );
                                    _logger.LogInformation($"Sent deletion notification to participant {participantId}");
                                }
                                catch (Exception ex)
                                {
                                    _logger.LogError(ex, $"Error sending deletion notification to participant {participantId}");
                                }
                            }
                        }
                    }

                    TempData["SuccessMessage"] = "Match successfully deleted";
                    return RedirectToAction(nameof(Index), new { personal = true });
                }

                TempData["ErrorMessage"] = "Failed to delete match";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while deleting match {MatchId}", matchId);
                TempData["ErrorMessage"] = "An error occurred while deleting the match";
            }

            return RedirectToAction(nameof(Index), new { personal = true });
        }

        [HttpGet]
        [Route("Match/Edit/{id}")]
        public async Task<IActionResult> Edit(string id)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                var request = new HttpRequestMessage(HttpMethod.Get, $"matches/{id}");
                // Fix the authorization header format
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                _logger.LogInformation($"Fetching match with ID: {id}");
                var response = await _httpClient.SendAsync(request);
                _logger.LogInformation($"Response status: {response.StatusCode}");

                if (response.IsSuccessStatusCode)
                {
                    var match = await response.Content.ReadFromJsonAsync<MatchData>();
                    if (match == null)
                    {
                        _logger.LogWarning($"No match found for ID: {id}");
                        return NotFound();
                    }

                    var viewModel = new UpdateMatchViewModel
                    {
                        MatchId = match.Id,
                        CourtLocation = match.CourtLocation,
                        MatchTime = match.MatchTime,
                        MatchType = match.MatchType
                    };

                    return PartialView("_EditMatch", viewModel);
                }

                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError($"API error: {errorContent}");
                return StatusCode((int)response.StatusCode, errorContent);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while getting match for edit");
                return StatusCode(500, "Failed to load edit form");
            }
        }
        [HttpPost]
        public async Task<IActionResult> RequestMatch(string matchId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var userId = HttpContext.Session.GetString("UserId");
                var userName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Authentication required" });
                }

                if (string.IsNullOrEmpty(matchId))
                {
                    return Json(new { success = false, message = "Match ID is required" });
                }

                // First, get match details to know who to notify
                MatchData matchData = null;
                try
                {
                    var detailsRequest = new HttpRequestMessage(HttpMethod.Get, $"matches/{matchId}");
                    detailsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                    var detailsResponse = await _httpClient.SendAsync(detailsRequest);

                    if (detailsResponse.IsSuccessStatusCode)
                    {
                        matchData = await detailsResponse.Content.ReadFromJsonAsync<MatchData>();
                        _logger.LogInformation($"Retrieved match details for request notification: {matchData?.CourtLocation}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error getting match details for request notification");
                    // Continue with the request process even if we couldn't get details for notification
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"matches/{matchId}/request");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                _logger.LogInformation($"Sending match request for match ID: {matchId}");
                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Match request response: {response.StatusCode}, {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    // Send notification to match creator
                    if (matchData != null && !string.IsNullOrEmpty(matchData.CreatorId))
                    {
                        try
                        {
                            await _notificationService.SendMatchRequestNotification(
                                matchData.CreatorId,
                                userName,
                                matchId,
                                matchData.CourtLocation
                            );
                            _logger.LogInformation($"Sent match request notification to creator {matchData.CreatorId}");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error sending match request notification");
                        }
                    }

                    return Json(new { success = true, message = "Request sent successfully" });
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                return Json(new { success = false, message = error?.Message ?? "Failed to send match request" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending match request");
                return Json(new { success = false, message = "An error occurred while requesting the match" });
            }
        }

        [HttpGet]
        public async Task<IActionResult> GetMatchRequests(string matchId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Authentication required" });
                }

                if (string.IsNullOrEmpty(matchId))
                {
                    return Json(new { success = false, message = "Match ID is required" });
                }

                var request = new HttpRequestMessage(HttpMethod.Get, $"matches/{matchId}/requests");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);
                _logger.LogInformation($"Get match requests response: {response.StatusCode}");

                if (response.IsSuccessStatusCode)
                {
                    var requestsResponse = await response.Content.ReadFromJsonAsync<MatchRequestsResponse>();
                    var requests = requestsResponse?.Requests ?? new List<MatchRequestModel>();

                    // Get user details for each requester
                    if (requests.Count > 0)
                    {
                        var requesterIds = requests.Select(r => r.Id).ToList();
                        var userDetails = await GetUserDetailsByIds(requesterIds, token);

                        // Enhance requests with user details
                        foreach (var matchRequest in requests)
                        {
                            if (userDetails.TryGetValue(matchRequest.Id, out var userDetail))
                            {
                                matchRequest.Name = userDetail.Name;
                                matchRequest.PlayerLevel = userDetail.PlayerLevel;
                            }
                        }
                    }

                    return Json(new
                    {
                        success = true,
                        requests = requests
                    });
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                return Json(new { success = false, message = error?.Message ?? "Failed to get match requests" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting match requests");
                return Json(new { success = false, message = "An error occurred while retrieving match requests" });
            }
        }

        [HttpPost]
        public async Task<IActionResult> DismissAcceptedRequest(string matchId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Authentication required" });
                }

                if (string.IsNullOrEmpty(matchId))
                {
                    return Json(new { success = false, message = "Match ID is required" });
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"matches/{matchId}/dismiss-accepted");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    return Json(new { success = true, message = "Accepted request dismissed" });
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                return Json(new { success = false, message = error?.Message ?? "Failed to dismiss request" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error dismissing accepted match request");
                return Json(new { success = false, message = "An error occurred while dismissing the request" });
            }
        }

        [HttpPost]
        public async Task<IActionResult> RespondToMatchRequest([FromBody] MatchRequestResponse model)
        {
            try
            {
                _logger.LogInformation($"Request received: matchId={model.MatchId}, requesterId={model.RequesterId}, accept={model.Accept}");

                var token = HttpContext.Session.GetString("JWTToken");
                var userId = HttpContext.Session.GetString("UserId");
                var userName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Authentication required" });
                }

                if (string.IsNullOrEmpty(model.MatchId) || string.IsNullOrEmpty(model.RequesterId))
                {
                    _logger.LogWarning("Missing required parameters: " +
                        (string.IsNullOrEmpty(model.MatchId) ? "MatchId is missing. " : "") +
                        (string.IsNullOrEmpty(model.RequesterId) ? "RequesterId is missing." : ""));

                    return Json(new { success = false, message = "Match ID and requester ID are required" });
                }

                // Get match details for notification
                MatchData matchData = null;
                try
                {
                    var detailsRequest = new HttpRequestMessage(HttpMethod.Get, $"matches/{model.MatchId}");
                    detailsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                    var detailsResponse = await _httpClient.SendAsync(detailsRequest);

                    if (detailsResponse.IsSuccessStatusCode)
                    {
                        matchData = await detailsResponse.Content.ReadFromJsonAsync<MatchData>();
                        _logger.LogInformation($"Retrieved match details for response notification: {matchData?.CourtLocation}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error getting match details for response notification");
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"matches/{model.MatchId}/respond");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Content = JsonContent.Create(new
                {
                    requesterId = model.RequesterId,
                    accept = model.Accept
                });

                _logger.LogInformation($"Sending API request to respond to match request");
                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Response: {response.StatusCode}, {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    // Create notification for the requester
                    try
                    {
                        // Get location from match data or use a default
                        string location = matchData?.CourtLocation ?? "a tennis court";

                        if (model.Accept)
                        {
                            // Send acceptance notification
                            await _notificationService.CreateNotificationAsync(
                                model.RequesterId,
                                "match_request_accepted",
                                $"Your request to join the match at {location} has been accepted",
                                model.MatchId,
                                userId
                            );

                            // Also notify other participants about the new player
                            if (matchData != null && matchData.Participants != null)
                            {
                                foreach (var participantId in matchData.Participants)
                                {
                                    // Skip creator (who is responding) and the requester
                                    if (!string.IsNullOrEmpty(participantId) &&
                                        participantId != userId &&
                                        participantId != model.RequesterId)
                                    {
                                        await _notificationService.CreateNotificationAsync(
                                            participantId,
                                            "new_participant",
                                            $"A new player has joined the match at {location}",
                                            model.MatchId,
                                            userId
                                        );
                                    }
                                }
                            }
                        }
                        else
                        {
                            // Send rejection notification
                            await _notificationService.CreateNotificationAsync(
                                model.RequesterId,
                                "match_request_rejected",
                                $"Your request to join the match at {location} has been declined",
                                model.MatchId,
                                userId
                            );
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error sending match response notification");
                        // Continue even if notification fails - the match request was handled successfully
                    }

                    return Json(new
                    {
                        success = true,
                        message = model.Accept ? "Request accepted successfully" : "Request rejected successfully"
                    });
                }

                var error = JsonSerializer.Deserialize<Dictionary<string, string>>(responseContent);
                string errorMessage = error?.ContainsKey("message") == true
                    ? error["message"]
                    : "Failed to respond to match request";

                return Json(new { success = false, message = errorMessage });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error responding to match request");
                return Json(new { success = false, message = "An error occurred while responding to the match request" });
            }
        }

        [HttpPost]
        public async Task<IActionResult> DismissRejectedRequest(string matchId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Authentication required" });
                }

                if (string.IsNullOrEmpty(matchId))
                {
                    return Json(new { success = false, message = "Match ID is required" });
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"matches/{matchId}/dismiss-rejected");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    return Json(new { success = true, message = "Rejected request dismissed" });
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                return Json(new { success = false, message = error?.Message ?? "Failed to dismiss request" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error dismissing rejected match request");
                return Json(new { success = false, message = "An error occurred while dismissing the request" });
            }
        }

        [HttpPost]
        public async Task<IActionResult> CancelRequest(string matchId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Authentication required" });
                }

                if (string.IsNullOrEmpty(matchId))
                {
                    return Json(new { success = false, message = "Match ID is required" });
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"matches/{matchId}/cancel-request");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    return Json(new { success = true, message = "Request canceled successfully" });
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                return Json(new { success = false, message = error?.Message ?? "Failed to cancel request" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error canceling match request");
                return Json(new { success = false, message = "An error occurred while canceling the request" });
            }
        }

        [HttpGet]
        public async Task<IActionResult> MyRequests()
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                var request = new HttpRequestMessage(HttpMethod.Get, "matches/user/requests");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);
                _logger.LogInformation($"Response status: {response.StatusCode}");

                if (response.IsSuccessStatusCode)
                {
                    var wrapper = await response.Content.ReadFromJsonAsync<MatchResponseWrapper>();
                    ViewBag.IsRequests = true; // Flag to indicate this is the requests view
                    return View("Requests", wrapper?.Matches ?? new List<MatchData>());
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                ModelState.AddModelError("", error?.Message ?? "Failed to load match requests");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while loading match requests");
                ModelState.AddModelError("", "An error occurred while loading match requests");
            }

            return View("Requests", new List<MatchData>());
        }

        [HttpPost]
        public async Task<IActionResult> Update(string matchId, UpdateMatchViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var userId = HttpContext.Session.GetString("UserId");
                var userName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // First get match details to know who to notify
                MatchData matchData = null;
                try
                {
                    var detailsRequest = new HttpRequestMessage(HttpMethod.Get, $"matches/{matchId}");
                    detailsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                    var detailsResponse = await _httpClient.SendAsync(detailsRequest);

                    if (detailsResponse.IsSuccessStatusCode)
                    {
                        matchData = await detailsResponse.Content.ReadFromJsonAsync<MatchData>();
                        _logger.LogInformation($"Retrieved match details for update notification: {matchData?.CourtLocation}");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error getting match details for update notification");
                    // Continue with the update process even if we couldn't get details for notification
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"matches/{matchId}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    courtLocation = model.CourtLocation,
                    matchTime = model.MatchTime.ToUniversalTime().ToString("o"),
                    matchType = model.MatchType.ToLower(),
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update match");
                }
                else
                {
                    // Send notifications to all participants
                    if (matchData != null && matchData.Participants != null)
                    {
                        _logger.LogInformation($"Sending update notifications to participants");

                        foreach (var participantId in matchData.Participants)
                        {
                            // Don't send notification to the person who updated it
                            if (!string.IsNullOrEmpty(participantId) && participantId != userId)
                            {
                                try
                                {
                                    await _notificationService.SendMatchEditedNotification(
                                        participantId,
                                        userName,
                                        matchId,
                                        model.CourtLocation
                                    );
                                    _logger.LogInformation($"Sent update notification to participant {participantId}");
                                }
                                catch (Exception ex)
                                {
                                    _logger.LogError(ex, $"Error sending update notification to participant {participantId}");
                                }
                            }
                        }
                    }

                    TempData["SuccessMessage"] = "Match updated successfully";
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while updating match {MatchId}", matchId);
                ModelState.AddModelError("", "An error occurred while updating the match");
            }

            return RedirectToAction(nameof(Index), new { personal = true });
        }
    }
}