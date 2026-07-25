using Microsoft.AspNetCore.Mvc;
using UMusic.Services;
using System.Threading;
using System.Threading.Tasks;

namespace UMusic.Controllers;

public sealed class AlbumController : Controller
{
    private readonly IMusicService _musicService;

    public AlbumController(IMusicService musicService)
    {
        _musicService = musicService;
    }

    [HttpGet("Album/{id}")]
    public async Task<IActionResult> Index(string id, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(id))
            return RedirectToAction("Index", "Home");

        var album = await _musicService.GetAlbumDetailsAsync(id, ct);
        if (album is null)
        {
            TempData["ErrorMessage"] = "Could not find the requested album.";
            return RedirectToAction("Index", "Home");
        }

        return View(album);
    }
}
