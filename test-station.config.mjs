const rootDir = import.meta.dirname;

export default {
  schemaVersion: "1",
  project: {
    name: "m68k-interpreter",
    rootDir,
    outputDir: ".test-results/test-station",
    rawDir: ".test-results/test-station/raw"
  },
  workspaceDiscovery: {
    provider: "manual",
    packages: ["quality", "interpreter", "ide", "integration", "browser"]
  },
  execution: {
    continueOnError: true,
    defaultCoverage: false
  },
  enrichers: {
    sourceAnalysis: {
      enabled: true
    }
  },
  render: {
    html: true,
    console: true,
    defaultView: "package",
    includeDetailedAnalysisToggle: true
  },
  suites: [
    {
      id: "workspace-lint",
      label: "Workspace Lint",
      adapter: "shell",
      package: "quality",
      cwd: rootDir,
      command: ["yarn", "lint"],
      module: "tooling",
      theme: "lint",
      coverage: {
        enabled: false
      }
    },
    {
      id: "workspace-type-check",
      label: "Workspace Type Check",
      adapter: "shell",
      package: "quality",
      cwd: rootDir,
      command: ["yarn", "type-check"],
      module: "tooling",
      theme: "types",
      coverage: {
        enabled: false
      }
    },
    {
      id: "workspace-build",
      label: "Workspace Build",
      adapter: "shell",
      package: "quality",
      cwd: rootDir,
      command: ["yarn", "build"],
      module: "tooling",
      theme: "build",
      coverage: {
        enabled: false
      }
    },
    {
      id: "interpreter-unit",
      label: "Interpreter Package Vitest",
      adapter: "vitest",
      package: "interpreter",
      cwd: rootDir,
      command: ["yarn", "vitest", "run", "--config", "packages/interpreter/vitest.config.ts"],
      module: "runtime",
      theme: "interpreter",
      coverage: {
        enabled: true,
        mode: "second-pass"
      }
    },
    {
      id: "ide-unit",
      label: "IDE Package Vitest",
      adapter: "vitest",
      package: "ide",
      cwd: rootDir,
      command: ["yarn", "vitest", "run", "--config", "packages/ide/vitest.config.ts"],
      module: "experience",
      theme: "ide",
      coverage: {
        enabled: true,
        mode: "second-pass"
      }
    },
    {
      id: "workspace-integration",
      label: "Workspace Integration Vitest",
      adapter: "vitest",
      package: "integration",
      cwd: rootDir,
      command: ["yarn", "vitest", "run", "--config", "vitest.config.ts"],
      module: "experience",
      theme: "integration",
      coverage: {
        enabled: true,
        mode: "second-pass"
      }
    },
    {
      id: "browser-e2e",
      label: "Browser E2E Playwright",
      adapter: "shell",
      package: "browser",
      cwd: rootDir,
      command: ["yarn", "test:e2e"],
      module: "experience",
      theme: "browser",
      coverage: {
        enabled: false
      }
    }
  ],
  adapters: []
};
