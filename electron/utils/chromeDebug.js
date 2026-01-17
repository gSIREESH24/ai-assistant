
const CDP = require("chrome-remote-interface");
const axios = require("axios");

const CHROME_PORTS = [9222, 9223, 9224, 9229, 9230];


async function findChromeTarget() {
  for (const port of CHROME_PORTS) {
    try {
      const res = await axios.get(`http://localhost:${port}/json`);
      const list = res.data;

      if (!Array.isArray(list)) continue;

      const target =
        list.find((t) => t.type === "page" && t.url && t.url !== "about:blank") ||
        null;

      if (target) {
        return { port, target };
      }
    } catch (e) {
    }
  }

  return null;
}

async function getActiveChromeURL() {
  try {
    const found = await findChromeTarget();
    if (!found) return null;

    const { port, target } = found;

    const client = await CDP({ target, port });
    const { Page } = client;

    const url = target.url;

    await client.close();
    return url;
  } catch (e) {
    console.warn("Chrome URL error:", e.message);
    return null;
  }
}

async function getChromeCookies() {
  try {
    const found = await findChromeTarget();
    if (!found) return [];

    const { port, target } = found;

    const client = await CDP({ target, port });
    const { Network } = client;

    await Network.enable();
    const cookies = await Network.getCookies();

    await client.close();

    return cookies.cookies || [];
  } catch (e) {
    console.warn("Cookie grab error:", e.message);
    return [];
  }
}

module.exports = {
  getActiveChromeURL,
  getChromeCookies,
};
