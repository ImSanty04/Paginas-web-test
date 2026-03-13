const menuBtn = document.getElementById("menuBtn");
const siteNav = document.getElementById("siteNav");

if (menuBtn && siteNav) {
  menuBtn.addEventListener("click", () => {
    const open = siteNav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });

  siteNav.querySelectorAll("a, button").forEach((node) => {
    node.addEventListener("click", () => {
      siteNav.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    });
  });
}

const yearNode = document.getElementById("year");
if (yearNode) {
  yearNode.textContent = "2025";
}

const contactModal = document.getElementById("contactModal");
const openContactButtons = document.querySelectorAll("[data-open-contact]");
const closeContactButtons = document.querySelectorAll("[data-close-contact]");

function openContactModal() {
  if (!contactModal) return;
  contactModal.classList.add("show");
  contactModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeContactModal() {
  if (!contactModal) return;
  contactModal.classList.remove("show");
  contactModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

openContactButtons.forEach((button) => {
  button.addEventListener("click", openContactModal);
});

closeContactButtons.forEach((button) => {
  button.addEventListener("click", closeContactModal);
});

if (contactModal) {
  contactModal.addEventListener("click", (event) => {
    if (event.target === contactModal) {
      closeContactModal();
    }
  });
}

const gallery = document.getElementById("portfolioGrid");
const lightbox = document.getElementById("lightbox");
const lightboxContent = document.getElementById("lightboxContent");
const lightboxClose = document.getElementById("lightboxClose");

function closeLightbox() {
  if (!lightbox || !lightboxContent) return;
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxContent.querySelectorAll("video").forEach((node) => node.pause());
}

if (gallery && lightbox && lightboxContent) {
  gallery.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName !== "IMG" && target.tagName !== "VIDEO") return;

    lightboxContent.querySelectorAll("img, video").forEach((node) => node.remove());

    if (target.tagName === "IMG") {
      const bigImg = document.createElement("img");
      bigImg.src = target.getAttribute("src") || "";
      bigImg.alt = target.getAttribute("alt") || "Imagen ampliada";
      lightboxContent.prepend(bigImg);
    }

    if (target.tagName === "VIDEO") {
      const bigVideo = document.createElement("video");
      bigVideo.src = target.getAttribute("src") || "";
      bigVideo.controls = true;
      bigVideo.preload = "metadata";
      bigVideo.playsInline = true;
      lightboxContent.prepend(bigVideo);

      const playPromise = bigVideo.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    }

    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
  });
}

if (lightboxClose) {
  lightboxClose.addEventListener("click", closeLightbox);
}

if (lightbox) {
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (lightbox && lightbox.classList.contains("open")) {
    closeLightbox();
    return;
  }

  if (contactModal && contactModal.classList.contains("show")) {
    closeContactModal();
  }
});
