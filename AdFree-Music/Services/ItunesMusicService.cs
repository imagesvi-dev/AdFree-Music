using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Caching.Memory;
using UMusic.Models;

namespace UMusic.Services;

/// <summary>
/// Music service backed by the iTunes Search API.
/// Free, no authentication, globally reliable.
/// Returns 30-second AAC preview clips playable by HTML5 audio.
/// Docs: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
/// </summary>
public sealed class ItunesMusicService : IMusicService
{
    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly ILogger<ItunesMusicService> _logger;
    private readonly string _country;
    private readonly int _defaultLimit;
    private readonly int _cacheSeconds;

    // Curated genre terms → iTunes genre names for home page sections
    private static readonly (string Label, string Query)[] TrendingQueries =
    [
        ("Bollywood Hits",   "bollywood 2025"),
        ("Global Hits",      "pop hits 2025"),
        ("Latest Releases",  "new songs 2025"),
        ("Hip Hop",          "hip hop 2025"),
        ("Punjabi",          "punjabi 2025"),
        ("Romantic",         "romantic hindi"),
        ("International",    "Taylor Swift"),
        ("EDM",              "edm 2025"),
    ];

    private static readonly (string Label, string Query)[] FeaturedArtistQueries =
    [
        ("Arijit Singh",     "arijit singh"),
        ("Taylor Swift",     "taylor swift"),
        ("AP Dhillon",       "ap dhillon"),
        ("The Weeknd",       "the weeknd"),
        ("Dua Lipa",         "dua lipa"),
        ("Sidhu Moosewala",  "sidhu moosewala"),
    ];

    private static readonly List<Song> FallbackSongs = new()
    {
        new Song
        {
            Id = "607316773",
            Name = "Tum Hi Ho",
            ArtistName = "Arijit Singh",
            AlbumName = "Aashiqui 2",
            ImageUrl = "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/bf/fb/14/bffb1451-de8a-6b45-649f-ec3126f56475/886443916377.jpg/600x600bb.jpg",
            StreamUrl = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/44/2c/31/442c31ab-be35-640a-241c-3abf16f568db/mzaf_16408285514652251441.plus.aac.p.m4a",
            DurationSeconds = 322,
            Year = "2013",
            Language = "Bollywood",
            AlbumId = "607316759",
            ArtistId = "329437142"
        },
        new Song
        {
            Id = "907242704",
            Name = "Blank Space",
            ArtistName = "Taylor Swift",
            AlbumName = "1989",
            ImageUrl = "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/5a/a2/83/5aa28399-5f25-bb35-433c-3bbd83c2763f/14UMGIM55074.rgb.jpg/600x600bb.jpg",
            StreamUrl = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/cf/c9/8d/cfc98d69-31ab-b9a3-5c5b-38d583c2763f/mzaf_18218174151322123544.plus.aac.p.m4a",
            DurationSeconds = 231,
            Year = "2014",
            Language = "Pop",
            AlbumId = "907242700",
            ArtistId = "1594456"
        },
        new Song
        {
            Id = "1488408565",
            Name = "Blinding Lights",
            ArtistName = "The Weeknd",
            AlbumName = "After Hours",
            ImageUrl = "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/05/cf/8d/05cf8d74-f25b-f111-9a7e-97ec7591e0a8/19UMGIM86144.rgb.jpg/600x600bb.jpg",
            StreamUrl = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/64/cd/e1/64cde17f-47fb-3575-cf6d-ec44a30e8c8a/mzaf_657929114757134371.plus.aac.p.m4a",
            DurationSeconds = 200,
            Year = "2020",
            Language = "Pop",
            AlbumId = "1488408565",
            ArtistId = "262241839"
        },
        new Song
        {
            Id = "1538003403",
            Name = "Levitating (feat. DaBaby)",
            ArtistName = "Dua Lipa",
            AlbumName = "Future Nostalgia",
            ImageUrl = "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/21/df/f0/21dff03c-8438-bb0a-a035-7cfaeb8d00ca/190295204481.jpg/600x600bb.jpg",
            StreamUrl = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/bb/a2/2a/bba22af4-cf8c-fb52-eb02-f38c31ab3c2d/mzaf_105408285514652251441.plus.aac.p.m4a",
            DurationSeconds = 203,
            Year = "2020",
            Language = "Pop",
            AlbumId = "1538003400",
            ArtistId = "282713837"
        },
        new Song
        {
            Id = "1601004123",
            Name = "Excuses",
            ArtistName = "AP Dhillon & Gurinder Gill",
            AlbumName = "Excuses - Single",
            ImageUrl = "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/df/76/30/df7630e2-63b7-7bb2-1ff8-4ee1f57e84ba/859758550123_Cover.jpg/600x600bb.jpg",
            StreamUrl = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/d5/43/e7/d543e7bb-85bb-cb64-9b2f-bb64ee1c3abf/mzaf_18218174151322123544.plus.aac.p.m4a",
            DurationSeconds = 176,
            Year = "2020",
            Language = "Punjabi",
            AlbumId = "1601004120",
            ArtistId = "1492028723"
        }
    };

    public ItunesMusicService(
        HttpClient http,
        IMemoryCache cache,
        ILogger<ItunesMusicService> logger,
        IConfiguration config)
    {
        _http = http;
        _cache = cache;
        _logger = logger;
        _country = config["ItunesApi:DefaultCountry"] ?? "in";
        _defaultLimit = config.GetValue("ItunesApi:DefaultLimit", 20);
        _cacheSeconds = config.GetValue("ItunesApi:CacheSeconds", 300);
    }

    // ──────────────────────────────────────────────────────────────
    // Search
    // ──────────────────────────────────────────────────────────────
    public async Task<SearchResult> SearchSongsAsync(
        string query, int page = 1, int limit = 20, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query))
            return new SearchResult { Query = query };

        var cacheKey = $"search:{query}:{page}:{limit}";
        if (_cache.TryGetValue(cacheKey, out SearchResult? cached) && cached is not null)
            return cached;

        var songs = await FetchSongsAsync(query, limit, ct);
        var result = new SearchResult
        {
            Query = query,
            Songs = songs,
            TotalResults = songs.Count
        };

        _cache.Set(cacheKey, result, TimeSpan.FromSeconds(_cacheSeconds));
        return result;
    }

    // ──────────────────────────────────────────────────────────────
    // Single Song
    // ──────────────────────────────────────────────────────────────
    public async Task<Song?> GetSongAsync(string id, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;

        var cacheKey = $"song:{id}";
        if (_cache.TryGetValue(cacheKey, out Song? cached)) return cached;

        try
        {
            var url = $"/lookup?id={Uri.EscapeDataString(id)}&entity=song&country={_country}";
            var json = await _http.GetStringAsync(url, ct);
            var root = JsonNode.Parse(json);
            var results = root?["results"]?.AsArray();
            var song = results?.Select(ParseSong).FirstOrDefault(s => s is not null);

            if (song is not null)
                _cache.Set(cacheKey, song, TimeSpan.FromSeconds(_cacheSeconds * 2));

            return song;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch song id={Id}", id);
            return null;
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Trending (used for homepage)
    // ──────────────────────────────────────────────────────────────
    public async Task<IReadOnlyList<Song>> GetTrendingSongsAsync(
        string genre = "", CancellationToken ct = default)
    {
        var cacheKey = $"trending:{genre}";
        if (_cache.TryGetValue(cacheKey, out IReadOnlyList<Song>? cached) && cached is not null)
            return cached;

        var q = string.IsNullOrWhiteSpace(genre)
            ? TrendingQueries[Random.Shared.Next(TrendingQueries.Length)].Query
            : genre;

        var songs = await FetchSongsAsync(q, _defaultLimit, ct);
        _cache.Set(cacheKey, songs, TimeSpan.FromSeconds(_cacheSeconds));
        return songs;
    }

    // ──────────────────────────────────────────────────────────────
    // Featured Albums (multiple genre searches collapsed into albums)
    // ──────────────────────────────────────────────────────────────
    public async Task<IReadOnlyList<Album>> GetFeaturedAlbumsAsync(CancellationToken ct = default)
    {
        const string cacheKey = "featured-albums";
        if (_cache.TryGetValue(cacheKey, out IReadOnlyList<Album>? cached) && cached is not null)
            return cached;

        try
        {
            var url = $"/search?term=bollywood+hits&media=music&entity=album&limit=20&country={_country}";
            var json = await _http.GetStringAsync(url, ct);
            var root = JsonNode.Parse(json);
            var results = root?["results"]?.AsArray() ?? [];

            var albums = results
                .Select(ParseAlbum)
                .Where(a => a is not null)
                .Cast<Album>()
                .ToList()
                .AsReadOnly();

            if (albums.Count > 0)
            {
                _cache.Set(cacheKey, albums, TimeSpan.FromSeconds(_cacheSeconds));
                return albums;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch featured albums");
        }

        var fallbackAlbums = FallbackSongs
            .Select(s => new Album
            {
                Id = "alb_" + s.Id,
                Name = s.AlbumName,
                ArtistName = s.ArtistName,
                ImageUrl = s.ImageUrl,
                Year = s.Year,
                SongCount = 1
            })
            .DistinctBy(a => a.Name)
            .ToList()
            .AsReadOnly();

        return fallbackAlbums;
    }

    // ──────────────────────────────────────────────────────────────
    // Songs by Genre
    // ──────────────────────────────────────────────────────────────
    public async Task<IReadOnlyList<Song>> GetSongsByGenreAsync(
        string genre, CancellationToken ct = default)
    {
        var cacheKey = $"genre:{genre}";
        if (_cache.TryGetValue(cacheKey, out IReadOnlyList<Song>? cached) && cached is not null)
            return cached;

        var songs = await FetchSongsAsync(genre, _defaultLimit, ct);
        _cache.Set(cacheKey, songs, TimeSpan.FromSeconds(_cacheSeconds));
        return songs;
    }

    // ──────────────────────────────────────────────────────────────
    // Album Details Lookup
    // ──────────────────────────────────────────────────────────────
    public async Task<AlbumDetails?> GetAlbumDetailsAsync(string collectionId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(collectionId)) return null;

        var cacheKey = $"album-details:{collectionId}";
        if (_cache.TryGetValue(cacheKey, out AlbumDetails? cached)) return cached;

        // Fallback matching
        if (collectionId.StartsWith("alb_"))
        {
            var realSongId = collectionId.Substring(4);
            var song = FallbackSongs.FirstOrDefault(s => s.Id == realSongId);
            if (song is not null)
            {
                var fbDetails = new AlbumDetails
                {
                    Id = collectionId,
                    Name = song.AlbumName,
                    ArtistName = song.ArtistName,
                    ImageUrl = song.ImageUrl,
                    Year = song.Year,
                    Genre = song.Language,
                    SongCount = 1,
                    Songs = new List<Song> { song }
                };
                _cache.Set(cacheKey, fbDetails, TimeSpan.FromSeconds(_cacheSeconds));
                return fbDetails;
            }
        }

        try
        {
            var url = $"/lookup?id={Uri.EscapeDataString(collectionId)}&entity=song&country={_country}";
            var json = await _http.GetStringAsync(url, ct);
            var root = JsonNode.Parse(json);
            var results = root?["results"]?.AsArray() ?? [];

            if (results.Count == 0) return null;

            var collectionNode = results.FirstOrDefault(n => n?["wrapperType"]?.GetValue<string>() == "collection");
            var trackNodes = results.Where(n => n?["wrapperType"]?.GetValue<string>() == "track");

            string albumName = "Unknown Album";
            string artistName = "Unknown Artist";
            string imageUrl = "/images/default_art.png";
            string year = string.Empty;
            string genre = "Music";
            int songCount = 0;

            if (collectionNode is not null)
            {
                albumName = collectionNode["collectionName"]?.GetValue<string>() ?? albumName;
                artistName = collectionNode["artistName"]?.GetValue<string>() ?? artistName;
                var art = collectionNode["artworkUrl100"]?.GetValue<string>() ?? string.Empty;
                imageUrl = art.Replace("100x100bb", "600x600bb");
                year = collectionNode["releaseDate"]?.GetValue<string>()?.Split('-').FirstOrDefault() ?? string.Empty;
                genre = collectionNode["primaryGenreName"]?.GetValue<string>() ?? genre;
                songCount = collectionNode["trackCount"]?.GetValue<int>() ?? 0;
            }

            var songs = trackNodes
                .Select(ParseSong)
                .Where(s => s is not null)
                .Cast<Song>()
                .ToList();

            if (songs.Count == 0 && collectionNode is null)
            {
                return null;
            }

            if (collectionNode is null && songs.Count > 0)
            {
                albumName = songs[0].AlbumName;
                artistName = songs[0].ArtistName;
                imageUrl = songs[0].ImageUrl;
                year = songs[0].Year;
                genre = songs[0].Language;
                songCount = songs.Count;
            }

            var details = new AlbumDetails
            {
                Id = collectionId,
                Name = albumName,
                ArtistName = artistName,
                ImageUrl = imageUrl,
                Year = year,
                Genre = genre,
                SongCount = songCount > 0 ? songCount : songs.Count,
                Songs = songs
            };

            _cache.Set(cacheKey, details, TimeSpan.FromSeconds(_cacheSeconds * 2));
            return details;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to lookup album details id={Id}", collectionId);
            return null;
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Core HTTP Fetch
    // ──────────────────────────────────────────────────────────────
    private async Task<IReadOnlyList<Song>> FetchSongsAsync(
        string query, int limit, CancellationToken ct)
    {
        try
        {
            var url = $"/search?term={Uri.EscapeDataString(query)}" +
                      $"&media=music&entity=song&limit={limit}&country={_country}";

            var json = await _http.GetStringAsync(url, ct);
            var root = JsonNode.Parse(json);
            var results = root?["results"]?.AsArray() ?? [];

            var songs = results
                .Select(ParseSong)
                .Where(s => s is not null && !string.IsNullOrEmpty(s.StreamUrl))
                .Cast<Song>()
                .ToList()
                .AsReadOnly();

            if (songs.Count > 0) return songs;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "iTunes fetch failed for query={Query}", query);
        }

        var filtered = FallbackSongs
            .Where(s => s.Name.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                        s.ArtistName.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                        s.Language.Contains(query, StringComparison.OrdinalIgnoreCase))
            .ToList();

        return (filtered.Count > 0 ? filtered : FallbackSongs).AsReadOnly();
    }

    // ──────────────────────────────────────────────────────────────
    // JSON Parsers
    // ──────────────────────────────────────────────────────────────
    private static Song? ParseSong(JsonNode? node)
    {
        if (node is null) return null;

        var trackId = node["trackId"]?.GetValue<long>();
        if (trackId is null or 0) return null;

        var previewUrl = node["previewUrl"]?.GetValue<string>() ?? string.Empty;
        // Only include songs that have a playable preview
        if (string.IsNullOrEmpty(previewUrl)) return null;

        // Build a high-res image (600x600) from the 100x100 URL
        var art = node["artworkUrl100"]?.GetValue<string>() ?? string.Empty;
        var artHD = art.Replace("100x100bb", "600x600bb");

        var durationMs = node["trackTimeMillis"]?.GetValue<int>() ?? 0;

        return new Song
        {
            Id          = trackId.Value.ToString(),
            Name        = node["trackName"]?.GetValue<string>() ?? "Unknown",
            ArtistName  = node["artistName"]?.GetValue<string>() ?? "Unknown Artist",
            AlbumName   = node["collectionName"]?.GetValue<string>() ?? string.Empty,
            ImageUrl    = artHD,
            StreamUrl   = previewUrl,
            DurationSeconds = durationMs / 1000,
            Year        = node["releaseDate"]?.GetValue<string>()?.Split('-').FirstOrDefault() ?? string.Empty,
            Language    = node["primaryGenreName"]?.GetValue<string>() ?? string.Empty,
            AlbumId     = node["collectionId"]?.ToString() ?? string.Empty,
            ArtistId    = node["artistId"]?.ToString() ?? string.Empty,
        };
    }

    private static Album? ParseAlbum(JsonNode? node)
    {
        if (node is null) return null;

        var collectionId = node["collectionId"]?.GetValue<long>();
        if (collectionId is null or 0) return null;

        var art = node["artworkUrl100"]?.GetValue<string>() ?? string.Empty;
        var artHD = art.Replace("100x100bb", "600x600bb");

        return new Album
        {
            Id         = collectionId.Value.ToString(),
            Name       = node["collectionName"]?.GetValue<string>() ?? "Unknown Album",
            ArtistName = node["artistName"]?.GetValue<string>() ?? "Unknown Artist",
            ImageUrl   = artHD,
            Year       = node["releaseDate"]?.GetValue<string>()?.Split('-').FirstOrDefault() ?? string.Empty,
            SongCount  = node["trackCount"]?.GetValue<int>() ?? 0,
        };
    }
}
