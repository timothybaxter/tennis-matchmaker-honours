using Microsoft.AspNetCore.Mvc;
using TennisMatchmakingSite2.Models;
using System.Net.Http.Json;
using System.Threading.Tasks;
using System;
using System.Text.Json;

namespace TennisMatchmakingSite2.Controllers
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
        [HttpGet]
        public IActionResult Register()
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
                Console.WriteLine($"Attempting to login user: {model.Email}");

                var request = new HttpRequestMessage(HttpMethod.Post, "auth/login");
                request.Headers.Add("Access-Control-Allow-Origin", "http://localhost:5000");

                var requestBody = new
                {
                    email = model.Email,
                    password = model.Password
                };

                Console.WriteLine($"Request body: {System.Text.Json.JsonSerializer.Serialize(requestBody)}");

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                Console.WriteLine($"Response status: {response.StatusCode}");

                if (response.IsSuccessStatusCode)
                {
                    var ResponseContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"Login response content: {ResponseContent}");
                    var result = await response.Content.ReadFromJsonAsync<AuthResponse>();
                    HttpContext.Session.SetString("JWTToken", result.Token);
                    HttpContext.Session.SetString("UserName", result.User.Name);
                    HttpContext.Session.SetString("SkillLevel", result.User.PlayerLevel); 
                    return RedirectToAction("Index", "Home");
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                Console.WriteLine($"Error response: {responseContent}");

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                ModelState.AddModelError("", error?.Message ?? "Login failed");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Exception: {ex.Message}");
                ModelState.AddModelError("", "An error occurred during login");
            }
            return View(model);
        }
        [HttpPost]
        public async Task<IActionResult> Register(RegisterViewModel model)
        {
            if (!ModelState.IsValid)
                return View(model);

            try
            {
                Console.WriteLine($"Attempting to register user: {model.Email}");

                var request = new HttpRequestMessage(HttpMethod.Post, "auth/register");
                request.Headers.Add("Access-Control-Allow-Origin", "http://localhost:5000");

                var requestBody = new
                {
                    name = model.Name,
                    email = model.Email,
                    password = model.Password,
                    playerLevel = model.PlayerLevel.ToString()
                };

                Console.WriteLine($"Request body: {System.Text.Json.JsonSerializer.Serialize(requestBody)}");

                request.Content = JsonContent.Create(requestBody);
                var response = await _httpClient.SendAsync(request);

                Console.WriteLine($"Response status: {response.StatusCode}");

                if (response.IsSuccessStatusCode)
                {
                    return RedirectToAction("Login");
                }

                var responseContent = await response.Content.ReadAsStringAsync();
                Console.WriteLine($"Error response: {responseContent}");

                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                ModelState.AddModelError("", error?.Message ?? "Registration failed");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Exception: {ex.Message}");
                ModelState.AddModelError("", "An error occurred during registration");
            }
            return View(model);
        }
    }
}