using Microsoft.AspNetCore.Mvc;
using UMusic.Models;
using UMusic.Services;

namespace UMusic.Controllers;

public sealed class HomeController : Controller
{
    private readonly IMusicService _musicService;

    public HomeController(IMusicService musicService) => _musicService = musicService;

    public async Task<IActionResult> Index(CancellationToken ct)
    {
        // Run all homepage sections in parallel for performance
        var trendingTask  = _musicService.GetTrendingSongsAsync("", ct);
        var bollywoodTask = _musicService.GetSongsByGenreAsync("bollywood hits 2025", ct);
        var globalTask    = _musicService.GetSongsByGenreAsync("pop hits 2025", ct);
        var albumsTask    = _musicService.GetFeaturedAlbumsAsync(ct);
        var latestTask    = _musicService.GetSongsByGenreAsync("new songs 2025", ct);

        await Task.WhenAll(trendingTask, bollywoodTask, globalTask, albumsTask, latestTask);

        var vm = new HomeViewModel
        {
            TrendingSongs  = await trendingTask,
            BollywoodSongs = await bollywoodTask,
            GlobalSongs    = await globalTask,
            FeaturedAlbums = await albumsTask,
            LatestSongs    = await latestTask,
        };

        return View(vm);
    }
}
