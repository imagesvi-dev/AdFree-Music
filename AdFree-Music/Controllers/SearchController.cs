using Microsoft.AspNetCore.Mvc;
using UMusic.Models;
using UMusic.Services;

namespace UMusic.Controllers;

public sealed class SearchController : Controller
{
    private readonly IMusicService _musicService;

    public SearchController(IMusicService musicService) => _musicService = musicService;

    [HttpGet]
    public async Task<IActionResult> Index([FromQuery] string q, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q))
            return View(new SearchResult { Query = string.Empty });

        var result = await _musicService.SearchSongsAsync(q.Trim(), ct: ct);
        return View(result);
    }
}
