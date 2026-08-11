import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import ProjectCard from "../components/ProjectCard";
import ThemeToggle from "../components/ThemeToggle";
import { normalizeRole } from "../utils/managerAccess";

function ProjectDashboard() {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState([]);

  const user = JSON.parse(localStorage.getItem("user"));
  const currentRole = normalizeRole(user?.role);
  const canManageProjects = currentRole === "admin";

  const fetchProjects = async () => {
    try {
      const res = await axios.get("/projects/list");
      setProjects(res.data.projects || []);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const createProject = async () => {
    if (!projectName) {
      return alert("Enter project name");
    }

    try {
      const res = await axios.post("/projects/create", {
        project_name: projectName,
      });

      const created = res?.data?.project || null;
      const projectId = created?.id || res?.data?.projectId;
      if (projectId) {
        localStorage.setItem(
          "selectedProject",
          JSON.stringify({
            id: projectId,
            project_name: created?.project_name || projectName,
            name: created?.project_name || projectName,
          })
        );
      }

      setProjectName("");
      fetchProjects();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to create project");
    }
  };

  const toggleProjectHidden = async (project, e) => {
    e?.stopPropagation?.();
    const isHidden = Boolean(project.is_hidden === 1 || project.is_hidden === true);
    const nextHidden = !isHidden;

    try {
      await axios.patch(`/projects/${project.id}/hidden`, { hidden: nextHidden });
      setProjects((prev) =>
        prev.map((p) =>
          Number(p.id) === Number(project.id)
            ? { ...p, is_hidden: nextHidden ? 1 : 0 }
            : p
        )
      );
    } catch (error) {
      alert(error.response?.data?.message || "Failed to update project visibility");
    }
  };

  const isProjectHidden = (project) =>
    Boolean(project?.is_hidden === 1 || project?.is_hidden === true);

  const sortProjects = (list) =>
    [...list].sort((a, b) => {
      const approvedValues = ["approved", "active", "live", "verified"];
      const aApproved =
        a?.whatsappApproved === true || approvedValues.includes(String(a?.status || "").toLowerCase()) ? 1 : 0;
      const bApproved =
        b?.whatsappApproved === true || approvedValues.includes(String(b?.status || "").toLowerCase()) ? 1 : 0;
      if (aApproved !== bApproved) return bApproved - aApproved;
      const aDate = new Date(a?.created_at || a?.createdAt || 0).getTime();
      const bDate = new Date(b?.created_at || b?.createdAt || 0).getTime();
      return bDate - aDate;
    });

  const visibleProjects = sortProjects(projects.filter((p) => !isProjectHidden(p)));
  const hiddenProjects = sortProjects(projects.filter((p) => isProjectHidden(p)));
  const count = visibleProjects.length;
  const hiddenCount = hiddenProjects.length;
  const totalCount = projects.length;

  const openProject = (project) => {
    try {
      localStorage.setItem("selectedProject", JSON.stringify(project));
    } catch (e) {}
    navigate("/admin", { state: { project } });
  };

  const renderProjectRow = (project, { dimmed = false, clickable = true } = {}) => (
    <div
      key={project.id}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : -1}
      aria-disabled={clickable ? undefined : true}
      onClick={clickable ? () => openProject(project) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key !== "Enter") return;
              openProject(project);
            }
          : undefined
      }
      className={`group relative w-full overflow-hidden rounded-2xl border bg-white/95 shadow-md ring-1 transition-all duration-300 focus:outline-none ${
        clickable
          ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          : "cursor-not-allowed pointer-events-none"
      } ${
        dimmed
          ? "border-gray-200/90 opacity-75 shadow-gray-200/20 ring-gray-100/80"
          : "border-gray-100/90 shadow-gray-200/25 ring-gray-100/80 hover:border-sky-200/90 hover:shadow-sky-500/15"
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-90 transition-transform duration-300 ${
          clickable ? "group-hover:scale-x-[1.02]" : ""
        } ${
          dimmed ? "from-gray-400 via-gray-300 to-gray-400" : "from-sky-500 via-sky-400 to-blue-600"
        }`}
        aria-hidden
      />
      <div className={clickable ? undefined : "pointer-events-auto"}>
        <ProjectCard
          project={project}
          clickable={clickable}
          onToggleHidden={
            canManageProjects ? (e) => toggleProjectHidden(project, e) : undefined
          }
        />
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-sky-50 via-white to-sky-100/60">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -right-20 -top-28 h-[24rem] w-[24rem] rounded-full bg-sky-400/25 blur-3xl" />
        <div className="absolute -left-28 top-1/4 h-[20rem] w-[20rem] rounded-full bg-blue-500/12 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-[18rem] w-[18rem] rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 h-[14rem] w-[14rem] rounded-full bg-emerald-300/10 blur-3xl" />
      </div>

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto max-w-[1240px] px-4 py-6 md:px-7 md:py-9 lg:px-10">
        {/* Hero */}
        <header className="motion-enter mb-6 md:mb-8">
          <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/75 px-5 py-5 shadow-lg shadow-sky-200/35 ring-1 ring-sky-100/80 backdrop-blur-sm md:px-7 md:py-6">
            <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-sky-300/25 blur-2xl" aria-hidden />
            <div className="pointer-events-none absolute bottom-0 left-1/3 h-16 w-16 translate-y-5 rounded-full bg-blue-300/20 blur-xl" aria-hidden />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700 shadow-sm ring-1 ring-sky-100/90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" aria-hidden />
                Project workspace
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-[2.35rem]">
                <span className="bg-gradient-to-r from-gray-900 via-sky-800 to-blue-900 bg-clip-text text-transparent">
                  {user?.name || "there"}, your project workspace
                </span>
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-gray-600 md:text-[16px]">
                Switch between projects, spin up a new workspace, and jump into your dashboard in one click.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {user?.role && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-50 to-blue-50 px-3 py-1 text-xs font-semibold capitalize text-sky-900 ring-1 ring-sky-200/70">
                    <svg className="h-3.5 w-3.5 text-sky-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                      <path
                        fillRule="evenodd"
                        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {user.role}
                  </span>
                )}
              </div>
            </div>

            <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:max-w-lg lg:w-auto lg:max-w-none lg:shrink-0">
              <div className="rounded-2xl border border-sky-100/80 bg-gradient-to-br from-white via-white to-sky-50/70 p-4 shadow-md shadow-sky-200/35 ring-1 ring-sky-100/70 md:p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Projects</p>
                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{count}</p>
                <p className="mt-1 text-xs font-medium text-sky-600/90">In your workspace</p>
              </div>
              <div className="rounded-2xl border border-blue-100/90 bg-gradient-to-br from-sky-500/10 via-white to-blue-600/15 p-4 shadow-md shadow-blue-200/30 ring-1 ring-blue-100/70 md:p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800/70">Quick tip</p>
                <p className="mt-1 text-sm font-semibold leading-snug text-gray-800">
                  Click any card to open that project’s dashboard.
                </p>
              </div>
            </div>
          </div>
          </div>
        </header>

        {canManageProjects && (
          <section
            className="motion-enter motion-delay-1 relative mb-8 overflow-hidden rounded-3xl border border-white/75 bg-white/85 shadow-lg shadow-sky-900/[0.08] ring-1 ring-sky-100/80 backdrop-blur-sm md:mb-10"
            aria-labelledby="create-project-heading"
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-600"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -right-12 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-sky-400/10 blur-2xl"
              aria-hidden
            />

            <div className="relative grid gap-7 p-5 md:grid-cols-[1fr_minmax(0,1.15fr)] md:items-center md:gap-8 md:p-7 lg:p-8">
              <div>
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg shadow-sky-600/30 ring-2 ring-white">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h2 id="create-project-heading" className="text-xl font-bold text-gray-900 md:text-2xl">
                  Create a new project
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
                  Name your workspace — you can manage campaigns, inbox, and data per project after you open it.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
                <div className="relative min-w-0 flex-1">
                  <label htmlFor="project-name-input" className="sr-only">
                    Project name
                  </label>
                  <input
                    id="project-name-input"
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createProject();
                    }}
                    placeholder="e.g. Acme Retail — WhatsApp"
                    className="min-h-[48px] w-full rounded-xl border-2 border-sky-100/90 bg-white/95 px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
                  />
                </div>
                <button
                  type="button"
                  onClick={createProject}
                  className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/30 transition-all hover:from-sky-500 hover:to-blue-500 hover:shadow-xl active:scale-[0.98] sm:px-8"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Projects list */}
        <section className="motion-enter motion-delay-2 rounded-3xl border border-white/75 bg-white/65 p-4 shadow-md shadow-sky-100/30 ring-1 ring-sky-100/70 backdrop-blur-sm md:p-5" aria-labelledby="projects-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-sky-100/70 pb-4">
            <div>
              <h2 id="projects-heading" className="text-xl font-bold text-gray-900 md:text-2xl">
                Your projects
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {totalCount === 0
                  ? "Nothing here yet — create one above."
                  : `${count} visible workspace${count !== 1 ? "s" : ""}${hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}`}
              </p>
            </div>
            {totalCount > 0 && (
              <span className="rounded-full border border-sky-100/90 bg-gradient-to-r from-white to-sky-50/80 px-4 py-1.5 text-xs font-bold text-sky-900 shadow-sm ring-1 ring-sky-100/60">
                {count} visible{hiddenCount > 0 ? ` / ${totalCount} total` : ""}
              </span>
            )}
          </div>

          {totalCount === 0 ? (
            <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-sky-200/90 bg-gradient-to-b from-sky-50/60 via-white to-blue-50/30 px-6 py-20 text-center shadow-inner ring-1 ring-sky-100/40 md:py-24">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-200/20 via-transparent to-transparent"
                aria-hidden
              />
              <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-blue-100 text-sky-600 shadow-inner ring-1 ring-sky-200/70">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <p className="relative text-lg font-bold text-gray-900">No projects yet</p>
              <p className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-600">
                Your workspaces will show up here. Add a name and hit <strong className="font-semibold text-sky-800">Create</strong> to
                get started.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
              {visibleProjects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-10 text-center">
                  <p className="text-sm font-semibold text-gray-700">All projects are hidden</p>
                  <p className="mt-1 text-sm text-gray-500">Use Unhide below to show a project again.</p>
                </div>
              ) : (
                visibleProjects.map((project) => renderProjectRow(project))
              )}

              {hiddenCount > 0 && (
                <div className="mt-4 border-t border-gray-100 pt-6">
                  <div className="mb-4">
                    <h3 className="text-base font-bold text-gray-800">Hidden projects</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      These are out of your main list. Click Unhide to bring one back.
                    </p>
                  </div>
                  <div className="flex flex-col gap-4">
                    {hiddenProjects.map((project) => renderProjectRow(project, { dimmed: true, clickable: false }))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default ProjectDashboard;
