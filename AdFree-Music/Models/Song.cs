namespace UMusic.Models;

public sealed class Song
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string ArtistName { get; init; } = string.Empty;
    public string AlbumName { get; init; } = string.Empty;
    public string ImageUrl { get; init; } = string.Empty;
    public string StreamUrl { get; init; } = string.Empty;
    public int DurationSeconds { get; init; }
    public string Year { get; init; } = string.Empty;
    public string Language { get; init; } = string.Empty;
    public string AlbumId { get; init; } = string.Empty;
    public string ArtistId { get; init; } = string.Empty;

    public string DurationFormatted => DurationSeconds > 0
        ? $"{DurationSeconds / 60}:{DurationSeconds % 60:D2}"
        : "--:--";
}
