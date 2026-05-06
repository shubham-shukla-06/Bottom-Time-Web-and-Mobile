const routes = ["/", "/dashboard", "/community", "/discover", "/shop", "/trips"];
const baseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

const fetchWithTimeout = async (url, timeoutMs = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};

const run = async () => {
  for (const route of routes) {
    const url = `${baseUrl}${route}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.error(`Route check failed: ${url} (${res.status})`);
      process.exit(1);
    }
    const html = await res.text();
    if (!html.includes('id="root"')) {
      console.error(`Missing root element for route: ${url}`);
      process.exit(1);
    }
    console.log(`✓ ${route} loaded`);
  }
  console.log("Frontend smoke checks passed.");
};

run();
