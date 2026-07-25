using UMusic.Models;

namespace UMusic.Models;

public sealed class HomeViewModel
{
    public IReadOnlyList<Song> TrendingSongs  { get; init; } = [];
    public IReadOnlyList<Song> BollywoodSongs { get; init; } = [];
    public IReadOnlyList<Song> GlobalSongs    { get; init; } = [];
    public IReadOnlyList<Album> FeaturedAlbums { get; init; } = [];
    public IReadOnlyList<Song> LatestSongs    { get; init; } = [];

    /// <summary>All songs merged into one list for the JS queue.</summary>
    public IReadOnlyList<Song> AllSongs =>
        TrendingSongs
            .Concat(BollywoodSongs)
            .Concat(GlobalSongs)
            .Concat(LatestSongs)
            .DistinctBy(s => s.Id)
            .ToList()
            .AsReadOnly();
}
