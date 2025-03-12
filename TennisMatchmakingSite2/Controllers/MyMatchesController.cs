using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using TennisMatchmakingSite2.Models;
using System.Text.Json;
using System.Collections.Generic;
using System.Threading.Tasks;
using System;
using System.Linq;

namespace TennisMatchmakingSite2.Controllers
{
    public class MyMatchesController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<MyMatchesController> _logger;

        public MyMatchesController(IConfiguration configuration, ILogger<MyMatchesController> logger)
        {
            _configuration = configuration;
            _logger = logger;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_configuration["ApiBaseUrl"] ?? throw new InvalidOperationException("ApiBaseUrl not configured"))
            };
        }

        public async Task<IActionResult> Index()
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                var request = new HttpRequestMessage(HttpMethod.Get, "comp-matches/active");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                _logger.LogInformation("Attempting to fetch active matches");
                var response = await _httpClient.SendAsync(request);

                _logger.LogInformation($"Response status: {response.StatusCode}");

                if (response.IsSuccessStatusCode)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    _logger.LogInformation($"Response content: {responseContent}");

                    // Use JsonDocument to parse and access the matches
                    using (JsonDocument doc = JsonDocument.Parse(responseContent))
                    {
                        if (doc.RootElement.TryGetProperty("matches", out JsonElement matchesElement))
                        {
                            _logger.LogInformation($"Found matches element: {matchesElement.GetArrayLength()} items");

                            var options = new JsonSerializerOptions
                            {
                                PropertyNameCaseInsensitive = true
                            };

                            var matches = JsonSerializer.Deserialize<List<CompMatchData>>(
                                matchesElement.GetRawText(), options);

                            _logger.LogInformation($"Successfully deserialized {matches?.Count ?? 0} matches");

                            if (matches != null && matches.Count > 0)
                            {
                                // Process each match to add missing data and set isChallengee flag
                                string userId = HttpContext.Session.GetString("UserId");
                                foreach (var match in matches)
                                {
                                    // Calculate time remaining and expired status
                                    if (match.Deadline.HasValue)
                                    {
                                        DateTime now = DateTime.UtcNow;
                                        TimeSpan timeRemaining = match.Deadline.Value - now;

                                        match.IsExpired = timeRemaining.TotalMilliseconds <= 0;
                                        match.TimeRemaining = (long)Math.Max(0, timeRemaining.TotalMilliseconds);
                                    }

                                    // Set isChallengee flag for ladder matches
                                    if (!string.IsNullOrEmpty(match.ChallengeeId) && match.ChallengeeId == userId)
                                    {
                                        match.IsChallengee = true;
                                    }

                                    // Log match details for debugging
                                    _logger.LogInformation($"Match ID: {match.Id}, Type: {(match.TournamentId != null ? "Tournament" : "Ladder")}, Status: {match.Status}");
                                }

                                // Separate tournament and ladder matches
                                var tournamentMatches = matches
                                    .Where(m => !string.IsNullOrEmpty(m.TournamentId))
                                    .ToList();

                                var ladderMatches = matches
                                    .Where(m => !string.IsNullOrEmpty(m.LadderId))
                                    .ToList();

                                _logger.LogInformation($"Categorized matches - Tournament: {tournamentMatches.Count}, Ladder: {ladderMatches.Count}");

                                // Set ViewBag properties
                                ViewBag.TournamentMatches = tournamentMatches;
                                ViewBag.LadderMatches = ladderMatches;

                                return View(matches);
                            }
                            else
                            {
                                _logger.LogInformation("No matches found or failed to deserialize");
                            }
                        }
                        else
                        {
                            _logger.LogWarning("No 'matches' property found in response");
                        }
                    }
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("API request failed: {StatusCode} {Content}",
                        response.StatusCode, errorContent);

                    ModelState.AddModelError("", $"Failed to load active matches: {response.StatusCode}");
                }

                // If we get here, there was an error or no matches
                ViewBag.TournamentMatches = new List<CompMatchData>();
                ViewBag.LadderMatches = new List<CompMatchData>();
                return View(new List<CompMatchData>());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading active matches");
                ModelState.AddModelError("", "An error occurred while loading your matches");
                ViewBag.TournamentMatches = new List<CompMatchData>();
                ViewBag.LadderMatches = new List<CompMatchData>();
                return View(new List<CompMatchData>());
            }
        }

        [HttpPost]
        public async Task<IActionResult> SubmitTournamentResult(string tournamentId, string matchId, string winner, List<ScoreSet> Scores)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Check if tournament ID is missing
                if (string.IsNullOrEmpty(tournamentId))
                {
                    _logger.LogError("Tournament ID is missing for match ID: {MatchId}", matchId);
                    TempData["ErrorMessage"] = "Tournament ID is missing. Cannot submit result.";
                    return RedirectToAction(nameof(Index));
                }

                // Submit to the tournament endpoint with proper URL format
                var request = new HttpRequestMessage(HttpMethod.Post, $"tournaments/{tournamentId}/matches/{matchId}/result");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    winner = winner,
                    scores = Scores.Select(s => new { player1 = s.Player1, player2 = s.Player2 }).ToList(),
                    isResubmission = false // Regular submission
                };

                _logger.LogInformation($"Submitting tournament result to {request.RequestUri}, Body: {JsonSerializer.Serialize(requestBody)}");

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Response: {response.StatusCode}, Content: {responseContent}");

                if (!response.IsSuccessStatusCode)
                {
                    TempData["ErrorMessage"] = $"Failed to submit match result: {responseContent}";
                }
                else
                {
                    TempData["SuccessMessage"] = "Match result submitted successfully";
                }

                return RedirectToAction(nameof(Index));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error submitting tournament match result");
                TempData["ErrorMessage"] = "An error occurred while submitting the match result";
                return RedirectToAction(nameof(Index));
            }
        }

        [HttpPost]
        public async Task<IActionResult> SubmitLadderResult(string ladderId, string matchId, string winner, List<ScoreSet> Scores)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Check if ladder ID is missing
                if (string.IsNullOrEmpty(ladderId))
                {
                    _logger.LogError("Ladder ID is missing for match ID: {MatchId}", matchId);
                    TempData["ErrorMessage"] = "Ladder ID is missing. Cannot submit result.";
                    return RedirectToAction(nameof(Index));
                }

                // Submit to the ladder endpoint with proper URL format
                var request = new HttpRequestMessage(HttpMethod.Post, $"ladders/{ladderId}/matches/{matchId}/result");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    winner = winner,
                    scores = Scores.Select(s => new { player1 = s.Player1, player2 = s.Player2 }).ToList(),
                    isResubmission = false // Regular submission
                };

                _logger.LogInformation($"Submitting ladder result to {request.RequestUri}, Body: {JsonSerializer.Serialize(requestBody)}");

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Response: {response.StatusCode}, Content: {responseContent}");

                if (!response.IsSuccessStatusCode)
                {
                    TempData["ErrorMessage"] = $"Failed to submit match result: {responseContent}";
                }
                else
                {
                    TempData["SuccessMessage"] = "Match result submitted successfully";
                }

                return RedirectToAction(nameof(Index));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error submitting ladder match result");
                TempData["ErrorMessage"] = "An error occurred while submitting the match result";
                return RedirectToAction(nameof(Index));
            }
        }

        [HttpPost]
        public async Task<IActionResult> ResubmitDisputedResult(string id, string matchId, string type, string winner, List<ScoreSet> Scores)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Check if ID is missing
                if (string.IsNullOrEmpty(id))
                {
                    _logger.LogError("ID is missing for resubmission of match ID: {MatchId}", matchId);
                    TempData["ErrorMessage"] = "Tournament/Ladder ID is missing. Cannot resubmit result.";
                    return RedirectToAction(nameof(Index));
                }

                // Check if matchId is missing (additional validation)
                if (string.IsNullOrEmpty(matchId))
                {
                    _logger.LogError("Match ID is missing for resubmission with ID: {Id}", id);
                    TempData["ErrorMessage"] = "Match ID is missing. Cannot resubmit result.";
                    return RedirectToAction(nameof(Index));
                }

                _logger.LogInformation("Resubmitting disputed result: Type={Type}, Id={Id}, MatchId={MatchId}, Winner={Winner}",
                    type, id, matchId, winner);

                // First, try to reset the match state by calling a separate API endpoint
                string resetEndpoint;
                if (type.ToLower() == "tournament")
                {
                    resetEndpoint = $"tournaments/{id}/matches/{matchId}/reset";
                }
                else
                {
                    resetEndpoint = $"ladders/{id}/matches/{matchId}/reset";
                }

                // Try to reset the match first (if the endpoint exists)
                try
                {
                    var resetRequest = new HttpRequestMessage(HttpMethod.Post, resetEndpoint);
                    resetRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                    var resetResponse = await _httpClient.SendAsync(resetRequest);
                    var resetContent = await resetResponse.Content.ReadAsStringAsync();

                    _logger.LogInformation("Reset response: {StatusCode}, Content: {Content}",
                        resetResponse.StatusCode, resetContent);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Reset endpoint not available or failed, continuing with direct resubmission");
                    // Continue with regular submission
                }

                // Now submit the result normally, but with isResubmission=true
                // Determine the correct endpoint based on type
                string endpoint;
                if (type.ToLower() == "tournament")
                {
                    endpoint = $"tournaments/{id}/matches/{matchId}/result";
                }
                else
                {
                    endpoint = $"ladders/{id}/matches/{matchId}/result";
                }

                var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    winner = winner,
                    scores = Scores.Select(s => new { player1 = s.Player1, player2 = s.Player2 }).ToList(),
                    isResubmission = true // Explicitly mark as resubmission
                };

                var jsonContent = JsonSerializer.Serialize(requestBody);
                _logger.LogInformation("Request body: {RequestBody}", jsonContent);

                request.Content = JsonContent.Create(requestBody);

                // Send the API request
                var response = await _httpClient.SendAsync(request);

                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Resubmission response: {StatusCode}, Content: {Content}",
                    response.StatusCode, responseContent);

                if (!response.IsSuccessStatusCode)
                {
                    // If we get the "already submitted" error, try directly modifying the match state
                    if (responseContent.Contains("already submitted"))
                    {
                        // Try a workaround using a different API call pattern
                        var alternateEndpoint = "";

                        if (type.ToLower() == "tournament")
                        {
                            alternateEndpoint = $"tournaments/{id}/force-resubmit/{matchId}";
                        }
                        else
                        {
                            alternateEndpoint = $"ladders/{id}/force-resubmit/{matchId}";
                        }

                        var alternateRequest = new HttpRequestMessage(HttpMethod.Post, alternateEndpoint);
                        alternateRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                        alternateRequest.Content = JsonContent.Create(requestBody);

                        var alternateResponse = await _httpClient.SendAsync(alternateRequest);
                        var alternateContent = await alternateResponse.Content.ReadAsStringAsync();

                        _logger.LogInformation("Alternate submission response: {StatusCode}, Content: {Content}",
                            alternateResponse.StatusCode, alternateContent);

                        if (alternateResponse.IsSuccessStatusCode)
                        {
                            TempData["SuccessMessage"] = "Match result resubmitted successfully (alternate method)";
                            return RedirectToAction(nameof(Index));
                        }
                        else
                        {
                            TempData["ErrorMessage"] = "Failed to resubmit match result. Please contact support or try again.";
                        }
                    }
                    else
                    {
                        TempData["ErrorMessage"] = $"Failed to resubmit match result: {responseContent}";
                    }
                }
                else
                {
                    TempData["SuccessMessage"] = "Match result resubmitted successfully";
                }

                return RedirectToAction(nameof(Index));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resubmitting match result");
                TempData["ErrorMessage"] = $"An error occurred while resubmitting the match result: {ex.Message}";
                return RedirectToAction(nameof(Index));
            }
        }

        [HttpPost]
        public async Task<IActionResult> RespondToChallenge(string ladderId, string matchId, string response)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Check if ladder ID is missing
                if (string.IsNullOrEmpty(ladderId))
                {
                    _logger.LogError("Ladder ID is missing for challenge response, match ID: {MatchId}", matchId);
                    TempData["ErrorMessage"] = "Ladder ID is missing. Cannot respond to challenge.";
                    return RedirectToAction(nameof(Index));
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"ladders/{ladderId}/matches/{matchId}/respond");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new { response = response.ToLower() };

                request.Content = JsonContent.Create(requestBody);
                var httpResponse = await _httpClient.SendAsync(request);

                if (!httpResponse.IsSuccessStatusCode)
                {
                    var responseContent = await httpResponse.Content.ReadAsStringAsync();
                    _logger.LogWarning("API request failed: {StatusCode} {Content}",
                        httpResponse.StatusCode, responseContent);

                    TempData["ErrorMessage"] = $"Failed to {response.ToLower()} challenge: {responseContent}";
                }
                else
                {
                    TempData["SuccessMessage"] = $"Challenge {response.ToLower()}ed successfully";
                }

                return RedirectToAction(nameof(Index));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error responding to ladder challenge");
                TempData["ErrorMessage"] = "An error occurred while responding to the challenge";
                return RedirectToAction(nameof(Index));
            }
        }
    }
}