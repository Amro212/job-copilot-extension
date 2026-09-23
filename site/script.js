/**
 * Kareer — Official Public Website Scripts
 * Zero tracking, zero telemetry, zero cookies.
 */

// Central configuration for official links and distribution channels.
// Replace `null` with production store URLs once published.
const LINKS = {
  github: "https://github.com/Amro212/kareer",
  chrome: null, // e.g. "https://chromewebstore.google.com/detail/kareer/..."
  firefox: "https://amro212.github.io/kareer/downloads/kareer-firefox.xpi",
  issues: "https://github.com/Amro212/kareer/issues",
  security: "https://github.com/Amro212/kareer/blob/master/SECURITY.md"
};

document.addEventListener("DOMContentLoaded", () => {
  initStoreLinks();
  initMobileNavigation();
  initFaqAccordion();
  initDynamicVersion();
  initInteractiveDemo();
});

/**
 * Updates store download/action buttons based on the centralized `LINKS` configuration.
 * When a URL is null, renders the button as disabled with "Coming soon".
 * When a URL is provided, transforms into an active install link.
 */
function initStoreLinks() {
  const storeButtons = document.querySelectorAll("[data-store]");

  storeButtons.forEach((btn) => {
    const store = btn.getAttribute("data-store");
    const targetUrl = LINKS[store];

    if (targetUrl) {
      btn.href = targetUrl;
      btn.classList.remove("kr-btn-disabled");
      btn.removeAttribute("aria-disabled");
      btn.removeAttribute("tabindex");
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";

      const tag = btn.querySelector(".kr-btn-tag");
      if (tag) {
        tag.textContent = store === "firefox" ? ".xpi" : "Install";
        tag.style.color = "var(--kr-signal)";
      }
    } else {
      btn.removeAttribute("href");
      btn.classList.add("kr-btn-disabled");
      btn.setAttribute("aria-disabled", "true");
      btn.setAttribute("tabindex", "-1");
    }
  });

  // Also bind all elements with data-link
  document.querySelectorAll("[data-link]").forEach((el) => {
    const key = el.getAttribute("data-link");
    if (LINKS[key] && !el.getAttribute("href")) {
      el.href = LINKS[key];
    }
  });
}

/**
 * Handles responsive mobile navigation drawer toggle.
 */
function initMobileNavigation() {
  const toggleBtn = document.querySelector(".kr-mobile-toggle");
  const nav = document.querySelector(".kr-nav");

  if (!toggleBtn || !nav) return;

  toggleBtn.addEventListener("click", () => {
    const isExpanded = toggleBtn.getAttribute("aria-expanded") === "true";
    toggleBtn.setAttribute("aria-expanded", String(!isExpanded));
    nav.classList.toggle("active");
  });

  // Close navigation menu upon clicking an in-page link
  nav.querySelectorAll(".kr-nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("active");
      toggleBtn.setAttribute("aria-expanded", "false");
    });
  });
}

/**
 * Enhances FAQ accordion with keyboard navigation and single-open behavior.
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll(".kr-faq-item");

  faqItems.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (item.open) {
        faqItems.forEach((other) => {
          if (other !== item && other.open) {
            other.removeAttribute("open");
          }
        });
      }
    });
  });
}

/**
 * Dynamically fetches and updates the version badge from version.json or repo package.json.
 */
async function initDynamicVersion() {
  const badge = document.querySelector("[data-version-badge]");
  if (!badge) return;

  try {
    const versionUrl = new URL("version.json", window.location.href).href;
    const res = await fetch(versionUrl, { cache: "no-cache" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.version) {
        badge.textContent = `v${data.version}`;
        return;
      }
    }
  } catch {}

  try {
    const res = await fetch("https://raw.githubusercontent.com/Amro212/kareer/master/package.json");
    if (res.ok) {
      const pkg = await res.json();
      if (pkg && pkg.version) {
        badge.textContent = `v${pkg.version}`;
      }
    }
  } catch {}
}

/**
 * Drives the interactive flight deck simulation panel:
 * - Tab switching between Run, Profile, and Settings
 * - Model selector updates
 * - Dynamic feedback for Save actions
 * - Interactive autofill run simulation
 */
function initInteractiveDemo() {
  const tabs = document.querySelectorAll("[data-sim-tab]");
  const panes = document.querySelectorAll(".kr-sim-pane");
  const actionBtn = document.getElementById("sim-action-btn");
  const feedbackMsg = document.getElementById("sim-feedback-msg");
  const modelSelect = document.getElementById("sim-model-select");
  const modelChip = document.getElementById("sim-model-chip");
  const progressBar = document.getElementById("sim-progress-bar");
  const wfDesc = document.getElementById("sim-wf-desc");
  const wfBadge = document.getElementById("sim-wf-badge");

  if (!tabs.length) return;

  function showFeedback(text) {
    if (!feedbackMsg) return;
    feedbackMsg.textContent = text;
    feedbackMsg.classList.add("visible");
    clearTimeout(feedbackMsg._timer);
    feedbackMsg._timer = setTimeout(() => {
      feedbackMsg.classList.remove("visible");
    }, 2400);
  }

  // 1. Tab switching
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetTab = tab.getAttribute("data-sim-tab");

      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      panes.forEach((pane) => {
        if (pane.classList.contains(`kr-sim-pane-${targetTab}`)) {
          pane.classList.add("active");
        } else {
          pane.classList.remove("active");
        }
      });

      // Update footer action button based on selected tab
      if (actionBtn) {
        if (targetTab === "run") {
          actionBtn.textContent = "Autofill Application";
          actionBtn.style.display = "inline-flex";
        } else if (targetTab === "profile") {
          actionBtn.textContent = "Save Profile";
          actionBtn.style.display = "inline-flex";
        } else if (targetTab === "settings") {
          actionBtn.textContent = "Save Settings";
          actionBtn.style.display = "inline-flex";
        }
      }
    });
  });

  // 2. Action button click behavior
  if (actionBtn) {
    actionBtn.addEventListener("click", () => {
      const activeTab = document.querySelector(".kr-sim-tab.active")?.getAttribute("data-sim-tab") || "run";

      if (activeTab === "run") {
        actionBtn.disabled = true;
        actionBtn.textContent = "Filling 14 fields...";
        if (progressBar) progressBar.style.transform = "scaleX(0.4)";
        if (wfBadge) {
          wfBadge.textContent = "FILLING...";
          wfBadge.className = "kr-badge kr-badge-blue";
        }
        if (wfDesc) wfDesc.textContent = "Scanning application fields and matching against candidate profile...";

        // Highlight form inputs on the left side
        const simInputs = document.querySelectorAll(".kr-sim-page .kr-sim-input");
        simInputs.forEach((inp) => inp.classList.remove("filled-verified", "filled-inferred"));

        setTimeout(() => {
          if (progressBar) progressBar.style.transform = "scaleX(0.75)";
          if (wfDesc) wfDesc.textContent = "Validating select choices, dates, and text inputs...";
          simInputs.forEach((inp) => inp.classList.add("filled-verified"));
        }, 400);

        setTimeout(() => {
          if (progressBar) progressBar.style.transform = "scaleX(1)";
          if (wfBadge) {
            wfBadge.textContent = "READY FOR REVIEW";
            wfBadge.className = "kr-badge kr-badge-success";
          }
          if (wfDesc) wfDesc.textContent = "13/14 fields verified. Safety boundary paused before electronic signature.";
          actionBtn.disabled = false;
          actionBtn.textContent = "Re-run Autofill";
          showFeedback("13 Verified, 1 Paused (Safety)");
        }, 900);
      } else if (activeTab === "profile") {
        showFeedback("Profile saved locally ✓");
      } else if (activeTab === "settings") {
        showFeedback("Settings saved ✓");
      }
    });
  }

  // 3. Model selector update
  if (modelSelect && modelChip) {
    modelSelect.addEventListener("change", (e) => {
      modelChip.textContent = e.target.value;
      showFeedback(`Model switched to ${e.target.value}`);
    });
  }
}

