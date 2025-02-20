using Microsoft.AspNetCore.Mvc;
using TennisMatchmakingSite2.Models;
using System.Net.Http.Json;
using System.Collections.Generic;
using System.Threading.Tasks;
using System;
using System.Net;
using System.Text.Json;
using System.Net.Http.Headers;

namespace TennisMatchmakingSite2.Controllers
{
    public class MatchController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<MatchController> _logger;

        public MatchController(IConfiguration configuration, ILogger<MatchController> logger)
        {
            _configuration = configuration;
            _logger = logger;
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

                // Build query parameters
                var queryParams = new List<string>();
                if (personal) queryParams.Add("personal=true");
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
                    ViewBag.IsPersonal = personal;
                    // Store the current filter values in ViewBag for the form
                    ViewBag.CurrentCourtLocation = courtLocation;
                    ViewBag.CurrentMatchType = matchType;
                    ViewBag.CurrentSkillLevel = skillLevel;
                    ViewBag.CurrentMatchDate = matchDate;
                    return View(wrapper?.Matches ?? new List<MatchData>());
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
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
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
        public async Task<IActionResult> Update(UpdateMatchViewModel model)
        {
            if (!ModelState.IsValid)
            {
                return RedirectToAction(nameof(Index), new { personal = true });
            }

            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                var request = new HttpRequestMessage(HttpMethod.Put, "matches");
                request.Headers.Add("Authorization", $"Bearer {token}");

                var requestBody = new
                {
                    matchId = model.MatchId,  // Updated to use MatchId
                    courtLocation = model.CourtLocation,
                    matchTime = model.MatchTime.ToUniversalTime().ToString("o"),
                    matchType = model.MatchType.ToLower()
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update match");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while updating match {MatchId}", model.MatchId);
                ModelState.AddModelError("", "An error occurred while updating the match");
            }

            return RedirectToAction(nameof(Index), new { personal = true });
        }
    }
}