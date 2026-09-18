import { useState } from "react";
import "./App.css";
import DependencyGraph from "./components/DependencyGraph";

function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError("");
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a ZIP file first.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Only ZIP files are allowed.");
      return;
    }

    const formData = new FormData();
    formData.append("project", file);

    try {
      setLoading(true);
      setError("");

      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Upload failed.");
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <h1>Project Dependency Analyzer</h1>

        <p>
          Upload a project ZIP file and visualize how the files in your
          project depend on each other.
        </p>

        <input
          type="file"
          accept=".zip"
          onChange={handleFileChange}
        />

        <button onClick={handleUpload} disabled={loading}>
          {loading ? "Analyzing..." : "Upload Project"}
        </button>

        {file && <p>Selected: {file.name}</p>}

        {error && <p>{error}</p>}

        {result && (
          <div>
            <h2>Analysis Complete</h2>
            <p>Project ID: {result.projectId}</p>
            <p>Files found: {result.files?.length}</p>
            <DependencyGraph dependencies={result.dependencies} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;