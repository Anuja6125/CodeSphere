import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";
import { NextRequest } from "../shims/next-server";

type RouteHandler = (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>;

/** Run a Next-style route handler (from the old chatbot app) as an Express handler. */
export function fromNextHandler(handler: RouteHandler) {
  return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    try {
      const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      const hasBody = !["GET", "HEAD"].includes(req.method);
      const userSub = (req as any).user?.sub;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (userSub) {
        headers["x-user-id"] = userSub;
      }

      const request = new NextRequest(url, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      });
      (request as any).user = (req as any).user;

      const response = await handler(request, { params: { id: String(req.params.id) } });
      const text = await response.text();
      res.status(response.status);
      res.type(response.headers.get("content-type") || "application/json");
      res.send(text);
    } catch (error) {
      next(error);
    }
  };
}
