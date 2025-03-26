using Microsoft.AspNetCore.Mvc;
using TennisMatchmakingSite2.Models;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using TennisMatchmakingSite2.Services;
namespace TennisMatchmakingSite2.Controllers
{
    public class TournamentsController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<TournamentsController> _logger;
        private readonly NotificationService _notificationService;

        public TournamentsController(
     IConfiguration configuration,
     ILogger<TournamentsController> logger,
     NotificationService notificationService) // Add this parameter
        {
            _configuration = configuration;
            _logger = logger;
            _notificationService = notificationService; // Add this line
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_configuration["ApiBaseUrl"] ?? throw new InvalidOperationException("ApiBaseUrl not configured"))
            };
        }

        [HttpGet]
        public async Task<IActionResult> Index(bool personal = false, bool showCompleted = false)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Get tournaments
                var tournamentsResponse = await FetchDataFromApi<List<TournamentData>>(
                    $"tournaments{(personal ? "?personal=true" : "")}",
                    token
                );

                if (tournamentsResponse == null)
                {
                    ModelState.AddModelError("", "Failed to load tournaments");
                    tournamentsResponse = new List<TournamentData>();
                }

                // Get ladders
                var laddersResponse = await FetchDataFromApi<List<LadderData>>(
                    $"ladders{(personal ? "?personal=true" : "")}",
                    token
                );

                if (laddersResponse == null)
                {
                    ModelState.AddModelError("", "Failed to load ladders");
                    laddersResponse = new List<LadderData>();
                }

                // Create a combined model
                var viewModel = new CompetitionViewModel
                {
                    Tournaments = tournamentsResponse,
                    Ladders = laddersResponse,
                    IsPersonal = personal
                };

                // Pass showCompleted to the ViewBag or ViewData to ensure it's available in the view
                ViewBag.ShowCompleted = showCompleted;

                return View(viewModel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading tournaments and ladders page");
                ModelState.AddModelError("", "An error occurred while loading tournaments and ladders");
                return View(new CompetitionViewModel
                {
                    Tournaments = new List<TournamentData>(),
                    Ladders = new List<LadderData>(),
                    IsPersonal = personal
                });
            }
        }

        [HttpGet]
        public async Task<IActionResult> TournamentDetails(string id)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Get tournament details
                var tournament = await FetchDataFromApi<TournamentDetailData>(
                    $"tournaments/{id}",
                    token
                );

                if (tournament == null)
                {
                    return RedirectToAction(nameof(Index));
                }

                return View(tournament);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading tournament details for ID {TournamentId}", id);
                return RedirectToAction(nameof(Index));
            }
        }

        [HttpGet]
        public async Task<IActionResult> LadderDetails(string id)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Get ladder details
                var ladder = await FetchDataFromApi<LadderDetailData>(
                    $"ladders/{id}",
                    token
                );

                if (ladder == null)
                {
                    return RedirectToAction(nameof(Index));
                }

                return View(ladder);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading ladder details for ID {LadderId}", id);
                return RedirectToAction(nameof(Index));
            }
        }

        [HttpGet]
        public IActionResult CreateTournament()
        {
            var token = HttpContext.Session.GetString("JWTToken");
            if (string.IsNullOrEmpty(token))
            {
                return RedirectToAction("Login", "Account");
            }

            return View(new CreateTournamentViewModel());
        }

        // 15. CreateTournament - Add automatic notification to creator
        [HttpPost]
        public async Task<IActionResult> CreateTournament(CreateTournamentViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var userId = HttpContext.Session.GetString("UserId");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (!ModelState.IsValid)
                {
                    return View(model);
                }

                var request = new HttpRequestMessage(HttpMethod.Post, "tournaments");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    name = model.Name,
                    format = model.Format.ToLower(),
                    visibility = model.Visibility.ToLower(),
                    challengeWindow = model.ChallengeWindow,
                    skillLevel = model.SkillLevel
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    // Get the tournament ID from the response if available
                    string tournamentId = null;
                    try
                    {
                        var responseJson = await response.Content.ReadAsStringAsync();
                        using (JsonDocument document = JsonDocument.Parse(responseJson))
                        {
                            if (document.RootElement.TryGetProperty("tournamentId", out JsonElement tournamentIdElement))
                            {
                                tournamentId = tournamentIdElement.GetString();
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error extracting tournament ID from creation response");
                    }

                    // Create a confirmation notification for the creator
                    if (!string.IsNullOrEmpty(userId) && !string.IsNullOrEmpty(tournamentId))
                    {
                        await _notificationService.CreateNotificationAsync(
                            userId,
                            "tournament_created",
                            $"You have successfully created the tournament \"{model.Name}\". Invite players to get started!",
                            tournamentId,
                            userId,
                            null
                        );
                    }

                    return RedirectToAction(nameof(Index), new { personal = true });
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                ModelState.AddModelError("", error?.Message ?? "Failed to create tournament");
                return View(model);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating tournament");
                ModelState.AddModelError("", "An error occurred while creating the tournament");
                return View(model);
            }
        }


        [HttpGet]
        public IActionResult CreateLadder()
        {
            var token = HttpContext.Session.GetString("JWTToken");
            if (string.IsNullOrEmpty(token))
            {
                return RedirectToAction("Login", "Account");
            }

            return View(new CreateLadderViewModel());
        }

        [HttpPost]
        public async Task<IActionResult> CreateLadder(CreateLadderViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var userId = HttpContext.Session.GetString("UserId");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (!ModelState.IsValid)
                {
                    return View(model);
                }

                var request = new HttpRequestMessage(HttpMethod.Post, "ladders");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    name = model.Name,
                    visibility = model.Visibility.ToLower(),
                    challengeWindow = model.ChallengeWindow,
                    skillLevel = model.SkillLevel
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    // Get the ladder ID from the response if available
                    string ladderId = null;
                    try
                    {
                        var responseJson = await response.Content.ReadAsStringAsync();
                        using (JsonDocument document = JsonDocument.Parse(responseJson))
                        {
                            if (document.RootElement.TryGetProperty("ladderId", out JsonElement ladderIdElement))
                            {
                                ladderId = ladderIdElement.GetString();
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error extracting ladder ID from creation response");
                    }

                    // Create a confirmation notification for the creator
                    if (!string.IsNullOrEmpty(userId) && !string.IsNullOrEmpty(ladderId))
                    {
                        await _notificationService.CreateNotificationAsync(
                            userId,
                            "ladder_created",
                            $"You have successfully created the ladder \"{model.Name}\". Invite players to get started!",
                            ladderId,
                            userId,
                            null
                        );
                    }

                    return RedirectToAction(nameof(Index), new { personal = true });
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                ModelState.AddModelError("", error?.Message ?? "Failed to create ladder");
                return View(model);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating ladder");
                ModelState.AddModelError("", "An error occurred while creating the ladder");
                return View(model);
            }
        }

        [HttpPost]
        public async Task<IActionResult> JoinTournament(string id)
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

                // Get tournament details first to have creator info for notification
                var tournament = await FetchDataFromApi<TournamentDetailData>($"tournaments/{id}", token);

                if (tournament == null)
                {
                    TempData["ErrorMessage"] = "Tournament not found";
                    return RedirectToAction(nameof(Index));
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"tournaments/{id}/join");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? "Failed to join tournament";
                }
                else
                {
                    // Notify tournament creator that someone joined
                    if (!string.IsNullOrEmpty(tournament.CreatorId) && tournament.CreatorId != userId)
                    {
                        await _notificationService.CreateNotificationAsync(
                             tournament.CreatorId,
                             "tournament_player_joined",
                             $"{userName} has joined your tournament \"{tournament.Name}\"",
                             id,
                             userId,
                             null
                         );
                    }

                    TempData["SuccessMessage"] = "Successfully joined tournament";
                }

                return RedirectToAction(nameof(TournamentDetails), new { id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error joining tournament {TournamentId}", id);
                TempData["ErrorMessage"] = "An error occurred while joining the tournament";
                return RedirectToAction(nameof(TournamentDetails), new { id });
            }
        }

        // 10. JoinLadder - Add notification to ladder creator
        [HttpPost]
        public async Task<IActionResult> JoinLadder(string id)
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

                // Get ladder details first
                var ladder = await FetchDataFromApi<LadderDetailData>($"ladders/{id}", token);

                if (ladder == null)
                {
                    TempData["ErrorMessage"] = "Ladder not found";
                    return RedirectToAction(nameof(Index));
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"ladders/{id}/join");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? "Failed to join ladder";
                }
                else
                {
                    // Notify ladder creator
                    if (!string.IsNullOrEmpty(ladder.CreatorId) && ladder.CreatorId != userId)
                    {
                        await _notificationService.CreateNotificationAsync(
                            ladder.CreatorId,
                            "ladder_player_joined",
                            $"{userName} has joined your ladder \"{ladder.Name}\"",
                            id,
                            userId,
                            null
                        );
                    }

                    TempData["SuccessMessage"] = "Successfully joined ladder";
                }

                return RedirectToAction(nameof(LadderDetails), new { id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error joining ladder {LadderId}", id);
                TempData["ErrorMessage"] = "An error occurred while joining the ladder";
                return RedirectToAction(nameof(LadderDetails), new { id });
            }
        }


        [HttpPost]
        public async Task<IActionResult> SubmitLadderMatchResult(string id, string matchId, string winner, List<ScoreSet> Scores)
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

                // Get ladder and match details first
                var ladder = await FetchDataFromApi<LadderDetailData>($"ladders/{id}", token);

                if (ladder == null)
                {
                    TempData["ErrorMessage"] = "Ladder not found";
                    return RedirectToAction(nameof(Index));
                }

                // Get match details to identify challenger and challengee
                var matchDetails = ladder.Matches?.FirstOrDefault(m => m.Id == matchId);

                if (matchDetails == null)
                {
                    TempData["ErrorMessage"] = "Match not found";
                    return RedirectToAction(nameof(LadderDetails), new { id });
                }

                var challengerId = matchDetails.ChallengerId;
                var challengeeId = matchDetails.ChallengeeId;

                // Get player positions before the match
                var preMatchPositions = ladder.Positions.ToDictionary(p => p.PlayerId, p => p.Rank);

                // Get player names for notifications
                var challengerDetails = ladder.Positions.FirstOrDefault(p => p.PlayerId == challengerId)?.PlayerDetails;
                var challengeeDetails = ladder.Positions.FirstOrDefault(p => p.PlayerId == challengeeId)?.PlayerDetails;

                var challengerName = challengerDetails?.Name ?? "Challenger";
                var challengeeName = challengeeDetails?.Name ?? "Opponent";

                var request = new HttpRequestMessage(HttpMethod.Post, $"ladders/{id}/matches/{matchId}/result");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    winner = winner,
                    scores = Scores.Select(s => new { player1 = s.Player1, player2 = s.Player2 }).ToList()
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? "Failed to submit match result";
                }
                else
                {
                    // Get updated ladder to check for position changes
                    var updatedLadder = await FetchDataFromApi<LadderDetailData>($"ladders/{id}", token);

                    if (updatedLadder != null)
                    {
                        // Send match result notifications first
                        if (challengerId != null && challengerId != submitterUserId)
                        {
                            await _notificationService.SendLadderChallengeResultNotification(
                                challengerId,
                                challengeeName,
                                winner == challengerId,
                                id,
                                ladder.Name,
                                matchId
                            );
                        }

                        if (challengeeId != null && challengeeId != submitterUserId)
                        {
                            await _notificationService.SendLadderChallengeResultNotification(
                                challengeeId,
                                challengerName,
                                winner == challengeeId,
                                id,
                                ladder.Name,
                                matchId
                            );
                        }

                        // Check for position changes and send notifications
                        var updatedPositions = updatedLadder.Positions.ToDictionary(p => p.PlayerId, p => p.Rank);

                        foreach (var player in updatedPositions.Keys)
                        {
                            if (preMatchPositions.TryGetValue(player, out int oldPosition) &&
                                updatedPositions[player] != oldPosition)
                            {
                                await _notificationService.SendLadderPositionChangeNotification(
                                    player,
                                    id,
                                    ladder.Name,
                                    oldPosition,
                                    updatedPositions[player]
                                );
                            }
                        }
                    }

                    TempData["SuccessMessage"] = "Match result submitted successfully";
                }

                return RedirectToAction(nameof(LadderDetails), new { id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error submitting match result for ladder {LadderId}, match {MatchId}", id, matchId);
                TempData["ErrorMessage"] = "An error occurred while submitting the match result";
                return RedirectToAction(nameof(LadderDetails), new { id });
            }
        }

        [HttpPost]
        public async Task<IActionResult> SubmitMatchResult(string id, string matchId, string winner, List<ScoreSet> Scores)
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

                // Get tournament and match details first
                var tournament = await FetchDataFromApi<TournamentDetailData>($"tournaments/{id}", token);

                if (tournament == null)
                {
                    TempData["ErrorMessage"] = "Tournament not found";
                    return RedirectToAction(nameof(Index));
                }

                // Get match details to identify players
                var matchDetails = tournament.Matches?.FirstOrDefault(m => m.Id == matchId);

                if (matchDetails == null)
                {
                    TempData["ErrorMessage"] = "Match not found";
                    return RedirectToAction(nameof(TournamentDetails), new { id });
                }

                var player1Id = matchDetails.Player1;
                var player2Id = matchDetails.Player2;

                // Get player names for notifications
                var player1Details = tournament.PlayerDetails?.FirstOrDefault(p => p.Id == player1Id);
                var player2Details = tournament.PlayerDetails?.FirstOrDefault(p => p.Id == player2Id);

                var player1Name = player1Details?.Name ?? "Opponent";
                var player2Name = player2Details?.Name ?? "Opponent";

                var request = new HttpRequestMessage(HttpMethod.Post, $"tournaments/{id}/matches/{matchId}/result");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    winner = winner,
                    scores = Scores.Select(s => new { player1 = s.Player1, player2 = s.Player2 }).ToList()
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? "Failed to submit match result";
                }
                else
                {
                    // Send notifications to both players
                    if (player1Id != null && player1Id != submitterUserId)
                    {
                        await _notificationService.SendTournamentMatchResultNotification(
                            player1Id,
                            player2Name,
                            winner == player1Id,
                            id,
                            tournament.Name,
                            matchId
                        );
                    }

                    if (player2Id != null && player2Id != submitterUserId)
                    {
                        await _notificationService.SendTournamentMatchResultNotification(
                            player2Id,
                            player1Name,
                            winner == player2Id,
                            id,
                            tournament.Name,
                            matchId
                        );
                    }

                    TempData["SuccessMessage"] = "Match result submitted successfully";
                }

                return RedirectToAction(nameof(TournamentDetails), new { id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error submitting match result for tournament {TournamentId}, match {MatchId}", id, matchId);
                TempData["ErrorMessage"] = "An error occurred while submitting the match result";
                return RedirectToAction(nameof(TournamentDetails), new { id });
            }
        }

        [HttpPost]
        public async Task<IActionResult> StartTournament(string id)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var organizerName = HttpContext.Session.GetString("UserName");
                var organizerId = HttpContext.Session.GetString("UserId");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Get tournament details first to get participant list and name
                var tournament = await FetchDataFromApi<TournamentDetailData>($"tournaments/{id}", token);

                if (tournament == null)
                {
                    TempData["ErrorMessage"] = "Tournament not found";
                    return RedirectToAction(nameof(Index));
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"tournaments/{id}/start");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? "Failed to start tournament";
                }
                else
                {
                    // Notify all participants except the organizer
                    if (tournament.Players != null && tournament.Players.Any())
                    {
                        foreach (var playerId in tournament.Players)
                        {
                            // Skip notifying the organizer
                            if (playerId != organizerId)
                            {
                                await _notificationService.SendTournamentStartedNotification(
                                    playerId,
                                    organizerName,
                                    id,
                                    tournament.Name
                                );
                            }
                        }
                    }

                    TempData["SuccessMessage"] = "Tournament started successfully";
                }

                return RedirectToAction(nameof(TournamentDetails), new { id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error starting tournament {TournamentId}", id);
                TempData["ErrorMessage"] = "An error occurred while starting the tournament";
                return RedirectToAction(nameof(TournamentDetails), new { id });
            }
        }

        // 6. IssueChallenge - Notifies a user when they receive a ladder challenge
        [HttpPost]
        public async Task<IActionResult> IssueChallenge(string id, string challengeeId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var challengerName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Get ladder details first
                var ladder = await FetchDataFromApi<LadderDetailData>($"ladders/{id}", token);

                if (ladder == null)
                {
                    TempData["ErrorMessage"] = "Ladder not found";
                    return RedirectToAction(nameof(Index));
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"ladders/{id}/challenge");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    challengeeId = challengeeId
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? "Failed to issue challenge";
                }
                else
                {
                    // Try to extract match ID from response for reference
                    string matchId = null;
                    try
                    {
                        var responseJson = await response.Content.ReadAsStringAsync();
                        using (JsonDocument document = JsonDocument.Parse(responseJson))
                        {
                            if (document.RootElement.TryGetProperty("matchId", out JsonElement matchIdElement))
                            {
                                matchId = matchIdElement.GetString();
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error extracting match ID from challenge response");
                    }

                    // Send notification to challengee
                    await _notificationService.SendLadderChallengeNotification(
                        challengeeId,
                        challengerName,
                        id,
                        ladder.Name,
                        matchId ?? id  // Use match ID if available, otherwise use ladder ID
                    );

                    TempData["SuccessMessage"] = "Challenge issued successfully";
                }

                return RedirectToAction(nameof(LadderDetails), new { id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error issuing challenge in ladder {LadderId}", id);
                TempData["ErrorMessage"] = "An error occurred while issuing the challenge";
                return RedirectToAction(nameof(LadderDetails), new { id });
            }
        }



        // Helper method to process ladder JSON and convert winner IDs to UserDetails objects
        private string ProcessLadderJson(JsonElement ladderElement)
        {
            // Create a mutable JSON structure based on the ladder
            var ladderObject = JsonSerializer.Deserialize<JsonObject>(ladderElement.GetRawText());

            // Check if matches exist and process them
            if (ladderObject.TryGetPropertyValue("matches", out JsonNode matchesNode) && matchesNode is JsonArray matchesArray)
            {
                // For each match, check winner property
                for (int i = 0; i < matchesArray.Count; i++)
                {
                    if (matchesArray[i] is JsonObject matchObj)
                    {
                        // Check if winner is just an ID string
                        if (matchObj.TryGetPropertyValue("winner", out JsonNode winnerNode) &&
                            winnerNode is JsonValue winnerValue &&
                            winnerValue.TryGetValue<string>(out string winnerId))
                        {
                            // Replace string with object
                            matchObj["winner"] = new JsonObject
                            {
                                ["id"] = winnerId,
                                ["name"] = GetPlayerNameById(matchObj, winnerId)
                            };
                        }
                    }
                }
            }

            return ladderObject.ToJsonString();
        }

        // Get invitation management page for tournaments
        [HttpGet]
        public async Task<IActionResult> TournamentInvitations(string id)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(id))
                {
                    return RedirectToAction(nameof(Index));
                }

                // Get tournament details
                var tournament = await FetchDataFromApi<TournamentDetailData>($"tournaments/{id}", token);

                if (tournament == null)
                {
                    return RedirectToAction(nameof(Index));
                }

                // Check if user is the creator
                string currentUserId = HttpContext.Session.GetString("UserId");
                if (tournament.CreatorId != currentUserId)
                {
                    TempData["ErrorMessage"] = "Only the tournament creator can manage invitations";
                    return RedirectToAction(nameof(TournamentDetails), new { id });
                }

                // Get sent invitations for this tournament
                var sentInvitations = await FetchDataFromApi<List<TournamentInvitationModel>>($"tournaments/{id}/invitations", token);

                if (sentInvitations == null)
                {
                    sentInvitations = new List<TournamentInvitationModel>();
                }

                // Create view model
                var viewModel = new TournamentInvitationsViewModel
                {
                    Tournament = tournament,
                    Invitations = sentInvitations
                };

                return View(viewModel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading tournament invitations for ID {TournamentId}", id);
                TempData["ErrorMessage"] = "Error loading tournament invitations";
                return RedirectToAction(nameof(TournamentDetails), new { id });
            }
        }

        // Get invitation management page for ladders
        [HttpGet]
        public async Task<IActionResult> LadderInvitations(string id)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(id))
                {
                    return RedirectToAction(nameof(Index));
                }

                // Get ladder details
                var ladder = await FetchDataFromApi<LadderDetailData>($"ladders/{id}", token);

                if (ladder == null)
                {
                    return RedirectToAction(nameof(Index));
                }

                // Check if user is the creator
                string currentUserId = HttpContext.Session.GetString("UserId");
                if (ladder.CreatorId != currentUserId)
                {
                    TempData["ErrorMessage"] = "Only the ladder creator can manage invitations";
                    return RedirectToAction(nameof(LadderDetails), new { id });
                }

                // Get sent invitations for this ladder
                var sentInvitations = await FetchDataFromApi<List<LadderInvitationModel>>($"ladders/{id}/invitations", token);

                if (sentInvitations == null)
                {
                    sentInvitations = new List<LadderInvitationModel>();
                }

                // Create view model
                var viewModel = new LadderInvitationsViewModel
                {
                    Ladder = ladder,
                    Invitations = sentInvitations
                };

                return View(viewModel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading ladder invitations for ID {LadderId}", id);
                TempData["ErrorMessage"] = "Error loading ladder invitations";
                return RedirectToAction(nameof(LadderDetails), new { id });
            }
        }

        // Get all invitations for current user
        [HttpGet]
        public async Task<IActionResult> Invitations()
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Create view model
                var viewModel = new CompetitionInvitationsViewModel();

                // Get tournament invitations
                var tournamentInvitations = await FetchDataFromApi<List<TournamentInvitationModel>>("tournaments/invitations", token);
                if (tournamentInvitations != null)
                {
                    viewModel.TournamentInvitations = tournamentInvitations;
                }

                // Get ladder invitations
                var ladderInvitations = await FetchDataFromApi<List<LadderInvitationModel>>("ladders/invitations", token);
                if (ladderInvitations != null)
                {
                    viewModel.LadderInvitations = ladderInvitations;
                }

                return View(viewModel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading invitations page");
                ModelState.AddModelError("", "An error occurred while loading invitations");
                return View(new CompetitionInvitationsViewModel());
            }
        }

        // Search players to invite
        [HttpGet]
        public async Task<IActionResult> SearchPlayers(string tournamentId, string ladderId, string searchTerm)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(searchTerm) || (string.IsNullOrEmpty(tournamentId) && string.IsNullOrEmpty(ladderId)))
                {
                    if (!string.IsNullOrEmpty(tournamentId))
                    {
                        return RedirectToAction(nameof(TournamentInvitations), new { id = tournamentId });
                    }
                    else if (!string.IsNullOrEmpty(ladderId))
                    {
                        return RedirectToAction(nameof(LadderInvitations), new { id = ladderId });
                    }
                    else
                    {
                        return RedirectToAction(nameof(Index));
                    }
                }

                // Search users
                var users = await FetchDataFromApi<List<UserSearchResult>>($"users/search?term={Uri.EscapeDataString(searchTerm)}", token);

                if (users == null)
                {
                    users = new List<UserSearchResult>();
                }

                // Get existing invitations and current participants to check for already invited/joined users
                if (!string.IsNullOrEmpty(tournamentId))
                {
                    // Tournament invitations
                    var tournament = await FetchDataFromApi<TournamentDetailData>($"tournaments/{tournamentId}", token);
                    var invitations = await FetchDataFromApi<List<TournamentInvitationModel>>($"tournaments/{tournamentId}/invitations", token);

                    if (tournament != null && invitations != null)
                    {
                        // Mark users who are already in the tournament or invited
                        foreach (var user in users)
                        {
                            user.IsAlreadyInTournament = tournament.Players.Contains(user.Id);
                            user.IsAlreadyInvited = invitations.Any(i => i.InviteeId == user.Id && i.Status == "pending");
                        }
                    }

                    // Create view model
                    var viewModel = new TournamentInvitationsViewModel
                    {
                        Tournament = tournament,
                        Invitations = invitations ?? new List<TournamentInvitationModel>(),
                        SearchModel = new UserSearchViewModel
                        {
                            SearchTerm = searchTerm,
                            Results = users
                        }
                    };

                    return View(nameof(TournamentInvitations), viewModel);
                }
                else if (!string.IsNullOrEmpty(ladderId))
                {
                    // Ladder invitations
                    var ladder = await FetchDataFromApi<LadderDetailData>($"ladders/{ladderId}", token);
                    var invitations = await FetchDataFromApi<List<LadderInvitationModel>>($"ladders/{ladderId}/invitations", token);

                    if (ladder != null && invitations != null)
                    {
                        // Mark users who are already in the ladder or invited
                        foreach (var user in users)
                        {
                            user.IsAlreadyInLadder = ladder.Positions.Any(p => p.PlayerId == user.Id);
                            user.IsAlreadyInvited = invitations.Any(i => i.InviteeId == user.Id && i.Status == "pending");
                        }
                    }

                    // Create view model
                    var viewModel = new LadderInvitationsViewModel
                    {
                        Ladder = ladder,
                        Invitations = invitations ?? new List<LadderInvitationModel>(),
                        SearchModel = new UserSearchViewModel
                        {
                            SearchTerm = searchTerm,
                            Results = users
                        }
                    };

                    return View(nameof(LadderInvitations), viewModel);
                }

                return RedirectToAction(nameof(Index));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching for players");
                TempData["ErrorMessage"] = "Error searching for players";

                if (!string.IsNullOrEmpty(tournamentId))
                {
                    return RedirectToAction(nameof(TournamentInvitations), new { id = tournamentId });
                }
                else if (!string.IsNullOrEmpty(ladderId))
                {
                    return RedirectToAction(nameof(LadderInvitations), new { id = ladderId });
                }
                else
                {
                    return RedirectToAction(nameof(Index));
                }
            }
        }

        // User search by username
        [HttpPost]
        public async Task<IActionResult> SearchUsersByUserName(string tournamentId, string ladderId, string userName)
        {
            if (string.IsNullOrWhiteSpace(userName))
            {
                if (!string.IsNullOrEmpty(tournamentId))
                {
                    return RedirectToAction(nameof(TournamentInvitations), new { id = tournamentId });
                }
                else if (!string.IsNullOrEmpty(ladderId))
                {
                    return RedirectToAction(nameof(LadderInvitations), new { id = ladderId });
                }
                else
                {
                    return RedirectToAction(nameof(Index));
                }
            }

            // Redirect to the existing search method
            return await SearchPlayers(tournamentId, ladderId, userName);
        }


        [HttpPost]
        public async Task<IActionResult> InviteToTournament(string tournamentId, string inviteeId, bool redirectToDetails = false)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var senderName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(tournamentId) || string.IsNullOrEmpty(inviteeId))
                {
                    TempData["ErrorMessage"] = "Tournament ID and Invitee ID are required";

                    // Redirect based on flag
                    if (redirectToDetails)
                    {
                        return RedirectToAction(nameof(TournamentDetails), new { id = tournamentId });
                    }
                    return RedirectToAction(nameof(TournamentInvitations), new { id = tournamentId });
                }

                // Get tournament details to include the tournament name in notification
                var tournament = await FetchDataFromApi<TournamentDetailData>($"tournaments/{tournamentId}", token);
                string tournamentName = tournament?.Name ?? "tournament";

                // Send the invitation through the API
                var request = new HttpRequestMessage(HttpMethod.Post, $"tournaments/{tournamentId}/invite");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    inviteeId = inviteeId
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    // Send notification to invitee
                    await _notificationService.SendTournamentInviteNotification(
                        inviteeId,
                        senderName,
                        tournamentId,
                        tournamentName
                    );

                    TempData["SuccessMessage"] = "Invitation sent successfully";
                }
                else
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? "Failed to send invitation";
                }

                // Redirect based on flag
                if (redirectToDetails)
                {
                    return RedirectToAction(nameof(TournamentDetails), new { id = tournamentId });
                }
                return RedirectToAction(nameof(TournamentInvitations), new { id = tournamentId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending tournament invitation");
                TempData["ErrorMessage"] = "An error occurred while sending the invitation";

                // Redirect based on flag
                if (redirectToDetails)
                {
                    return RedirectToAction(nameof(TournamentDetails), new { id = tournamentId });
                }
                return RedirectToAction(nameof(TournamentInvitations), new { id = tournamentId });
            }
        }

        [HttpPost]
        public async Task<IActionResult> InviteToLadder(string ladderId, string inviteeId, bool redirectToDetails = false)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var senderName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(ladderId) || string.IsNullOrEmpty(inviteeId))
                {
                    TempData["ErrorMessage"] = "Ladder ID and Invitee ID are required";

                    // Redirect based on flag
                    if (redirectToDetails)
                    {
                        return RedirectToAction(nameof(LadderDetails), new { id = ladderId });
                    }
                    return RedirectToAction(nameof(LadderInvitations), new { id = ladderId });
                }

                // Get ladder details to include the ladder name in notification
                var ladder = await FetchDataFromApi<LadderDetailData>($"ladders/{ladderId}", token);
                string ladderName = ladder?.Name ?? "ladder";

                var request = new HttpRequestMessage(HttpMethod.Post, $"ladders/{ladderId}/invite");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    inviteeId = inviteeId
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    // Send notification to invitee
                    await _notificationService.SendLadderInviteNotification(
                        inviteeId,
                        senderName,
                        ladderId,
                        ladderName
                    );

                    TempData["SuccessMessage"] = "Invitation sent successfully";
                }
                else
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? "Failed to send invitation";
                }

                // Redirect based on flag
                if (redirectToDetails)
                {
                    return RedirectToAction(nameof(LadderDetails), new { id = ladderId });
                }
                return RedirectToAction(nameof(LadderInvitations), new { id = ladderId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending ladder invitation");
                TempData["ErrorMessage"] = "An error occurred while sending the invitation";

                // Redirect based on flag
                if (redirectToDetails)
                {
                    return RedirectToAction(nameof(LadderDetails), new { id = ladderId });
                }
                return RedirectToAction(nameof(LadderInvitations), new { id = ladderId });
            }
        }

        // 7. RespondToTournamentInvitation - Notifies tournament creator when invitation is accepted/rejected
        [HttpPost]
        public async Task<IActionResult> RespondToTournamentInvitation(string invitationId, string response)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var respondentName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(invitationId) || string.IsNullOrEmpty(response))
                {
                    TempData["ErrorMessage"] = "Invitation ID and response are required";
                    return RedirectToAction(nameof(Invitations));
                }

                // Get invitation details first to get tournament info and creator
                var details = await FetchDataFromApi<Dictionary<string, object>>($"tournaments/invitations/{invitationId}/details", token);

                string tournamentId = null;
                string tournamentName = "tournament";
                string creatorId = null;

                if (details != null &&
                    details.TryGetValue("tournament", out var tournamentObj) &&
                    tournamentObj is JsonElement tournamentElement)
                {
                    if (tournamentElement.TryGetProperty("id", out var idElement))
                    {
                        tournamentId = idElement.GetString();
                    }

                    if (tournamentElement.TryGetProperty("name", out var nameElement))
                    {
                        tournamentName = nameElement.GetString();
                    }

                    if (tournamentElement.TryGetProperty("creatorId", out var creatorElement))
                    {
                        creatorId = creatorElement.GetString();
                    }
                }

                string endpoint = response.ToLower() == "accept"
                    ? $"tournaments/invitations/{invitationId}/accept"
                    : $"tournaments/invitations/{invitationId}/reject";

                var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var responseMessage = await _httpClient.SendAsync(request);

                if (!responseMessage.IsSuccessStatusCode)
                {
                    var error = await responseMessage.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? $"Failed to {response} invitation";
                }
                else
                {
                    // Notify tournament creator if we have their ID
                    if (!string.IsNullOrEmpty(creatorId) && !string.IsNullOrEmpty(tournamentId))
                    {
                        if (response.ToLower() == "accept")
                        {
                            await _notificationService.CreateNotificationAsync(
                                creatorId,
                                "tournament_invitation_accepted",
                                $"{respondentName} has accepted your invitation to join \"{tournamentName}\"",
                                tournamentId,
                                null,
                                null
                            );
                        }
                        else
                        {
                            await _notificationService.CreateNotificationAsync(
                                creatorId,
                                "tournament_invitation_rejected",
                                $"{respondentName} has declined your invitation to join \"{tournamentName}\"",
                                tournamentId,
                                null,
                                null
                            );
                        }
                    }

                    TempData["SuccessMessage"] = $"Tournament invitation {response}ed successfully";
                }

                return RedirectToAction(nameof(Invitations));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error responding to tournament invitation");
                TempData["ErrorMessage"] = "An error occurred while responding to the invitation";
                return RedirectToAction(nameof(Invitations));
            }
        }

        [HttpPost]
        public async Task<IActionResult> RespondToLadderInvitation(string invitationId, string response)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var respondentName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(invitationId) || string.IsNullOrEmpty(response))
                {
                    TempData["ErrorMessage"] = "Invitation ID and response are required";
                    return RedirectToAction(nameof(Invitations));
                }

                // Get invitation details first to get ladder info and creator
                var details = await FetchDataFromApi<Dictionary<string, object>>($"ladders/invitations/{invitationId}/details", token);

                string ladderId = null;
                string ladderName = "ladder";
                string creatorId = null;

                if (details != null &&
                    details.TryGetValue("ladder", out var ladderObj) &&
                    ladderObj is JsonElement ladderElement)
                {
                    if (ladderElement.TryGetProperty("id", out var idElement))
                    {
                        ladderId = idElement.GetString();
                    }

                    if (ladderElement.TryGetProperty("name", out var nameElement))
                    {
                        ladderName = nameElement.GetString();
                    }

                    if (ladderElement.TryGetProperty("creatorId", out var creatorElement))
                    {
                        creatorId = creatorElement.GetString();
                    }
                }

                string endpoint = response.ToLower() == "accept"
                    ? $"ladders/invitations/{invitationId}/accept"
                    : $"ladders/invitations/{invitationId}/reject";

                var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var responseMessage = await _httpClient.SendAsync(request);

                if (!responseMessage.IsSuccessStatusCode)
                {
                    var error = await responseMessage.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? $"Failed to {response} invitation";
                }
                else
                {
                    // Notify ladder creator if we have their ID
                    if (!string.IsNullOrEmpty(creatorId) && !string.IsNullOrEmpty(ladderId))
                    {
                        if (response.ToLower() == "accept")
                        {
                            await _notificationService.CreateNotificationAsync(
                                creatorId,
                                "ladder_invitation_accepted",
                                $"{respondentName} has accepted your invitation to join \"{ladderName}\"",
                                ladderId,
                                null,
                                null
                            );
                        }
                        else
                        {
                            await _notificationService.CreateNotificationAsync(
                                creatorId,
                                "ladder_invitation_rejected",
                                $"{respondentName} has declined your invitation to join \"{ladderName}\"",
                                ladderId,
                                null,
                                null
                            );
                        }
                    }

                    TempData["SuccessMessage"] = $"Ladder invitation {response}ed successfully";
                }

                return RedirectToAction(nameof(Invitations));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error responding to ladder invitation");
                TempData["ErrorMessage"] = "An error occurred while responding to the invitation";
                return RedirectToAction(nameof(Invitations));
            }
        }

        // 11. CancelTournamentInvitation - Add notification to invitee
        [HttpPost]
        public async Task<IActionResult> CancelTournamentInvitation(string tournamentId, string invitationId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var organizerName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(invitationId))
                {
                    TempData["ErrorMessage"] = "Invitation ID is required";
                    return RedirectToAction(nameof(TournamentInvitations), new { id = tournamentId });
                }

                // Get invitation details to get invitee info and tournament name
                var tournament = await FetchDataFromApi<TournamentDetailData>($"tournaments/{tournamentId}", token);
                var invitations = await FetchDataFromApi<List<TournamentInvitationModel>>($"tournaments/{tournamentId}/invitations", token);
                string tournamentName = tournament?.Name ?? "tournament";
                string inviteeId = null;

                if (invitations != null)
                {
                    var invitation = invitations.FirstOrDefault(i => i.Id == invitationId);
                    if (invitation != null)
                    {
                        inviteeId = invitation.InviteeId;
                    }
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"tournaments/invitations/{invitationId}/cancel");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? "Failed to cancel invitation";
                }
                else
                {
                    // Notify the invitee if we have their ID
                    if (!string.IsNullOrEmpty(inviteeId))
                    {
                        await _notificationService.CreateNotificationAsync(
                            inviteeId,
                            "tournament_invitation_cancelled",
                            $"{organizerName} has cancelled your invitation to \"{tournamentName}\"",
                            tournamentId,
                            null,
                            null
                        );
                    }

                    TempData["SuccessMessage"] = "Invitation cancelled successfully";
                }

                return RedirectToAction(nameof(TournamentInvitations), new { id = tournamentId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cancelling tournament invitation");
                TempData["ErrorMessage"] = "An error occurred while cancelling the invitation";
                return RedirectToAction(nameof(TournamentInvitations), new { id = tournamentId });
            }
        }

        // 12. CancelLadderInvitation - Add notification to invitee
        [HttpPost]
        public async Task<IActionResult> CancelLadderInvitation(string ladderId, string invitationId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var organizerName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(invitationId))
                {
                    TempData["ErrorMessage"] = "Invitation ID is required";
                    return RedirectToAction(nameof(LadderInvitations), new { id = ladderId });
                }

                // Get invitation details to get invitee info and ladder name
                var ladder = await FetchDataFromApi<LadderDetailData>($"ladders/{ladderId}", token);
                var invitations = await FetchDataFromApi<List<LadderInvitationModel>>($"ladders/{ladderId}/invitations", token);
                string ladderName = ladder?.Name ?? "ladder";
                string inviteeId = null;

                if (invitations != null)
                {
                    var invitation = invitations.FirstOrDefault(i => i.Id == invitationId);
                    if (invitation != null)
                    {
                        inviteeId = invitation.InviteeId;
                    }
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"ladders/invitations/{invitationId}/cancel");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    TempData["ErrorMessage"] = error?.Message ?? "Failed to cancel invitation";
                }
                else
                {
                    // Notify the invitee if we have their ID
                    if (!string.IsNullOrEmpty(inviteeId))
                    {
                        await _notificationService.CreateNotificationAsync(
                            inviteeId,
                            "ladder_invitation_cancelled",
                            $"{organizerName} has cancelled your invitation to \"{ladderName}\"",
                            ladderId,
                            null,
                            null
                        );
                    }

                    TempData["SuccessMessage"] = "Invitation cancelled successfully";
                }

                return RedirectToAction(nameof(LadderInvitations), new { id = ladderId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cancelling ladder invitation");
                TempData["ErrorMessage"] = "An error occurred while cancelling the invitation";
                return RedirectToAction(nameof(LadderInvitations), new { id = ladderId });
            }
        }

        // Add a helper method to make API requests with proper error handling
        private async Task<T> FetchDataFromApi<T>(string endpoint, string token) where T : class
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    // For collection endpoints (like tournaments, ladders, invitations)
                    if (typeof(T) == typeof(List<TournamentData>) ||
                        typeof(T) == typeof(List<LadderData>) ||
                        typeof(T) == typeof(List<TournamentInvitationModel>) ||
                        typeof(T) == typeof(List<LadderInvitationModel>) ||
                        typeof(T) == typeof(List<UserSearchResult>))
                    {
                        var wrapper = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();

                        // Determine the key name based on the type
                        string collectionName = "";
                        if (typeof(T) == typeof(List<TournamentData>)) collectionName = "tournaments";
                        else if (typeof(T) == typeof(List<LadderData>)) collectionName = "ladders";
                        else if (typeof(T) == typeof(List<TournamentInvitationModel>)) collectionName = "invitations";
                        else if (typeof(T) == typeof(List<LadderInvitationModel>)) collectionName = "invitations";
                        else if (typeof(T) == typeof(List<UserSearchResult>)) collectionName = "users";

                        if (wrapper.ContainsKey(collectionName))
                        {
                            // Convert to Json and then deserialize to T
                            var json = System.Text.Json.JsonSerializer.Serialize(wrapper[collectionName]);
                            return System.Text.Json.JsonSerializer.Deserialize<T>(json);
                        }
                    }
                    else if (typeof(T) == typeof(TournamentDetailData))
                    {
                        var wrapper = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
                        if (wrapper.ContainsKey("tournament"))
                        {
                            var json = System.Text.Json.JsonSerializer.Serialize(wrapper["tournament"]);
                            return System.Text.Json.JsonSerializer.Deserialize<T>(json);
                        }
                    }
                    else if (typeof(T) == typeof(LadderDetailData))
                    {
                        var wrapper = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
                        if (wrapper.ContainsKey("ladder"))
                        {
                            var json = System.Text.Json.JsonSerializer.Serialize(wrapper["ladder"]);

                            // Process the JSON string to handle winner format
                            using (JsonDocument document = JsonDocument.Parse(json))
                            {
                                var processedJson = ProcessLadderJson(document.RootElement);
                                return System.Text.Json.JsonSerializer.Deserialize<T>(processedJson);
                            }
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


        [HttpPost]
        public async Task<IActionResult> ResolveLadderDispute(ResolveLadderDisputeViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                var resolverName = HttpContext.Session.GetString("UserName");

                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Authorization required" });
                }

                if (string.IsNullOrEmpty(model.LadderId) || string.IsNullOrEmpty(model.MatchId) || string.IsNullOrEmpty(model.Resolution))
                {
                    return Json(new { success = false, message = "Required parameters missing" });
                }

                // Get ladder details first to get match participants
                var ladder = await FetchDataFromApi<LadderDetailData>($"ladders/{model.LadderId}", token);

                if (ladder == null)
                {
                    return Json(new { success = false, message = "Ladder not found" });
                }

                // Find the match and get player info
                var match = ladder.Matches?.FirstOrDefault(m => m.Id == model.MatchId);

                if (match == null)
                {
                    return Json(new { success = false, message = "Match not found" });
                }

                string challengerId = match.ChallengerId;
                string challengeeId = match.ChallengeeId;

                // For void_match, we'll pass "void" as the winnerId instead of null
                string winnerId = model.WinnerId;
                if (model.Resolution == "void_match")
                {
                    winnerId = "void";
                }

                var request = new HttpRequestMessage(HttpMethod.Post, $"ladders/{model.LadderId}/matches/{model.MatchId}/resolve");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    resolution = model.Resolution,
                    winnerId = winnerId
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"API response: {response.StatusCode}, Content: {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    // Notify both challenger and challengee
                    if (!string.IsNullOrEmpty(challengerId))
                    {
                        await _notificationService.SendMatchDisputeResolvedNotification(
                            challengerId,
                            resolverName,
                            model.Resolution,
                            "ladder",
                            ladder.Name,
                            model.MatchId,
                            model.LadderId
                        );
                    }

                    if (!string.IsNullOrEmpty(challengeeId))
                    {
                        await _notificationService.SendMatchDisputeResolvedNotification(
                            challengeeId,
                            resolverName,
                            model.Resolution,
                            "ladder",
                            ladder.Name,
                            model.MatchId,
                            model.LadderId
                        );
                    }

                    // Set a success message that will be shown after redirect
                    TempData["SuccessMessage"] = "Dispute resolved successfully";

                    // Return success response that will trigger a redirect in the client-side JS
                    return Json(new { success = true });
                }
                else
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    var errorMessage = error?.Message ?? $"Failed to resolve dispute: {response.StatusCode}";
                    return Json(new { success = false, message = errorMessage });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resolving ladder dispute");
                return Json(new { success = false, message = $"An error occurred while resolving the dispute: {ex.Message}" });
            }
        }
        [HttpGet]
        public async Task<IActionResult> SearchAllUsers(string query)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return Json(new { success = false, message = "Authentication required" });
                }

                if (string.IsNullOrEmpty(query) || query.Length < 2)
                {
                    return Json(new { success = false, message = "Search query must be at least 2 characters" });
                }

                _logger.LogInformation($"Searching all users for tournament invite with query: {query}");

                // Call the new /users/search-all endpoint
                var request = new HttpRequestMessage(HttpMethod.Get, $"users/search-all?query={Uri.EscapeDataString(query)}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();

                _logger.LogDebug($"Search response: {response.StatusCode}, Content: {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    // Parse users directly from the response
                    try
                    {
                        using (JsonDocument document = JsonDocument.Parse(responseContent))
                        {
                            if (document.RootElement.TryGetProperty("users", out JsonElement usersElement))
                            {
                                var users = new List<object>();

                                foreach (JsonElement user in usersElement.EnumerateArray())
                                {
                                    string id = user.TryGetProperty("_id", out var idElement) ? idElement.GetString() : "";
                                    string name = user.TryGetProperty("name", out var nameElement) ? nameElement.GetString() : "";
                                    string email = user.TryGetProperty("email", out var emailElement) ? emailElement.GetString() : "";
                                    string playerLevel = user.TryGetProperty("playerLevel", out var levelElement) ? levelElement.GetString() : "";

                                    users.Add(new
                                    {
                                        id,
                                        name,
                                        email,
                                        playerLevel
                                    });
                                }

                                return Json(new { success = true, users });
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error parsing user search response");
                    }
                }

                _logger.LogWarning("API request for user search failed: {StatusCode} {ReasonPhrase}",
                    response.StatusCode, response.ReasonPhrase);

                // Return empty list if search fails
                return Json(new { success = false, message = "Failed to find users", users = new List<object>() });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching for users with query: {Query}", query);
                return Json(new { success = false, message = "An error occurred during search", users = new List<object>() });
            }
        }
        [HttpPost]
        private string GetPlayerNameById(JsonObject matchObj, string playerId)
        {
            // Try to get name from challenger or challengee
            if (matchObj.TryGetPropertyValue("challenger", out JsonNode challengerNode) &&
                challengerNode is JsonObject challenger &&
                challenger.TryGetPropertyValue("id", out JsonNode challengerId) &&
                challengerId.GetValue<string>() == playerId)
            {
                return challenger.TryGetPropertyValue("name", out JsonNode nameNode) ?
                    nameNode.GetValue<string>() : "Unknown";
            }

            if (matchObj.TryGetPropertyValue("challengee", out JsonNode challengeeNode) &&
                challengeeNode is JsonObject challengee &&
                challengee.TryGetPropertyValue("id", out JsonNode challengeeId) &&
                challengeeId.GetValue<string>() == playerId)
            {
                return challengee.TryGetPropertyValue("name", out JsonNode nameNode) ?
                    nameNode.GetValue<string>() : "Unknown";
            }

            return "Unknown";
        }
    }
    }