const rootDir = import.meta.dirname;

export default {
  schemaVersion: '1',
  project: {
    name: 'm68k-interpreter-panel-workspace',
    rootDir,
    outputDir: '.test-results/test-station-panel-workspace',
    rawDir: '.test-results/test-station-panel-workspace/raw',
  },
  workspaceDiscovery: { provider: 'manual', packages: ['benchmark'] },
  execution: { continueOnError: false, defaultCoverage: false },
  render: { html: true, console: true, defaultView: 'package' },
  suites: [
    {
      id: 'panel-workspace-performance',
      label: 'Panel Workspace Performance',
      adapter: 'shell',
      package: 'benchmark',
      cwd: rootDir,
      command: ['yarn', 'profile:panel-workspace:test-station'],
      resultFormat: 'suite-json-v1',
      module: 'experience',
      theme: 'benchmark',
      coverage: { enabled: false },
    },
  ],
  adapters: [],
};
