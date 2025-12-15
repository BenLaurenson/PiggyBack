import { z } from "zod/v4";
import { NextResponse } from "next/server";

export const uuidSchema = z.string().uuid();
export const uuidArraySchema = z.array(uuidSchema).min(1).max(100);
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID format.
 * Returns null if valid, or a 400 NextResponse if invalid.
 */
export function validateUuidParam(id: string): NextResponse | null {
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }
  return null;
}

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns { data } on success or { error, response } on failure.
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<
  | { data: T; error?: never; response?: never }
  | { data?: never; error: string; response: NextResponse }
> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      return {
        error: "Invalid request body",
        response: NextResponse.json(
          { error: "Invalid request body" },
          { status: 400 }
        ),
      };
    }
    return { data: result.data };
  } catch {
    return {
      error: "Invalid JSON",
      response: NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      ),
    };
  }
}
