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

                // Store the theme in session
                HttpContext.Session.SetString("Theme", model.Theme.ToString());

                TempData["SuccessMessage"] = "Theme updated successfully";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating theme");
                ModelState.AddModelError("", "An error occurred while updating your theme");
            }
            return RedirectToAction(nameof(Index));
        }

        // Add other update methods (UpdateName, UpdateEmail, etc.) similarly
    }
}