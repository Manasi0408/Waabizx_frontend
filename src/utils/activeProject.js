/** Read the currently selected project from browser storage. */
export function readSelectedProject() {
  try {
    const raw = localStorage.getItem("selectedProject");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id != null && String(parsed.id).trim() !== "") {
        return parsed;
      }
    }
  } catch (_) {
    /* ignore */
  }

  try {
    const legacyId = localStorage.getItem("selectedProjectId");
    if (legacyId != null && String(legacyId).trim() !== "") {
      return { id: Number(legacyId) || legacyId };
    }
  } catch (_) {
    /* ignore */
  }

  return null;
}

/** Resolve the active project id from localStorage (selected project, then user profile). */
export function resolveActiveProjectId() {
  const fromSelected = readSelectedProject()?.id;
  if (fromSelected != null && String(fromSelected).trim() !== "") {
    return String(fromSelected).trim();
  }

  try {
    const rawUser = localStorage.getItem("user");
    if (rawUser) {
      const user = JSON.parse(rawUser);
      const fromUser = user?.projectId;
      if (fromUser != null && String(fromUser).trim() !== "") {
        return String(fromUser).trim();
      }
    }
  } catch (_) {
    /* ignore */
  }

  return null;
}

/** Persist the active project for this browser session. */
export function persistSelectedProject(project) {
  if (!project || project.id == null || String(project.id).trim() === "") {
    return null;
  }

  const payload = {
    ...project,
    id: Number(project.id) || project.id,
    project_name: String(project.project_name || project.name || "").trim(),
  };

  try {
    localStorage.setItem("selectedProject", JSON.stringify(payload));
    localStorage.setItem("selectedProjectId", String(payload.id));
    window.dispatchEvent(new CustomEvent("waabiz-project-changed", { detail: payload }));
  } catch (_) {
    /* ignore */
  }

  return payload;
}

/** Persist minimal selectedProject when the user profile has an assigned projectId. */
export function ensureSelectedProjectFromUser() {
  const existing = readSelectedProject();
  if (existing?.id != null) {
    return existing;
  }

  try {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) return null;
    const user = JSON.parse(rawUser);
    const pid = user?.projectId;
    if (pid == null || String(pid).trim() === "") return null;
    return persistSelectedProject({ id: Number(pid) || pid });
  } catch (_) {
    return null;
  }
}

function projectIdsMatch(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim() === String(b).trim();
}

/** Keep selectedProject if still allowed; otherwise pick the first assigned project. */
export function syncSelectedProjectWithAllowed(projects) {
  const list = Array.isArray(projects) ? projects.filter((p) => p?.id != null) : [];
  if (list.length === 0) return readSelectedProject();

  const current = readSelectedProject();
  const currentId = current?.id;

  if (currentId != null && String(currentId).trim() !== "") {
    const match = list.find((p) => projectIdsMatch(p.id, currentId));
    if (match) {
      return persistSelectedProject({
        ...current,
        ...match,
        id: match.id,
        project_name: match.project_name || match.name || current?.project_name || "",
      });
    }
  }

  return persistSelectedProject(list[0]);
}
