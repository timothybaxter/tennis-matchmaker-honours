using Microsoft.AspNetCore.Mvc;
using TennisMatchmakingSite2.Models;
using System.Net.Http.Json;

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
        public async Task<IActionResult> Index()
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
        public async Task<IActionResult> UpdateTheme(SettingsViewModel model)
        {
            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    return RedirectToAction("Login", "Account");
                }

                var request = new HttpRequestMessage(HttpMethod.Put, "user/settings");
                request.Headers.Add("Authorization", $"Bearer {token}");

                var requestBody = new { theme = model.Theme.ToString() };
                request.Content = JsonContent.Create(requestBody);

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    HttpContext.Session.SetString("Theme", model.Theme.ToString());
                    TempData["SuccessMessage"] = "Theme updated successfully";
                }
                else
                {
                    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update theme");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating theme");
                ModelState.AddModelError("", "An error occurred while updating theme");
            }
            return RedirectToAction(nameof(Index));
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

                // Update auth service
                var authRequest = new HttpRequestMessage(HttpMethod.Put, "auth/user");
                authRequest.Headers.Add("Authorization", $"Bearer {token}");
                var authBody = new { name = model.Name };
                authRequest.Content = JsonContent.Create(authBody);

                var authResponse = await _httpClient.SendAsync(authRequest);

                if (!authResponse.IsSuccessStatusCode)
                {
                    var error = await authResponse.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update name");
                    return RedirectToAction(nameof(Index));
                }

                // Update settings service
                var settingsRequest = new HttpRequestMessage(HttpMethod.Put, "user/settings");
                settingsRequest.Headers.Add("Authorization", $"Bearer {token}");
                settingsRequest.Content = JsonContent.Create(authBody);

                var settingsResponse = await _httpClient.SendAsync(settingsRequest);

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
                    return RedirectToAction("Login", "Account");
                }

                // Update auth service
                var authRequest = new HttpRequestMessage(HttpMethod.Put, "auth/user");
                authRequest.Headers.Add("Authorization", $"Bearer {token}");
                var authBody = new { email = model.Email };
                authRequest.Content = JsonContent.Create(authBody);

                var authResponse = await _httpClient.SendAsync(authRequest);

                if (!authResponse.IsSuccessStatusCode)
                {
                    var error = await authResponse.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update email");
                    return RedirectToAction(nameof(Index));
                }

                // Update settings service
                var settingsRequest = new HttpRequestMessage(HttpMethod.Put, "user/settings");
                settingsRequest.Headers.Add("Authorization", $"Bearer {token}");
                settingsRequest.Content = JsonContent.Create(authBody);

                var settingsResponse = await _httpClient.SendAsync(settingsRequest);

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

                var request = new HttpRequestMessage(HttpMethod.Put, "auth/password");
                request.Headers.Add("Authorization", $"Bearer {token}");
                
                var requestBody = new
                {
                    currentPassword = model.CurrentPassword,
                    newPassword = model.NewPassword
                };

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

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

                // Update auth service
                var authRequest = new HttpRequestMessage(HttpMethod.Put, "auth/user");
                authRequest.Headers.Add("Authorization", $"Bearer {token}");
                var authBody = new { playerLevel = model.PlayerLevel.ToString() };
                authRequest.Content = JsonContent.Create(authBody);

                var authResponse = await _httpClient.SendAsync(authRequest);

                if (!authResponse.IsSuccessStatusCode)
                {
                    var error = await authResponse.Content.ReadFromJsonAsync<ErrorResponse>();
                    ModelState.AddModelError("", error?.Message ?? "Failed to update player level");
                    return RedirectToAction(nameof(Index));
                }

                // Update settings service
                var settingsRequest = new HttpRequestMessage(HttpMethod.Put, "user/settings");
                settingsRequest.Headers.Add("Authorization", $"Bearer {token}");
                settingsRequest.Content = JsonContent.Create(authBody);

                var settingsResponse = await _httpClient.SendAsync(settingsRequest);

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

                var request = new HttpRequestMessage(HttpMethod.Put, "user/settings");
                request.Headers.Add("Authorization", $"Bearer {token}");

                var requestBody = new { hometown = model.Hometown };
                request.Content = JsonContent.Create(requestBody);

                var response = await _httpClient.SendAsync(request);

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
    }
}