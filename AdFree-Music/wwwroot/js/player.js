/**
 * AdFree Music — Audio Player Engine
 * Manages HTML5 audio, queue, controls, player bar, playlists, downloads, and option menus.
 * Includes Media Session API for lock-screen playback controls on Android and iOS.
 */

'use strict';

(function () {
    // ─────────────────────────────────────────
    // Audio Element + State
    // ─────────────────────────────────────────
    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    
    // Additional performance tuning
    audio.volume = 0.85; // default volume

    // Global state object
    window.UMusic = window.UMusic || {
        queue: [],
        currentIndex: 0,
        isPlaying: false
    };
    const state = window.UMusic;

    let isShuffle = false;
    let repeatMode = 0; // 0=off, 1=all, 2=one

    // ─────────────────────────────────────────
    // DOM Refs
    // ─────────────────────────────────────────
    let els = {};

    // ─────────────────────────────────────────
    // Init
    // ─────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        els = {
            playerBar:    document.getElementById('player-bar'),
            art:          document.getElementById('player-art-img'),
            artWrap:      document.getElementById('player-art'),
            songName:     document.getElementById('player-song-name'),
            artistName:   document.getElementById('player-artist-name'),
            playBtn:      document.getElementById('player-play-btn'),
            playIcon:     document.getElementById('player-play-icon'),
            prevBtn:      document.getElementById('player-prev-btn'),
            nextBtn:      document.getElementById('player-next-btn'),
            shuffleBtn:   document.getElementById('player-shuffle-btn'),
            repeatBtn:    document.getElementById('player-repeat-btn'),
            progressTrack:document.getElementById('progress-track'),
            progressFill: document.getElementById('progress-fill'),
            timeElapsed:  document.getElementById('player-time-elapsed'),
            timeDuration: document.getElementById('player-time-duration'),
            volumeTrack:  document.getElementById('volume-track'),
            volumeFill:   document.getElementById('volume-fill'),
            volumeBtn:    document.getElementById('player-volume-btn'),
            queueBtn:     document.getElementById('player-queue-btn'),
            queueDrawer:  document.getElementById('queue-drawer'),
            queueClose:   document.getElementById('queue-drawer-close'),
            clearQueueBtn:document.getElementById('btn-clear-queue-list'),
            nowPlayingQ:  document.getElementById('queue-now-playing-container'),
            nextQ:        document.getElementById('queue-next-container'),
            optionsMenu:  document.getElementById('song-options-menu'),
            playlistModal:document.getElementById('playlist-select-modal'),
            playlistClose:document.getElementById('playlist-select-close'),
            playlistList: document.getElementById('playlist-select-list')
        };

        loadVolumePreference();
        loadSettingsPreferences();
        bindEvents();
        initQueueDragAndDrop();

        // Dynamic option button injection observer
        const observer = new MutationObserver(() => {
            injectOptionButtons();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        injectOptionButtons();
    });

    // ─────────────────────────────────────────
    // Settings & Quality Preferences
    // ─────────────────────────────────────────
    function loadSettingsPreferences() {
        isShuffle = localStorage.getItem('umusic_shuffle') === 'true';
        els.shuffleBtn?.classList.toggle('is-active', isShuffle);

        repeatMode = parseInt(localStorage.getItem('umusic_repeat_mode') || '0', 10);
        if (els.repeatBtn) {
            els.repeatBtn.classList.toggle('is-active', repeatMode > 0);
            els.repeatBtn.dataset.repeat = repeatMode;
            const iconEl = els.repeatBtn.querySelector('svg');
            if (iconEl) iconEl.style.opacity = repeatMode === 0 ? '0.4' : '1';
        }
    }

    // ─────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────

    window.playTrack = function playTrack(song, queue, queueIndex) {
        if (queue && Array.isArray(queue)) {
            state.queue = queue;
            state.currentIndex = typeof queueIndex === 'number' ? queueIndex : 0;
        }

        if (!song.streamUrl) {
            console.warn('[UMusic] No stream URL for track:', song.name);
            return;
        }

        // Apply audio quality streaming preferences
        const quality = localStorage.getItem('umusic_audio_quality') || 'high';
        
        // Show loading spinner immediately
        showLoadingState(true);
        
        // Use preload="auto" + direct src assignment for fastest playback
        audio.preload = 'auto';
        audio.src = `${song.streamUrl}?quality=${quality}`;
        
        // Start playing as soon as possible (no extra load() needed)
        const playPromise = audio.play();
        if (playPromise) {
            playPromise.catch(err => {
                console.error('[UMusic] Playback error:', err);
                showLoadingState(false);
            });
        }

        state.isPlaying = true;
        updatePlayerBarUI(song);
        updateMediaSession(song);
        highlightActiveSong(song.id);
        renderQueueDrawer();

        // === NEW: Prefetch next track immediately (eliminates future delay) ===
        prefetchNextTrack();
    };

    // Prefetch next track's stream URL in background
    function prefetchNextTrack() {
        if (!state.queue.length) return;
        
        const nextIndex = (state.currentIndex + 1) % state.queue.length;
        const nextSong = state.queue[nextIndex];
        
        if (!nextSong || !nextSong.streamUrl) return;
        
        // Fire and forget prefetch
        const quality = localStorage.getItem('umusic_audio_quality') || 'high';
        fetch(`${nextSong.streamUrl}?quality=${quality}`, { 
            method: 'HEAD',
            cache: 'force-cache' 
        }).catch(() => {});
        
        // Also warm the yt-dlp cache on server for next song
        if (nextSong.artist && nextSong.name) {
            fetch('/api/warm-cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([{
                    artist: nextSong.artist,
                    title: nextSong.name,
                    quality: quality
                }])
            }).catch(() => {});
        }
    }

    window.setQueue = function setQueue(songs) {
        state.queue = songs;
        renderQueueDrawer();
    };

    // ─────────────────────────────────────────
    // Playback Controls
    // ─────────────────────────────────────────
    function togglePlay() {
        if (!audio.src) return;
        if (audio.paused) {
            audio.play().catch(err => console.error('[AdFreeMusic] Resume error:', err));
        } else {
            audio.pause();
        }
    }

    function playPrev() {
        if (state.queue.length === 0) return;
        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
        }
        state.currentIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
        playTrack(state.queue[state.currentIndex]);
    }

    function playNext() {
        if (state.queue.length === 0) return;
        if (isShuffle) {
            state.currentIndex = Math.floor(Math.random() * state.queue.length);
        } else {
            state.currentIndex = (state.currentIndex + 1) % state.queue.length;
        }
        playTrack(state.queue[state.currentIndex]);
    }

    function toggleShuffle() {
        isShuffle = !isShuffle;
        localStorage.setItem('umusic_shuffle', isShuffle.toString());
        els.shuffleBtn?.classList.toggle('is-active', isShuffle);
    }

    function toggleRepeat() {
        repeatMode = (repeatMode + 1) % 3;
        localStorage.setItem('umusic_repeat_mode', repeatMode.toString());
        if (els.repeatBtn) {
            els.repeatBtn.classList.toggle('is-active', repeatMode > 0);
            els.repeatBtn.dataset.repeat = repeatMode;
            const iconEl = els.repeatBtn.querySelector('svg');
            if (iconEl) iconEl.style.opacity = repeatMode === 0 ? '0.4' : '1';
        }
    }

    // ─────────────────────────────────────────
    // Volume Management
    // ─────────────────────────────────────────
    let isMuted = false;
    let savedVolume = 0.8;

    function loadVolumePreference() {
        const stored = localStorage.getItem('umusic:volume');
        savedVolume = stored !== null ? parseFloat(stored) : 0.8;
        audio.volume = savedVolume;
        updateVolumeFill(savedVolume);
    }

    function setVolume(v) {
        v = Math.max(0, Math.min(1, v));
        audio.volume = v;
        savedVolume = v;
        isMuted = v === 0;
        localStorage.setItem('umusic:volume', v.toString());
        updateVolumeFill(v);
        updateVolumeIcon(v);
    }

    function toggleMute() {
        if (isMuted) {
            setVolume(savedVolume || 0.8);
        } else {
            savedVolume = audio.volume;
            setVolume(0);
        }
        isMuted = !isMuted;
    }

    function updateVolumeFill(v) {
        if (els.volumeFill) els.volumeFill.style.width = `${Math.round(v * 100)}%`;
    }

    function updateVolumeIcon(v) {
        if (!els.volumeBtn) return;
        const path = els.volumeBtn.querySelector('path');
        if (!path) return;
        if (v === 0) {
            path.setAttribute('d', 'M9 9L5 5m0 14l4-4M5 12h3M15 9a6 6 0 010 6M18 6a9 9 0 010 12');
        } else if (v < 0.5) {
            path.setAttribute('d', 'M15 9a6 6 0 010 6M5 12h8m-8 0a7 7 0 007 7V5a7 7 0 00-7 7z');
        } else {
            path.setAttribute('d', 'M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14');
        }
    }

    // ─────────────────────────────────────────
    // Seek Progress
    // ─────────────────────────────────────────
    function seekTo(clientX) {
        if (!els.progressTrack || !audio.duration) return;
        const rect = els.progressTrack.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        audio.currentTime = ratio * audio.duration;
    }

    function seekVolume(clientX) {
        if (!els.volumeTrack) return;
        const rect = els.volumeTrack.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        setVolume(ratio);
    }

    // ─────────────────────────────────────────
    // Audio Events
    // ─────────────────────────────────────────
    audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        
        // Custom Crossfade implementation
        const crossfadeSeconds = parseInt(localStorage.getItem('umusic_crossfade') || '0', 10);
        if (crossfadeSeconds > 0 && (audio.duration - audio.currentTime <= crossfadeSeconds)) {
            const ratio = (audio.duration - audio.currentTime) / crossfadeSeconds;
            audio.volume = Math.max(0, savedVolume * ratio);
        } else {
            audio.volume = savedVolume;
        }

        const ratio = audio.currentTime / audio.duration;
        if (els.progressFill) els.progressFill.style.width = `${ratio * 100}%`;
        if (els.timeElapsed) els.timeElapsed.textContent = formatDuration(audio.currentTime);
    });

    audio.addEventListener('durationchange', () => {
        if (els.timeDuration) els.timeDuration.textContent = formatDuration(audio.duration);
    });

    audio.addEventListener('play', () => {
        state.isPlaying = true;
        // Don't update icon if we are still buffering
        if (audio.readyState >= 3) {
            updatePlayButton(true);
        }
    });

    audio.addEventListener('pause', () => {
        state.isPlaying = false;
        updatePlayButton(false);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
    });

    audio.addEventListener('waiting', () => {
        showLoadingState(true);
    });

    audio.addEventListener('playing', () => {
        showLoadingState(false);
        updatePlayButton(true);
    });

    audio.addEventListener('canplay', () => {
        showLoadingState(false);
        if (state.isPlaying) updatePlayButton(true);
    });

    // Extra: start playing as soon as we have enough data
    audio.addEventListener('canplaythrough', () => {
        if (state.isPlaying && audio.paused) {
            audio.play().catch(() => {});
        }
    });

    audio.addEventListener('ended', () => {
        audio.volume = savedVolume;
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'none';
        }
        if (repeatMode === 2) {
            audio.currentTime = 0;
            audio.play();
        } else if (state.queue.length > 0) {
            playNext();
        } else {
            state.isPlaying = false;
            updatePlayButton(false);
        }
    });

    // ─────────────────────────────────────────
    // UI Helpers
    // ─────────────────────────────────────────
    function updatePlayerBarUI(song) {
        if (!song) return;
        if (els.art) {
            els.art.src = song.image || artFallback();
            els.art.style.display = 'block';
            els.art.onerror = () => { els.art.src = artFallback(); };
        }
        if (els.artWrap) els.artWrap.classList.remove('no-track');
        if (els.songName) {
            els.songName.textContent = song.name || 'Unknown';
            els.songName.classList.remove('empty');
        }
        if (els.artistName) els.artistName.textContent = song.artist || '';
        if (els.timeDuration) els.timeDuration.textContent = formatDuration(song.duration || 0);
        if (els.progressFill) els.progressFill.style.width = '0%';
        if (els.timeElapsed) els.timeElapsed.textContent = '0:00';

        document.title = `${song.name} — AdFree Music`;
    }

    function updatePlayButton(playing) {
        if (!els.playIcon) return;
        els.playIcon.innerHTML = playing
            ? `<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`
            : `<polygon points="5,3 19,12 5,21"/>`;
        els.playIcon.classList.remove('spin-anim');
    }

    function showLoadingState(isLoading) {
        if (!els.playIcon) return;
        if (isLoading) {
            // Show a spinner SVG instead of play/pause
            els.playIcon.innerHTML = `<path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>`;
            els.playIcon.classList.add('spin-anim');
        } else {
            els.playIcon.classList.remove('spin-anim');
            updatePlayButton(state.isPlaying);
        }
    }

    function highlightActiveSong(songId) {
        document.querySelectorAll('[data-song-id]').forEach(el => {
            el.classList.toggle('is-active', el.dataset.songId === songId);
        });
    }

    // ─────────────────────────────────────────
    // Media Session API (Lock-Screen Controls)
    // ─────────────────────────────────────────
    function updateMediaSession(song) {
        if (!('mediaSession' in navigator)) return;

        // Build artwork array — provide multiple sizes for OS to pick
        const artSrc = song.image || '';
        const artwork = artSrc
            ? [
                { src: artSrc, sizes: '96x96',   type: 'image/jpeg' },
                { src: artSrc, sizes: '128x128',  type: 'image/jpeg' },
                { src: artSrc, sizes: '192x192',  type: 'image/jpeg' },
                { src: artSrc, sizes: '256x256',  type: 'image/jpeg' },
                { src: artSrc, sizes: '512x512',  type: 'image/jpeg' }
              ]
            : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }];

        navigator.mediaSession.metadata = new MediaMetadata({
            title:  song.name   || 'Unknown Track',
            artist: song.artist || 'Unknown Artist',
            album:  song.album  || 'AdFree Music',
            artwork
        });

        navigator.mediaSession.playbackState = 'playing';

        // Action handlers — guard each with try/catch for Safari partial support
        const safeHandler = (action, handler) => {
            try { navigator.mediaSession.setActionHandler(action, handler); }
            catch { /* browser doesn't support this action */ }
        };

        safeHandler('play',  () => { audio.play(); });
        safeHandler('pause', () => { audio.pause(); });

        safeHandler('previoustrack', () => { playPrev(); });
        safeHandler('nexttrack',     () => { playNext(); });

        // Seek support (Chrome Android, desktop Chrome)
        safeHandler('seekto', details => {
            if (details.seekTime !== undefined && audio.duration) {
                audio.currentTime = details.seekTime;
                navigator.mediaSession.setPositionState({
                    duration:     audio.duration,
                    playbackRate: audio.playbackRate,
                    position:     audio.currentTime
                });
            }
        });

        // Expose position state when duration is known
        audio.addEventListener('durationchange', () => {
            if (!('mediaSession' in navigator) || !audio.duration) return;
            try {
                navigator.mediaSession.setPositionState({
                    duration:     audio.duration,
                    playbackRate: audio.playbackRate,
                    position:     Math.min(audio.currentTime, audio.duration)
                });
            } catch { /* not supported */ }
        }, { once: true });
    }

    // ─────────────────────────────────────────
    // Dynamic option button ⋮ injection
    // ─────────────────────────────────────────
    function injectOptionButtons() {
        const selectors = '.song-list-item, .trending-item, .album-card, .carousel__slide';
        document.querySelectorAll(selectors).forEach(el => {
            if (el.querySelector('.song-options-btn')) return;

            const songId = el.dataset.songId;
            if (!songId) return;

            const btn = document.createElement('button');
            btn.className = 'song-options-btn';
            btn.innerHTML = '⋮';
            btn.title = 'Options';
            btn.setAttribute('aria-label', 'Options');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openOptionsMenu(e, songId, el);
            });

            if (el.classList.contains('song-list-item')) {
                const durEl = el.querySelector('.song-list-item__duration');
                if (durEl) durEl.appendChild(btn);
            } else if (el.classList.contains('trending-item')) {
                el.appendChild(btn);
            } else if (el.classList.contains('album-card')) {
                el.querySelector('.album-card__meta')?.appendChild(btn);
            } else if (el.classList.contains('carousel__slide')) {
                el.querySelector('.carousel__actions')?.appendChild(btn);
            }
        });
    }

    // ─────────────────────────────────────────
    // Three-dot Options Menu Actions
    // ─────────────────────────────────────────
    let activeSongMetadata = null;

    function openOptionsMenu(e, songId, el) {
        activeSongMetadata = scrapeSongMetadata(el, songId);
        
        const menu = els.optionsMenu;
        if (!menu) return;

        menu.style.display = 'block';
        
        const rect = e.currentTarget.getBoundingClientRect();
        let top = rect.bottom;
        let left = rect.left - 160;

        // Prevent overflow
        if (left < 10) left = 10;
        if (top + 320 > window.innerHeight) {
            top = rect.top - 320;
        }

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;

        // Update download action label
        const dlBtn = menu.querySelector('[data-action="download"]');
        if (dlBtn) {
            const downloads = JSON.parse(localStorage.getItem('umusic_downloaded_metadata') || '[]');
            const isDownloaded = downloads.some(s => s.id === songId);
            dlBtn.textContent = isDownloaded ? 'Remove Download' : 'Download Offline';
        }

        // Close menu on outer click
        const closeMenu = (event) => {
            if (!menu.contains(event.target) && event.target !== e.target) {
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 50);
    }

    function scrapeSongMetadata(el, songId) {
        let name = '';
        let artist = '';
        let album = '';
        let image = '';
        let durationFormatted = '';

        // Robust scraping with multiple fallbacks
        if (el.classList.contains('song-list-item')) {
            name = el.querySelector('.song-list-item__name')?.textContent?.trim() || '';
            artist = el.querySelector('.song-list-item__artist')?.textContent?.trim() || '';
            album = el.querySelector('.song-list-item__album')?.textContent?.trim() || '';
            image = el.querySelector('.song-list-item__art img')?.src || '';
            durationFormatted = el.querySelector('.song-list-item__duration span')?.textContent || 
                                el.querySelector('.song-list-item__duration')?.textContent || '';
        } else if (el.classList.contains('trending-item')) {
            name = el.querySelector('.trending-item__name')?.textContent?.trim() || '';
            artist = el.querySelector('.trending-item__artist')?.textContent?.trim() || '';
            image = el.querySelector('.trending-item__art img')?.src || '';
            durationFormatted = el.querySelector('.trending-item__dur')?.textContent || '';
        } else if (el.classList.contains('album-card')) {
            name = el.querySelector('.album-card__title')?.textContent?.trim() || '';
            artist = el.querySelector('.album-card__artist')?.textContent?.trim() || '';
            image = el.querySelector('.album-card__art img')?.src || '';
        } else if (el.classList.contains('carousel__slide')) {
            name = el.querySelector('.carousel__title')?.textContent?.trim() || '';
            artist = el.querySelector('.carousel__artist-album')?.textContent?.trim() || '';
            image = el.querySelector('.carousel__poster-art img')?.src || '';
        }

        // Fallbacks if still empty
        if (!name) name = el.dataset.songName || 'Unknown Track';
        if (!artist) artist = el.dataset.artistName || '';

        durationFormatted = durationFormatted.replace('⋮', '').trim();

        const albumId = el.dataset.albumId || '';
        const artistId = el.dataset.artistId || '';

        return {
            id: songId,
            name: name.trim(),
            artist: artist.trim(),
            album: album.trim(),
            image: image,
            streamUrl: `/api/stream/${songId}`,
            durationFormatted: durationFormatted,
            albumId: albumId,
            artistId: artistId
        };
    }

    // Bind Menu Clicks - Production Ready
    document.getElementById('song-options-menu')?.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn || !activeSongMetadata) return;

        const action = actionBtn.dataset.action;
        const menu = els.optionsMenu;
        if (menu) menu.style.display = 'none';

        try {
            if (action === 'play') {
                window.playTrack(activeSongMetadata, [activeSongMetadata], 0);
                
            } else if (action === 'playnext') {
                if (!state.queue || state.queue.length === 0) {
                    window.playTrack(activeSongMetadata, [activeSongMetadata], 0);
                } else {
                    const insertIndex = Math.min(state.currentIndex + 1, state.queue.length);
                    state.queue.splice(insertIndex, 0, activeSongMetadata);
                    renderQueueDrawer();
                    showToastNotification('Added to play next');
                }
                
            } else if (action === 'addqueue') {
                if (!state.queue || state.queue.length === 0) {
                    window.playTrack(activeSongMetadata, [activeSongMetadata], 0);
                } else {
                    state.queue.push(activeSongMetadata);
                    renderQueueDrawer();
                    showToastNotification('Added to queue');
                }
                
            } else if (action === 'playlist') {
                showPlaylistSelector(activeSongMetadata);
                
            } else if (action === 'download') {
                await handleOfflineDownload(activeSongMetadata);
                
            } else if (action === 'album') {
                if (activeSongMetadata.albumId) {
                    window.location.href = '/Album/' + activeSongMetadata.albumId;
                } else {
                    window.location.href = '/Search?q=' + encodeURIComponent(activeSongMetadata.album || activeSongMetadata.name);
                }
                
            } else if (action === 'artist') {
                window.location.href = '/Search?q=' + encodeURIComponent(activeSongMetadata.artist);
                
            } else if (action === 'share') {
                const shareUrl = `${window.location.origin}/Search?q=${encodeURIComponent(activeSongMetadata.name + ' ' + activeSongMetadata.artist)}`;
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    showToastNotification('Link copied to clipboard');
                } catch {
                    // Fallback
                    prompt('Copy this link:', shareUrl);
                }
                
            } else if (action === 'info') {
                showToastNotification(`${activeSongMetadata.name} — ${activeSongMetadata.artist}`);
                setTimeout(() => {
                    alert(`Song Information:\n\nTitle: ${activeSongMetadata.name}\nArtist: ${activeSongMetadata.artist}\nAlbum: ${activeSongMetadata.album || 'Single'}`);
                }, 300);
            }
        } catch (err) {
            console.error('[Menu Action Error]', err);
            showToastNotification('Action failed. Please try again.');
        }
    });

    // Simple toast notification helper (production friendly)
    function showToastNotification(message) {
        let toast = document.getElementById('umusic-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'umusic-toast';
            toast.style.cssText = `
                position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
                background: rgba(30,30,30,0.95); color: white; padding: 12px 20px;
                border-radius: 9999px; font-size: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                z-index: 999999; display: none; white-space: nowrap;
            `;
            document.body.appendChild(toast);
        }
        
        toast.textContent = message;
        toast.style.display = 'block';
        
        setTimeout(() => {
            if (toast) toast.style.display = 'none';
        }, 2400);
    }

    // ─────────────────────────────────────────
    // Offline Download Logic (IndexedDB/Cache API)
    // ─────────────────────────────────────────
    async function handleOfflineDownload(song) {
        let downloads = JSON.parse(localStorage.getItem('umusic_downloaded_metadata') || '[]');
        const isDownloaded = downloads.some(s => s.id === song.id);

        if (isDownloaded) {
            if ('caches' in window) {
                const cache = await caches.open('umusic-downloads');
                await cache.delete(song.streamUrl);
            }
            downloads = downloads.filter(s => s.id !== song.id);
            localStorage.setItem('umusic_downloaded_metadata', JSON.stringify(downloads));
            alert('Offline download removed.');
            highlightActiveSong(song.id); // updates UI offline status
        } else {
            // Dynamic progress toast injection
            let dlToast = document.getElementById('download-progress-toast');
            if (!dlToast) {
                dlToast = document.createElement('div');
                dlToast.id = 'download-progress-toast';
                dlToast.style.cssText = 'position:fixed; bottom:100px; right:20px; background:rgba(20,20,20,0.95); backdrop-filter:blur(12px); border:1px solid var(--accent); padding:16px; border-radius:var(--radius-md); display:none; z-index:99999; width:280px; box-shadow:0 12px 36px rgba(0,0,0,0.6);';
                dlToast.innerHTML = `
                    <div style="font-weight:600; font-size:0.85rem; margin-bottom:8px; color:#fff;" id="dl-toast-title">Downloading track...</div>
                    <div style="height:6px; background:rgba(255,255,255,0.12); border-radius:3px; overflow:hidden; margin-bottom:6px;">
                        <div id="dl-toast-bar" style="width:0%; height:100%; background:var(--accent); transition:width 0.1s ease;"></div>
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); text-align:right;" id="dl-toast-percent">0%</div>
                `;
                document.body.appendChild(dlToast);
            }

            document.getElementById('dl-toast-title').textContent = `Downloading ${song.name}...`;
            document.getElementById('dl-toast-bar').style.width = '0%';
            document.getElementById('dl-toast-percent').textContent = '0%';
            dlToast.style.display = 'block';

            try {
                const quality = localStorage.getItem('umusic_download_quality') || 'high';
                const dlUrl = `${song.streamUrl}?quality=${quality}`;
                
                const response = await fetch(dlUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const reader = response.body.getReader();
                const contentLength = +response.headers.get('Content-Length') || 0;
                
                let receivedLength = 0;
                const chunks = [];
                
                while(true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    receivedLength += value.length;
                    
                    if (contentLength > 0) {
                        const percent = Math.round((receivedLength / contentLength) * 100);
                        document.getElementById('dl-toast-bar').style.width = `${percent}%`;
                        document.getElementById('dl-toast-percent').textContent = `${percent}%`;
                    }
                }

                // Assemble chunks
                const chunksAll = new Uint8Array(receivedLength);
                let position = 0;
                for(let chunk of chunks) {
                    chunksAll.set(chunk, position);
                    position += chunk.length;
                }

                const blob = new Blob([chunksAll], { type: 'audio/mpeg' });
                const responseToCache = new Response(blob, {
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'Content-Length': receivedLength.toString(),
                        'Accept-Ranges': 'bytes'
                    }
                });

                if ('caches' in window) {
                    const cache = await caches.open('umusic-downloads');
                    await cache.put(song.streamUrl, responseToCache);
                    
                    downloads.push(song);
                    localStorage.setItem('umusic_downloaded_metadata', JSON.stringify(downloads));
                }

                dlToast.style.display = 'none';
                alert('Song downloaded successfully for offline listening!');
                highlightActiveSong(song.id);
            } catch(e) {
                console.error('[UMusic] Download failed:', e);
                dlToast.style.display = 'none';
                alert('Download failed. Please check network connection.');
            }
        }
    }

    // ─────────────────────────────────────────
    // Playlist Selection Modal
    // ─────────────────────────────────────────
    function showPlaylistSelector(song) {
        const modal = els.playlistModal;
        const list = els.playlistList;
        if (!modal || !list) return;

        let playlists = [];
        try {
            playlists = JSON.parse(localStorage.getItem('umusic_playlists') || '[]');
        } catch(e) {
            playlists = [];
        }

        if (playlists.length === 0) {
            list.innerHTML = `<p style="font-size:0.8rem; color:var(--text-muted); text-align:center;">No playlists found. Create one first on the Playlists page.</p>`;
        } else {
            list.innerHTML = playlists.map(pl => `
                <button class="settings-btn" data-playlist-id="${pl.id}" style="text-align:left; width:100%;">${escapeHtml(pl.name)}</button>
            `).join('');

            list.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const plId = btn.dataset.playlistId;
                    const playlist = playlists.find(p => p.id === plId);
                    if (playlist) {
                        if (playlist.songs.some(s => s.id === song.id)) {
                            alert('This song is already in the playlist.');
                        } else {
                            playlist.songs.push(song);
                            localStorage.setItem('umusic_playlists', JSON.stringify(playlists));
                            alert(`Added to playlist: ${playlist.name}`);
                        }
                    }
                    modal.style.display = 'none';
                });
            });
        }

        modal.style.display = 'block';
    }

    // Close playlist modal
    document.getElementById('playlist-select-close')?.addEventListener('click', () => {
        if (els.playlistModal) els.playlistModal.style.display = 'none';
    });

    // ─────────────────────────────────────────
    // Queue Drawer Render & Drag and Drop
    // ─────────────────────────────────────────
    function renderQueueDrawer() {
        const npContainer = els.nowPlayingQ;
        const nextContainer = els.nextQ;
        if (!npContainer || !nextContainer) return;

        // Render Now Playing
        if (state.queue.length === 0 || state.currentIndex >= state.queue.length || state.currentIndex < 0) {
            npContainer.innerHTML = `<p style="font-size:0.8rem; color:var(--text-muted);">Nothing playing</p>`;
            nextContainer.innerHTML = '';
            return;
        }

        const activeSong = state.queue[state.currentIndex];
        npContainer.innerHTML = `
            <div class="queue-item" style="cursor:default; border-color: var(--accent);">
                <div class="queue-item__art">
                    <img src="${activeSong.image || artFallback()}" onerror="this.src=artFallback()"/>
                </div>
                <div class="queue-item__info">
                    <div class="queue-item__name">${activeSong.name}</div>
                    <div class="queue-item__artist">${activeSong.artist}</div>
                </div>
            </div>`;

        // Render Next Up
        const nextSongs = state.queue.slice(state.currentIndex + 1);
        if (nextSongs.length === 0) {
            nextContainer.innerHTML = `<p style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:12px;">Queue is empty</p>`;
            return;
        }

        nextContainer.innerHTML = nextSongs.map((song, i) => `
            <div class="queue-item draggable-q" draggable="true" data-index="${state.currentIndex + 1 + i}">
                <div class="queue-item__art">
                    <img src="${song.image || artFallback()}" onerror="this.src=artFallback()"/>
                </div>
                <div class="queue-item__info">
                    <div class="queue-item__name">${song.name}</div>
                    <div class="queue-item__artist">${song.artist}</div>
                </div>
                <button class="queue-item__remove" data-index="${state.currentIndex + 1 + i}" title="Remove track">×</button>
            </div>
        `).join('');

        // Bind queue remove button clicks
        nextContainer.querySelectorAll('.queue-item__remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index, 10);
                state.queue.splice(idx, 1);
                renderQueueDrawer();
            });
        });

        // Bind click to play immediately
        nextContainer.querySelectorAll('.queue-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.queue-item__remove')) return;
                const idx = parseInt(item.dataset.index, 10);
                window.playTrack(state.queue[idx], state.queue, idx);
            });
        });
    }

    // HTML5 Drag & Drop queue reordering
    function initQueueDragAndDrop() {
        const nextContainer = document.getElementById('queue-next-container');
        if (!nextContainer) return;

        let dragElIndex = null;

        nextContainer.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.draggable-q');
            if (item) {
                dragElIndex = parseInt(item.dataset.index, 10);
                item.classList.add('dragging');
            }
        });

        nextContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingEl = nextContainer.querySelector('.dragging');
            const siblings = [...nextContainer.querySelectorAll('.draggable-q:not(.dragging)')];
            
            const nextSibling = siblings.find(sibling => {
                const box = sibling.getBoundingClientRect();
                return e.clientY <= box.top + box.height / 2;
            });

            if (nextSibling) {
                nextContainer.insertBefore(draggingEl, nextSibling);
            } else {
                nextContainer.appendChild(draggingEl);
            }
        });

        nextContainer.addEventListener('dragend', () => {
            const draggingEl = nextContainer.querySelector('.dragging');
            if (draggingEl) draggingEl.classList.remove('dragging');

            // Reconstruct state queue based on new DOM order
            const newOrder = [...nextContainer.querySelectorAll('.draggable-q')].map(el => parseInt(el.dataset.index, 10));
            
            if (newOrder.length > 0 && dragElIndex !== null) {
                const nextQueuePart = state.queue.slice(state.currentIndex + 1);
                const reorderedPart = newOrder.map(oldIdx => state.queue[oldIdx]);
                
                // Reconstruct full queue
                state.queue = state.queue.slice(0, state.currentIndex + 1).concat(reorderedPart);
                renderQueueDrawer();
            }
            dragElIndex = null;
        });
    }

    // ─────────────────────────────────────────
    // Bind General DOM Events
    // ─────────────────────────────────────────
    function bindEvents() {
        els.playBtn?.addEventListener('click', togglePlay);
        els.prevBtn?.addEventListener('click', playPrev);
        els.nextBtn?.addEventListener('click', playNext);
        els.shuffleBtn?.addEventListener('click', toggleShuffle);
        els.repeatBtn?.addEventListener('click', toggleRepeat);
        els.volumeBtn?.addEventListener('click', toggleMute);

        // Queue Drawer Toggle
        els.queueBtn?.addEventListener('click', () => {
            const isVisible = els.queueDrawer.style.display === 'block' || els.queueDrawer.style.display === 'flex';
            els.queueDrawer.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible) renderQueueDrawer();
        });

        els.queueClose?.addEventListener('click', () => {
            els.queueDrawer.style.display = 'none';
        });

        els.clearQueueBtn?.addEventListener('click', () => {
            if (confirm('Clear the entire playback queue?')) {
                state.queue = [];
                state.currentIndex = 0;
                audio.src = '';
                state.isPlaying = false;
                updatePlayButton(false);
                if (els.songName) els.songName.textContent = 'Nothing playing';
                if (els.artistName) els.artistName.textContent = '';
                if (els.art) els.art.style.display = 'none';
                if (els.artWrap) els.artWrap.classList.add('no-track');
                renderQueueDrawer();
            }
        });

        // Seek triggers
        let seekingProgress = false;
        els.progressTrack?.addEventListener('mousedown', e => {
            seekingProgress = true;
            seekTo(e.clientX);
        });
        document.addEventListener('mousemove', e => {
            if (seekingProgress) seekTo(e.clientX);
        });
        document.addEventListener('mouseup', () => { seekingProgress = false; });

        els.progressTrack?.addEventListener('touchstart', e => {
            seekTo(e.touches[0].clientX);
        }, { passive: true });
        els.progressTrack?.addEventListener('touchmove', e => {
            seekTo(e.touches[0].clientX);
        }, { passive: true });

        // Volume triggers
        let seekingVolume = false;
        els.volumeTrack?.addEventListener('mousedown', e => {
            seekingVolume = true;
            seekVolume(e.clientX);
        });
        document.addEventListener('mousemove', e => {
            if (seekingVolume) seekVolume(e.clientX);
        });
        document.addEventListener('mouseup', () => { seekingVolume = false; });

        // Keyboard navigation
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowRight':
                    if (e.shiftKey) { playNext(); }
                    else { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); }
                    break;
                case 'ArrowLeft':
                    if (e.shiftKey) { playPrev(); }
                    else { audio.currentTime = Math.max(0, audio.currentTime - 10); }
                    break;
                case 'KeyQ':
                    els.queueBtn?.click();
                    break;
            }
        });
    }

    // ─────────────────────────────────────────
    // Full-Screen Player Expansion
    // ─────────────────────────────────────────
    const playerBar = document.getElementById('player-bar');
    const playerTrackContainer = document.querySelector('.player-bar__track');
    let playerCloseBtn = document.querySelector('.player-bar__close-btn');

    // Create close button if it doesn't exist (e.g. cached HTML)
    if (playerBar && !playerCloseBtn) {
        playerCloseBtn = document.createElement('button');
        playerCloseBtn.className = 'player-bar__close-btn';
        playerCloseBtn.setAttribute('aria-label', 'Close full player');
        playerCloseBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
        playerBar.insertBefore(playerCloseBtn, playerBar.firstChild);
    }

    if (playerTrackContainer && playerBar) {
        playerTrackContainer.addEventListener('click', () => {
            // Only expand if there's actually a song playing (currentIndex >= 0)
            if (!playerBar.classList.contains('is-expanded') && state.currentIndex >= 0) {
                playerBar.classList.add('is-expanded');
                document.body.style.overflow = 'hidden'; // Prevent background scrolling
            }
        });
    }

    if (playerCloseBtn && playerBar) {
        playerCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playerBar.classList.remove('is-expanded');
            document.body.style.overflow = ''; // Restore scrolling
        });
    }

})();
