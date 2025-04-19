using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using System;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;

namespace TennisMatchmakingSite2.Controllers
{
    public class BaseController : Controller
    {
        protected readonly IHttpClientFactory _httpClientFactory;
        protected readonly IConfiguration _configuration;
        protected readonly ILogger<BaseController> _logger;

        public BaseController(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<BaseController> logger)
        {
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        public override async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            // Get unread notification count before the action executes
            await GetUnreadNotificationCountAsync();

            // Execute the action
            await next();
        }

        protected async Task GetUnreadNotificationCountAsync()
        {
            try
            {
                // Check if we already have it in session to avoid frequent API calls
                if (HttpContext.Session.GetInt32("UnreadNotificationCount") is int cachedCount)
                {
                    ViewBag.UnreadNotificationCount = cachedCount;
                    return;
                }

                var token = HttpContext.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    ViewBag.UnreadNotificationCount = 0;
                    return;
                }

                // Create a separate client for notification count
                var apiBaseUrl = _configuration["ApiBaseUrl"];
                using var client = _httpClientFactory.CreateClient();
                client.BaseAddress = new Uri(apiBaseUrl);

                var request = new HttpRequestMessage(HttpMethod.Get, "notifications?unread=true");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await client.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var jsonDocument = JsonDocument.Parse(content);

                    if (jsonDocument.RootElement.TryGetProperty("notifications", out var notificationsElement) &&
                        notificationsElement.ValueKind == JsonValueKind.Array)
                    {
                        int count = 0;
                        foreach (var notification in notificationsElement.EnumerateArray())
                        {
                            if (notification.TryGetProperty("isRead", out var isReadElement) &&
                                isReadElement.ValueKind == JsonValueKind.False)
                            {
                                count++;
                            }
                        }

                        ViewBag.UnreadNotificationCount = count;
                        HttpContext.Session.SetInt32("UnreadNotificationCount", count);
                    }
                    else
                    {
                        ViewBag.UnreadNotificationCount = 0;
                    }
                }
                else
                {
                    ViewBag.UnreadNotificationCount = 0;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting unread notification count");
                ViewBag.UnreadNotificationCount = 0;
            }
        }
    }
}