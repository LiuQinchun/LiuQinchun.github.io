(function () {
  'use strict';

  var modal = document.getElementById('qc-search-modal');
  var trigger = document.getElementById('qc-search-trigger');
  var input = document.getElementById('qc-search-input');
  var results = document.getElementById('qc-search-results');
  var empty = document.getElementById('qc-search-empty');
  var index = null;
  var flat = [];
  var cursor = 0;

  function load() {
    if (index) return Promise.resolve(index);
    return fetch('/search.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        index = data.posts || [];
        return index;
      })
      .catch(function () { index = []; return index; });
  }

  function open() {
    modal.hidden = false;
    document.body.classList.add('qc-no-scroll');
    load().then(function () { input.focus(); if (input.value) render(input.value); });
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('qc-no-scroll');
  }

  function root(url) {
    return url;
  }

  function match(q) {
    var s = q.trim().toLowerCase();
    if (!s) return [];
    var terms = s.split(/\s+/);
    return index.filter(function (it) {
      var hay = (it.title + ' ' + (it.tags || []).join(' ') + ' ' + (it.categories || []).join(' ') + ' ' + it.text).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) > -1; });
    }).slice(0, 8);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(q) {
    flat = match(q);
    if (!q.trim()) {
      results.innerHTML = '<div class="qc-modal-empty" id="qc-search-empty">输入关键词,按 Enter 打开第一条结果</div>';
      return;
    }
    if (!flat.length) {
      results.innerHTML = '<div class="qc-modal-empty">没有匹配 “' + esc(q) + '” 的文档</div>';
      return;
    }
    results.innerHTML = flat.map(function (it, i) {
      var tags = (it.tags || []).slice(0, 3).map(function (t) { return '<span class="qc-chip">' + esc(t) + '</span>'; }).join('');
      return '<a class="qc-result' + (i === 0 ? ' active' : '') + '" data-i="' + i + '" href="' + root(it.url) + '">' +
        '<span class="qc-result-title">' + esc(it.title) + '</span>' +
        '<span class="qc-result-meta">' + esc(it.date) + (tags ? ' ' + tags : '') + '</span>' +
        '</a>';
    }).join('');
    cursor = 0;
    Array.prototype.forEach.call(results.querySelectorAll('.qc-result'), function (el) {
      el.addEventListener('mousemove', function () { setCursor(Number(this.dataset.i)); });
    });
  }

  function setCursor(i) {
    cursor = i;
    Array.prototype.forEach.call(results.querySelectorAll('.qc-result'), function (el, j) {
      el.classList.toggle('active', j === i);
    });
  }

  trigger.addEventListener('click', open);
  modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-qc-close')) close();
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      modal.hidden ? open() : close();
      return;
    }
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (flat.length) setCursor(Math.min(cursor + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (flat.length) setCursor(Math.max(cursor - 1, 0)); }
    else if (e.key === 'Enter') {
      if (flat[cursor]) { e.preventDefault(); window.location.href = root(flat[cursor].url); }
    }
  });

  var timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { render(input.value); }, 120);
  });

  // Smooth scroll for same-page anchors (#domains / #workflow / #tools)
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href*="#"]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (href.charAt(0) !== '#') {
      var m = href.match(/^\/?#(.+)$/);
      if (!m) return;
    }
    var id = href.slice(href.indexOf('#') + 1);
    var el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Post TOC: scroll spy + custom track thumb (rAF loop + cached geometry)
  var toc = document.querySelector('.qc-toc');
  if (toc) {
    var nav = toc.querySelector('.qc-toc-nav');
    var track = toc.querySelector('.qc-toc-track');
    var thumb = toc.querySelector('.qc-toc-thumb');
    var links = Array.prototype.slice.call(toc.querySelectorAll('.qc-toc-link'));
    var expandButton = toc.querySelector('[data-toc-action="expand"]');
    var collapseButton = toc.querySelector('[data-toc-action="collapse"]');
    var minLevel = links.reduce(function (min, link) {
      return Math.min(min, Number(link.getAttribute('data-level')) || 6);
    }, 6);
    var heads = links.map(function (a) {
      return document.getElementById(a.getAttribute('href').slice(1));
    }).filter(Boolean);

    var winH = window.innerHeight;
    var docH = 1;
    var trackH = 0;
    var thumbH = 28;
    var headTops = [];
    var lastThumbTop = null;
    var lastThumbH = null;
    var currentIdx = -1;

    function setTocMode(mode) {
      var expanded = mode === 'expanded';
      links.forEach(function (link) {
        var level = Number(link.getAttribute('data-level')) || minLevel;
        link.hidden = !expanded && level !== minLevel;
      });
      if (expandButton) expandButton.setAttribute('aria-pressed', expanded ? 'true' : 'false');
      if (collapseButton) collapseButton.setAttribute('aria-pressed', expanded ? 'false' : 'true');
      currentIdx = -1;
      apply();
    }

    if (expandButton) expandButton.addEventListener('click', function () { setTocMode('expanded'); });
    if (collapseButton) collapseButton.addEventListener('click', function () { setTocMode('collapsed'); });
    setTocMode('expanded');

    function syncGeometry() {
      var sh = document.documentElement.scrollHeight;
      var wh = window.innerHeight;
      var th = track ? track.clientHeight : 0;
      if (sh === docH && wh === winH && th === trackH) return;
      docH = Math.max(1, sh);
      winH = wh;
      trackH = th;
      thumbH = Math.min(trackH || 28, Math.max(28, trackH * Math.min(1, winH / docH)));
      var y = window.pageYOffset;
      headTops = heads.map(function (h) {
        return h.getBoundingClientRect().top + y;
      });
    }

    function setThumb(topPx, hPx) {
      if (!thumb) return;
      var tStr = topPx.toFixed(1) + 'px';
      var hStr = hPx.toFixed(1) + 'px';
      if (tStr !== lastThumbTop) { thumb.style.top = tStr; lastThumbTop = tStr; }
      if (hStr !== lastThumbH) { thumb.style.height = hStr; lastThumbH = hStr; }
    }

    function setActive(idx) {
      if (!links.length) return;
      var visibleIdx = idx;
      while (visibleIdx > 0 && links[visibleIdx].hidden) visibleIdx -= 1;
      if (links[visibleIdx] && links[visibleIdx].hidden) visibleIdx = -1;
      if (visibleIdx === currentIdx || visibleIdx < 0) return;
      currentIdx = visibleIdx;
      links.forEach(function (a, j) { a.classList.toggle('active', j === visibleIdx); });
      var act = links[visibleIdx];
      if (act && nav) {
        var nr = nav.getBoundingClientRect();
        var ar = act.getBoundingClientRect();
        if (ar.top < nr.top + 24 || ar.bottom > nr.bottom - 24) {
          nav.scrollTop += ar.top - nr.top - nr.height / 2;
        }
      }
    }

    function apply() {
      syncGeometry();
      var max = Math.max(1, docH - winH);
      var y = window.pageYOffset;
      if (track && thumb && trackH > 0) {
        setThumb(Math.max(0, Math.min(1, y / max)) * (trackH - thumbH), thumbH);
      }
      if (headTops.length) {
        var pos = y + 110;
        var lo = 0;
        var hi = headTops.length - 1;
        var idx = 0;
        while (lo <= hi) {
          var mid = (lo + hi) >> 1;
          if (headTops[mid] <= pos) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
        }
        if (y >= docH - winH - 2) idx = headTops.length - 1;
        setActive(idx);
      }
    }

    function frame() {
      apply();
      window.requestAnimationFrame(frame);
    }

    // scroll events can be delayed while the tab renders rarely — poll as a fallback
    window.setInterval(apply, 50);
    window.addEventListener('scroll', function () { apply(); }, { passive: true });

    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        var el = document.getElementById(a.getAttribute('href').slice(1));
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        var top = el.getBoundingClientRect().top + window.pageYOffset - 96;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        if (history.replaceState) history.replaceState(null, '', a.getAttribute('href'));
      });
    });

    if (track && thumb) {
      var dragging = false;
      var dragRect = null;

      function progressFrom(clientY) {
        var span = Math.max(1, dragRect.height - thumbH);
        return Math.min(1, Math.max(0, (clientY - dragRect.top - thumbH / 2) / span));
      }

      thumb.addEventListener('pointerdown', function (e) {
        dragging = true;
        dragRect = track.getBoundingClientRect();
        thumb.classList.add('dragging');
        try { thumb.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or stale pointer */ }
        e.preventDefault();
      });
      thumb.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var p = progressFrom(e.clientY);
        setThumb(p * (trackH - thumbH), thumbH);
        window.scrollTo(0, p * Math.max(0, docH - winH));
      });
      function endDrag(e) {
        dragging = false;
        thumb.classList.remove('dragging');
        if (thumb.hasPointerCapture && thumb.hasPointerCapture(e.pointerId)) thumb.releasePointerCapture(e.pointerId);
      }
      thumb.addEventListener('pointerup', endDrag);
      thumb.addEventListener('pointercancel', endDrag);
      track.addEventListener('pointerdown', function (e) {
        if (e.target === thumb || dragging) return;
        dragRect = track.getBoundingClientRect();
        var p = progressFrom(e.clientY);
        setThumb(p * (trackH - thumbH), thumbH);
        window.scrollTo(0, p * Math.max(0, docH - winH));
      });
    }

    frame();
  }
})();
