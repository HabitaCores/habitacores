import { NextResponse } from 'next/server';

// Composition with the database-backed SessionService is deliberately owned by the
// deployment bootstrap. Until that bootstrap exists, the framework route fails closed.
export function POST(): NextResponse {
  return NextResponse.json(
    { error: 'Authentication runtime is not configured.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
