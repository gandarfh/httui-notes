export function StatusBar() {
  return (
    <div className="bg-base-100 border-t border-base-300 h-6 flex items-center justify-between px-3 text-xs text-base-content/60 select-none">
      {/* Left */}
      <div className="flex items-center gap-3">
        <span className="badge badge-ghost badge-xs">VS Code</span>
        <span>default</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <span>UTF-8</span>
        <span>Ln 1, Col 1</span>
      </div>
    </div>
  );
}
