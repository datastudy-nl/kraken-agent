// Mobile sidebar toggle
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.querySelector(".sidebar-toggle");
    var sidebar = document.querySelector("#sidebar");
    if (!toggle || !sidebar) return;

    // Create overlay element
    var overlay = document.createElement("div");
    overlay.className = "sidebar-overlay";
    document.body.appendChild(overlay);

    function open() {
      sidebar.classList.add("open");
      overlay.classList.add("open");
    }

    function close() {
      sidebar.classList.remove("open");
      overlay.classList.remove("open");
    }

    toggle.addEventListener("click", function () {
      if (sidebar.classList.contains("open")) {
        close();
      } else {
        open();
      }
    });

    overlay.addEventListener("click", close);

    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  });
})();
