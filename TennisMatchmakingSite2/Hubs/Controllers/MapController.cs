using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using TennisMatchmakingSite2.Models;

namespace TennisMatchmakingSite2.Controllers
{
    public class MapController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<MapController> _logger;

        public MapController(IConfiguration configuration, ILogger<MapController> logger)
        {
            _configuration = configuration;
            _logger = logger;
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

                var request = new HttpRequestMessage(HttpMethod.Get, "courts");
                request.Headers.Add("Authorization", $"Bearer {token}");

                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    var courtsResponse = await response.Content.ReadFromJsonAsync<CourtsResponse>();
                    return View(courtsResponse?.Courts ?? new List<CourtData>());
                }

                _logger.LogError("Failed to fetch courts");
                return View(new List<CourtData>());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching courts");
                return View(new List<CourtData>());
            }
        }

        [HttpGet]
        public async Task<IActionResult> Search(string query)
        {
            _logger.LogInformation($"Court search requested with query: {query}");

            if (string.IsNullOrEmpty(query) || query.Length < 2)
            {
                _logger.LogInformation("Query too short, returning empty list");
                return Json(new List<CourtData>());
            }

            try
            {
                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    _logger.LogWarning("No JWT token found, returning test data");
                    return Json(GetFallbackTestData(query));
                }

                var request = new HttpRequestMessage(HttpMethod.Get, $"courts?query={Uri.EscapeDataString(query)}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                _logger.LogInformation($"Sending request to: {request.RequestUri}");
                var response = await _httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    _logger.LogInformation($"Response content: {responseContent}");

                    var result = await response.Content.ReadFromJsonAsync<CourtsResponse>();

                    if (result?.Courts == null || !result.Courts.Any())
                    {
                        _logger.LogWarning("API returned empty results, using fallback data");
                        return Json(GetFallbackTestData(query));
                    }

                    _logger.LogInformation($"Search successful, found {result.Courts.Count} courts");
                    return Json(result.Courts);
                }

                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError($"Failed to search courts: {response.StatusCode}, Response: {errorContent}");

                // Return fallback data if API request fails
                _logger.LogInformation("Using fallback test data due to API error");
                return Json(GetFallbackTestData(query));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching courts");

                // Return fallback data if exception occurs
                _logger.LogInformation("Using fallback test data due to exception");
                return Json(GetFallbackTestData(query));
            }
        }

        // Helper method to provide test data for the autocomplete when API is not available
        private List<CourtData> GetFallbackTestData(string query)
        {
            query = query.ToLower();

            var testCourts = new List<CourtData>
            {
                new CourtData { Id = "1", Name = "Dundee University Tennis Courts", Location = "Dundee, UK", Coordinates = new double[] { 56.4576, -2.9833 } },
                new CourtData { Id = "2", Name = "Dundee Indoor Tennis Club", Location = "Dundee, UK", Coordinates = new double[] { 56.4701, -2.9829 } },
                new CourtData { Id = "3", Name = "St Andrews Tennis Club", Location = "St Andrews, UK", Coordinates = new double[] { 56.3403, -2.8034 } },
                new CourtData { Id = "4", Name = "Perth Tennis Club", Location = "Perth, UK", Coordinates = new double[] { 56.3950, -3.4308 } },
                new CourtData { Id = "5", Name = "David Lloyd Tennis Centre", Location = "Dundee, UK", Coordinates = new double[] { 56.4718, -2.9712 } },
                new CourtData { Id = "6", Name = "Broughty Ferry Tennis Courts", Location = "Broughty Ferry, UK", Coordinates = new double[] { 56.4647, -2.8707 } },
                new CourtData { Id = "7", Name = "Arbroath Tennis Club", Location = "Arbroath, UK", Coordinates = new double[] { 56.5590, -2.5770 } },
                new CourtData { Id = "8", Name = "Montrose Tennis Club", Location = "Montrose, UK", Coordinates = new double[] { 56.7106, -2.4667 } }
            };

            // Filter courts based on query
            return testCourts.Where(c =>
                c.Name.ToLower().Contains(query) ||
                c.Location.ToLower().Contains(query)
            ).ToList();
        }
    }

    public class CourtsResponse
    {
        public List<CourtData> Courts { get; set; } = new List<CourtData>();
    }

    public class CourtData
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Location { get; set; }
        public double[] Coordinates { get; set; }
    }
}