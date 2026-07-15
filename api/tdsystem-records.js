import { scrapeTdsystemRecords } from "../scripts/tdsystem-scraper.mjs";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ records: [], upcomingMeets: [], error: "Method not allowed" });
    return;
  }

  try {
    const result = await scrapeTdsystemRecords({
      team: request.query.team || "RSケーニーズ",
      source: request.query.source || "https://www.tdsystem.co.jp/",
      limitMeets: Number(request.query.limitMeets || 240),
      months: Number(request.query.months || 12),
      futureMonths: Number(request.query.futureMonths || 6)
    });

    response.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
    response.status(200).json(result);
  } catch (error) {
    response.status(502).json({ records: [], upcomingMeets: [], error: error.message });
  }
}

