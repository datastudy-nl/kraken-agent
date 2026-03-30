// Dark/Light mode toggle with localStorage persistence
(function () {
  const KEY = "kraken-theme";

  function getPreferred() {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
  }

  // Apply immediately to avoid flash
  apply(getPreferred());

  document.addEventListener("DOMContentLoaded", function () {
    const btn = document.querySelector(".theme-toggle");
    if (!btn) return;

    btn.addEventListener("click", function () {
      const current = document.documentElement.getAttribute("data-theme");
      apply(current === "dark" ? "light" : "dark");
    });
  });
})();
