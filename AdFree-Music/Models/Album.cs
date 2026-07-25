namespace UMusic.Models;

public sealed class Album
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string ArtistName { get; init; } = string.Empty;
    public string ImageUrl { get; init; } = string.Empty;
    public string Year { get; init; } = string.Empty;
    public int SongCount { get; init; }
}
