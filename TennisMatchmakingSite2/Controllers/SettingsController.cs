using Microsoft.AspNetCore.Mvc;
using TennisMatchmakingSite2.Models;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using System;
using System.Linq;

namespace TennisMatchmakingSite2.Controllers
{
    public class SettingsController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<SettingsController> _logger;

        public SettingsController(IConfiguration configuration, ILogger<SettingsController> logger)
        {
            _configuration = configuration;
            _logger = logger;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_configuration["ApiBaseUrl"] ?? throw new InvalidOperationException("ApiBaseUrl not configured"))
            };
        }

        [HttpGet]
        public IActionResult Index()
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Get current theme from session, default to Wimbledon if not set
                var currentTheme = GrandSlamTheme.Wimbledon;
                var themeString = HttpContext.Session.GetString("Theme");
                if (!string.IsNullOrEmpty(themeString))
                {
                    Enum.TryParse<GrandSlamTheme>(themeString, out currentTheme);
                }

                // Get current player level from session
                var playerLevel = PlayerLevel.Beginner;
                var playerLevelString = HttpContext.Session.GetString("SkillLevel");
                if (!string.IsNullOrEmpty(playerLevelString))
                {
                    Enum.TryParse<PlayerLevel>(playerLevelString, out playerLevel);
                }

                var model = new SettingsViewModel
                {
                    Name = HttpContext.Session.GetString("UserName") ?? "",
                    Email = HttpContext.Session.GetString("UserEmail") ?? "",
                    PlayerLevel = playerLevel,
                    Theme = currentTheme,
                    Hometown = HttpContext.Session.GetString("Hometown") ?? ""
                };

                return View(model);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error loading settings page");
                ModelState.AddModelError("", "An error occurred while loading your profile");
                return View(new SettingsViewModel());
            }
        }

        [HttpPost]
        public async Task<IActionResult> UpdateName(SettingsViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Update auth database
                var authRequest = new HttpRequestMessage(HttpMethod.Post, "auth/update-user");
                authRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var authBody = new { name = model.Name };
                authRequest.Content = JsonContent.Create(authBody);

                _logger.LogInformation($"Sending auth request to update name: {model.Name}");
                var authResponse = await _httpClient.SendAsync(authRequest);
                var authResponseContent = await authResponse.Content.ReadAsStringAsync();
                _logger.LogInformation($"Auth response status: {authResponse.StatusCode}");
                _logger.LogInformation($"Auth response content: {authResponseContent}");

                if (!authResponse.IsSuccessStatusCode)
                {
                    var error = await authResponse.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update name in auth database");
                    return RedirectToAction(nameof(Index));
                }

                // Update settings database
                var settingsRequest = new HttpRequestMessage(HttpMethod.Post, "settings/update-settings");
                settingsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                settingsRequest.Content = JsonContent.Create(new { name = model.Name });

                _logger.LogInformation($"Sending settings request to update name");
                var settingsResponse = await _httpClient.SendAsync(settingsRequest);
                var settingsResponseContent = await settingsResponse.Content.ReadAsStringAsync();
                _logger.LogInformation($"Settings response status: {settingsResponse.StatusCode}");
                _logger.LogInformation($"Settings response content: {settingsResponseContent}");

                if (settingsResponse.IsSuccessStatusCode)
                {
                    HttpContext.Session.SetString("UserName", model.Name);
                    TempData["SuccessMessage"] = "Name updated successfully";
                }
                else
                {
                    var error = await settingsResponse.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update name in settings");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating name");
                ModelState.AddModelError("", "An error occurred while updating name");
            }
            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> UpdateEmail(SettingsViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    _logger.LogWarning("No JWT token found in session");
                    return RedirectToAction("Login", "Account");
                }

                // Update auth database
                var authRequest = new HttpRequestMessage(HttpMethod.Post, "auth/update-user");
                authRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var authBody = new { email = model.Email };
                authRequest.Content = JsonContent.Create(authBody);

                _logger.LogInformation($"Base URL: {_httpClient.BaseAddress}");
                _logger.LogInformation($"Endpoint: auth/update-user");
                _logger.LogInformation($"Full request URL: {authRequest.RequestUri}");
                _logger.LogInformation($"Authorization: {authRequest.Headers.Authorization}");
                var bodyContent = await authRequest.Content.ReadAsStringAsync();
                _logger.LogInformation($"Request body: {bodyContent}");

                var authResponse = await _httpClient.SendAsync(authRequest);
                var authResponseContent = await authResponse.Content.ReadAsStringAsync();
                _logger.LogInformation($"Auth response status: {authResponse.StatusCode}");
                _logger.LogInformation($"Auth response content: {authResponseContent}");

                if (!authResponse.IsSuccessStatusCode)
                {
                    var error = await authResponse.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update email in auth database");
                    return RedirectToAction(nameof(Index));
                }

                // Update settings database
                var settingsRequest = new HttpRequestMessage(HttpMethod.Post, "settings/update-settings");
                settingsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                settingsRequest.Content = JsonContent.Create(new { email = model.Email });

                var settingsResponse = await _httpClient.SendAsync(settingsRequest);
                var settingsResponseContent = await settingsResponse.Content.ReadAsStringAsync();
                _logger.LogInformation($"Settings response status: {settingsResponse.StatusCode}");
                _logger.LogInformation($"Settings response content: {settingsResponseContent}");

                if (settingsResponse.IsSuccessStatusCode)
                {
                    HttpContext.Session.SetString("UserEmail", model.Email);
                    TempData["SuccessMessage"] = "Email updated successfully";
                }
                else
                {
                    var error = await settingsResponse.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update email in settings");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating email");
                ModelState.AddModelError("", "An error occurred while updating email");
            }
            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> UpdatePassword(SettingsViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                if (string.IsNullOrEmpty(model.CurrentPassword) ||
                    string.IsNullOrEmpty(model.NewPassword) ||
                    string.IsNullOrEmpty(model.ConfirmNewPassword))
                {
                    ModelState.AddModelError("", "All password fields are required");
                    return RedirectToAction(nameof(Index));
                }

                if (model.NewPassword != model.ConfirmNewPassword)
                {
                    ModelState.AddModelError("", "New passwords do not match");
                    return RedirectToAction(nameof(Index));
                }

                // Now uses the regular auth/update-user endpoint with password fields
                var request = new HttpRequestMessage(HttpMethod.Post, "auth/update-user");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new
                {
                    currentPassword = model.CurrentPassword,
                    newPassword = model.NewPassword
                };

                request.Content = JsonContent.Create(requestBody);

                _logger.LogInformation("Sending password update request");
                _logger.LogInformation($"Authorization header: {request.Headers.Authorization}");
                _logger.LogInformation($"Request body: {await request.Content.ReadAsStringAsync()}");

                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Password update response status: {response.StatusCode}");
                _logger.LogInformation($"Password update response content: {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    TempData["SuccessMessage"] = "Password updated successfully";
                }
                else
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update password");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating password");
                ModelState.AddModelError("", "An error occurred while updating password");
            }
            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> UpdatePlayerLevel(SettingsViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Update auth database
                var authRequest = new HttpRequestMessage(HttpMethod.Post, "auth/update-user");
                authRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var authBody = new { playerLevel = model.PlayerLevel.ToString() };
                authRequest.Content = JsonContent.Create(authBody);

                _logger.LogInformation($"Sending player level update request: {model.PlayerLevel}");
                var authResponse = await _httpClient.SendAsync(authRequest);
                var authResponseContent = await authResponse.Content.ReadAsStringAsync();
                _logger.LogInformation($"Auth response status: {authResponse.StatusCode}");
                _logger.LogInformation($"Auth response content: {authResponseContent}");

                if (!authResponse.IsSuccessStatusCode)
                {
                    var error = await authResponse.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update player level in auth database");
                    return RedirectToAction(nameof(Index));
                }

                // Update settings database
                var settingsRequest = new HttpRequestMessage(HttpMethod.Post, "settings/update-settings");
                settingsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                settingsRequest.Content = JsonContent.Create(new { playerLevel = model.PlayerLevel.ToString() });

                var settingsResponse = await _httpClient.SendAsync(settingsRequest);
                var settingsResponseContent = await settingsResponse.Content.ReadAsStringAsync();
                _logger.LogInformation($"Settings response status: {settingsResponse.StatusCode}");
                _logger.LogInformation($"Settings response content: {settingsResponseContent}");

                if (settingsResponse.IsSuccessStatusCode)
                {
                    HttpContext.Session.SetString("SkillLevel", model.PlayerLevel.ToString());
                    TempData["SuccessMessage"] = "Player level updated successfully";
                }
                else
                {
                    var error = await settingsResponse.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update player level in settings");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating player level");
                ModelState.AddModelError("", "An error occurred while updating player level");
            }
            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> UpdateHometown(SettingsViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Only update settings database for hometown
                var request = new HttpRequestMessage(HttpMethod.Post, "settings/update-settings");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var requestBody = new { hometown = model.Hometown };
                request.Content = JsonContent.Create(requestBody);

                _logger.LogInformation($"Sending hometown update request: {model.Hometown}");
                var response = await _httpClient.SendAsync(request);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation($"Hometown update response status: {response.StatusCode}");
                _logger.LogInformation($"Hometown update response content: {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    HttpContext.Session.SetString("Hometown", model.Hometown);
                    TempData["SuccessMessage"] = "Hometown updated successfully";
                }
                else
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update hometown");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating hometown");
                ModelState.AddModelError("", "An error occurred while updating hometown");
            }
            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> UpdateTheme(SettingsViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                // Update auth database with theme
                var authRequest = new HttpRequestMessage(HttpMethod.Post, "auth/update-user");
                authRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                authRequest.Content = JsonContent.Create(new { theme = model.Theme.ToString() });

                _logger.LogInformation($"Sending auth request to update theme: {model.Theme}");
                var authResponse = await _httpClient.SendAsync(authRequest);
                var authResponseContent = await authResponse.Content.ReadAsStringAsync();
                _logger.LogInformation($"Auth response status: {authResponse.StatusCode}");
                _logger.LogInformation($"Auth response content: {authResponseContent}");

                if (!authResponse.IsSuccessStatusCode)
                {
                    _logger.LogWarning($"Failed to update theme in auth database: {authResponse.StatusCode}");
                    // Continue anyway to try settings update
                }

                // Update settings database for theme
                var settingsRequest = new HttpRequestMessage(HttpMethod.Post, "settings/update-settings");
                settingsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                settingsRequest.Content = JsonContent.Create(new { theme = model.Theme.ToString() });

                _logger.LogInformation($"Sending settings request to update theme: {model.Theme}");
                var settingsResponse = await _httpClient.SendAsync(settingsRequest);
                var settingsResponseContent = await settingsResponse.Content.ReadAsStringAsync();
                _logger.LogInformation($"Settings response status: {settingsResponse.StatusCode}");
                _logger.LogInformation($"Settings response content: {settingsResponseContent}");

                if (settingsResponse.IsSuccessStatusCode)
                {
                    HttpContext.Session.SetString("Theme", model.Theme.ToString());
                    TempData["SuccessMessage"] = "Theme updated successfully";
                }
                else
                {
                    var error = await settingsResponse.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update theme in settings");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating theme");
                ModelState.AddModelError("", "An error occurred while updating theme");
            }
            return RedirectToAction(nameof(Index));
        }
    }
}