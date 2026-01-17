const axios = require("axios");
const cheerio = require("cheerio");

async function fetchPageText(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 FutureSafeAI Scraper"
      }
    });

    const $ = cheerio.load(data);

    $("script, style, noscript").remove();

    return $("body").text().replace(/\s+/g, " ").trim();
  } catch (err) {
    console.error("Fetch text error:", err);
    return "";
  }
}

async function scrapeWebsite(url) {
  try {

    const mainText = await fetchPageText(url);

    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const keywords = ["terms", "privacy", "policy", "conditions", "cookies"];
    let links = [];

    $("a").each((_, el) => {
      const t = $(el).text().toLowerCase();
      const href = $(el).attr("href");

      if (!href) return;

      if (keywords.some((k) => t.includes(k))) {
        try {
          const fullURL = href.startsWith("http")
            ? href
            : new URL(href, url).href;

          if (!links.includes(fullURL)) links.push(fullURL);
        } catch { }
      }
    });

    let tncCombined = "";

    for (let link of links) {
      try {
        const text = await fetchPageText(link);
        tncCombined += "\n\n" + text;
      } catch (err) {
        console.log("Error loading:", link);
      }
    }

    return {
      success: true,
      url,
      title: $("title").text(),
      text: (mainText + "\n\n" + tncCombined).trim(),
      foundLinks: links,
      cookies: [],
    };
  } catch (err) {
    console.error("SCRAPER ERROR:", err);
    return { success: false, error: err.message };
  }
}

module.exports = { scrapeWebsite };
