using Microsoft.AspNetCore.Mvc;
using TennisMatchmakingSite2.Models;
using System.Net.Http.Json;
using System.Collections.Generic;
using System.Threading.Tasks;
using System;
using System.Net;

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

                var queryString = personal ? "?personal=true" : "";
                var request = new HttpRequestMessage(HttpMethod.Get, $"matches{queryString}");
                request.Headers.Add("Authorization", $"Bearer {token}");

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    var wrapper = await response.Content.ReadFromJsonAsync<MatchResponseWrapper>();
                    ViewBag.IsPersonal = personal;
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
                var requestBody = new
                {
                    courtLocation = model.CourtLocation,
                    matchTime = model.MatchTime.ToUniversalTime().ToString("o"),
                    matchType = model.MatchType.ToLower(),
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

                var request = new HttpRequestMessage(HttpMethod.Delete, "matches");
                request.Headers.Add("Authorization", $"Bearer {token}");
                request.Content = JsonContent.Create(new { matchId });

                var response = await _httpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to delete match");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while deleting match {MatchId}", matchId);
                ModelState.AddModelError("", "An error occurred while deleting the match");
            }

            return RedirectToAction(nameof(Index), new { personal = true });
        }

        [HttpPost]
        public async Task<IActionResult> Update(string matchId, UpdateMatchViewModel model)
        {
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
                    matchId,
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
                _logger.LogError(ex, "Error occurred while updating match {MatchId}", matchId);
                ModelState.AddModelError("", "An error occurred while updating the match");
            }

            return RedirectToAction(nameof(Index), new { personal = true });
        }
    }
}