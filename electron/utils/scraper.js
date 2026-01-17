// electron/utils/scraper.js
const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Extract visible text from any page using Cheerio
 */
async function fetchPageText(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 FutureSafeAI Scraper"
      }
    });

    const $ = cheerio.load(data);

    // Remove scripts + styles
    $("script, style, noscript").remove();

    return $("body").text().replace(/\s+/g, " ").trim();
  } catch (err) {
    console.error("Fetch text error:", err);
    return "";
  }
}

/**
 * Fully scrape main page + Terms + Privacy links
 */
async function scrapeWebsite(url) {
  try {
    // ================================
    // 1. LOAD MAIN PAGE TEXT
    // ================================
    const mainText = await fetchPageText(url);

    // Load DOM for link scanning
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    // ================================
    // 2. EXTRACT POSSIBLE T&C LINKS
    // ================================
    const keywords = ["terms", "privacy", "policy", "conditions", "cookies"];
    let links = [];

    $("a").each((_, el) => {
      const t = $(el).text().toLowerCase();
      const href = $(el).attr("href");

      if (!href) return;

      // Any T&C related anchor text
      if (keywords.some((k) => t.includes(k))) {
        try {
          const fullURL = href.startsWith("http")
            ? href
            : new URL(href, url).href;

          if (!links.includes(fullURL)) links.push(fullURL);
        } catch {}
      }
    });

    // ================================
    // 3. SCRAPE T&C PAGES
    // ================================
    let tncCombined = "";

    for (let link of links) {
      try {
        const text = await fetchPageText(link);
        tncCombined += "\n\n" + text;
      } catch (err) {
        console.log("Error loading:", link);
      }
    }

    // ================================
    // 4. FINAL MERGED OUTPUT
    // ================================
    return {
      success: true,
      url,
      title: $("title").text(),
      text: (mainText + "\n\n" + tncCombined).trim(),
      foundLinks: links,
      cookies: [], // Chrome cookie grab is separate (chromeDebug.js)
    };
  } catch (err) {
    console.error("SCRAPER ERROR:", err);
    return { success: false, error: err.message };
  }
}

module.exports = { scrapeWebsite };
