import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Settings, FileText, Menu } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mb-1 ${
      isActive
        ? "bg-blue-600 text-white shadow-lg"
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    }`;

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col shadow-2xl z-10">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-xl">
            A
          </div>
          <span className="text-lg font-bold tracking-tight">AutoStory</span>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <NavLink to="/" className={navClass}>
            <LayoutDashboard size={20} />
            Dashboard
          </NavLink>
          <NavLink to="/feeds" className={navClass}>
            <FileText size={20} />
            Material / RSS
          </NavLink>
          <NavLink to="/posts" className={navClass}>
            <FileText size={20} />
            Post List
          </NavLink>
          <NavLink to="/templates" className={navClass}>
            <LayoutDashboard size={20} />
            Templates
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            <Settings size={20} />
            Settings
          </NavLink>
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-600 text-center">
          v1.0.0 | React + Gemini
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">{children}</main>
    </div>
  );
};

export default Layout;
