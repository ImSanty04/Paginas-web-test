(function () {
  const authSection = document.getElementById("authSection");
  const dashboardSection = document.getElementById("dashboardSection");
  const loginForm = document.getElementById("loginForm");
  const logoutBtn = document.getElementById("logoutBtn");
  const uploadForm = document.getElementById("uploadForm");
  const homeModeSelect = document.getElementById("homeModeSelect");
  const saveHomeModeBtn = document.getElementById("saveHomeModeBtn");
  const adminGalleryList = document.getElementById("adminGalleryList");
  const adminTrashList = document.getElementById("adminTrashList");
  const authMessage = document.getElementById("authMessage");
  const adminMessage = document.getElementById("adminMessage");

  const state = {
    order: "manual",
    galleryItems: [],
    trashItems: [],
    dragSourceId: null,
  };
  const allowedImageMimes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);
  const allowedVideoMimes = new Set([
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ]);

  function setMessage(node, message, type) {
    if (!node) return;
    node.textContent = message || "";
    node.classList.remove("error", "success");
    if (type) node.classList.add(type);
  }

  function publicErrorMessage(err, fallback) {
    const raw = String(err?.message || "");
    if (
      raw.includes("Formato no permitido") ||
      raw.includes("supera 60MB") ||
      raw.includes("supera 10MB") ||
      raw.includes("rango de inicio") ||
      raw.includes("3 elementos destacados")
    ) {
      return raw;
    }
    return fallback;
  }

  function isConfigured() {
    return window.AppSupabase?.isConfigured?.() === true;
  }

  function client() {
    return window.AppSupabase.getClient();
  }

  function sanitizeFileName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function isSafeMediaUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
    try {
      const url = new URL(rawUrl, window.location.origin);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch (_err) {
      return false;
    }
  }

  function safeMediaUrl(rawUrl) {
    return isSafeMediaUrl(rawUrl) ? rawUrl : "";
  }

  function statusCard(message) {
    const div = document.createElement("div");
    div.className = "admin-empty";
    div.textContent = message;
    return div;
  }

  function mediaPreview(item) {
    if (item.media_type === "video") {
      const video = document.createElement("video");
      video.src = safeMediaUrl(item.public_url);
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "metadata";
      return video;
    }
    const img = document.createElement("img");
    img.src = safeMediaUrl(item.public_url);
    img.alt = item.alt_text || "Preview";
    img.loading = "lazy";
    return img;
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

  async function requireAdmin(user) {
    const { data, error } = await client()
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      await client().auth.signOut();
      throw new Error(
        "Tu usuario no tiene perfil admin. Carga tu UUID en public.profiles con role=admin."
      );
    }
    if (data.role !== "admin") {
      await client().auth.signOut();
      throw new Error("Tu usuario no tiene permisos de administrador.");
    }
  }

  async function ensureSettingsRow() {
    const { data, error } = await client()
      .from("app_settings")
      .select("id, home_mode")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      const { error: insertError } = await client()
        .from("app_settings")
        .insert({ id: 1, home_mode: "auto" });
      if (insertError) throw insertError;
      homeModeSelect.value = "auto";
      return;
    }

    homeModeSelect.value = data.home_mode === "manual" ? "manual" : "auto";
  }

  async function loadGallery() {
    const { data, error } = await applyOrder(
      client().from("gallery_items").select("*").eq("is_deleted", false),
      state.order
    );

    if (error) throw error;
    state.galleryItems = data || [];
    renderGallery();
  }

  async function loadTrash() {
    const { data, error } = await client()
      .from("gallery_items")
      .select("*")
      .eq("is_deleted", true)
      .order("deleted_at", { ascending: false });

    if (error) throw error;
    state.trashItems = data || [];
    renderTrash();
  }

  async function refreshAll() {
    await Promise.all([ensureSettingsRow(), loadGallery(), loadTrash()]);
  }

  function setFilterActive() {
    document.querySelectorAll("[data-admin-order]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.adminOrder === state.order);
    });
  }

  async function saveManualOrder() {
    const updates = state.galleryItems.map((item, index) => ({
      id: item.id,
      sort_order: (index + 1) * 10,
    }));

    for (const payload of updates) {
      const { error } = await client()
        .from("gallery_items")
        .update({ sort_order: payload.sort_order })
        .eq("id", payload.id);
      if (error) throw error;
    }
  }

  async function setFeatured(item, enabled) {
    if (enabled) {
      const featuredCount = state.galleryItems.filter(
        (entry) => entry.featured_home && entry.id !== item.id
      ).length;
      if (featuredCount >= 3) {
        throw new Error("Solo puedes tener 3 elementos destacados para inicio.");
      }
    }

    const nextPayload = enabled
      ? { featured_home: true, home_rank: item.home_rank || null }
      : { featured_home: false, home_rank: null };

    const { error } = await client()
      .from("gallery_items")
      .update(nextPayload)
      .eq("id", item.id);
    if (error) throw error;
  }

  async function setHomeRank(item, rankValue) {
    const rank = Number(rankValue);
    if (!Number.isInteger(rank) || rank < 1 || rank > 3) {
      throw new Error("El rango de inicio debe ser 1, 2 o 3.");
    }

    const { error: clearError } = await client()
      .from("gallery_items")
      .update({ home_rank: null })
      .eq("home_rank", rank)
      .neq("id", item.id);
    if (clearError) throw clearError;

    const { error } = await client()
      .from("gallery_items")
      .update({ featured_home: true, home_rank: rank })
      .eq("id", item.id);
    if (error) throw error;
  }

  async function updateCaption(item, captionValue) {
    const caption = String(captionValue || "").trim();
    const { error } = await client()
      .from("gallery_items")
      .update({ caption: caption || null })
      .eq("id", item.id);
    if (error) throw error;
    item.caption = caption || null;
  }

  async function softDeleteItem(item) {
    const { error } = await client()
      .from("gallery_items")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        featured_home: false,
        home_rank: null,
      })
      .eq("id", item.id);
    if (error) throw error;
  }

  async function restoreItem(item) {
    const { error } = await client()
      .from("gallery_items")
      .update({ is_deleted: false, deleted_at: null })
      .eq("id", item.id);
    if (error) throw error;
  }

  async function permanentlyDeleteItem(item) {
    if (item.storage_path) {
      const { error: storageError } = await client()
        .storage.from(window.AppSupabase.bucketName())
        .remove([item.storage_path]);
      if (storageError) throw storageError;
    }

    const { error } = await client().from("gallery_items").delete().eq("id", item.id);
    if (error) throw error;
  }

  function wireDragAndDrop(card, item) {
    if (state.order !== "manual") return;

    card.draggable = true;
    card.addEventListener("dragstart", () => {
      state.dragSourceId = item.id;
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      card.classList.add("drag-over");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });

    card.addEventListener("drop", async (event) => {
      event.preventDefault();
      card.classList.remove("drag-over");
      if (!state.dragSourceId || state.dragSourceId === item.id) return;

      const sourceIndex = state.galleryItems.findIndex(
        (entry) => entry.id === state.dragSourceId
      );
      const targetIndex = state.galleryItems.findIndex((entry) => entry.id === item.id);
      if (sourceIndex < 0 || targetIndex < 0) return;

      const [dragged] = state.galleryItems.splice(sourceIndex, 1);
      state.galleryItems.splice(targetIndex, 0, dragged);
      renderGallery();

      try {
        await saveManualOrder();
        setMessage(adminMessage, "Orden de destacados guardado.", "success");
      } catch (err) {
        setMessage(adminMessage, publicErrorMessage(err, "No se pudo guardar el orden."), "error");
      }
    });
  }

  function renderGallery() {
    adminGalleryList.innerHTML = "";
    if (state.galleryItems.length === 0) {
      adminGalleryList.appendChild(statusCard("No hay elementos publicados."));
      return;
    }

    state.galleryItems.forEach((item) => {
      const card = document.createElement("article");
      card.className = "admin-media-card";
      card.dataset.id = item.id;

      const media = mediaPreview(item);
      media.classList.add("admin-preview");
      card.appendChild(media);

      const body = document.createElement("div");
      body.className = "admin-media-body";

      const title = document.createElement("h4");
      title.textContent = item.caption || item.alt_text || "Sin descripciÃ³n";
      body.appendChild(title);

      const meta = document.createElement("p");
      meta.className = "admin-meta";
      meta.textContent = `${item.media_type} | orden ${item.sort_order ?? "-"}`;
      body.appendChild(meta);

      const titleRow = document.createElement("div");
      titleRow.className = "admin-title-row";

      const titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.maxLength = 180;
      titleInput.className = "admin-title-input";
      titleInput.placeholder = "Titulo visible en servicios";
      titleInput.value = item.caption || "";
      titleRow.appendChild(titleInput);

      const titleSaveBtn = document.createElement("button");
      titleSaveBtn.type = "button";
      titleSaveBtn.className = "btn btn-alt admin-title-save";
      titleSaveBtn.textContent = "Guardar titulo";
      titleRow.appendChild(titleSaveBtn);

      body.appendChild(titleRow);

      const controls = document.createElement("div");
      controls.className = "admin-controls";

      const featuredLabel = document.createElement("label");
      featuredLabel.className = "admin-check";
      const featuredInput = document.createElement("input");
      featuredInput.type = "checkbox";
      featuredInput.checked = Boolean(item.featured_home);
      featuredLabel.appendChild(featuredInput);
      featuredLabel.append(" Destacar inicio");
      controls.appendChild(featuredLabel);

      const rankInput = document.createElement("input");
      rankInput.type = "number";
      rankInput.min = "1";
      rankInput.max = "3";
      rankInput.value = item.home_rank || "";
      rankInput.placeholder = "Rango 1-3";
      rankInput.className = "admin-rank-input";
      controls.appendChild(rankInput);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-alt admin-danger";
      deleteBtn.textContent = "Mover a papelera";
      controls.appendChild(deleteBtn);

      body.appendChild(controls);
      card.appendChild(body);
      adminGalleryList.appendChild(card);

      wireDragAndDrop(card, item);

      featuredInput.addEventListener("change", async () => {
        try {
          await setFeatured(item, featuredInput.checked);
          await loadGallery();
          setMessage(adminMessage, "Destacado actualizado.", "success");
        } catch (err) {
          featuredInput.checked = !featuredInput.checked;
          setMessage(
            adminMessage,
            publicErrorMessage(err, "No se pudo actualizar destacado."),
            "error"
          );
        }
      });

      rankInput.addEventListener("change", async () => {
        if (!rankInput.value) return;
        try {
          await setHomeRank(item, rankInput.value);
          await loadGallery();
          setMessage(adminMessage, "Rank de inicio guardado.", "success");
        } catch (err) {
          setMessage(adminMessage, publicErrorMessage(err, "No se pudo guardar el rango."), "error");
        }
      });

      deleteBtn.addEventListener("click", async () => {
        try {
          await softDeleteItem(item);
          await refreshAll();
          setMessage(adminMessage, "Elemento enviado a papelera.", "success");
        } catch (err) {
          setMessage(
            adminMessage,
            publicErrorMessage(err, "No se pudo mover a papelera."),
            "error"
          );
        }
      });

      const saveTitle = async () => {
        try {
          await updateCaption(item, titleInput.value);
          title.textContent = item.caption || item.alt_text || "Sin descripcion";
          setMessage(adminMessage, "Titulo guardado.", "success");
        } catch (err) {
          setMessage(adminMessage, publicErrorMessage(err, "No se pudo guardar el titulo."), "error");
        }
      };

      titleSaveBtn.addEventListener("click", saveTitle);
      titleInput.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        await saveTitle();
      });
    });
  }

  function renderTrash() {
    adminTrashList.innerHTML = "";
    if (state.trashItems.length === 0) {
      adminTrashList.appendChild(statusCard("Papelera vacÃ­a."));
      return;
    }

    state.trashItems.forEach((item) => {
      const card = document.createElement("article");
      card.className = "admin-media-card";

      const media = mediaPreview(item);
      media.classList.add("admin-preview");
      card.appendChild(media);

      const body = document.createElement("div");
      body.className = "admin-media-body";

      const title = document.createElement("h4");
      title.textContent = item.caption || item.alt_text || "Sin descripciÃ³n";
      body.appendChild(title);

      const controls = document.createElement("div");
      controls.className = "admin-controls";

      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "btn";
      restoreBtn.textContent = "Restaurar";
      controls.appendChild(restoreBtn);

      const destroyBtn = document.createElement("button");
      destroyBtn.type = "button";
      destroyBtn.className = "btn btn-alt admin-danger";
      destroyBtn.textContent = "Borrar permanente";
      controls.appendChild(destroyBtn);

      body.appendChild(controls);
      card.appendChild(body);
      adminTrashList.appendChild(card);

      restoreBtn.addEventListener("click", async () => {
        try {
          await restoreItem(item);
          await refreshAll();
          setMessage(adminMessage, "Elemento restaurado.", "success");
        } catch (err) {
          setMessage(adminMessage, publicErrorMessage(err, "No se pudo restaurar."), "error");
        }
      });

      destroyBtn.addEventListener("click", async () => {
        const ok = window.confirm("Esta acciÃ³n borra definitivamente el archivo. Â¿Continuar?");
        if (!ok) return;
        try {
          await permanentlyDeleteItem(item);
          await refreshAll();
          setMessage(adminMessage, "Elemento eliminado permanentemente.", "success");
        } catch (err) {
          setMessage(
            adminMessage,
            publicErrorMessage(err, "No se pudo borrar permanentemente."),
            "error"
          );
        }
      });
    });
  }

  async function getNextSortOrder() {
    const { data, error } = await client()
      .from("gallery_items")
      .select("sort_order")
      .eq("is_deleted", false)
      .order("sort_order", { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) throw error;
    const max = data && data[0] ? Number(data[0].sort_order || 0) : 0;
    return max + 10;
  }

  async function uploadFile(payload) {
    const file = payload.file;
    const mime = String(file.type || "").toLowerCase();
    const isVideo = allowedVideoMimes.has(mime);
    const isImage = allowedImageMimes.has(mime);
    if (!isVideo && !isImage) {
      throw new Error("Formato no permitido. Usa JPG/PNG/WEBP/GIF o MP4/WEBM/MOV.");
    }
    const mediaType = isVideo ? "video" : "image";
    const sizeLimit = mediaType === "video" ? 60 * 1024 * 1024 : 10 * 1024 * 1024;

    if (file.size > sizeLimit) {
      throw new Error(
        mediaType === "video"
          ? "El video supera 60MB."
          : "La imagen supera 10MB."
      );
    }

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const extMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
    };
    const ext = extMap[mime] || "bin";
    const randomPart = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const safeName = sanitizeFileName(`${randomPart}.${ext}`);
    const filePath = `public/${yyyy}/${mm}/${safeName}`;

    const { error: uploadError } = await client()
      .storage.from(window.AppSupabase.bucketName())
      .upload(filePath, file, { upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = client()
      .storage.from(window.AppSupabase.bucketName())
      .getPublicUrl(filePath);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error("No se pudo obtener URL pÃºblica del archivo.");

    const sortOrder = await getNextSortOrder();
    const insertPayload = {
      media_type: mediaType,
      storage_path: filePath,
      public_url: publicUrl,
      alt_text: payload.alt_text || null,
      caption: payload.caption || null,
      sort_order: sortOrder,
      featured_home: false,
      home_rank: null,
      is_deleted: false,
    };

    const { error: insertError } = await client().from("gallery_items").insert(insertPayload);
    if (insertError) throw insertError;
  }

  async function showDashboardForUser(user) {
    try {
      await requireAdmin(user);
    } catch (err) {
      authSection.classList.remove("hidden");
      dashboardSection.classList.add("hidden");
      setMessage(authMessage, err?.message || "No se pudo abrir el panel admin.", "error");
      return false;
    }

    authSection.classList.add("hidden");
    dashboardSection.classList.remove("hidden");
    setMessage(authMessage, "", "");

    try {
      await refreshAll();
      setFilterActive();
      setMessage(adminMessage, "", "");
    } catch (err) {
      setMessage(
        adminMessage,
        publicErrorMessage(err, "Sesion iniciada, pero no se pudo cargar la galeria."),
        "error"
      );
    }

    return true;
  }

  async function initAuth() {
    if (!isConfigured()) {
      setMessage(
        authMessage,
        "Configura supabase-config.js con URL y ANON KEY para usar el panel admin.",
        "error"
      );
      if (loginForm) loginForm.querySelector("button[type='submit']").disabled = true;
      return;
    }

    const { data: sessionData } = await client().auth.getSession();
    const user = sessionData?.session?.user || null;
    if (user) {
      await showDashboardForUser(user);
    }

    client().auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user || null;
      if (!currentUser) {
        authSection.classList.remove("hidden");
        dashboardSection.classList.add("hidden");
        return;
      }
      await showDashboardForUser(currentUser);
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!isConfigured()) return;

      const formData = new FormData(loginForm);
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");

      setMessage(authMessage, "Ingresando...", "");
      const { data, error } = await client().auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(
          authMessage,
          "No se pudo iniciar sesiÃ³n. Verifica credenciales.",
          "error"
        );
        return;
      }

      if (!data?.user) {
        setMessage(authMessage, "No se pudo validar el usuario autenticado.", "error");
        return;
      }

      const openedDashboard = await showDashboardForUser(data.user);
      if (openedDashboard) {
        setMessage(adminMessage, "Sesion iniciada.", "success");
        loginForm.reset();
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await client().auth.signOut();
      setMessage(authMessage, "SesiÃ³n cerrada.", "success");
    });
  }

  if (uploadForm) {
    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const formData = new FormData(uploadForm);
        const file = formData.get("file");
        if (!(file instanceof File) || !file.size) {
          throw new Error("Selecciona un archivo vÃ¡lido.");
        }

        await uploadFile({
          file,
          alt_text: String(formData.get("alt_text") || "").trim(),
          caption: String(formData.get("caption") || "").trim(),
        });

        uploadForm.reset();
        await refreshAll();
        setMessage(adminMessage, "Archivo subido correctamente.", "success");
      } catch (err) {
        setMessage(adminMessage, publicErrorMessage(err, "No se pudo subir el archivo."), "error");
      }
    });
  }

  if (saveHomeModeBtn) {
    saveHomeModeBtn.addEventListener("click", async () => {
      try {
        const mode = homeModeSelect.value === "manual" ? "manual" : "auto";
        const { error } = await client()
          .from("app_settings")
          .upsert({ id: 1, home_mode: mode }, { onConflict: "id" });
        if (error) throw error;
        setMessage(adminMessage, "Modo de inicio actualizado.", "success");
      } catch (err) {
        setMessage(adminMessage, publicErrorMessage(err, "No se pudo actualizar modo."), "error");
      }
    });
  }

  document.querySelectorAll("[data-admin-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.order = btn.dataset.adminOrder || "manual";
      setFilterActive();
      try {
        await loadGallery();
      } catch (err) {
        setMessage(adminMessage, publicErrorMessage(err, "No se pudo cargar la galerÃ­a."), "error");
      }
    });
  });

  initAuth();
})();


