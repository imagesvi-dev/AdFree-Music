using System.Collections.Generic;
using UMusic.Models;

namespace UMusic.Models;

public sealed class SeeAllViewModel
{
    public string Type { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public IReadOnlyList<Song> Songs { get; init; } = [];
    public IReadOnlyList<Album> Albums { get; init; } = [];
    public IReadOnlyList<string> Artists { get; init; } = [];
}
