using Microsoft.AspNetCore.Mvc;

namespace TennisMatchmakingSite2.Controllers
{
    public class TestController : Controller
    {
        private readonly IWebHostEnvironment _environment;

        public TestController(IWebHostEnvironment environment)
        {
            _environment = environment ?? throw new ArgumentNullException(nameof(environment));
        }

        public IActionResult TestImages()
        {
            try
            {
                var currentDirectory = Directory.GetCurrentDirectory();
                var projectPath = Directory.GetParent(currentDirectory)?.Parent?.Parent?.FullName;
                var contentRoot = _environment.ContentRootPath;
                var webRootPath = _environment.WebRootPath;
                var expectedWwwRoot = Path.Combine(projectPath ?? "", "wwwroot");
                var expectedImagePath = Path.Combine(expectedWwwRoot, "images", "logo.png");

                var result = new
                {
                    CurrentDirectory = currentDirectory,
                    ProjectPath = projectPath,
                    ContentRootPath = contentRoot,
                    WebRootPath = webRootPath,
                    ExpectedWwwRoot = expectedWwwRoot,
                    ExpectedImagePath = expectedImagePath,
                    ExpectedImageExists = System.IO.File.Exists(expectedImagePath),
                    DirectoryContents = Directory.Exists(expectedWwwRoot)
                        ? Directory.GetFiles(expectedWwwRoot, "*.*", SearchOption.AllDirectories)
                        : new string[0]
                };

                return Json(result);
            }
            catch (Exception ex)
            {
                return Json(new
                {
                    Error = ex.Message,
                    Stack = ex.StackTrace,
                    Type = ex.GetType().Name
                });
            }
        }
    }
}