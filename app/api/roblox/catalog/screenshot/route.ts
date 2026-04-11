import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const assetId = req.nextUrl.searchParams.get('id');
  if (!assetId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`,
      { redirect: 'follow' },
    );

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('image') || contentType.includes('octet-stream')) {
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType.includes('image') ? contentType : 'image/png',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (json?.location) {
        const imgRes = await fetch(json.location);
        const buffer = await imgRes.arrayBuffer();
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': imgRes.headers.get('content-type') || 'image/png',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    } catch {}

    return new NextResponse(null, { status: 404 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}