using UMusic.Models;

namespace UMusic.Services;

public interface IMusicService
{
    Task<SearchResult> SearchSongsAsync(string query, int page = 1, int limit = 20, CancellationToken ct = default);
    Task<Song?> GetSongAsync(string id, CancellationToken ct = default);
    Task<IReadOnlyList<Song>> GetTrendingSongsAsync(string genre = "", CancellationToken ct = default);
    Task<IReadOnlyList<Album>> GetFeaturedAlbumsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<Song>> GetSongsByGenreAsync(string genre, CancellationToken ct = default);
    Task<AlbumDetails?> GetAlbumDetailsAsync(string collectionId, CancellationToken ct = default);
}
