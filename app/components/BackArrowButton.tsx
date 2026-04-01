"use client";

import { useRouter } from "next/navigation";

type BackArrowButtonProps = {
  fallbackHref?: string;
  label?: string;
  className?: string;
};

export default function BackArrowButton({
  fallbackHref = "/",
  label = "Go back",
  className,
}: BackArrowButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={className ? `back-arrow-button ${className}` : "back-arrow-button"}
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  );
}
