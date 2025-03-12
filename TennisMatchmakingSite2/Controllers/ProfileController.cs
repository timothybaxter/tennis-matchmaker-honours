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

                // Get match statistics for this user
                var statsRequest = new HttpRequestMessage(HttpMethod.Get, $"matches/stats?userId={id}");
                statsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var statsResponse = await _httpClient.SendAsync(statsRequest);
                if (statsResponse.IsSuccessStatusCode)
                {
                    var statsContent = await statsResponse.Content.ReadAsStringAsync();
                    var statsJson = JsonDocument.Parse(statsContent).RootElement;

                    if (statsJson.TryGetProperty("stats", out var statsElement))
                    {
                        var stats = JsonSerializer.Deserialize<MatchStatsData>(statsElement.ToString());
                        ViewBag.Stats = stats;
                    }
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

        public async Task<IActionResult> MatchHistory(string id)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                ViewBag.UserId = id;

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

                // Get match history
                var historyRequest = new HttpRequestMessage(HttpMethod.Get, $"matches/history?userId={id}");
                historyRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(historyRequest);
                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var wrapper = JsonDocument.Parse(content).RootElement;

                    if (wrapper.TryGetProperty("matches", out var matchesElement))
                    {
                        ViewBag.Matches = JsonSerializer.Deserialize<List<CompMatchData>>(matchesElement.ToString());
                    }

                    if (wrapper.TryGetProperty("pagination", out var paginationElement))
                    {
                        ViewBag.Pagination = JsonSerializer.Deserialize<PaginationData>(paginationElement.ToString());
                    }
                }
                else
                {
                    TempData["ErrorMessage"] = "Failed to load match history";
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