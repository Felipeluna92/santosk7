/* Lógica dos formulários de cadastro e login + página pós-cadastro. */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var label = params.get("label");

  function withLabel(path) {
    return label ? path + (path.indexOf("?") < 0 ? "?" : "&") + "label=" + encodeURIComponent(label) : path;
  }

  // mantém ?label= nos links entre páginas
  document.querySelectorAll("a[data-keep-label]").forEach(function (a) {
    a.setAttribute("href", withLabel(a.getAttribute("href")));
  });

  var formToken = fetch("/api/form-token")
    .then(function (r) { return r.json(); })
    .then(function (j) { return j.token; })
    .catch(function () { return ""; });

  function showErrors(form, errors) {
    form.querySelectorAll("[data-error-for]").forEach(function (el) {
      var key = el.getAttribute("data-error-for");
      el.textContent = errors[key] || "";
      var input = form.querySelector('[name="' + key + '"]');
      if (input) input.setAttribute("aria-invalid", errors[key] ? "true" : "false");
    });
  }

  function clientValidate(kind, v) {
    var e = {};
    var emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email || "");
    if (kind === "signup") {
      if (!v.name || v.name.trim().length < 2 || v.name.trim().length > 60) e.name = "Nome deve ter entre 2 e 60 caracteres.";
      if (!emailOk) e.email = "E-mail inválido.";
      if (!v.password || v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password))
        e.password = "Senha precisa de 8+ caracteres, com letra e número.";
      if (v.password !== v.confirm) e.confirm = "As senhas não conferem.";
      if (!v.terms) e.terms = "Aceite os termos para continuar.";
    } else {
      if (!emailOk) e.email = "E-mail inválido.";
      if (!v.password) e.password = "Informe a senha.";
    }
    return e;
  }

  var form = document.querySelector("form[data-kind]");
  if (form) {
    var kind = form.getAttribute("data-kind");
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var fd = new FormData(form);
      var values = {
        name: fd.get("name"),
        email: (fd.get("email") || "").trim(),
        password: fd.get("password") || "",
        confirm: fd.get("confirm"),
        terms: fd.get("terms") === "on",
        website: fd.get("website") || "", // honeypot
      };
      var errs = clientValidate(kind, values);
      showErrors(form, errs);
      if (Object.keys(errs).length) return;

      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        var payload = Object.assign({}, values, {
          form_token: await formToken,
          telemetry: await window.LabCollector.snapshot(),
        });
        var res = await fetch("/api/" + kind, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        var body = await res.json();
        if (res.ok) {
          location.assign(withLabel("/welcome?run=" + body.run_id + "&kind=" + kind));
          return;
        }
        showErrors(form, body.errors || { _: "Erro inesperado." });
      } catch (e) {
        showErrors(form, { _: "Falha de rede: " + e });
      }
      btn.disabled = false;
    });
  }

  // página pós-cadastro: mostra o veredito do detector para esta submissão
  var result = document.getElementById("result");
  if (result) {
    var runId = params.get("run");
    var heading = document.getElementById("welcome-title");
    if (heading) heading.textContent = params.get("kind") === "login" ? "Login efetuado" : "Conta criada";
    if (!runId) {
      result.textContent = "Nenhuma submissão para mostrar.";
    } else {
      fetch("/api/runs/" + encodeURIComponent(runId))
        .then(function (r) { return r.json(); })
        .then(function (run) {
          document.getElementById("score").textContent = run.score;
          var v = document.getElementById("verdict");
          v.textContent = run.verdict;
          v.setAttribute("data-verdict", run.verdict);
          var list = document.getElementById("signals");
          list.innerHTML = "";
          run.signals
            .filter(function (s) { return s.triggered; })
            .forEach(function (s) {
              var li = document.createElement("li");
              li.innerHTML = "<strong></strong> <span class=tag></span><div class=detail></div>";
              li.querySelector("strong").textContent = s.title + " (+" + s.weight + ")";
              li.querySelector(".tag").textContent = s.robustness;
              li.querySelector(".detail").textContent = s.detail;
              list.appendChild(li);
            });
          if (!list.children.length) list.innerHTML = "<li>Nenhum sinal disparou.</li>";
          result.hidden = false;
        })
        .catch(function () { result.textContent = "Não foi possível carregar o resultado."; });
    }
  }
})();
