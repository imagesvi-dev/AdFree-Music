using System.Collections.Generic;
using System.Linq;

namespace UMusic.Models;

public sealed class AlbumDetails
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string ArtistName { get; init; } = string.Empty;
    public string ImageUrl { get; init; } = string.Empty;
    public string Year { get; init; } = string.Empty;
    public string Genre { get; init; } = string.Empty;
    public int SongCount { get; init; }
    public IReadOnlyList<Song> Songs { get; set; } = [];

    public int TotalDurationSeconds => Songs.Sum(s => s.DurationSeconds);
    
    public string TotalDurationFormatted
    {
        get
        {
            var totalSecs = TotalDurationSeconds;
            var hours = totalSecs / 3600;
            var mins = (totalSecs % 3600) / 60;
            var secs = totalSecs % 60;
            if (hours > 0)
                return $"{hours} hr {mins} min";
            return $"{mins} min {secs} sec";
        }
    }
}
