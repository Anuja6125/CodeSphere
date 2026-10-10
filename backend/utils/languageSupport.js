// Which files the dependency graph covers, and what language each one is.
// Shared by the file scanner and the dependency analyzer.
const path = require("path");

// extension (lowercase, with dot) -> { language, category }
const EXTENSIONS = {
    // JavaScript / TypeScript family
    ".js": ["JavaScript", "source"],
    ".jsx": ["JavaScript", "source"],
    ".mjs": ["JavaScript", "source"],
    ".cjs": ["JavaScript", "source"],
    ".ts": ["TypeScript", "source"],
    ".tsx": ["TypeScript", "source"],
    ".mts": ["TypeScript", "source"],
    ".cts": ["TypeScript", "source"],
    ".vue": ["Vue", "source"],
    ".svelte": ["Svelte", "source"],

    // Python
    ".py": ["Python", "source"],
    ".pyi": ["Python", "source"],

    // JVM
    ".java": ["Java", "source"],
    ".kt": ["Kotlin", "source"],
    ".kts": ["Kotlin", "source"],
    ".scala": ["Scala", "source"],
    ".groovy": ["Groovy", "source"],

    // C family
    ".c": ["C", "source"],
    ".h": ["C", "source"], // re-labelled C++ when the project contains C++ sources
    ".cc": ["C++", "source"],
    ".cpp": ["C++", "source"],
    ".cxx": ["C++", "source"],
    ".c++": ["C++", "source"],
    ".hpp": ["C++", "source"],
    ".hh": ["C++", "source"],
    ".hxx": ["C++", "source"],
    ".h++": ["C++", "source"],
    ".inl": ["C++", "source"],
    ".ipp": ["C++", "source"],
    ".cs": ["C#", "source"],
    ".m": ["Objective-C", "source"],
    ".mm": ["Objective-C", "source"],

    // Other languages
    ".go": ["Go", "source"],
    ".php": ["PHP", "source"],
    ".rb": ["Ruby", "source"],
    ".rake": ["Ruby", "source"],
    ".rs": ["Rust", "source"],
    ".swift": ["Swift", "source"],
    ".dart": ["Dart", "source"],
    ".lua": ["Lua", "source"],
    ".r": ["R", "source"],
    ".pl": ["Perl", "source"],
    ".pm": ["Perl", "source"],
    ".ex": ["Elixir", "source"],
    ".exs": ["Elixir", "source"],
    ".erl": ["Erlang", "source"],
    ".hs": ["Haskell", "source"],
    ".fs": ["F#", "source"],
    ".clj": ["Clojure", "source"],
    ".sh": ["Shell", "source"],
    ".bash": ["Shell", "source"],
    ".zsh": ["Shell", "source"],
    ".ps1": ["PowerShell", "source"],
    ".sql": ["SQL", "source"],
    ".prisma": ["Prisma", "config"],
    ".graphql": ["GraphQL", "source"],
    ".gql": ["GraphQL", "source"],
    ".proto": ["Protobuf", "source"],

    // Web markup and styles
    ".html": ["HTML", "markup"],
    ".htm": ["HTML", "markup"],
    ".css": ["CSS", "style"],
    ".scss": ["SCSS", "style"],
    ".sass": ["SCSS", "style"],
    ".less": ["Less", "style"],

    // Build / project configuration identified by extension
    ".cmake": ["CMake", "config"],
    ".csproj": ["MSBuild", "config"],
    ".fsproj": ["MSBuild", "config"],
    ".vbproj": ["MSBuild", "config"],
    ".sln": ["MSBuild", "config"],
    ".gradle": ["Gradle", "config"]
};

// Exact (lowercase) file names that are relevant project configuration.
const CONFIG_FILE_NAMES = {
    "package.json": "JSON",
    "tsconfig.json": "JSON",
    "jsconfig.json": "JSON",
    "composer.json": "JSON",
    "pom.xml": "Maven",
    "build.gradle.kts": "Gradle",
    "settings.gradle.kts": "Gradle",
    "go.mod": "Go Module",
    "cargo.toml": "Cargo",
    "cmakelists.txt": "CMake",
    "makefile": "Make",
    "dockerfile": "Docker",
    "docker-compose.yml": "YAML",
    "docker-compose.yaml": "YAML",
    "requirements.txt": "Python Config",
    "pyproject.toml": "Python Config",
    "setup.cfg": "Python Config",
    "pipfile": "Python Config",
    "gemfile": "Ruby",
    "rakefile": "Ruby",
    "pubspec.yaml": "YAML"
};

// tsconfig.app.json, tsconfig.base.json, ...
const CONFIG_FILE_PATTERNS = [
    { test: /^tsconfig\..+\.json$/, language: "JSON" }
];

// Directories that never contain hand-written project source.
const IGNORED_DIRECTORIES = new Set([
    "node_modules", "bower_components", "jspm_packages",
    ".git", ".svn", ".hg", "__MACOSX",
    "dist", "build", "out", "target", "obj", "coverage", ".nyc_output",
    ".next", ".nuxt", ".svelte-kit", ".output", ".turbo", ".cache", ".parcel-cache", ".vercel", ".angular",
    "__pycache__", ".venv", "venv", ".tox", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".eggs",
    "vendor", "Pods", "DerivedData", ".gradle", ".dart_tool",
    ".idea", ".vscode", ".vs"
]);

// File name patterns for generated or minified output.
const GENERATED_FILE_PATTERNS = [
    /\.min\.(js|css|mjs)$/i,
    /\.bundle\.(js|css)$/i,
    /[.-]chunk\.[\w]+\.js$/i,
    /\.g\.cs$/i,
    /\.g\.i\.cs$/i,
    /\.designer\.cs$/i,
    /\.pb\.go$/i,
    /_pb2(_grpc)?\.py$/i,
    /\.generated\.\w+$/i,
    /^assemblyinfo\.cs$/i
];

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // larger text files are almost always generated

const isIgnoredDirectory = (name) => {
    return IGNORED_DIRECTORIES.has(name) || name.endsWith(".egg-info");
};

const isGeneratedFile = (fileName) => {
    return GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
};

/** Returns { language, category } for a project-relative path, or null when the graph should skip it. */
const classifyFile = (filePath) => {
    const name = path.posix.basename(filePath).toLowerCase();

    if (CONFIG_FILE_NAMES[name]) {
        return { language: CONFIG_FILE_NAMES[name], category: "config" };
    }

    for (const pattern of CONFIG_FILE_PATTERNS) {
        if (pattern.test.test(name)) {
            return { language: pattern.language, category: "config" };
        }
    }

    // ".d.ts" is TypeScript; path.extname gives ".ts" already.
    const extension = path.posix.extname(name);
    const entry = EXTENSIONS[extension];

    if (entry) {
        return { language: entry[0], category: entry[1] };
    }

    return null;
};

const isSupportedFile = (filePath) => classifyFile(filePath) !== null;

const detectLanguage = (filePath, options = {}) => {
    const info = classifyFile(filePath);
    if (!info) return null;
    // Bare .h headers are C++ when the project already has C++ sources.
    if (
        info.language === "C" &&
        options.cppProject &&
        path.posix.extname(filePath).toLowerCase() === ".h"
    ) {
        return "C++";
    }
    return info.language;
};

const projectHasCpp = (files) =>
    files.some((file) => {
        const info = classifyFile(file);
        return info && info.language === "C++";
    });

module.exports = {
    IGNORED_DIRECTORIES,
    MAX_FILE_SIZE_BYTES,
    classifyFile,
    detectLanguage,
    isGeneratedFile,
    isIgnoredDirectory,
    isSupportedFile,
    projectHasCpp
};
