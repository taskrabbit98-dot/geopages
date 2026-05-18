/**
 * Simple in-memory generation queue with concurrency control.
 * For production, replace the in-memory store with BullMQ + Redis.
 */

import prisma from "~/db.server";
import { createAIProvider } from "~/lib/ai";
import { assemblePageHtml, calculateQualityScore } from "~/lib/content/generator";
import { isTooSimilar } from "~/lib/content/similarity";
import { getMapEmbedUrl } from "~/lib/shopify/maps";
import { getImageUrl } from "~/lib/shopify/images";
import { resolveTemplate } from "~/lib/content/trustLinks";

const MAX_CONCURRENT = 3;
const MAX_RETRIES = 2;

let runningJobs = 0;
const pendingQueue: string[] = []; // job IDs

export function enqueueJob(jobId: string) {
  pendingQueue.push(jobId);
  processNext();
}

function processNext() {
  if (runningJobs >= MAX_CONCURRENT) return;
  const jobId = pendingQueue.shift();
  if (!jobId) return;
  runningJobs++;
  runJob(jobId).finally(() => {
    runningJobs--;
    processNext();
  });
}

async function runJob(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "done") return;

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "running", updatedAt: new Date() },
  });

  let attempt = job.attempts;
  let lastError = "";

  while (attempt < MAX_RETRIES + 1) {
    try {
      await executeGeneration(job.shop, job.serviceId, job.locationId);
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: "done", attempts: attempt + 1 },
      });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      attempt++;
      if (attempt <= MAX_RETRIES) {
        // Exponential backoff: 2^attempt seconds
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "failed", error: lastError, attempts: attempt },
  });
}

async function executeGeneration(
  shop: string,
  serviceId: string,
  locationId: string
): Promise<void> {
  const [service, location, settings, trustTemplates] = await Promise.all([
    prisma.service.findFirst({ where: { id: serviceId, shop } }),
    prisma.location.findFirst({ where: { id: locationId, shop } }),
    prisma.appSettings.findUnique({ where: { shop } }),
    prisma.trustLinkTemplate.findMany({ where: { shop }, orderBy: { sortOrder: "asc" } }),
  ]);

  if (!service || !location || !settings) {
    throw new Error("Missing service, location, or settings");
  }

  const resolvedTrustLinks = trustTemplates.map((t) => ({
    url: resolveTemplate(t.urlTemplate, {
      service: service.name,
      city: location.city,
      state: location.state,
      zip: location.zip,
    }),
    platform: t.platform,
  }));

  const provider = createAIProvider(
    settings.defaultAiModel,
    settings.openaiApiKey,
    settings.geminiApiKey
  );

  const writingStyles: Array<"formal" | "conversational" | "direct"> = [
    "formal",
    "conversational",
    "direct",
  ];
  const styleIndex =
    (service.name.length + location.name.length) % writingStyles.length;

  const content = await provider.generatePageContent({
    serviceName: service.name,
    locationName: location.name,
    locationCity: location.city,
    locationState: location.state,
    businessName: settings.businessName || shop,
    businessPhone: settings.businessPhone || "",
    businessAddress: settings.businessAddress || "",
    writingStyle: writingStyles[styleIndex],
    minServiceNameMentions: Math.max(resolvedTrustLinks.length, 3),
  });

  // Duplicate content check — compare against existing pages for same service
  const existingPages = await prisma.generatedPage.findMany({
    where: { shop, serviceId },
    select: { bodyHtml: true, id: true },
    take: 50,
  });

  for (const existing of existingPages) {
    if (isTooSimilar(content.intro + content.serviceDetails, existing.bodyHtml)) {
      throw new Error(
        `Generated content is too similar to existing page (id: ${existing.id}). Retry will vary the content.`
      );
    }
  }

  // Build related pages list (same service, other locations)
  const relatedPages = await prisma.generatedPage.findMany({
    where: { shop, serviceId, status: "published" },
    select: { title: true, slug: true },
    take: 10,
  });

  const slug = `${service.slug}-${location.slug}`;
  const shopUrl = `https://${shop}`;

  const imageUrl = await getImageUrl({
    strategy: (settings.imageStrategy as "unsplash" | "dalle" | "none") || "unsplash",
    serviceName: service.name,
    unsplashKey: settings.unsplashKey,
    openaiKey: settings.openaiApiKey,
  });

  const mapEmbedUrl = getMapEmbedUrl({
    city: location.city,
    state: location.state,
    lat: location.lat,
    lng: location.lng,
    googleMapsKey: settings.googleMapsKey,
  });

  const bodyHtml = assemblePageHtml({
    content,
    serviceName: service.name,
    locationName: location.name,
    locationCity: location.city,
    locationState: location.state,
    businessName: settings.businessName || shop,
    businessPhone: settings.businessPhone || "",
    businessAddress: settings.businessAddress || "",
    shopUrl,
    slug,
    imageUrl,
    mapEmbedUrl,
    directoryLinks: resolvedTrustLinks,
    relatedPages,
  });

  const qualityScore = calculateQualityScore({
    bodyHtml,
    faqCount: content.faq.length,
    directoryLinksCount: resolvedTrustLinks.length,
    hasImage: !!imageUrl,
    hasMap: !!mapEmbedUrl,
    serviceName: service.name,
    locationName: location.name,
  });

  // Upsert the generated page record
  await prisma.generatedPage.upsert({
    where: {
      shop_serviceId_locationId: { shop, serviceId, locationId },
    },
    create: {
      shop,
      serviceId,
      locationId,
      slug,
      title: `${service.name} in ${location.name}`,
      metaTitle: content.metaTitle,
      metaDescription: content.metaDescription,
      h1: content.h1,
      bodyHtml,
      faqJson: JSON.stringify(content.faq),
      schemaJson: "{}",
      imageUrl,
      mapEmbedUrl,
      status: "draft",
      aiModel: settings.defaultAiModel,
      qualityScore,
      generatedAt: new Date(),
    },
    update: {
      slug,
      title: `${service.name} in ${location.name}`,
      metaTitle: content.metaTitle,
      metaDescription: content.metaDescription,
      h1: content.h1,
      bodyHtml,
      faqJson: JSON.stringify(content.faq),
      schemaJson: "{}",
      imageUrl,
      mapEmbedUrl,
      aiModel: settings.defaultAiModel,
      qualityScore,
      generatedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
