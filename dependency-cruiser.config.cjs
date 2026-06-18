/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-must-not-import-adapters-or-agents",
      severity: "error",
      from: { path: "^src/core" },
      to: { path: "^src/(adapters|agents|tools|services)" }
    },
    {
      name: "runtime-must-not-import-datagen",
      severity: "error",
      from: { path: "^src" },
      to: { path: "^datagen" }
    }
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "node", "default"]
    }
  }
};
