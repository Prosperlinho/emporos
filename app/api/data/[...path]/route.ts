// Authenticated data API for the app. Routes:
//   GET  business                PUT business
//   GET  suppliers               GET suppliers/mine          POST suppliers
//   PUT  suppliers/:id           DELETE suppliers/:id        POST suppliers/:id/verify  (admin)
//   GET  products[?supplierId]   POST products               PUT products/:id   DELETE products/:id
//   GET  orders                  POST orders                 GET orders/:id     PATCH orders/:id
import * as repo from "@/lib/server/repo.ts";
import { handle, readJson } from "@/lib/server/http.ts";
import { HttpError, requireUser } from "@/lib/server/session.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function id(value: string | undefined): string {
  if (!value || !UUID.test(value)) throw new HttpError(404, "Not found.");
  return value;
}

async function route(method: string, request: Request, ctx: Ctx) {
  const [resource, a, b] = (await ctx.params).path;
  const user = await requireUser();
  const key = `${method} ${resource}${a === undefined ? "" : a === "mine" ? "/mine" : "/:id"}${b ? `/${b}` : ""}`;

  switch (key) {
    case "GET business":
      return { business: await repo.getBusiness(user) };
    case "PUT business":
      return repo.saveBusiness(user, await readJson(request));

    case "GET suppliers":
      return repo.listSuppliers();
    case "GET suppliers/mine":
      return repo.listMySuppliers(user);
    case "POST suppliers":
      return repo.createSupplier(user, await readJson(request));
    case "PUT suppliers/:id":
      return repo.updateSupplier(user, id(a), await readJson(request));
    case "DELETE suppliers/:id":
      return repo.deleteSupplier(user, id(a));
    case "POST suppliers/:id/verify": {
      const body = (await readJson(request)) as { verified?: unknown };
      return repo.setSupplierVerified(user, id(a), body.verified === true);
    }

    case "GET products": {
      const supplierId = new URL(request.url).searchParams.get("supplierId");
      return repo.listProducts(supplierId ? id(supplierId) : undefined);
    }
    case "POST products":
      return repo.saveProduct(user, null, await readJson(request));
    case "PUT products/:id":
      return repo.saveProduct(user, id(a), await readJson(request));
    case "DELETE products/:id":
      return repo.deleteProduct(user, id(a));

    case "GET orders":
      return repo.listOrders(user);
    case "POST orders":
      return repo.createOrder(user, await readJson(request));
    case "GET orders/:id":
      return repo.getOrder(user, id(a));
    case "PATCH orders/:id":
      return repo.updateOrder(user, id(a), await readJson(request));

    default:
      throw new HttpError(404, "Not found.");
  }
}

export const GET = (request: Request, ctx: Ctx) => handle(() => route("GET", request, ctx));
export const POST = (request: Request, ctx: Ctx) => handle(() => route("POST", request, ctx));
export const PUT = (request: Request, ctx: Ctx) => handle(() => route("PUT", request, ctx));
export const PATCH = (request: Request, ctx: Ctx) => handle(() => route("PATCH", request, ctx));
export const DELETE = (request: Request, ctx: Ctx) => handle(() => route("DELETE", request, ctx));
