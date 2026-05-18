import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = await login(request);
  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = await login(request);
  return { errors };
};
