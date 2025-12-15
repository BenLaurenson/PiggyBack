import { ErrorDisplay } from "@/components/ui/error-display";

export default function NotFound() {
  return (
    <ErrorDisplay
      variant="not-found"
      showBackButton={true}
      showHomeButton={true}
      homeHref="/home"
    />
  );
}
