// Event Bus - Lightweight cross-module communication via CustomEvents

window.MissionEvents = {
  emit: function (name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  },
  on: function (name, handler) {
    window.addEventListener(name, function (e) { handler(e.detail); });
  }
};
