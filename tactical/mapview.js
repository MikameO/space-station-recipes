/*
  SPDX-License-Identifier: GPL-3.0-only
  Copyright (C) 2026 MikameO
  This file is part of Space Station Recipes.
  See LICENSE for details.
*/
// Canvas view for the tactical map: one planet PNG where 1 pixel is 1 tile, pan,
// zoom to the cursor, and layers drawn on top in world coordinates.
//
// World units: tile (x, y) covers [x, x+1] × [y, y+1], +Y points up (north).
// PNG pixel (0, 0) is tile (minX, maxY).
(function (root) {
  'use strict';

  var DRAG_THRESHOLD_PX = 4;   // a hand that moves less than this while clicking still clicks
  var MIN_SCALE = 0.5;
  var MAX_SCALE = 64;

  function MapView(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = null;
    this.bounds = null;
    this.scale = 1;          // CSS px per tile
    this.ox = 0;             // CSS px of the bounds' left edge
    this.oy = 0;             // CSS px of the bounds' top edge
    this.layers = [];
    this.hoverFns = [];
    this.clickFns = [];
    this.viewFns = [];
    this.pending = false;
    this.hoverTile = null;
    this._bind();
  }

  MapView.prototype.setImage = function (img, bounds) {
    this.img = img;
    this.bounds = bounds;
    this.resize();
    this.fit();
  };

  MapView.prototype.cssSize = function () {
    return { w: this.canvas.clientWidth || 1, h: this.canvas.clientHeight || 1 };
  };

  MapView.prototype.resize = function () {
    var dpr = root.devicePixelRatio || 1;
    var s = this.cssSize();
    var w = Math.round(s.w * dpr), h = Math.round(s.h * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.requestDraw();
  };

  MapView.prototype.tilesWide = function () { return this.bounds.maxX - this.bounds.minX + 1; };
  MapView.prototype.tilesHigh = function () { return this.bounds.maxY - this.bounds.minY + 1; };

  MapView.prototype.fit = function () {
    if (!this.bounds) return;
    var s = this.cssSize();
    var scale = Math.min(s.w / this.tilesWide(), s.h / this.tilesHigh()) * 0.96;
    this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    this.ox = (s.w - this.tilesWide() * this.scale) / 2;
    this.oy = (s.h - this.tilesHigh() * this.scale) / 2;
    this._changed();
  };

  MapView.prototype.worldToScreen = function (wx, wy) {
    return [this.ox + (wx - this.bounds.minX) * this.scale,
            this.oy + (this.bounds.maxY + 1 - wy) * this.scale];
  };

  MapView.prototype.screenToWorld = function (sx, sy) {
    return [this.bounds.minX + (sx - this.ox) / this.scale,
            this.bounds.maxY + 1 - (sy - this.oy) / this.scale];
  };

  MapView.prototype.tileAtScreen = function (sx, sy) {
    if (!this.bounds) return null;
    var w = this.screenToWorld(sx, sy);
    var x = Math.floor(w[0]), y = Math.floor(w[1]);
    if (x < this.bounds.minX || x > this.bounds.maxX || y < this.bounds.minY || y > this.bounds.maxY) return null;
    return [x, y];
  };

  MapView.prototype.zoomAt = function (factor, sx, sy) {
    var next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
    if (next === this.scale) return;
    var w = this.screenToWorld(sx, sy);
    this.scale = next;
    this.ox = sx - (w[0] - this.bounds.minX) * next;
    this.oy = sy - (this.bounds.maxY + 1 - w[1]) * next;
    this._changed();
  };

  MapView.prototype.zoomBy = function (factor) {
    var s = this.cssSize();
    this.zoomAt(factor, s.w / 2, s.h / 2);
  };

  // Centre the view on a world point at a given scale (CSS px per tile).
  MapView.prototype.centerOn = function (wx, wy, scale) {
    var s = this.cssSize();
    if (scale) this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    this.ox = s.w / 2 - (wx - this.bounds.minX) * this.scale;
    this.oy = s.h / 2 - (this.bounds.maxY + 1 - wy) * this.scale;
    this._changed();
  };

  MapView.prototype.panBy = function (dx, dy) {
    this.ox += dx;
    this.oy += dy;
    this._changed();
  };

  MapView.prototype.addLayer = function (fn) { this.layers.push(fn); this.requestDraw(); };
  MapView.prototype.onHover = function (fn) { this.hoverFns.push(fn); };
  MapView.prototype.onClick = function (fn) { this.clickFns.push(fn); };
  MapView.prototype.onViewChange = function (fn) { this.viewFns.push(fn); };

  MapView.prototype._changed = function () {
    this.requestDraw();
    for (var i = 0; i < this.viewFns.length; i++) this.viewFns[i](this);
  };

  MapView.prototype.requestDraw = function () {
    if (this.pending) return;
    this.pending = true;
    var self = this;
    (root.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () {
      self.pending = false;
      self.draw();
    });
  };

  MapView.prototype.draw = function () {
    var ctx = this.ctx, dpr = root.devicePixelRatio || 1;
    var s = this.cssSize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);
    if (!this.img || !this.bounds) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.img, this.ox, this.oy, this.tilesWide() * this.scale, this.tilesHigh() * this.scale);
    for (var i = 0; i < this.layers.length; i++) {
      ctx.save();
      try { this.layers[i](ctx, this); } finally { ctx.restore(); }
    }
  };

  // Visible world rectangle, for culling layer work.
  MapView.prototype.visibleTiles = function () {
    var s = this.cssSize();
    var a = this.screenToWorld(0, 0), b = this.screenToWorld(s.w, s.h);
    return {
      minX: Math.max(this.bounds.minX, Math.floor(a[0])), maxX: Math.min(this.bounds.maxX, Math.ceil(b[0])),
      minY: Math.max(this.bounds.minY, Math.floor(b[1])), maxY: Math.min(this.bounds.maxY, Math.ceil(a[1]))
    };
  };

  MapView.prototype._local = function (e) {
    var r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  MapView.prototype._bind = function () {
    var self = this, c = this.canvas, drag = null;

    c.addEventListener('wheel', function (e) {
      if (!self.bounds) return;
      e.preventDefault();
      var p = self._local(e);
      self.zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, p[0], p[1]);
    }, { passive: false });

    c.addEventListener('pointerdown', function (e) {
      if (!self.bounds || e.button !== 0) return;
      var p = self._local(e);
      drag = { x: p[0], y: p[1], lastX: p[0], lastY: p[1], moved: false, id: e.pointerId };
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no capture */ }
    });

    c.addEventListener('pointermove', function (e) {
      if (!self.bounds) return;
      var p = self._local(e);
      if (drag && drag.id === e.pointerId) {
        if (!drag.moved && Math.hypot(p[0] - drag.x, p[1] - drag.y) >= DRAG_THRESHOLD_PX) drag.moved = true;
        if (drag.moved) {
          self.panBy(p[0] - drag.lastX, p[1] - drag.lastY);
          c.style.cursor = 'grabbing';
        }
        drag.lastX = p[0];
        drag.lastY = p[1];
        return;
      }
      var tile = self.tileAtScreen(p[0], p[1]);
      var same = tile && self.hoverTile && tile[0] === self.hoverTile[0] && tile[1] === self.hoverTile[1];
      if (!same && (tile || self.hoverTile)) {
        self.hoverTile = tile;
        for (var i = 0; i < self.hoverFns.length; i++) self.hoverFns[i](tile, e);
      }
    });

    function end(e) {
      if (!drag || drag.id !== e.pointerId) return;
      var wasDrag = drag.moved, p = self._local(e);
      drag = null;
      c.style.cursor = '';
      if (wasDrag || e.type === 'pointercancel') return;
      var tile = self.tileAtScreen(p[0], p[1]);
      if (!tile) return;
      for (var i = 0; i < self.clickFns.length; i++) self.clickFns[i](tile, e);
    }
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);

    c.addEventListener('pointerleave', function (e) {
      if (drag) return;
      if (self.hoverTile) {
        self.hoverTile = null;
        for (var i = 0; i < self.hoverFns.length; i++) self.hoverFns[i](null, e);
      }
    });

    if (root.ResizeObserver) new root.ResizeObserver(function () { self.resize(); }).observe(c);
    root.addEventListener('resize', function () { self.resize(); });   // observers can stall in hidden tabs
  };

  root.TacticalMapView = MapView;
})(typeof window !== 'undefined' ? window : this);
