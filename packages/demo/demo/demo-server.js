#!/usr/bin/env node

import express from "express";
import path from "path";
import fs from "fs";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "../swagger.config.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { exec } from "child_process";
import { createRequire } from "module";

// ES module equivalents for __dirname and require
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Package paths
const CORE_DOCS_DIR = path.join(__dirname, "..", "..", "core", "docs");
const CORE_DIST_DIR = path.join(__dirname, "..", "..", "core", "dist");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Import API routes
import apiRoutes from "./api-routes.js";

// Swagger UI setup
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "BTC Locker API Documentation",
    customfavIcon: "/favicon.ico",
    swaggerOptions: {
      explorer: true,
      displayOperationId: false,
      displayRequestDuration: true,
      defaultModelRendering: "model",
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
    },
  })
);

// Serve Swagger JSON spec
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// API routes
app.use("/api", apiRoutes);

// Serve static files from the demo directory
app.use(express.static(__dirname));

// Serve the built bundle from packages/core/dist
app.use("/dist", express.static(CORE_DIST_DIR));

// Serve WASM files with correct MIME type and better error handling
app.use("/dist", (req, res, next) => {
  if (req.path.endsWith(".wasm")) {
    res.set("Content-Type", "application/wasm");
  }
  next();
});

// Also serve WASM files from the demo directory root for relative paths
app.use((req, res, next) => {
  if (req.path.endsWith(".wasm")) {
    const wasmPath = path.join(
      CORE_DIST_DIR,
      path.basename(req.path)
    );
    if (fs.existsSync(wasmPath)) {
      res.set("Content-Type", "application/wasm");
      res.sendFile(wasmPath);
      return;
    }
  }
  next();
});

// CORS for browser testing
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});

// Serve the main demo page
app.get("/", (req, res) => {
  const homePath = path.join(__dirname, "home.html");

  if (fs.existsSync(homePath)) {
    res.sendFile(homePath);
  } else {
    res.status(404).json({
      error: "Home page not found",
      path: "demo/home.html",
    });
  }
});

// Serve the bundle file
app.get("/btc-locker.js", (req, res) => {
  const bundlePath = path.join(__dirname, "..", "dist", "btc-locker.bundle.js");
  if (fs.existsSync(bundlePath)) {
    res.sendFile(bundlePath);
  } else {
    res
      .status(404)
      .json({ error: "Bundle not found. Run npm run build first." });
  }
});

// Simple API endpoint to get bundle status
app.get("/api/bundle-info", (req, res) => {
  const bundlePath = path.join(__dirname, "..", "dist", "btc-locker.bundle.js");
  const exists = fs.existsSync(bundlePath);

  let stats = null;
  if (exists) {
    try {
      stats = fs.statSync(bundlePath);
    } catch (err) {
      // Ignore stat errors
    }
  }

  res.json({
    success: true,
    data: {
      bundleExists: exists,
      bundlePath: "/dist/btc-locker.bundle.js",
      bundleSize: stats ? stats.size : null,
      lastModified: stats ? stats.mtime : null,
    },
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
  );
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: packageJson.version,
  });
});

// Serve the main demo page
app.get("/test-bundle", (req, res) => {
  res.sendFile(path.join(__dirname, "test-bundle.html"));
});

// Serve example files
app.get("/examples/:filename", (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, "examples", filename);

  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).json({ error: "Example file not found" });
  }
});

// Serve CLI documentation
app.get("/cli", (req, res) => {
  const cliMdPath = path.join(__dirname, "..", "..", "..", "CLI.md");

  if (fs.existsSync(cliMdPath)) {
    const content = fs.readFileSync(cliMdPath, "utf8");
    res.set("Content-Type", "text/plain");
    res.send(content);
  } else {
    res.status(404).json({ error: "CLI documentation not found" });
  }
});

// Serve API documentation index (specific handler for the root docs page)
app.get("/docs/", (req, res) => {
  const docsPath = path.join(CORE_DOCS_DIR, "index.html");

  if (fs.existsSync(docsPath)) {
    // Read the file and inject base href if not present
    let content = fs.readFileSync(docsPath, "utf8");
    if (!content.includes('<base href="/docs/">')) {
      content = content.replace("<head>", '<head>\n    <base href="/docs/">');
    }
    res.send(content);
  } else {
    // Try to generate docs automatically
    exec(
      "npm run docs",
      { cwd: path.join(__dirname, "..", "..", "core") },
      (error, stdout, stderr) => {
        if (error) {
          res.status(404).json({
            error: "API documentation not found and could not be generated.",
            message: "Run 'npm run docs' manually to generate documentation.",
            details: error.message,
          });
        } else {
          // Check again if docs were created
          if (fs.existsSync(docsPath)) {
            let content = fs.readFileSync(docsPath, "utf8");
            if (!content.includes('<base href="/docs/">')) {
              content = content.replace(
                "<head>",
                '<head>\n    <base href="/docs/">'
              );
            }
            res.send(content);
          } else {
            res.status(500).json({
              error: "Documentation generation completed but files not found.",
              stdout: stdout,
              stderr: stderr,
            });
          }
        }
      }
    );
  }
});

// Redirect /docs to /docs/ to ensure proper static file serving
app.get("/docs", (req, res) => {
  res.redirect("/docs/");
});

// Serve docs static assets (for CSS, JS, images, etc.)
app.use("/docs", express.static(CORE_DOCS_DIR));

// Middleware to inject base href into HTML files in docs
app.use("/docs", (req, res, next) => {
  // Only process HTML files
  if (req.path.endsWith(".html")) {
    const filePath = path.join(CORE_DOCS_DIR, req.path);

    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, "utf8");
      if (!content.includes('<base href="/docs/">')) {
        content = content.replace("<head>", '<head>\n    <base href="/docs/">');
      }
      res.set("Content-Type", "text/html");
      res.send(content);
      return;
    }
  }
  next();
});

// Error handler
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: error.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
  });
});

// Start server
app.listen(port, () => {
  console.log(`Demo: http://localhost:${port}`);
  console.log(`JS Library Docs: http://localhost:${port}/docs`);
  console.log(`Server API Docs: http://localhost:${port}/api-docs`);
  console.log(`CLI Docs: http://localhost:${port}/cli`);
});

export default app;
