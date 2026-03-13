(function () {
  const PUBLIC_SELECT =
    "id, media_type, public_url, alt_text, caption, sort_order, created_at, featured_home, home_rank";
  const PUBLIC_PAGE_SIZE = 9;

  const fallbackItems = [
    {
      media_type: "image",
      public_url: "assets/img/p208.png",
      alt_text: "Pulido profesional",
      caption: "Pulido profesional",
    },
    {
      media_type: "image",
      public_url: "assets/img/dif2.png",
      alt_text: "Limpieza interior",
      caption: "Limpieza interior",
    },
    {
      media_type: "video",
      public_url: "assets/img/trat.mp4",
      alt_text: "Aplicación de tratamiento",
      caption: "Aplicación de tratamiento",
    },
    {
      media_type: "image",
      public_url: "assets/img/dif.png",
      alt_text: "Antes y después",
      caption: "Antes y después",
    },
    {
      media_type: "image",
      public_url: "assets/img/camaro.png",
      alt_text: "Terminación final",
      caption: "Terminación final",
    },
  ];

  function statusNode(message) {
    const p = document.createElement("p");
    p.className = "gallery-status";
    p.textContent = message;
    return p;
  }

  function isSafeMediaUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
    try {
      const url = new URL(rawUrl, window.location.origin);
      const isHttp = url.protocol === "https:" || url.protocol === "http:";
      return isHttp;
    } catch (_err) {
      return false;
    }
  }

  function getSafeMediaUrl(rawUrl) {
    return isSafeMediaUrl(rawUrl) ? rawUrl : "";
  }

  function mediaCard(item) {
    const article = document.createElement("article");
    article.className = "portfolio-item";

    if (item.media_type === "video") {
      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = getSafeMediaUrl(item.public_url);
      article.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = getSafeMediaUrl(item.public_url);
      img.alt = item.alt_text || "Imagen de servicio";
      article.appendChild(img);
    }

    if (item.caption) {
      const caption = document.createElement("p");
      caption.className = "portfolio-caption";
      caption.textContent = item.caption;
      article.appendChild(caption);
    }

    return article;
  }

  function renderHomeFallback(homeGrid) {
    homeGrid.innerHTML = "";
    fallbackItems.slice(0, 3).forEach((item) => {
      if (item.media_type === "video") {
        const video = document.createElement("video");
        video.src = getSafeMediaUrl(item.public_url);
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "metadata";
        homeGrid.appendChild(video);
        return;
      }

      const img = document.createElement("img");
      img.src = getSafeMediaUrl(item.public_url);
      img.alt = item.alt_text || "Resultado";
      img.loading = "lazy";
      homeGrid.appendChild(img);
    });
  }

  function renderPublicFallback(galleryGrid, pagination) {
    galleryGrid.innerHTML = "";
    fallbackItems.forEach((item) => galleryGrid.appendChild(mediaCard(item)));
    if (pagination) pagination.classList.add("hidden");
  }

  function applyOrder(query, order) {
    if (order === "recent") {
      return query.order("created_at", { ascending: false });
    }
    if (order === "old") {
      return query.order("created_at", { ascending: true });
    }
    return query
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  }

  async function fetchGalleryItems(client, order, limit, page, pageSize) {
    let query = client
      .from("gallery_items")
      .select(PUBLIC_SELECT)
      .eq("is_deleted", false);

    query = applyOrder(query, order);
    if (limit) query = query.limit(limit);
    if (page && pageSize) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function fetchGalleryCount(client) {
    const { count, error } = await client
      .from("gallery_items")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false);
    if (error) throw error;
    return Number(count || 0);
  }

  async function fetchHomeItems(client) {
    const { data: settingsRow } = await client
      .from("app_settings")
      .select("home_mode")
      .eq("id", 1)
      .maybeSingle();

    const homeMode = settingsRow?.home_mode === "manual" ? "manual" : "auto";

    if (homeMode === "auto") {
      return fetchGalleryItems(client, "recent", 3);
    }

    const { data: manualItems, error: manualError } = await client
      .from("gallery_items")
      .select(PUBLIC_SELECT)
      .eq("is_deleted", false)
      .eq("featured_home", true)
      .order("home_rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(3);

    if (manualError) throw manualError;
    const selected = manualItems || [];
    if (selected.length >= 3) return selected;

    const recent = await fetchGalleryItems(client, "recent", 20);
    const selectedIds = new Set(selected.map((item) => item.id));
    for (const item of recent) {
      if (selectedIds.has(item.id)) continue;
      selected.push(item);
      if (selected.length === 3) break;
    }

    return selected;
  }

  function setActiveOrder(order) {
    document.querySelectorAll("[data-gallery-order]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.galleryOrder === order);
    });
  }

  function pageButton(label, disabled, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "page-btn";
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) btn.addEventListener("click", onClick);
    return btn;
  }

  function pageNumberButton(label, active, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "page-btn page-number";
    if (active) btn.classList.add("active");
    btn.textContent = String(label);
    if (!active) btn.addEventListener("click", onClick);
    return btn;
  }

  function renderPagination(container, currentPage, totalPages, onChangePage) {
    if (!container) return;
    container.innerHTML = "";

    if (totalPages <= 1) {
      container.classList.add("hidden");
      return;
    }

    container.classList.remove("hidden");

    container.appendChild(
      pageButton("Anterior", currentPage <= 1, () => onChangePage(currentPage - 1))
    );

    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    if (start > 1) {
      container.appendChild(pageNumberButton(1, false, () => onChangePage(1)));
      if (start > 2) {
        const dots = document.createElement("span");
        dots.className = "page-dots";
        dots.textContent = "...";
        container.appendChild(dots);
      }
    }

    for (let page = start; page <= end; page += 1) {
      container.appendChild(
        pageNumberButton(page, page === currentPage, () => onChangePage(page))
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        const dots = document.createElement("span");
        dots.className = "page-dots";
        dots.textContent = "...";
        container.appendChild(dots);
      }
      container.appendChild(
        pageNumberButton(totalPages, false, () => onChangePage(totalPages))
      );
    }

    container.appendChild(
      pageButton("Siguiente", currentPage >= totalPages, () => onChangePage(currentPage + 1))
    );
  }

  async function initPublicServices() {
    const galleryGrid = document.getElementById("portfolioGrid");
    const pagination = document.getElementById("publicGalleryPagination");
    if (!galleryGrid) return;

    const configured = window.AppSupabase?.isConfigured?.() === true;
    if (!configured) {
      renderPublicFallback(galleryGrid, pagination);
      return;
    }

    const client = window.AppSupabase.getClient();
    let currentOrder = "manual";
    let currentPage = 1;
    let totalPages = 1;

    async function load(order, page) {
      galleryGrid.innerHTML = "";
      galleryGrid.appendChild(statusNode("Cargando galería..."));
      try {
        const totalItems = await fetchGalleryCount(client);
        totalPages = Math.max(1, Math.ceil(totalItems / PUBLIC_PAGE_SIZE));
        if (page > totalPages) {
          currentPage = totalPages;
        }

        const items = await fetchGalleryItems(
          client,
          order,
          null,
          currentPage,
          PUBLIC_PAGE_SIZE
        );
        galleryGrid.innerHTML = "";
        if (items.length === 0) {
          renderPublicFallback(galleryGrid, pagination);
          return;
        }
        items.forEach((item) => galleryGrid.appendChild(mediaCard(item)));
        renderPagination(pagination, currentPage, totalPages, async (nextPage) => {
          currentPage = nextPage;
          await load(currentOrder, currentPage);
        });
      } catch (err) {
        renderPublicFallback(galleryGrid, pagination);
      }
    }

    document.querySelectorAll("[data-gallery-order]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentOrder = btn.dataset.galleryOrder || "manual";
        currentPage = 1;
        setActiveOrder(currentOrder);
        load(currentOrder, currentPage);
      });
    });

    setActiveOrder(currentOrder);
    load(currentOrder, currentPage);
  }

  async function initHomeResults() {
    const homeGrid = document.getElementById("homeResultsGrid");
    if (!homeGrid) return;

    const configured = window.AppSupabase?.isConfigured?.() === true;
    if (!configured) {
      renderHomeFallback(homeGrid);
      return;
    }

    const client = window.AppSupabase.getClient();
    homeGrid.innerHTML = "";
    homeGrid.appendChild(statusNode("Cargando resultados..."));

    try {
      const items = await fetchHomeItems(client);
      homeGrid.innerHTML = "";
      if (items.length === 0) {
        renderHomeFallback(homeGrid);
        return;
      }

      items.slice(0, 3).forEach((item) => {
        if (item.media_type === "video") {
          const video = document.createElement("video");
          video.src = getSafeMediaUrl(item.public_url);
          video.autoplay = true;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.preload = "metadata";
          homeGrid.appendChild(video);
          return;
        }

        const img = document.createElement("img");
        img.src = getSafeMediaUrl(item.public_url);
        img.alt = item.alt_text || "Resultado";
        img.loading = "lazy";
        homeGrid.appendChild(img);
      });
    } catch (err) {
      renderHomeFallback(homeGrid);
    }
  }

  initPublicServices();
  initHomeResults();
})();
