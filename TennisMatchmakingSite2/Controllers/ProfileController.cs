using Microsoft.AspNetCore.Mvc;
using TennisMatchmakingSite2.Models;
using System.Text.Json;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using System.Collections.Generic;
using System.Threading.Tasks;
using System;

namespace TennisMatchmakingSite2.Controllers
{
    public class ProfileController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<ProfileController> _logger;

        public ProfileController(IConfiguration configuration, ILogger<ProfileController> logger)
        {
            _configuration = configuration;
            _logger = logger;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_configuration["ApiBaseUrl"] ?? throw new InvalidOperationException("ApiBaseUrl not configured"))
            };
        }

        public async Task<IActionResult> ViewProfile(string id)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Check for invalid ID input (like just '&')
                if (id == "&")
                {
                    id = null;
                }

                // If no ID is provided, use the current user's ID
                if (string.IsNullOrEmpty(id))
                {
                    id = HttpContext.Session.GetString("UserId");
                    if (string.IsNullOrEmpty(id))
                    {
                        return RedirectToAction("Login", "Account");
                    }
                }

                var currentUserId = HttpContext.Session.GetString("UserId");
                ViewBag.IsCurrentUser = currentUserId == id;
                ViewBag.UserId = id;

                // Fetch user profile from settings-lambda
                var profileRequest = new HttpRequestMessage(HttpMethod.Get, $"settings/profile/{id}");
                profileRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                _logger.LogInformation($"Requesting profile for user {id}");
                var profileResponse = await _httpClient.SendAsync(profileRequest);

                // Log the response for debugging
                var profileContent = await profileResponse.Content.ReadAsStringAsync();
                _logger.LogInformation($"Profile response status: {profileResponse.StatusCode}");
                _logger.LogInformation($"Profile response content: {profileContent}");

                if (!profileResponse.IsSuccessStatusCode)
                {
                    TempData["ErrorMessage"] = "Could not retrieve user profile";
                    return RedirectToAction("Index", "Home");
                }

                var profileJson = JsonDocument.Parse(profileContent).RootElement;

                if (profileJson.TryGetProperty("profile", out var profileElement))
                {
                    var profile = JsonSerializer.Deserialize<UserProfileData>(profileElement.ToString());
                    ViewBag.Profile = profile;
                }
                else
                {
                    TempData["ErrorMessage"] = "Invalid profile data returned";
                    return RedirectToAction("Index", "Home");
                }

                // Check if users are friends
                if (!ViewBag.IsCurrentUser)
                {
                    var friendCheckRequest = new HttpRequestMessage(HttpMethod.Get, $"friends/check/{id}");
                    friendCheckRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                    var friendResponse = await _httpClient.SendAsync(friendCheckRequest);
                    if (friendResponse.IsSuccessStatusCode)
                    {
                        var friendContent = await friendResponse.Content.ReadAsStringAsync();
                        var friendJson = JsonDocument.Parse(friendContent).RootElement;

                        if (friendJson.TryGetProperty("isFriend", out var isFriendElement))
                        {
                            ViewBag.IsFriend = isFriendElement.GetBoolean();
                        }

                        if (friendJson.TryGetProperty("hasPendingRequest", out var pendingElement))
                        {
                            ViewBag.HasPendingRequest = pendingElement.GetBoolean();
                        }
                    }
                }

                // Get match statistics for this user - UPDATED ENDPOINT
                var statsRequest = new HttpRequestMessage(HttpMethod.Get, $"comp-matches/stats?userId={id}");
                statsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var statsResponse = await _httpClient.SendAsync(statsRequest);
                if (statsResponse.IsSuccessStatusCode)
                {
                    var statsContent = await statsResponse.Content.ReadAsStringAsync();
                    var statsJson = JsonDocument.Parse(statsContent).RootElement;

                    if (statsJson.TryGetProperty("stats", out var statsElement))
                    {
                        var stats = JsonSerializer.Deserialize<MatchStatsData>(statsElement.ToString());

                        // Initialize RecentPerformance as empty list if null to avoid errors
                        if (stats.RecentPerformance == null)
                        {
                            stats.RecentPerformance = new List<RecentMatch>();
                        }

                        ViewBag.Stats = stats;
                    }
                    else
                    {
                        // Create default stats object with empty RecentPerformance
                        ViewBag.Stats = new MatchStatsData
                        {
                            RecentPerformance = new List<RecentMatch>()
                        };
                    }
                }
                else
                {
                    // Create default stats object for the view to avoid null reference
                    ViewBag.Stats = new MatchStatsData
                    {
                        RecentPerformance = new List<RecentMatch>()
                    };
                }

                return View();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading profile for user {UserId}", id);
                TempData["ErrorMessage"] = "An error occurred while loading the profile";
                return RedirectToAction("Index", "Home");
            }
        }
        public async Task<IActionResult> MatchHistory(string id, string type = null, int skip = 0, int limit = 10)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Validate the ID parameter
                if (string.IsNullOrEmpty(id) || id == "&")
                {
                    id = HttpContext.Session.GetString("UserId");
                    if (string.IsNullOrEmpty(id))
                    {
                        return RedirectToAction("Login", "Account");
                    }
                }

                ViewBag.UserId = id;
                ViewBag.CurrentType = type;

                // Get user profile
                var profileRequest = new HttpRequestMessage(HttpMethod.Get, $"settings/profile/{id}");
                profileRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var profileResponse = await _httpClient.SendAsync(profileRequest);
                if (profileResponse.IsSuccessStatusCode)
                {
                    var profileContent = await profileResponse.Content.ReadAsStringAsync();
                    var profileJson = JsonDocument.Parse(profileContent).RootElement;

                    if (profileJson.TryGetProperty("profile", out var profileElement))
                    {
                        var profile = JsonSerializer.Deserialize<UserProfileData>(profileElement.ToString());
                        ViewBag.Profile = profile;
                    }
                }

                // Build query string for filtering with proper parameter formatting
                var queryParams = new List<string>();
                queryParams.Add($"userId={Uri.EscapeDataString(id)}");  // Always include userId
                queryParams.Add($"skip={skip}");
                queryParams.Add($"limit={limit}");

                if (!string.IsNullOrEmpty(type))
                {
                    queryParams.Add($"type={Uri.EscapeDataString(type)}");
                }

                var queryString = string.Join("&", queryParams);

                // Get match history with filters
                var historyRequest = new HttpRequestMessage(HttpMethod.Get, $"comp-matches/history?{queryString}");
                historyRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                _logger.LogInformation($"Requesting match history with query: {queryString}");
                var response = await _httpClient.SendAsync(historyRequest);

                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    _logger.LogInformation($"Match history response: {content}");
                    var wrapper = JsonDocument.Parse(content).RootElement;

                    if (wrapper.TryGetProperty("matches", out var matchesElement))
                    {
                        var options = new JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        };

                        var matches = JsonSerializer.Deserialize<List<CompMatchData>>(matchesElement.ToString(), options);
                        _logger.LogInformation($"Deserialized {matches.Count} matches");

                        // Process matches to ensure opponent data is available
                        foreach (var match in matches)
                        {
                            // If opponent is null but we have challenger/challengee or player details
                            if (match.Opponent == null)
                            {
                                // Create opponent from available user details
                                if (match.ChallengerId != null && match.ChallengeeId != null)
                                {
                                    // Determine which player is the opponent based on the current user ID
                                    if (match.ChallengerId == id && match.Challengee != null)
                                    {
                                        match.Opponent = new OpponentData
                                        {
                                            Id = match.ChallengeeId,
                                            Name = match.Challengee?.Name ?? "Opponent",
                                            PlayerLevel = match.Challengee?.PlayerLevel
                                        };
                                    }
                                    else if (match.ChallengeeId == id && match.Challenger != null)
                                    {
                                        match.Opponent = new OpponentData
                                        {
                                            Id = match.ChallengerId,
                                            Name = match.Challenger?.Name ?? "Opponent",
                                            PlayerLevel = match.Challenger?.PlayerLevel
                                        };
                                    }
                                }
                                else if (match.Player1 != null && match.Player2 != null)
                                {
                                    // Tournament match format
                                    if (match.Player1 == id && match.Player2Details != null)
                                    {
                                        match.Opponent = new OpponentData
                                        {
                                            Id = match.Player2,
                                            Name = match.Player2Details?.Name ?? "Opponent",
                                            PlayerLevel = match.Player2Details?.PlayerLevel
                                        };
                                    }
                                    else if (match.Player2 == id && match.Player1Details != null)
                                    {
                                        match.Opponent = new OpponentData
                                        {
                                            Id = match.Player1,
                                            Name = match.Player1Details?.Name ?? "Opponent",
                                            PlayerLevel = match.Player1Details?.PlayerLevel
                                        };
                                    }
                                }

                                // If we still don't have an opponent, create a placeholder
                                if (match.Opponent == null)
                                {
                                    match.Opponent = new OpponentData { Name = "Unknown Opponent" };
                                }
                            }
                        }

                        ViewBag.Matches = matches;
                    }
                    else
                    {
                        ViewBag.Matches = new List<CompMatchData>();
                        _logger.LogWarning("No matches property found in response");
                    }

                    if (wrapper.TryGetProperty("pagination", out var paginationElement))
                    {
                        ViewBag.Pagination = JsonSerializer.Deserialize<PaginationData>(paginationElement.ToString());
                    }
                }
                else
                {
                    _logger.LogWarning($"Failed to load match history: {response.StatusCode}, {await response.Content.ReadAsStringAsync()}");
                    TempData["ErrorMessage"] = "Failed to load match history";
                    ViewBag.Matches = new List<CompMatchData>();
                }

                return View();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading match history for user {UserId}", id);
                TempData["ErrorMessage"] = "An error occurred while loading match history";
                return RedirectToAction("ViewProfile", new { id });
            }
        }
    }

        public class PaginationData
    {
        [JsonPropertyName("total")]
        public int Total { get; set; }

        [JsonPropertyName("limit")]
        public int Limit { get; set; }

        [JsonPropertyName("skip")]
        public int Skip { get; set; }
    }

    public class UserProfileData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("email")]
        public string Email { get; set; }

        [JsonPropertyName("playerLevel")]
        public string PlayerLevel { get; set; }

        [JsonPropertyName("hometown")]
        public string Hometown { get; set; }

        [JsonPropertyName("bio")]
        public string Bio { get; set; }

        [JsonPropertyName("joinedAt")]
        public DateTime JoinedAt { get; set; }

        // Handle LastActive as string first to provide nullable capability
        [JsonPropertyName("lastActive")]
        public string LastActiveString { get; set; }

        // Create computed property for LastActive as nullable DateTime
        public DateTime? LastActive =>
            !string.IsNullOrEmpty(LastActiveString)
                ? DateTime.Parse(LastActiveString)
                : null;
    }
}