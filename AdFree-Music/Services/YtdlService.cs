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
    /// </summary>
    public async Task<string> GetAudioStreamUrlAsync(string artist, string title, string quality = "high", CancellationToken ct = default)
    {
        await EnsureInstalledAsync(ct);

        var cleanArtist = artist.Replace("\"", "");
        var cleanTitle = title.Replace("\"", "");
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
        
        // Setup process start info
        var startInfo = new ProcessStartInfo
        {
            FileName = _exePath,
            Arguments = $"--skip-download --print urls --format \"{formatFilter}\" \"{searchQuery}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        _logger.LogInformation("Running yt-dlp to get stream URL for: {Artist} - {Title}", artist, title);

        using var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
            
            // Read output and error streams
            var outputTask = process.StandardOutput.ReadLineAsync(ct);
            var errorTask = process.StandardError.ReadToEndAsync(ct);

            await Task.WhenAny(outputTask.AsTask(), Task.Delay(15000, ct)); // 15s timeout

            if (!process.HasExited)
            {
                process.Kill();
            }

            var streamUrl = await outputTask;
            var error = await errorTask;

            if (!string.IsNullOrWhiteSpace(error) && string.IsNullOrWhiteSpace(streamUrl))
            {
                _logger.LogWarning("yt-dlp error output: {Error}", error);
            }

            if (!string.IsNullOrWhiteSpace(streamUrl))
            {
                var cleanUrl = streamUrl.Trim();
                _logger.LogInformation("Successfully resolved stream URL");
                return cleanUrl;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing yt-dlp for search query: {Query}", searchQuery);
        }

        return string.Empty;
    }
}
