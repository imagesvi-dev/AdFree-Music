namespace UMusic.Models;

public sealed class SearchResult
{
    public IReadOnlyList<Song> Songs { get; init; } = [];
    public string Query { get; init; } = string.Empty;
    public int TotalResults { get; init; }
}
