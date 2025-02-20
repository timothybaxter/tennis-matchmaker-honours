using Microsoft.AspNetCore.Mvc;
using TennisMatchmakingSite2.Models;
using System.Net.Http.Json;
using System.Threading.Tasks;
using System;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TennisMatchmakingSite2.Controllers
{
    public class AccountController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AccountController> _logger;

        public AccountController(IConfiguration configuration, ILogger<AccountController> logger)
        {
            _configuration = configuration;
            _logger = logger;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_configuration["ApiBaseUrl"] ?? throw new InvalidOperationException("ApiBaseUrl not configured"))
            };
        }

        [HttpGet]
        public IActionResult Login()
        {
            return View();
        }

        [HttpGet]
        public IActionResult Register()
        {
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> Register(RegisterViewModel model)
        {
            if (!ModelState.IsValid)
                return View(model);

            try
            {
                _logger.LogInformation($"Attempting to register user: {model.Email}");

                var request = new HttpRequestMessage(HttpMethod.Post, "auth/register");

                var requestBody = new
                {
                    name = model.Name,
                    email = model.Email,
                    password = model.Password,
                    playerLevel = model.PlayerLevel.ToString()
                };

                _logger.LogInformation($"Request body: {JsonSerializer.Serialize(requestBody)}");

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                _logger.LogInformation($"Response status: {response.StatusCode}");

                if (response.IsSuccessStatusCode)
                {
                    var result = await response.Content.ReadFromJsonAsync<AuthResponse>();

                    // Store initial settings
                    var settingsRequest = new HttpRequestMessage(HttpMethod.Post, "user/settings");
                    var settingsBody = new
                    {
                        userId = result.User.Id,
                        name = model.Name,
                        email = model.Email,
                        playerLevel = model.PlayerLevel.ToString(),
                        theme = "Wimbledon" // Default theme
                    };

                    settingsRequest.Content = JsonContent.Create(settingsBody);
                    var settingsResponse = await _httpClient.SendAsync(settingsRequest);

                    if (!settingsResponse.IsSuccessStatusCode)
                    {
                        _logger.LogError($"Failed to create settings: {await settingsResponse.Content.ReadAsStringAsync()}");
                    }

                    return RedirectToAction("Login");
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                ModelState.AddModelError("", error?.Message ?? "Registration failed");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during registration");
                ModelState.AddModelError("", "An error occurred during registration");
            }
            return View(model);
        }

        [HttpPost]
        public async Task<IActionResult> Login(LoginViewModel model)
        {
            if (!ModelState.IsValid)
                return View(model);

            try
            {
                _logger.LogInformation($"Attempting to login user: {model.Email}");

                var request = new HttpRequestMessage(HttpMethod.Post, "auth/login");

                var requestBody = new
                {
                    email = model.Email,
                    password = model.Password
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    var result = await response.Content.ReadFromJsonAsync<AuthResponse>();

                    // Store session data
                    HttpContext.Session.SetString("JWTToken", result.Token);
                    HttpContext.Session.SetString("UserName", result.User.Name);
                    HttpContext.Session.SetString("UserEmail", result.User.Email);
                    HttpContext.Session.SetString("SkillLevel", result.User.PlayerLevel);
                    HttpContext.Session.SetString("Theme", "Wimbledon"); // Set default theme

                    // Get user settings
                    var settingsRequest = new HttpRequestMessage(HttpMethod.Get, "user/settings");
                    settingsRequest.Headers.Add("Authorization", $"Bearer {result.Token}");
                    var settingsResponse = await _httpClient.SendAsync(settingsRequest);

                    if (settingsResponse.IsSuccessStatusCode)
                    {
                        var settings = await settingsResponse.Content.ReadFromJsonAsync<UserSettings>();
                        HttpContext.Session.SetString("Theme", settings.Theme);
                        HttpContext.Session.SetString("Hometown", settings.Hometown ?? "");
                    }

                    return RedirectToAction("Index", "Home");
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                ModelState.AddModelError("", error?.Message ?? "Login failed");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during login");
                ModelState.AddModelError("", "An error occurred during login");
            }
            return View(model);
        }
    }
}