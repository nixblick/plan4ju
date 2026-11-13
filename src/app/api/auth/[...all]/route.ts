import { handleAuthRequest } from "@/server/auth";

export const GET = (req: Request) => handleAuthRequest(req);
export const POST = (req: Request) => handleAuthRequest(req);
