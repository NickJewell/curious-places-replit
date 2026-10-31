import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    origins.add("http://localhost:8081");
    origins.add("http://127.0.0.1:8081");

    const origin = req.header("origin");

    if (origin && origins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  // Serve admin places page
  const adminPlacesPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin-places.html",
  );
  app.get("/admin/places", (_req: Request, res: Response) => {
    res.sendFile(adminPlacesPath);
  });

  // Serve admin curio editor page
  const adminCurioPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin-curio.html",
  );
  app.get("/admin/curio", (_req: Request, res: Response) => {
    res.sendFile(adminCurioPath);
  });

  // Serve admin extract page for extracting place JSON
  const adminExtractPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin-extract.html",
  );
  app.get("/admin/extract", (_req: Request, res: Response) => {
    res.sendFile(adminExtractPath);
  });

  // Serve admin map page for creating new places
  const adminMapPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin-map.html",
  );
  app.get("/admin/map", (_req: Request, res: Response) => {
    res.sendFile(adminMapPath);
  });

  // Serve admin graph explorer page
  const adminGraphPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin-graph.html",
  );
  app.get("/admin/graph", (_req: Request, res: Response) => {
    res.sendFile(adminGraphPath);
  });

  // Serve map explorer page
  const mapExplorerPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "map-explorer.html",
  );
  app.get("/map", (_req: Request, res: Response) => {
    res.sendFile(mapExplorerPath);
  });
  app.get("/admin/map-explorer", (_req: Request, res: Response) => {
    res.sendFile(mapExplorerPath);
  });

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      const manifestPath = path.resolve(
        process.cwd(),
        "static-build",
        platform,
        "manifest.json",
      );
      if (fs.existsSync(manifestPath)) {
        return serveExpoManifest(platform, res);
      }
      return next();
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupMetroProxy(app: express.Application) {
  const hasStaticBuild = fs.existsSync(
    path.resolve(process.cwd(), "static-build", "ios", "manifest.json"),
  );

  if (hasStaticBuild) return;

  log("Dev mode: proxying Metro bundle requests to http://localhost:8081");

  const METRO_PATHS = [
    "/client",
    "/_expo",
    "/node_modules",
    "/manifest",
    "/symbolicate",
    "/hot",
    "/packager-status",
    "/debugger-ui",
    "/inspector",
    "/open-stack-frame",
    "/reload",
  ];

  const metroProxy = createProxyMiddleware({
    target: "http://localhost:8081",
    changeOrigin: false,
    ws: true,
    pathFilter: (pathname) =>
      METRO_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")),
    on: {
      error: (_err, _req, res) => {
        if (res && "status" in res) {
          (res as Response).status(502).json({
            message:
              "Metro bundler not ready. The dev server may still be starting up.",
          });
        }
      },
    },
  });

  app.use(metroProxy);
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    res.status(status).json({ message });

    throw err;
  });
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);
  setupMetroProxy(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
