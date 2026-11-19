/*
 * Coletor de sinais do laboratório.
 *
 * Duas partes:
 *  1. Ambiente (fingerprint): webdriver, UA, client hints, tela, fuso, idioma,
 *     WebGL, permissões, plugins, artefato de CDP.
 *  2. Comportamento: timing de teclas, mouse, cliques, foco e input.
 *
 * Privacidade: nenhuma tecla ou valor de campo é gravado. Para digitação só
 * ficam o campo, o instante do keydown e o tempo de pressão (dwell), calculados
 * aqui mesmo no cliente.
 */
(function () {
  "use strict";

  var T0 = performance.now();
  var MAX_MOUSE = 3000;
  var params = new URLSearchParams(location.search);

  function now() {
    return Math.round((performance.now() - T0) * 10) / 10;
  }

  function fieldOf(target) {
    if (!target || !target.getAttribute) return null;
    return target.getAttribute("name") || target.id || target.tagName.toLowerCase();
  }

  var beh = {
    mouse: [], // [t, x, y]
    clicks: [], // {t, x, y, field, dx, dy, w, h, trusted}
    keys: [], // {t, field, dwell, trusted}
    inputs: [], // {t, field, type, trusted}
    focus: [], // [t, field]
    scrolls: 0,
    pastes: 0,
    untrusted: 0,
    firstInteraction: null,
  };

  function mark(e) {
    if (!e.isTrusted) beh.untrusted++;
    if (beh.firstInteraction === null) beh.firstInteraction = now();
  }

  var pressed = new Map(); // e.code -> {t, field, trusted}; só para calcular dwell

  document.addEventListener(
    "mousemove",
    function (e) {
      if (!e.isTrusted) beh.untrusted++;
      if (beh.mouse.length < MAX_MOUSE) beh.mouse.push([now(), e.clientX, e.clientY]);
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "mousedown",
    function (e) {
      mark(e);
      var el = e.target.closest("input, button, label, a") || e.target;
      var r = el.getBoundingClientRect();
      beh.clicks.push({
        t: now(),
        x: e.clientX,
        y: e.clientY,
        field: fieldOf(el),
        // deslocamento do clique em relação ao centro, normalizado por meia largura/altura
        dx: r.width ? (e.clientX - (r.left + r.width / 2)) / (r.width / 2) : 0,
        dy: r.height ? (e.clientY - (r.top + r.height / 2)) / (r.height / 2) : 0,
        w: Math.round(r.width),
        h: Math.round(r.height),
        trusted: e.isTrusted,
      });
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "keydown",
    function (e) {
      mark(e);
      if (e.repeat) return;
      pressed.set(e.code || e.key, { t: now(), field: fieldOf(e.target), trusted: e.isTrusted });
    },
    { capture: true },
  );

  document.addEventListener(
    "keyup",
    function (e) {
      var k = e.code || e.key;
      var down = pressed.get(k);
      if (!down) return;
      pressed.delete(k);
      beh.keys.push({ t: down.t, field: down.field, dwell: Math.round((now() - down.t) * 10) / 10, trusted: down.trusted });
    },
    { capture: true },
  );

  document.addEventListener(
    "input",
    function (e) {
      mark(e);
      beh.inputs.push({ t: now(), field: fieldOf(e.target), type: e.inputType || null, trusted: e.isTrusted });
    },
    { capture: true },
  );

  document.addEventListener(
    "focusin",
    function (e) {
      beh.focus.push([now(), fieldOf(e.target)]);
    },
    { capture: true },
  );

  document.addEventListener("paste", function () { beh.pastes++; }, { capture: true });
  window.addEventListener("scroll", function () { beh.scrolls++; }, { passive: true });

  // --- ambiente --------------------------------------------------------------

  // Artefato de CDP: com o domínio Runtime habilitado (Playwright/Puppeteer/
  // DevTools aberto), o console serializa o objeto e chama o getter de `stack`.
  // Falso positivo esperado: humano com DevTools aberto.
  var cdpRuntime = false;
  try {
    var probe = new Error("lab-probe");
    Object.defineProperty(probe, "stack", {
      configurable: false,
      get: function () {
        cdpRuntime = true;
        return "";
      },
    });
    console.debug(probe);
  } catch (_) {
    /* ignorar */
  }

  function webglInfo() {
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (!gl) return { available: false };
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        available: true,
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    } catch (e) {
      return { available: false, error: String(e) };
    }
  }

  async function canvasHash() {
    try {
      var c = document.createElement("canvas");
      c.width = 240;
      c.height = 60;
      var ctx = c.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "16px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(100, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("bot-lab ção ☃", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("bot-lab ção ☃", 4, 17);
      var buf = new TextEncoder().encode(c.toDataURL());
      var digest = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(digest).slice(0, 8))
        .map(function (b) { return b.toString(16).padStart(2, "0"); })
        .join("");
    } catch (e) {
      return null;
    }
  }

  async function permissionsInfo() {
    try {
      var q = await navigator.permissions.query({ name: "notifications" });
      return { notification: typeof Notification !== "undefined" ? Notification.permission : null, query: q.state };
    } catch (e) {
      return { error: String(e) };
    }
  }

  async function uaData() {
    var d = navigator.userAgentData;
    if (!d) return null;
    var out = { brands: d.brands, mobile: d.mobile, platform: d.platform };
    try {
      var hi = await d.getHighEntropyValues(["platformVersion", "fullVersionList", "architecture"]);
      out.platformVersion = hi.platformVersion;
      out.fullVersionList = hi.fullVersionList;
      out.architecture = hi.architecture;
    } catch (_) {
      /* ignorar */
    }
    return out;
  }

  function tzOffsetFromIntl(tz) {
    // offset (minutos, sinal de getTimezoneOffset) que o Intl implica para o fuso declarado
    try {
      var d = new Date();
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).formatToParts(d);
      var g = {};
      parts.forEach(function (p) { g[p.type] = p.value; });
      var asUTC = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute, +g.second);
      return Math.round((d.getTime() - asUTC) / 60000);
    } catch (_) {
      return null;
    }
  }

  var envPromise = (async function () {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      webdriver: navigator.webdriver,
      userAgent: navigator.userAgent,
      appVersion: navigator.appVersion,
      platform: navigator.platform,
      vendor: navigator.vendor,
      language: navigator.language,
      languages: navigator.languages ? Array.from(navigator.languages) : [],
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints,
      pluginsLength: navigator.plugins ? navigator.plugins.length : null,
      mimeTypesLength: navigator.mimeTypes ? navigator.mimeTypes.length : null,
      hasChromeObject: typeof window.chrome !== "undefined",
      hasChromeRuntime: !!(window.chrome && window.chrome.runtime),
      uaData: await uaData(),
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        dpr: window.devicePixelRatio,
      },
      window: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
      },
      timezone: tz,
      tzOffset: new Date().getTimezoneOffset(),
      tzOffsetIntl: tzOffsetFromIntl(tz),
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      webgl: webglInfo(),
      canvasHash: await canvasHash(),
      permissions: await permissionsInfo(),
      cdpRuntime: cdpRuntime,
    };
  })();

  window.LabCollector = {
    snapshot: async function () {
      return {
        version: 1,
        label: params.get("label") || "manual",
        page: location.pathname,
        submittedAt: now(),
        env: await envPromise,
        behavior: beh,
      };
    },
  };
})();
