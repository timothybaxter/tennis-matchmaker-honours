using Microsoft.AspNetCore.Mvc;
using TennisMatchmakingSite.Models;
using System.Net.Http.Json;

namespace TennisMatchmakingSite.Controllers
{
    public class AccountController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;

        public AccountController(IConfiguration configuration)
        {
            _configuration = configuration;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_configuration["ApiBaseUrl"])
            };
        }

        [HttpGet]
        public IActionResult Login()
        {
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> Login(LoginViewModel model)
        {
            if (!ModelState.IsValid)
                return View(model);

            try
            {
                var response = await _httpClient.PostAsJsonAsync("/auth/login", new
                {
                    email = model.Email,
                    password = model.Password
                });

                if (response.IsSuccessStatusCode)
                {
                    var result = await response.Content.ReadFromJsonAsync<AuthResponse>();
                    HttpContext.Session.SetString("JWTToken", result.Token);
                    return RedirectToAction("Index", "Home");
                }

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                ModelState.AddModelError("", error?.Message ?? "Login failed");
            }
            catch (Exception)
            {
                ModelState.AddModelError("", "An error occurred during login");
            }
            return View(model);
        }
    }
}