// app/api/outfits/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const outfits = await prisma.outfit.findMany({
      include: { owner: true },
      orderBy: [
        { voteScore: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = outfits.map((o: any) => ({
      id: o.id,
      name: o.name,
      build: JSON.parse(o.buildJson),
      isPublic: o.isPublic,
      voteScore: o.voteScore,
      owner: o.owner.username,
      customImageUrl: o.customImage ?? null, // <--- image from DB
    }));

    return NextResponse.json({ outfits: mapped });
  } catch (err) {
    console.error('GET /api/outfits error', err);
    return NextResponse.json(
      { error: 'Failed to load outfits.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, name, build, customImageUrl } = body;

    if (typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required.' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found.' },
        { status: 401 },
      );
    }

    if (!build || typeof build !== 'object') {
      return NextResponse.json(
        { error: 'Invalid outfit build.' },
        { status: 400 },
      );
    }

    const created = await prisma.outfit.create({
      data: {
        name: typeof name === 'string' && name.trim() ? name.trim() : null,
        buildJson: JSON.stringify(build),
        ownerId: user.id,
        isPublic: false,
        voteScore: 0,
        customImage:
          typeof customImageUrl === 'string' && customImageUrl.trim()
            ? customImageUrl
            : null,
      },
      include: { owner: true },
    });

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        build: JSON.parse(created.buildJson),
        isPublic: created.isPublic,
        voteScore: created.voteScore,
        owner: created.owner.username,
        customImageUrl: created.customImage ?? null,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('POST /api/outfits error', err);
    return NextResponse.json(
      { error: 'Failed to save outfit.' },
      { status: 500 },
    );
  }
}
