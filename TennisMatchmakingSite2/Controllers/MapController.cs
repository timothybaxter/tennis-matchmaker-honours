using Microsoft.AspNetCore.Mvc;

namespace TennisMatchmakingSite2.Controllers
{
    public class MapController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}
