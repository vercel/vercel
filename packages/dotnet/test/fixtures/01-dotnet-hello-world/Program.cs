var app = WebApplication.Create(args);

app.MapGet("/", () => "Hello from .NET on Vercel!");

app.MapGet("/api/info", () => new
{
    runtime = "dotnet",
    version = Environment.Version.ToString()
});

app.Run();
