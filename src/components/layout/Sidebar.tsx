interface SidebarProps {
  width: number;
}

export function Sidebar({ width }: SidebarProps) {
  return (
    <div
      className="bg-base-100 border-r border-base-300 flex flex-col overflow-hidden"
      style={{ width }}
    >
      {/* Files section */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
            Files
          </h3>
        </div>
        <div className="px-3 py-8 text-center">
          <p className="text-sm text-base-content/40">No vault selected</p>
        </div>
      </div>

      {/* Connections section */}
      <div className="border-t border-base-300">
        <div className="px-3 py-2">
          <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
            Connections
          </h3>
        </div>
        <div className="px-3 py-4 text-center">
          <p className="text-sm text-base-content/40">No connections</p>
        </div>
      </div>
    </div>
  );
}
