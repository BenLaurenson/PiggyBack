import { redirect } from "next/navigation";

export default function ForgotPasswordRedirect() {
  redirect("/forgot-password");
}
