using Microsoft.Extensions.FileProviders;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.IO;
using TennisMatchmakingSite2.Hubs; // Add this to import your hub namespace
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using TennisMatchmakingSite2.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllersWithViews();
builder.Services.AddSession();
builder.Services.AddSignalR();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<NotificationService>();

// Optional: Add CORS if needed
builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", builder =>
        builder
            .WithOrigins("*") // Add your client URLs
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials()); // Required for SignalR
});

builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.ListenAnyIP(5000);
});

// Set the correct web root path for both development and production
if (!Directory.Exists(builder.Environment.WebRootPath))
{
    // Development environment (running from bin/Debug)
    var projectPath = Directory.GetParent(Directory.GetCurrentDirectory())?.Parent?.Parent?.FullName;
    if (projectPath != null && Directory.Exists(Path.Combine(projectPath, "wwwroot")))
    {
        builder.Environment.WebRootPath = Path.Combine(projectPath, "wwwroot");
        Console.WriteLine($"Using development wwwroot path: {builder.Environment.WebRootPath}");
    }
    else
    {
        // Fallback to current directory
        builder.Environment.WebRootPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        Console.WriteLine($"Using fallback wwwroot path: {builder.Environment.WebRootPath}");
    }
}
else
{
    Console.WriteLine($"Using default wwwroot path: {builder.Environment.WebRootPath}");
}

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Error: {ex}");
        throw;
    }
});

app.UseHttpsRedirection();
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(builder.Environment.WebRootPath),
    RequestPath = ""
});

// app.UseCors("CorsPolicy");

app.UseSession();
app.UseRouting();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Account}/{action=Login}/{id?}");

// Map SignalR hub
app.MapHub<TennisMatchmakerHub>("/tennisMatchmakerHub");

app.Run();