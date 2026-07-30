using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace UMusic.Services;

public sealed class YtdlService
{
    private readonly ILogger<YtdlService> _logger;
    private readonly string _exePath;
    private readonly string _toolsDir;

    // Aggressive in-memory cache for resolved stream URLs (key = artist|title|quality)
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> _streamCache 
        = new System.Collections.Concurrent.ConcurrentDictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    public YtdlService(ILogger<YtdlService> logger)
    {
        _logger = logger;
        // Place yt-dlp in a Tools directory inside the project root
        _toolsDir = Path.Combine(Directory.GetCurrentDirectory(), "Tools");
        
        bool isWindows = System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows);
        _exePath = Path.Combine(_toolsDir, isWindows ? "yt-dlp.exe" : "yt-dlp");
    }


    /// <summary>
    /// Ensures that yt-dlp.exe exists, downloading it from GitHub if necessary.
    /// </summary>
    public async Task EnsureInstalledAsync(CancellationToken ct = default)
    {
        if (File.Exists(_exePath))
        {
            return;
        }

        _logger.LogInformation("yt-dlp.exe not found. Preparing to download...");

        if (!Directory.Exists(_toolsDir))
        {
            Directory.CreateDirectory(_toolsDir);
        }

        bool isWindows = System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows);
        string downloadUrl = isWindows 
            ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" 
            : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

        using var client = new HttpClient();
        
        try
        {
            _logger.LogInformation("Downloading yt-dlp from {Url}", downloadUrl);
            var response = await client.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();

            using var fileStream = new FileStream(_exePath, FileMode.Create, FileAccess.Write, FileShare.None);
            await response.Content.CopyToAsync(fileStream, ct);
            _logger.LogInformation("yt-dlp downloaded successfully to {Path}", _exePath);

            // On Linux/Mac, ensure it is executable
            if (!isWindows)
            {
                try
                {
                    File.SetUnixFileMode(_exePath, 
                        UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute | 
                        UnixFileMode.GroupRead | UnixFileMode.GroupExecute | 
                        UnixFileMode.OtherRead | UnixFileMode.OtherExecute);
                    _logger.LogInformation("Execution permissions set for yt-dlp");
                }
                catch (Exception chmodEx)
                {
                    _logger.LogWarning(chmodEx, "Could not set Unix file mode, trying chmod...");
                    using var chmodProcess = Process.Start("chmod", $"+x \"{_exePath}\"");
                    await chmodProcess.WaitForExitAsync(ct);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download yt-dlp.exe");
            throw;
        }
    }

    /// <summary>
    /// Searches YouTube for the song and artist and returns the direct audio stream URL.
    /// Uses aggressive in-memory caching + faster yt-dlp flags to eliminate 10-15s delay.
    /// </summary>
    public async Task<string> GetAudioStreamUrlAsync(string artist, string title, string quality = "high", CancellationToken ct = default)
    {
        await EnsureInstalledAsync(ct);

        var cleanArtist = artist.Replace("\"", "").Trim();
        var cleanTitle = title.Replace("\"", "").Trim();
        var cacheKey = $"{cleanArtist}|{cleanTitle}|{quality?.ToLower() ?? "high"}";

        // 1. Return cached URL instantly if available
        if (_streamCache.TryGetValue(cacheKey, out var cachedUrl) && !string.IsNullOrWhiteSpace(cachedUrl))
        {
            _logger.LogDebug("Cache hit for stream URL: {Artist} - {Title}", artist, title);
            return cachedUrl;
        }

        var searchQuery = $"ytsearch1:{cleanArtist} - {cleanTitle} audio";

        // Map audio quality request to yt-dlp format filter
        string formatFilter;
        switch (quality?.ToLower())
        {
            case "low":
                formatFilter = "ba[abr<=96]/ba";
                break;
            case "medium":
                formatFilter = "ba[abr<=128]/ba";
                break;
            case "lossless":
                formatFilter = "ba/b"; // Best format regardless of m4a/aac container rules
                break;
            case "high":
            default:
                formatFilter = "ba[ext=m4a]/ba"; // Apple-aligned M4A container (AAC)
                break;
        }
        
        // 2. Faster yt-dlp flags: --no-playlist, --flat-playlist, --no-warnings, shorter timeout
        var startInfo = new ProcessStartInfo
        {
            FileName = _exePath,
            Arguments = $"--no-playlist --flat-playlist --no-warnings --skip-download --print urls --format \"{formatFilter}\" \"{searchQuery}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        _logger.LogInformation("Running yt-dlp (cached) for: {Artist} - {Title}", artist, title);

        using var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
            
            // Read output and error streams with aggressive timeout
            var outputTask = process.StandardOutput.ReadLineAsync(ct);
            var errorTask = process.StandardError.ReadToEndAsync(ct);

            // Much shorter timeout (4s) + cache miss handling
            await Task.WhenAny(outputTask.AsTask(), Task.Delay(4000, ct)); 

            if (!process.HasExited)
            {
                try { process.Kill(); } catch { }
            }

            var streamUrl = await outputTask;
            var error = await errorTask;

            if (!string.IsNullOrWhiteSpace(error) && string.IsNullOrWhiteSpace(streamUrl))
            {
                _logger.LogWarning("yt-dlp error: {Error}", error);
            }

            if (!string.IsNullOrWhiteSpace(streamUrl))
            {
                var cleanUrl = streamUrl.Trim();
                
                // 3. Store in cache for future instant playback
                _streamCache[cacheKey] = cleanUrl;
                
                _logger.LogInformation("Resolved + cached stream URL");
                return cleanUrl;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "yt-dlp error for query: {Query}", searchQuery);
        }

        return string.Empty;
    }

    /// <summary>
    /// Pre-warms the cache for multiple songs in background (called after search).
    /// </summary>
    public void WarmCache(IEnumerable<(string artist, string title, string quality)> songs)
    {
        _ = Task.Run(async () =>
        {
            foreach (var (artist, title, quality) in songs.Take(8)) // Limit to top 8
            {
                try
                {
                    await GetAudioStreamUrlAsync(artist, title, quality ?? "high");
                    await Task.Delay(120); // Gentle rate limit
                }
                catch { /* ignore background errors */ }
            }
        });
    }
}
