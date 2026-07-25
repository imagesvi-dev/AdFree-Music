using Microsoft.AspNetCore.Mvc;

namespace UMusic.Controllers;

public sealed class LibraryController : Controller
{
    [HttpGet("Playlists")]
    public IActionResult Playlists()
    {
        return View();
    }

    [HttpGet("Downloads")]
    public IActionResult Downloads()
    {
        return View();
    }

    [HttpGet("Settings")]
    public IActionResult Settings()
    {
        return View();
    }
}
