using Microsoft.AspNetCore.Mvc;
using UMusic.Models;
using UMusic.Services;

namespace UMusic.Controllers;

/// <summary>
/// JSON API endpoints consumed by the frontend JavaScript.
/// </summary>
[Route("api")]
[ApiController]
public sealed class MusicController : ControllerBase
{
    private readonly IMusicService _musicService;
    private readonly YtdlService _ytdlService;
    private readonly IHttpClientFactory _httpClientFactory;

    public MusicController(
        IMusicService musicService,
        YtdlService ytdlService,
        IHttpClientFactory httpClientFactory)
    {
        _musicService = musicService;
        _ytdlService = ytdlService;
        _httpClientFactory = httpClientFactory;
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string q,
        [FromQuery] int page = 1,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new { error = "Query parameter 'q' is required." });

        var result = await _musicService.SearchSongsAsync(q.Trim(), page, 20, ct);
        return Ok(new
        {
            query = result.Query,
            total = result.TotalResults,
            songs = result.Songs.Select(MapSong)
        });
    }

    [HttpGet("songs/{id}")]
    public async Task<IActionResult> GetSong(string id, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(id))
            return BadRequest(new { error = "Song ID is required." });

        var song = await _musicService.GetSongAsync(id, ct);
        if (song is null)
            return NotFound(new { error = "Song not found." });

        return Ok(MapSong(song));
    }

    [HttpGet("trending")]
    public async Task<IActionResult> Trending(
        [FromQuery] string genre = "",
        CancellationToken ct = default)
    {
        var songs = await _musicService.GetTrendingSongsAsync(genre, ct);
        return Ok(new { songs = songs.Select(MapSong) });
    }

    [HttpGet("albums/featured")]
    public async Task<IActionResult> FeaturedAlbums(CancellationToken ct)
    {
        var albums = await _musicService.GetFeaturedAlbumsAsync(ct);
        return Ok(new { albums = albums.Select(MapAlbum) });
    }

    [HttpGet("stream/{id}")]
    public async Task StreamAudio(string id, [FromQuery] string quality = "high", CancellationToken ct = default)
    {
        var song = await _musicService.GetSongAsync(id, ct);
        if (song is null)
        {
            Response.StatusCode = 404;
            return;
        }

        var streamUrl = await _ytdlService.GetAudioStreamUrlAsync(song.ArtistName, song.Name, quality, ct);
        if (string.IsNullOrEmpty(streamUrl))
        {
            Response.StatusCode = 404;
            return;
        }

        var client = _httpClientFactory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, streamUrl);

        // Forward Range headers to support seeking
        if (Request.Headers.TryGetValue("Range", out var rangeHeader))
        {
            request.Headers.Add("Range", rangeHeader.ToString());
        }

        try
        {
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            Response.StatusCode = (int)response.StatusCode;

            foreach (var header in response.Headers)
            {
                if (header.Key.Equals("Accept-Ranges", StringComparison.OrdinalIgnoreCase) ||
                    header.Key.Equals("ETag", StringComparison.OrdinalIgnoreCase))
                {
                    Response.Headers[header.Key] = header.Value.ToArray();
                }
            }
            foreach (var header in response.Content.Headers)
            {
                if (header.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase) ||
                    header.Key.Equals("Content-Length", StringComparison.OrdinalIgnoreCase) ||
                    header.Key.Equals("Content-Range", StringComparison.OrdinalIgnoreCase))
                {
                    Response.Headers[header.Key] = header.Value.ToArray();
                }
            }

            using var responseStream = await response.Content.ReadAsStreamAsync(ct);
            await responseStream.CopyToAsync(Response.Body, ct);
        }
        catch (Exception ex)
        {
            // Handle expected client aborts/cancels gracefully
            if (ex is not OperationCanceledException && ex is not TaskCanceledException)
            {
                // Simple logging if not cancellation
                System.Console.WriteLine($"[UMusic] Stream redirection/piping error: {ex.Message}");
            }
        }
    }

    private static object MapSong(Song s) => new
    {
        id               = s.Id,
        name             = s.Name,
        artist           = s.ArtistName,
        album            = s.AlbumName,
        image            = s.ImageUrl,
        streamUrl        = $"/api/stream/{s.Id}", // Route to our full audio streaming proxy
        duration         = s.DurationSeconds,
        durationFormatted= s.DurationFormatted,
        year             = s.Year,
        language         = s.Language,
        albumId          = s.AlbumId,
        artistId         = s.ArtistId,
    };

    private static object MapAlbum(Album a) => new
    {
        id       = a.Id,
        name     = a.Name,
        artist   = a.ArtistName,
        image    = a.ImageUrl,
        year     = a.Year,
        songCount= a.SongCount,
    };
}
