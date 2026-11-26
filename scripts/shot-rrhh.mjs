import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://localhost:3001/rrhh";
const EMAIL = "rrhh.talento@reymon.test";
const PASSWORD = "Reymon2026*";
const OUT = process.env.TEMP + "\\rrhh-dash.png";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1440,1100"],
  defaultViewport: { width: 1440, height: 1100 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "networkidle2" });

// fill login
await page.type('input[type="email"], input[name="email"]', EMAIL, { delay: 10 });
await page.type('input[type="password"], input[name="password"]', PASSWORD, { delay: 10 });
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    /entrar|ingresar/i.test(b.textContent || "")
  );
  if (btn) { btn.click(); return true; }
  return false;
});
console.log("CLICKED=" + clicked);
await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));

await page.screenshot({ path: OUT, fullPage: true });
console.log("SHOT=" + OUT);
console.log("URL_AFTER=" + page.url());
await browser.close();
