/**
 * Minimal stand-in for "next/server".
 * The route handlers moved from the old chatbot app only use these pieces.
 * This lets them run inside Express without changes.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

// Next types .json() as Promise<any>. The moved handlers and tests rely on that.
type AnyJson = { json(): Promise<any> };

class NextRequestImpl extends Request {
  get nextUrl(): URL {
    return new URL(this.url);
  }
}

export type NextRequest = Omit<NextRequestImpl, "json"> & AnyJson;
export const NextRequest = NextRequestImpl as unknown as {
  new (input: string | URL | Request, init?: RequestInit): NextRequest;
};

export type NextResponse = Omit<Response, "json"> & AnyJson;
export const NextResponse = {
  json(body: unknown, init?: ResponseInit): NextResponse {
    return Response.json(body, init) as NextResponse;
  },
};
