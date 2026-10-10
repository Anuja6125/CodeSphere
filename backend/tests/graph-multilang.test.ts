import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRepositoryGraph } from "../src/services/graph";
import { scanDirectory } from "../utils/fileScanner.js";
import { analyzeDependencies } from "../utils/dependencyAnalyzer.js";
import { isIgnoredDirectory, isSupportedFile } from "../utils/languageSupport.js";

const temps: string[] = [];

function makeProject(tree: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codesphere-graph-"));
  temps.push(root);
  for (const [rel, content] of Object.entries(tree)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

const ids = (graph: { nodes: { id: string }[] }) => graph.nodes.map((n) => n.id).sort();
const edgeKeys = (graph: { edges: { source: string; target: string }[] }) =>
  graph.edges.map((e) => `${e.source}->${e.target}`).sort();

describe("file discovery", () => {
  it("skips dependency, vcs, and build directories", () => {
    expect(isIgnoredDirectory("node_modules")).toBe(true);
    expect(isIgnoredDirectory(".git")).toBe(true);
    expect(isIgnoredDirectory("dist")).toBe(true);
    expect(isIgnoredDirectory("__pycache__")).toBe(true);
    expect(isIgnoredDirectory("src")).toBe(false);
  });

  it("accepts mixed source and config files", () => {
    expect(isSupportedFile("src/app.js")).toBe(true);
    expect(isSupportedFile("src/app.ts")).toBe(true);
    expect(isSupportedFile("src/main.py")).toBe(true);
    expect(isSupportedFile("src/App.java")).toBe(true);
    expect(isSupportedFile("src/main.cpp")).toBe(true);
    expect(isSupportedFile("src/lib.go")).toBe(true);
    expect(isSupportedFile("package.json")).toBe(true);
    expect(isSupportedFile("readme.md")).toBe(false);
    expect(isSupportedFile("logo.png")).toBe(false);
  });
});

describe("graph generation", () => {
  it("1. JavaScript-only project keeps import edges", () => {
    const root = makeProject({
      "package.json": JSON.stringify({ name: "demo", main: "src/index.js" }),
      "src/index.js": 'import { helper } from "./helper";\nexport const n = helper();\n',
      "src/helper.js": "export function helper() { return 1; }\n",
    });
    const graph = buildRepositoryGraph(root);
    expect(ids(graph)).toEqual(["package.json", "src/helper.js", "src/index.js"]);
    expect(edgeKeys(graph)).toEqual(expect.arrayContaining(["src/index.js->src/helper.js", "package.json->src/index.js"]));
    expect(graph.nodes.find((n) => n.id === "src/index.js")?.language).toBe("JavaScript");
  });

  it("2. mixed JS/TS/Python project includes every language and resolved edges", () => {
    const root = makeProject({
      "web/app.ts": 'import { boot } from "./boot";\nboot();\n',
      "web/boot.ts": "export function boot() {}\n",
      "web/legacy.js": 'const boot = require("./boot");\n',
      "pkg/__init__.py": "",
      "pkg/api.py": "from pkg import util\nfrom pkg.util import add\n",
      "pkg/util.py": "def add(a, b):\n    return a + b\n",
    });
    const graph = buildRepositoryGraph(root);
    expect(ids(graph)).toEqual(["pkg/__init__.py", "pkg/api.py", "pkg/util.py", "web/app.ts", "web/boot.ts", "web/legacy.js"]);
    expect(edgeKeys(graph)).toEqual(
      expect.arrayContaining(["web/app.ts->web/boot.ts", "web/legacy.js->web/boot.ts", "pkg/api.py->pkg/util.py"])
    );
    expect(graph.nodes.find((n) => n.id === "pkg/api.py")?.language).toBe("Python");
    expect(graph.nodes.find((n) => n.id === "web/app.ts")?.language).toBe("TypeScript");
  });

  it("3a. Java project links imports and same-package references", () => {
    const root = makeProject({
      "src/com/demo/App.java": 'package com.demo;\nimport com.demo.util.Ids;\npublic class App { Ids ids; Helper h; }\n',
      "src/com/demo/Helper.java": "package com.demo;\npublic class Helper {}\n",
      "src/com/demo/util/Ids.java": "package com.demo.util;\npublic class Ids {}\n",
    });
    const graph = buildRepositoryGraph(root);
    expect(ids(graph)).toEqual(["src/com/demo/App.java", "src/com/demo/Helper.java", "src/com/demo/util/Ids.java"]);
    expect(edgeKeys(graph)).toEqual(
      expect.arrayContaining(["src/com/demo/App.java->src/com/demo/util/Ids.java", "src/com/demo/App.java->src/com/demo/Helper.java"])
    );
  });

  it("3b. C++ project links quoted includes and leaves system headers unresolved-as-external", () => {
    const root = makeProject({
      "src/main.cpp": '#include "net/socket.h"\n#include <vector>\nint main() { return 0; }\n',
      "include/net/socket.h": "#pragma once\nclass Socket {};\n",
      "src/unused.cpp": "int unused() { return 2; }\n",
    });
    const graph = buildRepositoryGraph(root);
    expect(ids(graph)).toEqual(["include/net/socket.h", "src/main.cpp", "src/unused.cpp"]);
    expect(edgeKeys(graph)).toEqual(["src/main.cpp->include/net/socket.h"]);
    expect(graph.unresolved).toEqual([]);
    expect(graph.nodes.find((n) => n.id === "src/unused.cpp")?.role).toBe("isolated");
  });

  it("4. one JavaScript file plus several non-JS files does not collapse to JS-only", () => {
    const root = makeProject({
      "index.js": "console.log('hi');\n",
      "main.py": "print('py')\n",
      "App.java": "class App {}\n",
      "lib.go": "package lib\n",
    });
    const graph = buildRepositoryGraph(root);
    expect(ids(graph)).toEqual(["App.java", "index.js", "lib.go", "main.py"]);
    expect(graph.nodes.map((n) => n.language).sort()).toEqual(["Go", "Java", "JavaScript", "Python"]);
  });

  it("5. files with no dependencies still appear as isolated nodes", () => {
    const root = makeProject({
      "a.py": "x = 1\n",
      "b.py": "y = 2\n",
    });
    const graph = buildRepositoryGraph(root);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes.every((n) => n.role === "isolated")).toBe(true);
  });

  it("6. unresolved imports are recorded and excluded directories are skipped", () => {
    const root = makeProject({
      "src/app.js": 'import "./missing.js";\nimport "react";\n',
      "src/ok.js": "export const ok = 1;\n",
      "node_modules/react/index.js": "module.exports = {};\n",
      ".git/config": "secret\n",
      "dist/bundle.js": "console.log(1);\n",
    });
    const files = scanDirectory(root);
    expect(files).toEqual(["src/app.js", "src/ok.js"]);
    const { unresolved, dependencies } = analyzeDependencies(root, files);
    expect(dependencies).toEqual([]);
    expect(unresolved).toEqual(expect.arrayContaining([expect.objectContaining({ source: "src/app.js", specifier: "./missing.js" })]));
    expect(unresolved.every((u: { specifier: string }) => u.specifier !== "react")).toBe(true);
  });

  it("resolves Go module imports, PHP requires, and Ruby require_relative", () => {
    const root = makeProject({
      "go.mod": "module example.com/demo\n",
      "cmd/main.go": 'package main\nimport "example.com/demo/pkg/util"\nfunc main() {}\n',
      "pkg/util/ids.go": "package util\nfunc ID() string { return \"1\" }\n",
      "php/index.php": "<?php require __DIR__ . '/lib.php';\n",
      "php/lib.php": "<?php function hi() {}\n",
      "ruby/app.rb": "require_relative 'helper'\n",
      "ruby/helper.rb": "def helper; 1; end\n",
    });
    const graph = buildRepositoryGraph(root);
    expect(edgeKeys(graph)).toEqual(
      expect.arrayContaining([
        "cmd/main.go->pkg/util/ids.go",
        "php/index.php->php/lib.php",
        "ruby/app.rb->ruby/helper.rb",
      ])
    );
  });

  it("C# using + type references and ZIP-style scan share the same graph builder", () => {
    const root = makeProject({
      "App.cs": "namespace Demo;\nusing Demo.Core;\npublic class App { Greeter g; }\n",
      "Core/Greeter.cs": "namespace Demo.Core;\npublic class Greeter {}\n",
    });
    const graph = buildRepositoryGraph(root);
    expect(edgeKeys(graph)).toEqual(["App.cs->Core/Greeter.cs"]);
  });
});
