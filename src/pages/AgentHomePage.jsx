import React, { useState } from "react";
import AgentSidebar from "../components/AgentSidebar";
import AgentTopbar from "../components/AgentTopbar";
import AgentStatusCards from "../components/AgentStatusCards";
import AgentHeroBanner from "../components/AgentHeroBanner";
import AgentWidgets from "../components/AgentWidgets";

function AgentHomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen flex flex-row bg-gray-50 overflow-hidden">
      <AgentSidebar open={sidebarOpen} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AgentTopbar onMenuClick={() => setSidebarOpen((o) => !o)} />

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="relative isolate min-h-full pb-6 md:pb-8">
            <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10" aria-hidden>
              <div className="absolute -top-28 -right-20 w-[22rem] h-[22rem] bg-sky-400/30 motion-page-blob" />
              <div className="absolute top-1/3 -left-24 w-[18rem] h-[18rem] bg-blue-400/20 motion-page-blob motion-page-blob--b" />
              <div
                className="absolute -bottom-32 right-1/4 w-[16rem] h-[16rem] bg-cyan-300/20 motion-page-blob"
                style={{ animationDelay: "-2s" }}
              />
            </div>

            <div className="relative z-0 mx-auto flex max-w-[1800px] flex-col gap-6 p-4 md:gap-8 md:p-6 lg:p-8 xl:gap-10">
              <AgentStatusCards />
              <AgentHeroBanner />
              <AgentWidgets />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentHomePage;
