/**
 * Image URL resolver: user-uploaded → DALL-E → Unsplash fallback.
 */

interface ImageParams {
  strategy: "unsplash" | "dalle" | "none";
  serviceName: string;
  unsplashKey?: string | null;
  openaiKey?: string | null;
  userUploadedUrl?: string | null;
}

export async function getImageUrl(params: ImageParams): Promise<string | null> {
  const { strategy, serviceName, unsplashKey, openaiKey, userUploadedUrl } = params;

  // Priority 1: user-uploaded
  if (userUploadedUrl) return userUploadedUrl;

  // Priority 2: DALL-E
  if (strategy === "dalle" && openaiKey) {
    try {
      return await generateDalleImage(serviceName, openaiKey);
    } catch {
      // Fall through to Unsplash
    }
  }

  // Priority 3: Unsplash
  if (unsplashKey) {
    try {
      return await fetchUnsplashImage(serviceName, unsplashKey);
    } catch {
      // Fall through
    }
  }

  return null;
}

async function generateDalleImage(serviceName: string, apiKey: string): Promise<string> {
  // Use the already-imported openai package
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const response = await client.images.generate({
    model: "dall-e-3",
    prompt: `Professional photo of ${serviceName} work being performed in a residential area, photorealistic, daytime, clean and trustworthy`,
    n: 1,
    size: "1024x1024",
    quality: "standard",
  });

  const url = response.data?.[0]?.url;
  if (!url) throw new Error("DALL-E returned no image URL");
  return url;
}

async function fetchUnsplashImage(serviceName: string, accessKey: string): Promise<string> {
  const query = encodeURIComponent(serviceName);
  const url = `https://api.unsplash.com/photos/random?query=${query}&orientation=landscape&client_id=${accessKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Unsplash API error: ${res.status}`);

  const data = (await res.json()) as { urls?: { regular?: string } } | undefined;
  const imageUrl = (data as { urls?: { regular?: string } } | undefined)?.urls?.regular;
  if (!imageUrl) throw new Error("Unsplash returned no image");

  return imageUrl;
}
