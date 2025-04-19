using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using TennisMatchmakingSite2.Models;
using System.Text.Json;
using System.Collections.Generic;
using System.Threading.Tasks;
using System;
using System.Linq;
using TennisMatchmakingSite2.Services;

namespace TennisMatchmakingSite2.Controllers
{
    public class MyMatchesController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<MyMatchesController> _logger;
        private readonly NotificationService _notificationService;

        public MyMatchesController(
            IConfiguration configuration,
            ILogger<MyMatchesController> logger,
            NotificationService notificationService) // Add NotificationService dependency
        {
            _configuration = configuration;
            _logger = logger;
            _notificationService = notificationService;
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
                var submitterUserId = HttpContext.Session.GetString("UserId");
                var submitterName = HttpContext.Session.GetString("UserName");

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

                _logger.LogInformation("SubmitTournamentResult called - TournamentId: {TournamentId}, MatchId: {MatchId}, Winner: {Winner}, SubmitterUserId: {SubmitterUserId}",
                    tournamentId, matchId, winner, submitterUserId);

                // Get tournament details to identify players
                var tournament = await FetchDataFromApi<TournamentDetailData>($"tournaments/{tournamentId}", token);
                if (tournament == null)
                {
                    TempData["ErrorMessage"] = "Tournament details could not be loaded";
                    return RedirectToAction(nameof(Index));
                }

                // Get match details
                var matchDetails = tournament.Matches?.FirstOrDefault(m => m.Id == matchId);
                if (matchDetails == null)
                {
                    TempData["ErrorMessage"] = "Match not found";
                    return RedirectToAction(nameof(Index));
                }

                // Get player IDs and names for notifications
                var player1Id = matchDetails.Player1;
                var player2Id = matchDetails.Player2;
                var player1Details = tournament.PlayerDetails?.FirstOrDefault(p => p.Id == player1Id);
                var player2Details = tournament.PlayerDetails?.FirstOrDefault(p => p.Id == player2Id);
                var player1Name = player1Details?.Name ?? "Opponent";
                var player2Name = player2Details?.Name ?? "Opponent";

                // Determine the opponent
                string opponentId = submitterUserId == player1Id ? player2Id : player1Id;
                string opponentName = submitterUserId == player1Id ? player2Name : player1Name;

                _logger.LogInformation("Determined opponent - OpponentId: {OpponentId}, OpponentName: {OpponentName}",
                    opponentId, opponentName);

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
                    // Check if match is finalized
                    bool isMatchFinalized = false;
                    try
                    {
                        using (JsonDocument document = JsonDocument.Parse(responseContent))
                        {
                            if (document.RootElement.TryGetProperty("status", out JsonElement statusElement) &&
                                (statusElement.GetString() == "completed" || statusElement.GetString() == "confirmed"))
                            {
                                isMatchFinalized = true;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error parsing match status from response");
                    }

                    _logger.LogInformation("Match status determined - IsFinalized: {IsFinalized}", isMatchFinalized);

                    // If the match is not yet finalized, notify the opponent to submit their result too
                    if (!isMatchFinalized && !string.IsNullOrEmpty(opponentId))
                    {
                        // Use the specialized notification method for tournament match submissions
                        var notificationSent = await _notificationService.SendTournamentMatchSubmissionNotification(
                            opponentId,
                            submitterName,
                            tournamentId,
                            tournament.Name,
                            matchId
                        );

                        if (notificationSent)
                        {
                            _logger.LogInformation("Notification sent successfully to opponent {OpponentId}", opponentId);
                        }
                        else
                        {
                            _logger.LogError("Failed to send notification to opponent {OpponentId}", opponentId);
                        }
                    }

                    // If match is finalized, notify both players and tournament participants
                    if (isMatchFinalized)
                    {
                        _logger.LogInformation("Match is finalized. Notifying participants.");

                        // Format scores for display (e.g., "6-4, 7-5")
                        string scoreDisplay = string.Join(", ", Scores.Select(s => $"{s.Player1}-{s.Player2}"));

                        // Get winner details
                        string winnerName = winner == player1Id ? player1Name : player2Name;
                        string loserName = winner == player1Id ? player2Name : player1Name;

                        // Notify opponent about match result
                        if (opponentId != submitterUserId)
                        {
                            await _notificationService.SendTournamentMatchResultNotification(
                                opponentId,
                                submitterUserId == player1Id ? player1Name : player2Name,
                                winner == opponentId,
                                tournamentId,
                                tournament.Name,
                                matchId
                            );
                        }

                        // Notify all tournament participants about the result
                        if (tournament.Players != null)
                        {
                            foreach (var playerId in tournament.Players)
                            {
                                // Skip the players who were in the match
                                if (playerId == player1Id || playerId == player2Id)
                                    continue;

                                await _notificationService.CreateNotificationAsync(
                                    playerId,
                                    "tournament_match_completed",
                                    $"{winnerName} defeated {loserName} ({scoreDisplay}) in tournament \"{tournament.Name}\"",
                                    matchId,
                                    null,
                                    new Dictionary<string, string> { { "tournamentId", tournamentId } }
                                );
                            }
                        }
                    }

                    TempData["SuccessMessage"] = isMatchFinalized
                        ? "Match result finalized successfully"
                        : "Match result submitted successfully. Waiting for opponent to confirm.";
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
                var submitterUserId = HttpContext.Session.GetString("UserId");
                var submitterName = HttpContext.Session.GetString("UserName");

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

                _logger.LogInformation("SubmitLadderResult called - LadderId: {LadderId}, MatchId: {MatchId}, Winner: {Winner}, SubmitterUserId: {SubmitterUserId}",
                    ladderId, matchId, winner, submitterUserId);

                // Get ladder details
                var ladder = await FetchDataFromApi<LadderDetailData>($"ladders/{ladderId}", token);
                if (ladder == null)
                {
                    TempData["ErrorMessage"] = "Ladder details could not be loaded";
                    return RedirectToAction(nameof(Index));
                }

                // Get match details
                var matchDetails = ladder.Matches?.FirstOrDefault(m => m.Id == matchId);
                if (matchDetails == null)
                {
                    TempData["ErrorMessage"] = "Match not found";
                    return RedirectToAction(nameof(Index));
                }

                // Get player IDs and determine opponent
                var challengerId = matchDetails.ChallengerId;
                var challengeeId = matchDetails.ChallengeeId;

                // Find player details
                var challengerDetails = ladder.Positions.FirstOrDefault(p => p.PlayerId == challengerId)?.PlayerDetails;
                var challengeeDetails = ladder.Positions.FirstOrDefault(p => p.PlayerId == challengeeId)?.PlayerDetails;

                var challengerName = challengerDetails?.Name ?? "Challenger";
                var challengeeName = challengeeDetails?.Name ?? "Opponent";

                // Determine opponent based on submitter
                string opponentId = submitterUserId == challengerId ? challengeeId : challengerId;
                string opponentName = submitterUserId == challengerId ? challengeeName : challengerName;

                _logger.LogInformation("Determined opponent - OpponentId: {OpponentId}, OpponentName: {OpponentName}",
                    opponentId, opponentName);

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
                    // Check if match is now finalized
                    bool isMatchFinalized = false;
                    try
                    {
                        using (JsonDocument document = JsonDocument.Parse(responseContent))
                        {
                            if (document.RootElement.TryGetProperty("status", out JsonElement statusElement) &&
                                (statusElement.GetString() == "completed" || statusElement.GetString() == "confirmed"))
                            {
                                isMatchFinalized = true;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error parsing match status from response");
                    }

                    _logger.LogInformation("Match status determined - IsFinalized: {IsFinalized}", isMatchFinalized);

                    // If this is the first submission (not yet finalized), notify the opponent
                    if (!isMatchFinalized && !string.IsNullOrEmpty(opponentId))
                    {
                        // Use the specialized LadderChallengeResultNotification method 
                        // (since ladder doesn't have a dedicated match submission notification)
                        var notificationSent = await _notificationService.SendLadderChallengeResultNotification(
                            opponentId,
                            submitterName,
                            false, // Since this is a submission not a result
                            ladderId,
                            ladder.Name,
                            matchId
                        );

                        if (notificationSent)
                        {
                            _logger.LogInformation("Notification sent successfully to opponent {OpponentId}", opponentId);
                        }
                        else
                        {
                            _logger.LogError("Failed to send notification to opponent {OpponentId}", opponentId);
                        }
                    }

                    // If match is finalized, notify players about the result
                    if (isMatchFinalized)
                    {
                        _logger.LogInformation("Match is finalized. Notifying participants.");

                        // Notify opponent about match result
                        if (opponentId != submitterUserId)
                        {
                            await _notificationService.SendLadderChallengeResultNotification(
                                opponentId,
                                submitterUserId == challengerId ? challengerName : challengeeName,
                                winner == opponentId,
                                ladderId,
                                ladder.Name,
                                matchId
                            );
                        }

                        // Store pre-match positions to check for changes later
                        var preMatchPositions = ladder.Positions.ToDictionary(p => p.PlayerId, p => p.Rank);

                        // Get updated ladder to check position changes
                        var updatedLadder = await FetchDataFromApi<LadderDetailData>($"ladders/{ladderId}", token);

                        if (updatedLadder != null)
                        {
                            var updatedPositions = updatedLadder.Positions.ToDictionary(p => p.PlayerId, p => p.Rank);

                            // Notify players of position changes
                            foreach (var position in updatedPositions)
                            {
                                if (preMatchPositions.TryGetValue(position.Key, out int oldRank) &&
                                    position.Value != oldRank)
                                {
                                    await _notificationService.SendLadderPositionChangeNotification(
                                        position.Key,
                                        ladderId,
                                        ladder.Name,
                                        oldRank,
                                        position.Value
                                    );
                                }
                            }
                        }
                    }

                    TempData["SuccessMessage"] = isMatchFinalized
                        ? "Match result finalized successfully"
                        : "Match result submitted successfully. Waiting for opponent to confirm.";
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

                // Based on type, redirect to the appropriate submission method
                if (type.ToLower() == "tournament")
                {
                    return await SubmitTournamentResult(id, matchId, winner, Scores);
                }
                else if (type.ToLower() == "ladder")
                {
                    return await SubmitLadderResult(id, matchId, winner, Scores);
                }
                else
                {
                    TempData["ErrorMessage"] = "Invalid competition type";
                    return RedirectToAction(nameof(Index));
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resubmitting disputed result");
                TempData["ErrorMessage"] = "An error occurred while resubmitting the match result";
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

        // Helper method to fetch data from API
        private async Task<T> FetchDataFromApi<T>(string endpoint, string token) where T : class
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    // Process the response content based on the expected type
                    if (typeof(T) == typeof(TournamentDetailData))
                    {
                        var wrapper = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
                        if (wrapper != null && wrapper.TryGetValue("tournament", out var tournament))
                        {
                            var json = System.Text.Json.JsonSerializer.Serialize(tournament);
                            return System.Text.Json.JsonSerializer.Deserialize<T>(json);
                        }
                    }
                    else if (typeof(T) == typeof(LadderDetailData))
                    {
                        var wrapper = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
                        if (wrapper != null && wrapper.TryGetValue("ladder", out var ladder))
                        {
                            var json = System.Text.Json.JsonSerializer.Serialize(ladder);
                            return System.Text.Json.JsonSerializer.Deserialize<T>(json);
                        }
                    }

                    // Direct deserialization fallback
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
    }
}