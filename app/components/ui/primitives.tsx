import Link, { type LinkProps } from "next/link";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
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

type UiFeedbackTone = "info" | "success" | "error" | "warning";

export type UiStatusProps = HTMLAttributes<HTMLParagraphElement> & {
  tone?: UiFeedbackTone;
};

export function UiStatus({ tone = "info", className, ...props }: UiStatusProps) {
  return <p className={cx("ui-status", className)} data-tone={tone} {...props} />;
}

export type UiEmptyStateProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "aside";
};

export function UiEmptyState({ as = "section", className, ...props }: UiEmptyStateProps) {
  const Component = as;
  return <Component className={cx("ui-empty-state", className)} {...props} />;
}

export type UiLoadingStateProps = HTMLAttributes<HTMLParagraphElement>;

export function UiLoadingState({ className, ...props }: UiLoadingStateProps) {
  return <p className={cx("ui-loading-state", className)} {...props} />;
}

export type UiFieldLabelProps = LabelHTMLAttributes<HTMLLabelElement>;
export function UiFieldLabel({ className, ...props }: UiFieldLabelProps) {
  return <label className={cx("ui-field-label", className)} {...props} />;
}

export type UiFormFieldProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  htmlFor?: string;
  helperText?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function UiFormField({
  label,
  htmlFor,
  helperText,
  error,
  required = false,
  className,
  children,
  ...props
}: UiFormFieldProps) {
  const helperId = htmlFor && helperText ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cx("ui-form-field", Boolean(error) && "ui-form-field--invalid", className)} {...props}>
      <UiFieldLabel htmlFor={htmlFor}>
        <span>{label}</span>
        {required ? <span className="ui-field-required">required</span> : null}
      </UiFieldLabel>
      {children}
      {helperText ? (
        <p className="ui-field-helper" id={helperId}>
          {helperText}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
