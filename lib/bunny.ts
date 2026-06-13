import crypto from "crypto";

const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE_NAME!;
const BUNNY_STORAGE_KEY = process.env.BUNNY_STORAGE_API_KEY!;
const BUNNY_CDN_URL = process.env.BUNNY_CDN_URL!;
const BUNNY_STREAM_LIBRARY = process.env.BUNNY_STREAM_LIBRARY_ID!;
const BUNNY_STREAM_KEY = process.env.BUNNY_STREAM_API_KEY!;
const BUNNY_SIGNING_KEY = process.env.BUNNY_SIGNING_KEY!;

export async function uploadToBunny(
  buffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const url = `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${safeName}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: BUNNY_STREAM_KEY,
      "Content-Type": contentType,
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    throw new Error(`Bunny upload failed: ${res.status} ${await res.text()}`);
  }

  return `https://${BUNNY_CDN_URL}/${safeName}`;
}

export async function createStreamVideo(title: string): Promise<{
  guid: string;
  directUrl: string;
}> {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY}/videos`,
    {
      method: "POST",
      headers: {
        AccessKey: BUNNY_STREAM_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  if (!res.ok) {
    throw new Error(`Bunny stream create failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    guid: data.guid,
    directUrl: `https://iframe.mediadelivery.net/play/${BUNNY_STREAM_LIBRARY}/${data.guid}`,
  };
}

export async function uploadToStream(
  videoId: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY}/videos/${videoId}`,
    {
      method: "PUT",
      headers: {
        AccessKey: BUNNY_STREAM_KEY,
        "Content-Type": contentType,
      },
      body: new Uint8Array(buffer),
    }
  );

  if (!res.ok) {
    throw new Error(`Bunny stream upload failed: ${res.status}`);
  }
}

export function generateSignedUrl(videoId: string, expiresIn = 3600): string {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const path = `/${BUNNY_STREAM_LIBRARY}/${videoId}`;
  const hash = crypto
    .createHmac("sha256", BUNNY_SIGNING_KEY)
    .update(path + expires)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `https://iframe.mediadelivery.net/play${path}?token=${hash}&expires=${expires}`;
}
