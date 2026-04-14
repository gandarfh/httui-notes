function App() {
  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center">
      <div className="card bg-base-100 shadow-xl p-8">
        <h1 className="text-3xl font-bold text-base-content mb-4">Notes</h1>
        <p className="text-base-content/70 mb-6">
          Markdown editor with executable blocks
        </p>
        <div className="flex gap-2">
          <button className="btn btn-primary">Get Started</button>
          <button className="btn btn-ghost">Learn More</button>
        </div>
      </div>
    </div>
  );
}

export default App;
