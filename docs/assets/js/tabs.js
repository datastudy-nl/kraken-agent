// Tab component switching
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".tabs").forEach(function (tabGroup) {
      var buttons = tabGroup.querySelectorAll(".tab-button");
      var contents = tabGroup.querySelectorAll(".tab-content");

      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          var target = button.getAttribute("data-tab");

          buttons.forEach(function (b) { b.classList.remove("active"); });
          contents.forEach(function (c) { c.classList.remove("active"); });

          button.classList.add("active");
          var panel = tabGroup.querySelector("#" + target);
          if (panel) panel.classList.add("active");
        });
      });
    });
  });
})();
