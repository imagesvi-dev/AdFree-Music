using Microsoft.AspNetCore.Mvc;
using UMusic.Services;
using UMusic.Models;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace UMusic.Controllers;

public sealed class SeeAllController : Controller
{
    private readonly IMusicService _musicService;

    public SeeAllController(IMusicService musicService)
    {
        _musicService = musicService;
    }

    [HttpGet("SeeAll")]
    public async Task<IActionResult> Index([FromQuery] string type, CancellationToken ct)
    {
        var categoryType = type?.ToLower() ?? "trending";
        var vm = new SeeAllViewModel { Type = categoryType };

        switch (categoryType)
        {
            case "albums":
                var albums = await _musicService.GetFeaturedAlbumsAsync(ct);
                vm = new SeeAllViewModel
                {
                    Type = categoryType,
                    Title = "All Featured Albums",
                    Albums = albums
                };
                break;

            case "new-releases":
                var newReleases = await _musicService.GetSongsByGenreAsync("new songs 2025", ct);
                vm = new SeeAllViewModel
                {
                    Type = categoryType,
                    Title = "All New Releases",
                    Songs = newReleases
                };
                break;

            case "artists":
                var artistsList = new List<string> { 
                    "Arijit Singh", "Taylor Swift", "AP Dhillon", "The Weeknd", 
                    "Dua Lipa", "Sidhu Moosewala", "Diljit Dosanjh", 
                    "Shreya Ghoshal", "Billie Eilish", "Drake", "Post Malone", "Ed Sheeran" 
                };
                vm = new SeeAllViewModel
                {
                    Type = categoryType,
                    Title = "All Popular Artists",
                    Artists = artistsList
                };
                break;

            case "playlists":
                vm = new SeeAllViewModel
                {
                    Type = categoryType,
                    Title = "All Playlists"
                };
                break;

            case "trending":
            default:
                var trending = await _musicService.GetTrendingSongsAsync("", ct);
                vm = new SeeAllViewModel
                {
                    Type = "trending",
                    Title = "All Trending Songs",
                    Songs = trending
                };
                break;
        }

        return View(vm);
    }
}
