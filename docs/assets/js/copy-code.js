// Add copy buttons to all code blocks
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var blocks = document.querySelectorAll("pre");

    blocks.forEach(function (pre) {
      var btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.setAttribute("aria-label", "Copy code to clipboard");

      btn.addEventListener("click", function () {
        var code = pre.querySelector("code");
        var text = code ? code.textContent : pre.textContent;

        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(function () {
            btn.textContent = "Copy";
            btn.classList.remove("copied");
          }, 2000);
        });
      });

      pre.style.position = "relative";
      pre.appendChild(btn);
    });
  });
})();
