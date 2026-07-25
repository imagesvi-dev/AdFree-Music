/**
 * U-Music — Search Page Logic
 * Handles live search with debounce, result rendering, and playback integration.
 */

'use strict';

(function () {
    const DEBOUNCE_MS = 350;

    let currentResults = [];  // Holds the current list of songs for queue

    document.addEventListener('DOMContentLoaded', () => {
        const searchInput = document.getElementById('search-input');
        const clearBtn    = document.getElementById('search-clear');
        const resultsEl   = document.getElementById('search-results');
        const countEl     = document.getElementById('results-count');
        const loadingEl   = document.getElementById('search-loading');

        if (!searchInput) return;

        // Auto-focus search on the page
        const globalSearch = document.getElementById('global-search');
        if (globalSearch) {
            globalSearch.focus();
            const val = globalSearch.value;
            globalSearch.value = '';
            globalSearch.value = val;
        } else {
            searchInput.focus();
        }

        // Show/hide clear button
        searchInput.addEventListener('input', () => {
            clearBtn?.classList.toggle('hidden', searchInput.value.length === 0);
        });

        clearBtn?.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.classList.add('hidden');
            searchInput.focus();
            currentResults = [];
            showPrompt(resultsEl, countEl);
        });

        // Debounced live search
        const doSearch = debounce(async (query) => {
            if (!query || query.trim().length < 2) {
                showPrompt(resultsEl, countEl);
                return;
            }

            showLoading(loadingEl, resultsEl, countEl);

            try {
                const resp = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
                if (!resp.ok) throw new Error(`HTTP ${resp.status} - Could not connect to music search service.`);
                const data = await resp.json();

                currentResults = data.songs || [];
                window.setQueue?.(currentResults);

                renderResults(currentResults, resultsEl, countEl, loadingEl);

                // Update URL without page reload for shareable links
                const url = new URL(window.location);
                url.searchParams.set('q', query.trim());
                history.replaceState({}, '', url);

            } catch (err) {
                console.error('[UMusic] Search error:', err);
                showError(resultsEl, loadingEl, countEl, err.message);
            }
        }, DEBOUNCE_MS);

        searchInput.addEventListener('input', () => doSearch(searchInput.value));

        // If the page loaded with a pre-filled query (from server-side), trigger a fetch too
        const initialQ = searchInput.value.trim();
        if (initialQ) {
            clearBtn?.classList.remove('hidden');
            doSearch(initialQ);
        }
    });

    // ─────────────────────────────────────────
    // Render Results
    // ─────────────────────────────────────────
    function renderResults(songs, container, countEl, loadingEl) {
        if (loadingEl) loadingEl.style.display = 'none';

        if (!songs || songs.length === 0) {
            if (countEl) countEl.textContent = 'No results found';
            container.innerHTML = `
                <div class="search-prompt">
                    <svg class="search-prompt__icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <p class="search-prompt__title">No songs found</p>
                    <p class="search-prompt__sub">Try a different keyword, artist name, or song title.</p>
                </div>`;
            return;
        }

        if (countEl) {
            countEl.textContent = `${songs.length} song${songs.length !== 1 ? 's' : ''}`;
        }

        const headerHtml = `
            <div class="song-list-header">
                <span class="song-list-header__num"><span class="col-label">#</span></span>
                <span class="song-list-header__art"></span>
                <span class="song-list-header__info"><span class="col-label">Title</span></span>
                <span class="song-list-header__album"><span class="col-label">Album</span></span>
                <span class="song-list-header__dur">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.5">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                </span>
            </div>`;

        const itemsHtml = songs.map((song, i) => buildSongItem(song, i)).join('');

        container.innerHTML = `<div class="song-list">${headerHtml}${itemsHtml}</div>`;
        container.classList.add('fade-in');

        // Bind click events
        container.querySelectorAll('.song-list-item').forEach((el, i) => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.song-options-btn')) return;
                window.playTrack?.(songs[i], songs, i);
                markActiveItem(container, songs[i].id);
            });
        });
    }

    function buildSongItem(song, index) {
        const art = escapeHtml(song.image || artFallback());
        const name = escapeHtml(song.name || 'Unknown');
        const artist = escapeHtml(song.artist || 'Unknown Artist');
        const album = escapeHtml(song.album || '');
        const dur = escapeHtml(song.durationFormatted || '--:--');
        const albumId = escapeHtml(song.albumId || '');
        const artistId = escapeHtml(song.artistId || '');

        return `
            <div class="song-list-item" data-song-id="${escapeHtml(song.id)}" data-album-id="${albumId}" data-artist-id="${artistId}" tabindex="0" role="button"
                 aria-label="Play ${name} by ${artist}">
                <span class="song-list-item__num">${index + 1}</span>
                <div class="song-list-item__art">
                    <img src="${art}" alt="${name}" loading="lazy" onerror="this.src=artFallback()">
                    <div class="song-list-item__art-overlay">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
                    </div>
                </div>
                <div class="song-list-item__info">
                    <div class="song-list-item__name">${name}</div>
                    <div class="song-list-item__artist">${artist}</div>
                </div>
                <div class="song-list-item__album">${album}</div>
                <div class="song-list-item__duration">${dur}</div>
            </div>`;
    }

    function markActiveItem(container, songId) {
        container.querySelectorAll('.song-list-item').forEach(el => {
            el.classList.toggle('is-active', el.dataset.songId === songId);
        });
    }

    // ─────────────────────────────────────────
    // State Helpers
    // ─────────────────────────────────────────
    function showPrompt(container, countEl) {
        if (countEl) countEl.textContent = '';
        if (container) container.innerHTML = `
            <div class="search-prompt">
                <svg class="search-prompt__icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <p class="search-prompt__title">Find your music</p>
                <p class="search-prompt__sub">Search for any song, artist, or album to start listening.</p>
            </div>`;
    }

    function showLoading(loadingEl, container, countEl) {
        if (countEl) countEl.textContent = '';
        if (container) container.innerHTML = '';
        if (loadingEl) loadingEl.style.display = 'flex';
    }

    function showError(container, loadingEl, countEl, errorMsg) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (countEl) countEl.textContent = '';
        const msg = errorMsg || 'Could not connect to music service. Please try again.';
        if (container) container.innerHTML = `
            <div class="search-prompt">
                <p class="search-prompt__title">Something went wrong</p>
                <p class="search-prompt__sub" style="color: var(--accent); font-weight: 500;">${escapeHtml(msg)}</p>
            </div>`;
    }

})();
