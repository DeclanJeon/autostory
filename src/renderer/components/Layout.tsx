import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Settings,
  FileText,
  Rss,
  Sparkles,
  Layers,
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all mb-2 font-medium ${
      isActive
        ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] translate-x-1"
        : "text-slate-400 hover:bg-slate-800/50 hover:text-white hover:translate-x-1"
    }`;

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-slate-950/50 border-r border-slate-800 flex flex-col backdrop-blur-xl relative z-20">
        <div className="p-8 border-b border-slate-800/50 flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-xl text-white shadow-lg">
            A
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white leading-none">
              AutoStory
            </h1>
            <span className="text-xs text-slate-500 font-medium">
              AI Writer Assistant
            </span>
          </div>
        </div>

        <nav className="flex-1 p-6 overflow-y-auto space-y-1">
          <div className="px-4 mb-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
            Main
          </div>
          <NavLink to="/" className={navClass}>
            <LayoutDashboard size={20} />
            Dashboard
          </NavLink>
          <NavLink to="/feeds" className={navClass}>
            <Rss size={20} />
            Material / RSS
          </NavLink>
          <NavLink to="/posts" className={navClass}>
            <FileText size={20} />
            Post Manager
          </NavLink>

          <div className="px-4 mb-2 mt-6 text-xs font-bold text-slate-600 uppercase tracking-wider">
            Configuration
          </div>
          <NavLink to="/templates" className={navClass}>
            <Sparkles size={20} />
            Templates
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            <Settings size={20} />
            Settings
          </NavLink>
        </nav>

        <div className="p-6 border-t border-slate-800/50">
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-bold text-emerald-400">
                System Ready
              </span>
            </div>
            <div className="text-[10px] text-slate-600">
              v2.0.0 | React + Electron
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
        {children}
      </main>
    </div>
  );
};

export default Layout;
