import Link, { type LinkProps } from "next/link";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

type UiVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type UiSize = "sm" | "md" | "lg";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function variantClass(variant: UiVariant) {
  if (variant === "primary") return "ui-btn--primary";
  if (variant === "ghost") return "ui-btn--ghost";
  if (variant === "danger") return "ui-btn--danger";
  if (variant === "success") return "ui-btn--success";
  return "ui-btn--secondary";
}

function sizeClass(size: UiSize) {
  if (size === "sm") return "ui-btn--sm";
  if (size === "lg") return "ui-btn--lg";
  return "ui-btn--md";
}

export type UiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: UiVariant;
  size?: UiSize;
  fullWidth?: boolean;
};

export const UiButton = forwardRef<HTMLButtonElement, UiButtonProps>(
  function UiButton(
    { variant = "secondary", size = "md", fullWidth = false, className, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={cx(
          "ui-btn",
          variantClass(variant),
          sizeClass(size),
          fullWidth && "ui-btn--full",
          className
        )}
        {...props}
      />
    );
  }
);

export type UiLinkButtonProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    variant?: UiVariant;
    size?: UiSize;
    fullWidth?: boolean;
  };

export function UiLinkButton({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className,
  ...props
}: UiLinkButtonProps) {
  return (
    <Link
      className={cx(
        "ui-btn",
        variantClass(variant),
        sizeClass(size),
        fullWidth && "ui-btn--full",
        className
      )}
      {...props}
    />
  );
}

type UiControlShared = {
  fullWidth?: boolean;
};

export type UiInputProps = InputHTMLAttributes<HTMLInputElement> & UiControlShared;
export const UiInput = forwardRef<HTMLInputElement, UiInputProps>(
  function UiInput({ className, fullWidth = true, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx("ui-control", fullWidth && "ui-control--full", className)}
        {...props}
      />
    );
  }
);

export type UiSelectProps = SelectHTMLAttributes<HTMLSelectElement> & UiControlShared;
export const UiSelect = forwardRef<HTMLSelectElement, UiSelectProps>(
  function UiSelect({ className, fullWidth = true, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cx("ui-control", "ui-select", fullWidth && "ui-control--full", className)}
        {...props}
      />
    );
  }
);

export type UiTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & UiControlShared;
export const UiTextarea = forwardRef<HTMLTextAreaElement, UiTextareaProps>(
  function UiTextarea({ className, fullWidth = true, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cx("ui-control", "ui-textarea", fullWidth && "ui-control--full", className)}
        {...props}
      />
    );
  }
);

export type UiCardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div" | "aside";
};

export function UiCard({ as = "section", className, ...props }: UiCardProps) {
  const Component = as;
  return <Component className={cx("ui-card", className)} {...props} />;
}

export type UiFieldLabelProps = LabelHTMLAttributes<HTMLLabelElement>;
export function UiFieldLabel({ className, ...props }: UiFieldLabelProps) {
  return <label className={cx("ui-field-label", className)} {...props} />;
}
