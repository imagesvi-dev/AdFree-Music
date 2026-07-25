using UMusic.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();
builder.Services.AddMemoryCache();

// iTunes Search API – free, no key, globally reliable
builder.Services.AddHttpClient<IMusicService, ItunesMusicService>(client =>
{
    var baseUrl = builder.Configuration["ItunesApi:BaseUrl"] ?? "https://itunes.apple.com";
    var timeout = builder.Configuration.GetValue("ItunesApi:TimeoutSeconds", 15);

    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromSeconds(timeout);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
    client.DefaultRequestHeaders.Add(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AdFreeMusic/1.0");
});

builder.Services.AddSingleton<YtdlService>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
