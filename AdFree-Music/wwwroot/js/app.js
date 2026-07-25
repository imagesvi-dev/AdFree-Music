/**
 * U-Music — Global Application Utilities
 * Initializes global state, utilities, and wires up sidebar + mobile nav.
 */

'use strict';

// ─────────────────────────────────────────
// Global App State (shared with player.js)
// ─────────────────────────────────────────
window.UMusic = window.UMusic || {
    queue: [],          // Array of song objects
    currentIndex: -1,   // Index in queue
    isPlaying: false,
};

// ─────────────────────────────────────────
// DOM Ready
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    initMobileNav();
    highlightActiveNav();
});

// ─────────────────────────────────────────
// Sidebar toggle (mobile)
// ─────────────────────────────────────────
function initSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');
    const openBtn = document.getElementById('sidebar-open-btn');

    if (!sidebar || !overlay) return;

    overlay.addEventListener('click', closeSidebar);

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            sidebar.classList.toggle('is-open');
            overlay.classList.toggle('is-visible');
        });
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar?.classList.remove('is-open');
    overlay?.classList.remove('is-visible');
}

// ─────────────────────────────────────────
// Mobile bottom nav
// ─────────────────────────────────────────
function initMobileNav() {
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn[data-href]');
    mobileNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = btn.dataset.href;
        });
    });
}

// ─────────────────────────────────────────
// Highlight active sidebar nav item
// ─────────────────────────────────────────
function highlightActiveNav() {
    const path = window.location.pathname.toLowerCase();
    document.querySelectorAll('.nav-item[data-path]').forEach(item => {
        const itemPath = item.dataset.path.toLowerCase();
        if (
            (itemPath === '/' && path === '/') ||
            (itemPath !== '/' && path.startsWith(itemPath))
        ) {
            item.classList.add('is-active');
        }
    });
}

// ─────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────

/**
 * Debounce a function call.
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
window.debounce = function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
};

/**
 * Format seconds into m:ss
 * @param {number} secs
 * @returns {string}
 */
window.formatDuration = function formatDuration(secs) {
    if (!secs || secs <= 0) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Escape HTML to prevent XSS in dynamic content.
 * @param {string} str
 * @returns {string}
 */
window.escapeHtml = function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

/**
 * Get a fallback image URL for missing album art.
 * @returns {string}
 */
window.artFallback = function artFallback() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%231e1e1e' width='100' height='100'/%3E%3Ccircle cx='50' cy='50' r='20' fill='%23333'/%3E%3Ccircle cx='50' cy='50' r='8' fill='%231e1e1e'/%3E%3C/svg%3E";
};
