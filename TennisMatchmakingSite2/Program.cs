using Microsoft.Extensions.FileProviders;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.IO;
using TennisMatchmakingSite2.Hubs; // Add this to import your hub namespace

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllersWithViews();
builder.Services.AddSession();
builder.Services.AddSignalR();

// Optional: Add CORS if needed
builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", builder =>
        builder
            .WithOrigins("http://localhost:5000") // Add your client URLs
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials()); // Required for SignalR
});

// Set the correct web root path
var projectPath = Directory.GetParent(Directory.GetCurrentDirectory())?.Parent?.Parent?.FullName;
builder.Environment.WebRootPath = Path.Combine(projectPath ?? Directory.GetCurrentDirectory(), "wwwroot");

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