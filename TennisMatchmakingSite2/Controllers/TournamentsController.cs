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

namespace TennisMatchmakingSite2.Controllers
{
    public class TournamentsController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<TournamentsController> _logger;

        public TournamentsController(IConfiguration configuration, ILogger<TournamentsController> logger)
        {
            _configuration = configuration;
            _logger = logger;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_configuration["ApiBaseUrl"] ?? throw new InvalidOperationException("ApiBaseUrl not configured"))
            };
        }

        [HttpGet]
        public async Task<IActionResult> Index(bool personal = false)
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

        [HttpPost]
        public async Task<IActionResult> CreateTournament(CreateTournamentViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
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
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
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

        [HttpPost]
        public async Task<IActionResult> JoinLadder(string id)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
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
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

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
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

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
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
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

        [HttpPost]
        public async Task<IActionResult> IssueChallenge(string id, string challengeeId)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
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

        // Helper method to fetch data from API
        // In TournamentsController.cs, find the FetchDataFromApi method and update it:
        private async Task<T> FetchDataFromApi<T>(string endpoint, string token) where T : class
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    // Log raw response for debugging
                    var responseContent = await response.Content.ReadAsStringAsync();
                    _logger.LogDebug("API Response: {Response}", responseContent);

                    // Check for ID pattern in endpoint
                    bool isDetailEndpoint = endpoint.Contains("/") && !endpoint.EndsWith("/");

                    // Handle ladder detail case specifically
                    if (endpoint.StartsWith("ladders/") && typeof(T).Name == "LadderDetailData")
                    {
                        // Parse JSON manually and transform it
                        using (JsonDocument doc = JsonDocument.Parse(responseContent))
                        {
                            if (doc.RootElement.TryGetProperty("ladder", out JsonElement ladderElement))
                            {
                                // Pre-process the JSON to handle matches with winner ID correctly
                                var options = new JsonSerializerOptions
                                {
                                    PropertyNameCaseInsensitive = true
                                };

                                // Create a copy of ladderElement as a JsonDocument
                                var processedLadderJson = ProcessLadderJson(ladderElement);

                                return JsonSerializer.Deserialize<T>(processedLadderJson, options);
                            }
                        }
                    }

                    // Standard collection case (not detail view)
                    if (!isDetailEndpoint)
                    {
                        // Handle collection responses
                        var wrapper = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();

                        // Determine collection name
                        string collectionName;
                        if (endpoint.StartsWith("tournaments")) collectionName = "tournaments";
                        else if (endpoint.StartsWith("ladders")) collectionName = "ladders";
                        else collectionName = endpoint;

                        var json = System.Text.Json.JsonSerializer.Serialize(wrapper[collectionName]);
                        return System.Text.Json.JsonSerializer.Deserialize<T>(json);
                    }
                    else
                    {
                        // Handle single object responses (tournament/ladder details)
                        var wrapper = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();

                        // Determine entity type based on endpoint pattern
                        string entityType;
                        if (endpoint.StartsWith("tournaments/")) entityType = "tournament";
                        else if (endpoint.StartsWith("ladders/")) entityType = "ladder";
                        else entityType = typeof(T).Name.ToLower().Replace("detaildata", "");

                        var json = System.Text.Json.JsonSerializer.Serialize(wrapper[entityType]);
                        return System.Text.Json.JsonSerializer.Deserialize<T>(json);
                    }
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

        // Helper method to get player name from match
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