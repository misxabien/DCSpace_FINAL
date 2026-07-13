import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LEGACY = path.resolve(ROOT, "..");

const ROUTE_MAP = {
  "01-login.html": "/login",
  "02-create.html": "/create",
  "03-schooldetails.html": "/school-details",
  "04-accounts.html": "/accounts",
  "05verify.html": "/verify",
  "06-agreement.html": "/agreement",
  "07-fpemail.html": "/forgot-password",
  "08-fpverification.html": "/forgot-password/verify",
  "09-home.html": "/home",
  "09-newpass.html": "/new-password",
  "10-invited.html": "/events/invited",
  "11-today.html": "/events/today",
  "12-upcoming.html": "/events/upcoming",
  "13-past.html": "/events/past",
  "14-event.html": "/events",
  "15-happen.html": "/events/happening",
  "16-acad.html": "/events/academic",
  "17-tech.html": "/events/tech",
  "18-organization.html": "/events/organization",
  "19-event-details.html": "/events/details",
  "20-event-explore.html": "/events/explore",
  "21-event-submit.html": "/events/submit",
  "22-attendance.html": "/attendance",
  "23-attendance-completed.html": "/attendance/completed",
  "24-attendance-incomplete.html": "/attendance/incomplete",
  "25-attendance-details.html": "/attendance/details",
  "26-certificates.html": "/certificates",
  "27-certificates-weekend.html": "/certificates/weekend",
  "28-certificates-month.html": "/certificates/month",
  "29-saved.html": "/saved",
  "30-saved-today.html": "/saved/today",
  "31-saved-upcoming.html": "/saved/upcoming",
  "32-saved-past.html": "/saved/past",
  "33-feedbacl.html": "/feedback",
  "34-feedback-details.html": "/feedback/details",
  "35-feedback-sign.html": "/feedback/sign",
  "36-profile.html": "/profile",
  "37-notif.html": "/notifications",
};

const AUTH_PAGES = new Set([
  "01-login.html",
  "02-create.html",
  "03-schooldetails.html",
  "04-accounts.html",
  "05verify.html",
  "06-agreement.html",
  "07-fpemail.html",
  "08-fpverification.html",
  "09-newpass.html",
]);

function routeToPagePath(route) {
  if (route === "/home") return "app/(app)/home/page.tsx";
  if (route === "/login") return "app/(auth)/login/page.tsx";
  const authRoutes = {
    "/create": "app/(auth)/create/page.tsx",
    "/school-details": "app/(auth)/school-details/page.tsx",
    "/accounts": "app/(auth)/accounts/page.tsx",
    "/verify": "app/(auth)/verify/page.tsx",
    "/agreement": "app/(auth)/agreement/page.tsx",
    "/forgot-password": "app/(auth)/forgot-password/page.tsx",
    "/forgot-password/verify": "app/(auth)/forgot-password/verify/page.tsx",
    "/new-password": "app/(auth)/new-password/page.tsx",
  };
  if (authRoutes[route]) return authRoutes[route];
  const segments = route.split("/").filter(Boolean);
  if (segments[0] === "events" && segments[1] === "details") return "app/(app)/events/details/page.tsx";
  if (segments[0] === "events" && segments[1] === "explore") return "app/(app)/events/explore/page.tsx";
  if (segments[0] === "events" && segments[1] === "submit") return "app/(app)/events/submit/page.tsx";
  if (segments[0] === "attendance" && segments[1] === "details") return "app/(app)/attendance/details/page.tsx";
  if (segments[0] === "feedback" && segments[1] === "details") return "app/(app)/feedback/details/page.tsx";
  return `app/(app)/${segments.join("/")}/page.tsx`;
}

function rewriteLinks(html) {
  let out = html;

  for (const [file, route] of Object.entries(ROUTE_MAP)) {
    const escaped = file.replace(/\./g, "\\.");
    for (const attr of ["href", "action"]) {
      const patterns = [
        new RegExp(`${attr}=["']\\.\\/${escaped}([^"']*)["']`, "gi"),
        new RegExp(`${attr}=["']${escaped}([^"']*)["']`, "gi"),
      ];
      for (const re of patterns) {
        out = out.replace(re, (_, query = "") => `${attr}="${route}${query}"`);
      }
    }

    const locationPatterns = [
      new RegExp(`(window\\.location\\.href\\s*=\\s*['"])\\.\\/${escaped}(['"])`, "gi"),
      new RegExp(`(window\\.location\\.href\\s*=\\s*['"])${escaped}(['"])`, "gi"),
      new RegExp(`(location\\.href\\s*=\\s*['"])\\.\\/${escaped}(['"])`, "gi"),
      new RegExp(`(location\\.href\\s*=\\s*['"])${escaped}(['"])`, "gi"),
    ];
    for (const re of locationPatterns) {
      out = out.replace(re, `$1${route}$2`);
    }
  }

  out = out.replace(/(href|action)=["']\.\/([^"']+\.html)([^"']*)["']/gi, (match, attr, file, query) => {
    const mapped = ROUTE_MAP[file];
    return mapped ? `${attr}="${mapped}${query}"` : match;
  });

  out = out.replace(
    /(window\.location\.href\s*=\s*['"])\.\/([^'"]+\.html)(['"])/gi,
    (match, prefix, file, suffix) => {
      const mapped = ROUTE_MAP[file];
      return mapped ? `${prefix}${mapped}${suffix}` : match;
    },
  );

  out = out.replace(
    /(location\.href\s*=\s*['"])\.\/([^'"]+\.html)(['"])/gi,
    (match, prefix, file, suffix) => {
      const mapped = ROUTE_MAP[file];
      return mapped ? `${prefix}${mapped}${suffix}` : match;
    },
  );

  out = out.replace(/src=["']finallogo\.png["']/gi, 'src="/finallogo.png"');
  out = out.replace(/src=["']\.\/finallogo\.png["']/gi, 'src="/finallogo.png"');

  out = out.replace(/src=["']([^"']+\.js)["']/gi, (match, src) => {
    const name = path.basename(src);
    return `data-legacy-script="${name}"`;
  });
  out = out.replace(/<link[^>]+site-tour\.css[^>]*>/gi, "");
  out = out.replace(/<script[^>]+site-tour\.js[^>]*><\/script>/gi, "");
  return out;
}

function stripInlineScripts(html) {
  return html.replace(/<script(?:\s+[^>]*)?>[\s\S]*?<\/script>/gi, "");
}

function extractStyles(html) {
  const styles = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) styles.push(m[1]);
  return styles.join("\n");
}

function extractMain(html) {
  const mainMatch = html.match(/<main[^>]*class=["']main["'][^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return mainMatch[1].trim();
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : html;
}

function extractScripts(html) {
  const scripts = [];
  const re =
    /<script(?:\s+(?:src=["']([^"']+)["']|data-legacy-script=["']([^"']+)["']))?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1] || m[2];
    if (src) {
      scripts.push({ type: "src", value: path.basename(src) });
    } else if (m[3] && m[3].trim()) {
      scripts.push({ type: "inline", value: m[3].trim() });
    }
  }
  return scripts.filter((s) => s.value !== "site-tour.js");
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].replace("DC Space — ", "").trim() : "DC Space";
}

const contentDir = path.join(ROOT, "content", "legacy");
fs.mkdirSync(contentDir, { recursive: true });

const manifest = {};

for (const [file, route] of Object.entries(ROUTE_MAP)) {
  const filePath = path.join(LEGACY, file);
  if (!fs.existsSync(filePath)) continue;
  const html = fs.readFileSync(filePath, "utf8");
  const rewrittenHtml = rewriteLinks(html);
  const isApp = !AUTH_PAGES.has(file) && html.includes('class="app"');
  const styles = extractStyles(rewrittenHtml);
  const mainHtml = stripInlineScripts(extractMain(rewrittenHtml));
  const scripts = extractScripts(html).map((script) =>
    script.type === "inline" ? { ...script, value: rewriteLinks(script.value) } : script,
  );
  const title = extractTitle(html);
  const id = file.replace(".html", "");

  const data = { id, route, title, isApp, styles, html: mainHtml, scripts };
  fs.writeFileSync(path.join(contentDir, `${id}.json`), JSON.stringify(data, null, 2));
  manifest[route] = id;
}

fs.writeFileSync(path.join(contentDir, "manifest.json"), JSON.stringify(manifest, null, 2));

for (const [route, id] of Object.entries(manifest)) {
  const pagePath = path.join(ROOT, routeToPagePath(route));
  fs.mkdirSync(path.dirname(pagePath), { recursive: true });
  const data = JSON.parse(fs.readFileSync(path.join(contentDir, `${id}.json`), "utf8"));
  const component = data.isApp ? "AppLegacyPage" : "AuthLegacyPage";
  const pageContent = `import { ${component} } from "@/components/legacy/${component}";
import type { LegacyPageData } from "@/lib/navigation";
import legacyData from "@/content/legacy/${id}.json";

const legacy = legacyData as LegacyPageData;

export default function Page() {
  return <${component} data={legacy} />;
}
`;
  fs.writeFileSync(pagePath, pageContent);
}

console.log(`Converted ${Object.keys(manifest).length} pages.`);
